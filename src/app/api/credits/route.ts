import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { balance, ledger } from "@/lib/credits";

export async function GET() {
  return route(async () => {
    const user = await requireUser();
    const projects = getDb()
      .prepare("SELECT COUNT(*) AS c FROM projects WHERE user_id = ?")
      .get(user.id) as { c: number };
    return json({ balance: balance(user.id), ledger: ledger(user.id, 40), projects: projects.c });
  });
}
