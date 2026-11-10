import { getDb } from "./db";
import { claimNext, complete, fail, retryLater, type Job } from "./queue";
import { latestAsset, saveAsset } from "./storage";
import { image as imageProvider, llm as llmProvider, tts as ttsProvider, video as videoProvider } from "./providers";
import { buildSystemPrompt, buildUserPrompt, mockScript, type Brief } from "./prompts";
import {
  compileImagePrompt,
  compileVideoPrompt,
  extractJson,
  normalizeScript,
  type Scene,
  type Script,
} from "./script";
import { isLiveFor, getResolvedKeys } from "./keys";
import { assembleProject } from "./assemble";

type ProjectRow = {
  id: string;
  user_id: string;
  title: string;
  topic: string;
  niche: string;
  aspect: string;
  scene_count: number;
  style_lock: string;
  character_lock: string;
  script_json: string | null;
};

function project(id: string): ProjectRow {
  const row = getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
  if (!row) throw new Error("Project not found");
  return row;
}

function scenesOf(projectId: string): (Scene & { id: string; image_asset_id: string | null; clip_asset_id: string | null })[] {
  return getDb()
    .prepare("SELECT * FROM scenes WHERE project_id = ? ORDER BY n ASC")
    .all(projectId) as (Scene & { id: string; image_asset_id: string | null; clip_asset_id: string | null })[];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/* -------------------------------- stage: script -------------------------------- */

async function runScript(job: Job): Promise<Record<string, unknown>> {
  const p = project(job.project_id);
  const brief: Brief = {
    topic: p.topic,
    niche: p.niche,
    aspect: p.aspect,
    sceneCount: p.scene_count,
    clipSeconds: 5,
    styleLock: p.style_lock || undefined,
    characterLock: p.character_lock || undefined,
  };

  let script: Script;
  let provider = "mock";
  let model = "offline";

  const keys = getResolvedKeys(job.user_id);
  if (isLiveFor(keys, "llm")) {
    const llm = llmProvider(keys);
    const res = await llm.complete({
      system: buildSystemPrompt(brief),
      user: buildUserPrompt(brief),
      json: true,
      temperature: 0.85,
      maxTokens: 8000,
    });
    script = normalizeScript(extractJson(res.text), {
      sceneCount: brief.sceneCount,
      styleLock: brief.styleLock,
      characterLock: brief.characterLock,
    });
    provider = res.provider;
    model = res.model;
  } else {
    script = normalizeScript(mockScript(brief), {
      sceneCount: brief.sceneCount,
      styleLock: brief.styleLock,
      characterLock: brief.characterLock,
    });
  }

  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM scenes WHERE project_id = ?").run(p.id);
    const insert = db.prepare(
      `INSERT INTO scenes (id, project_id, n, duration_sec, narration, on_screen_text, image_prompt, video_prompt, sfx)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    for (const s of script.scenes) {
      insert.run(
        cryptoId(), p.id, s.n, s.duration_sec, s.narration, s.on_screen_text,
        s.image_prompt, s.video_prompt, s.sfx,
      );
    }
    db.prepare(
      "UPDATE projects SET script_json = ?, style_lock = ?, character_lock = ?, title = ?, status = 'ready', updated_at = ? WHERE id = ?",
    ).run(JSON.stringify(script), script.style_lock, script.character_lock, script.title || p.title, Date.now(), p.id);
  });
  tx.immediate();

  return { scenes: script.scenes.length, seconds: script.total_duration_sec, provider, model };
}

function cryptoId(): string {
  return globalThis.crypto.randomUUID();
}

/* -------------------------------- stage: images -------------------------------- */

async function runImages(job: Job): Promise<Record<string, unknown>> {
  const p = project(job.project_id);
  if (!p.script_json) throw new Error("Generate the script first");
  const script = JSON.parse(p.script_json) as Script;
  const rows = scenesOf(p.id);
  const provider = imageProvider(getResolvedKeys(job.user_id));

  const todo = rows.filter((r) => !r.image_asset_id);
  const errors: string[] = [];
  let made = 0;

  await mapLimit(todo, 3, async (row) => {
    const scene = script.scenes.find((s) => s.n === row.n) ?? row;
    try {
      const media = await provider.generate({
        prompt: compileImagePrompt(scene as Scene, script),
        aspect: p.aspect,
        seed: row.n,
      });
      const asset = saveAsset({
        projectId: p.id,
        kind: "image",
        sceneN: row.n,
        data: media.data,
        mime: media.mime,
        meta: { ...media.meta, provider: provider.name },
      });
      getDb().prepare("UPDATE scenes SET image_asset_id = ? WHERE id = ?").run(asset.id, row.id);
      made++;
    } catch (err) {
      errors.push(`scene ${row.n}: ${(err as Error).message}`);
    }
  });

  if (made === 0 && errors.length > 0) throw new Error(errors[0]);
  return { made, pending: todo.length - made, errors: errors.slice(0, 5), provider: provider.name };
}

/* -------------------------------- stage: videos -------------------------------- */

async function runVideos(job: Job): Promise<Record<string, unknown>> {
  const p = project(job.project_id);
  if (!p.script_json) throw new Error("Generate the script first");
  const script = JSON.parse(p.script_json) as Script;
  const rows = scenesOf(p.id);
  const provider = videoProvider(getResolvedKeys(job.user_id));

  const todo = rows.filter((r) => !r.clip_asset_id);
  const errors: string[] = [];
  let made = 0;

  await mapLimit(todo, 2, async (row) => {
    const scene = script.scenes.find((s) => s.n === row.n) ?? row;
    const imageAsset = row.image_asset_id
      ? (getDb().prepare("SELECT path FROM assets WHERE id = ?").get(row.image_asset_id) as { path: string } | undefined)
      : undefined;
    try {
      const media = await provider.generate({
        prompt: compileVideoPrompt(scene as Scene, script),
        imagePath: imageAsset?.path,
        durationSec: Math.round((scene as Scene).duration_sec),
        aspect: p.aspect,
        seed: row.n,
      });
      const asset = saveAsset({
        projectId: p.id,
        kind: "clip",
        sceneN: row.n,
        data: media.data,
        mime: media.mime,
        meta: { ...media.meta, provider: provider.name },
      });
      getDb().prepare("UPDATE scenes SET clip_asset_id = ? WHERE id = ?").run(asset.id, row.id);
      made++;
    } catch (err) {
      errors.push(`scene ${row.n}: ${(err as Error).message}`);
    }
  });

  if (made === 0 && errors.length > 0) throw new Error(errors[0]);
  return { made, pending: todo.length - made, errors: errors.slice(0, 5), provider: provider.name };
}

/* --------------------------------- stage: tts --------------------------------- */

async function runTts(job: Job): Promise<Record<string, unknown>> {
  const p = project(job.project_id);
  if (!p.script_json) throw new Error("Generate the script first");
  const script = JSON.parse(p.script_json) as Script;
  const provider = ttsProvider(getResolvedKeys(job.user_id));

  // One continuous read keeps prosody natural and gives assembly a single track.
  const text = script.scenes.map((s) => s.narration.trim()).join("\n\n");
  const media = await provider.speak({ text });
  const asset = saveAsset({
    projectId: p.id,
    kind: "audio",
    data: media.data,
    mime: media.mime,
    meta: { ...media.meta, provider: provider.name },
  });
  return { assetId: asset.id, bytes: asset.bytes, provider: provider.name };
}

/* ------------------------------ stage: assemble ------------------------------- */

async function runAssemble(job: Job): Promise<Record<string, unknown>> {
  const res = await assembleProject(job.project_id);
  return { assetId: res.assetId, kind: res.kind, note: res.note };
}

/* --------------------------------- the loop ---------------------------------- */

/** When the queue drains for a project, flip it out of "rendering". */
function settleProject(projectId: string): void {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM jobs WHERE project_id = ? AND status IN ('queued','running')")
    .get(projectId) as { c: number };
  if (row.c === 0) {
    db.prepare("UPDATE projects SET status = 'ready', updated_at = ? WHERE id = ?").run(Date.now(), projectId);
  }
}

export async function processNextJob(): Promise<boolean> {
  const job = claimNext();
  if (!job) return false;
  try {
    let result: Record<string, unknown>;
    switch (job.kind) {
      case "script":
        result = await runScript(job);
        break;
      case "images":
        result = await runImages(job);
        break;
      case "videos":
        result = await runVideos(job);
        break;
      case "tts":
        result = await runTts(job);
        break;
      case "assemble":
        result = await runAssemble(job);
        break;
      default:
        throw new Error(`Unknown job kind ${job.kind}`);
    }
    complete(job, result);
    settleProject(job.project_id);
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    // Transient provider trouble: one free retry. Otherwise fail and refund.
    if (retryLater(job, message)) {
      // leave the charge in place; it covers the retry
    } else {
      fail(job, message, { refund: true });
      settleProject(job.project_id);
    }
  }
  return true;
}

type WorkerGlobal = typeof globalThis & { __facelessWorker?: boolean; __facelessBusy?: boolean };

export function ensureWorker(): void {
  const g = globalThis as WorkerGlobal;
  if (g.__facelessWorker) return;
  g.__facelessWorker = true;
  if (process.env.WORKER_DISABLED === "true") return;

  const tick = async () => {
    if (g.__facelessBusy) return;
    g.__facelessBusy = true;
    try {
      // drain a few jobs per tick, but stay responsive
      for (let i = 0; i < 3; i++) {
        const did = await processNextJob();
        if (!did) break;
      }
    } catch (err) {
      console.error("[worker]", err);
    } finally {
      g.__facelessBusy = false;
    }
  };

  setInterval(tick, 1200);
  void tick();
}
