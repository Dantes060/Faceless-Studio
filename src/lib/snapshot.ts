import { getDb } from "./db";
import { balance } from "./credits";
import { listJobs } from "./queue";
import { listAssets } from "./storage";
import { pipelineCost } from "./pipeline";
import { getResolvedKeys, providerStatus } from "./keys";
import type { Snapshot } from "./types";

/**
 * One snapshot shape, used by both the API route (polling) and the server
 * page (first paint) so the workspace never flashes an empty state.
 */
export function buildSnapshot(userId: string, projectId: string): Snapshot | null {
  const project = getDb()
    .prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
    .get(projectId, userId) as Snapshot["project"] | undefined;
  if (!project) return null;

  const scenes = getDb()
    .prepare("SELECT * FROM scenes WHERE project_id = ? ORDER BY n")
    .all(projectId) as Snapshot["scenes"];

  const assets = listAssets(projectId).map((a) => ({
    id: a.id,
    kind: a.kind as string,
    scene_n: a.scene_n,
    mime: a.mime,
    bytes: a.bytes,
    created_at: a.created_at,
    url: `/api/assets/${a.id}`,
  }));

  return {
    project,
    scenes,
    assets,
    jobs: listJobs(projectId, 12) as Snapshot["jobs"],
    balance: balance(userId),
    prices: pipelineCost(projectId),
    providers: providerStatus(getResolvedKeys(userId)),
  };
}
