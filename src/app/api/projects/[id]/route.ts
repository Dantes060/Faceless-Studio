import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildSnapshot } from "@/lib/snapshot";
import { ensureWorker } from "@/lib/worker";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const user = await requireUser();
    ensureWorker();
    const { id } = await ctx.params;
    const snapshot = buildSnapshot(user.id, id);
    if (!snapshot) return json({ error: "Project not found" }, 404);
    return json(snapshot);
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    getDb().prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(id, user.id);
    return json({ ok: true });
  });
}
