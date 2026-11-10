import { json, readJson, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { balance } from "@/lib/credits";
import { chargeAndEnqueue, stageCost, STAGES, type Stage } from "@/lib/pipeline";
import { ensureWorker } from "@/lib/worker";

/**
 * The only place work is created. Debits the ledger, then queues the stages.
 * Every stage is idempotent: re-running fills only what is missing.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const user = await requireUser();
    ensureWorker();
    const { id } = await ctx.params;

    const owned = getDb()
      .prepare("SELECT id, script_json FROM projects WHERE id = ? AND user_id = ?")
      .get(id, user.id) as { id: string; script_json: string | null } | undefined;
    if (!owned) return json({ error: "Project not found" }, 404);

    const { stage } = await readJson<{ stage?: string }>(req);
    const requested = stage ?? "script";
    if (requested !== "all" && !STAGES.includes(requested as Stage)) {
      return json({ error: `Unknown stage: ${requested}` }, 400);
    }
    if (requested !== "script" && requested !== "all" && !owned.script_json) {
      return json({ error: "Generate the script first" }, 409);
    }

    const cost = requested === "all" ? undefined : stageCost(id, requested as Stage);
    const result = chargeAndEnqueue({ userId: user.id, projectId: id, stage: requested as Stage | "all" });

    return json({ ...result, cost, balance: balance(user.id) });
  });
}
