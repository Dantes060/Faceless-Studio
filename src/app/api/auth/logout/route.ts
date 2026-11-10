import { json, route } from "@/lib/api";
import { endSession } from "@/lib/auth";

export async function POST() {
  return route(async () => {
    await endSession();
    return json({ ok: true });
  });
}
