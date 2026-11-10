import crypto from "node:crypto";
import { json, readJson, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { balance } from "@/lib/credits";
import { MAX_SCENES } from "@/lib/config";
import { ensureWorker } from "@/lib/worker";

type CreateBody = {
  topic?: string;
  title?: string;
  niche?: string;
  sceneCount?: number;
  aspect?: string;
  styleLock?: string;
  characterLock?: string;
};

export async function GET() {
  return route(async () => {
    const user = await requireUser();
    const projects = getDb()
      .prepare(
        `SELECT p.*, (SELECT COUNT(*) FROM assets a WHERE a.project_id = p.id AND a.kind = 'export') AS exports
           FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC`,
      )
      .all(user.id);
    return json({ projects, balance: balance(user.id) });
  });
}

export async function POST(req: Request) {
  return route(async () => {
    const user = await requireUser();
    ensureWorker();
    const body = await readJson<CreateBody>(req);

    const topic = (body.topic ?? "").trim();
    if (topic.length < 3) return json({ error: "Give the project a topic (3+ characters)" }, 400);

    const sceneCount = Math.min(MAX_SCENES, Math.max(3, Number(body.sceneCount) || 12));
    const aspect = ["9:16", "16:9", "1:1"].includes(body.aspect ?? "") ? body.aspect! : "9:16";
    const id = crypto.randomUUID();
    const now = Date.now();

    getDb()
      .prepare(
        `INSERT INTO projects (id, user_id, title, topic, niche, aspect, scene_count, style_lock, character_lock, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,'draft',?,?)`,
      )
      .run(
        id,
        user.id,
        (body.title ?? "").trim() || topic.slice(0, 80),
        topic,
        (body.niche ?? "documentary").trim() || "documentary",
        aspect,
        sceneCount,
        (body.styleLock ?? "").trim(),
        (body.characterLock ?? "").trim(),
        now,
        now,
      );

    return json({ id });
  });
}
