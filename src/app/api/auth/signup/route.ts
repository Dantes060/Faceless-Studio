import { json, readJson, route } from "@/lib/api";
import { createUser, startSession } from "@/lib/auth";

export async function POST(req: Request) {
  return route(async () => {
    const { email, password } = await readJson<{ email?: string; password?: string }>(req);
    if (!email || !password) return json({ error: "Email and password are required" }, 400);
    const user = createUser(email, password);
    await startSession(user.id);
    return json({ id: user.id, email: user.email });
  });
}
