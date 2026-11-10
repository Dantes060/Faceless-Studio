import { getDb } from "./db";
import { credit, debit, PRICE, scriptCost, imageCost, videoCost } from "./credits";
import { enqueue, hasActive, type JobKind } from "./queue";

export type Stage = "script" | "images" | "videos" | "tts" | "assemble";

export const STAGES: Stage[] = ["script", "images", "videos", "tts", "assemble"];

type ProjectState = {
  id: string;
  scene_count: number;
  script_json: string | null;
};

function projectState(projectId: string): ProjectState {
  const p = getDb()
    .prepare("SELECT id, scene_count, script_json FROM projects WHERE id = ?")
    .get(projectId) as ProjectState | undefined;
  if (!p) throw new Error("Project not found");
  return p;
}

function countMissing(projectId: string, column: "image_asset_id" | "clip_asset_id"): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM scenes WHERE project_id = ? AND ${column} IS NULL`)
    .get(projectId) as { c: number };
  return row.c;
}

/**
 * Price what is actually left to do, not the whole project again. Re-running a
 * stage only charges for the shots that are still missing.
 */
export function stageCost(projectId: string, stage: Stage): number {
  const p = projectState(projectId);
  switch (stage) {
    case "script":
      return scriptCost(p.scene_count);
    case "images":
      return p.script_json ? countMissing(projectId, "image_asset_id") * PRICE.image.perScene : imageCost(p.scene_count);
    case "videos":
      return p.script_json ? countMissing(projectId, "clip_asset_id") * PRICE.video.perScene5s : videoCost(p.scene_count);
    case "tts":
      return PRICE.tts.base;
    case "assemble":
      return PRICE.assembly.base;
  }
}

export function pipelineCost(projectId: string): { total: number; stages: Record<Stage, number> } {
  const stages = Object.fromEntries(STAGES.map((s) => [s, stageCost(projectId, s)])) as Record<Stage, number>;
  return { total: STAGES.reduce((a, s) => a + stages[s], 0), stages };
}

export function chargeAndEnqueue(args: {
  userId: string;
  projectId: string;
  stage: Stage | "all";
}): { jobs: { id: string; kind: JobKind; cost: number }[] } {
  const { userId, projectId } = args;
  const stages: Stage[] = args.stage === "all" ? STAGES : [args.stage];

  if (hasActive(projectId)) {
    throw new Error("A job is already running for this project");
  }

  const costs = stages.map((s) => ({ stage: s, cost: stageCost(projectId, s) }));
  const total = costs.reduce((a, c) => a + c.cost, 0);

  // Nothing left to render for these stages: succeed without charging.
  if (total === 0) return { jobs: [] };

  // Charge once, up front, for the whole batch — then hand out the work.
  debit({
    userId,
    amount: total,
    kind: "job",
    ref: projectId,
    memo: `${stages.join("+")} for project ${projectId}`,
  });

  try {
    const jobs = costs.map(({ stage, cost }) => {
      const job = enqueue({ projectId, userId, kind: stage as JobKind, cost });
      return { id: job.id, kind: job.kind, cost };
    });
    getDb()
      .prepare("UPDATE projects SET status = 'rendering', updated_at = ? WHERE id = ?")
      .run(Date.now(), projectId);
    return { jobs };
  } catch (err) {
    // Nothing was queued: give the credits straight back.
    credit({ userId, amount: total, kind: "refund", ref: projectId, memo: "enqueue failed" });
    throw err;
  }
}
