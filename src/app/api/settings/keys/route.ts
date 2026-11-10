import { json, readJson, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { KEY_PROVIDERS, keyStatus, setUserKey, type KeyProviderId } from "@/lib/keys";

const IDS = new Set(KEY_PROVIDERS.map((p) => p.id));

export async function GET() {
  return route(async () => {
    const user = await requireUser();
    return json({ providers: keyStatus(user.id) });
  });
}

export async function PUT(req: Request) {
  return route(async () => {
    const user = await requireUser();
    const body = await readJson<{ provider?: string; value?: string }>(req);
    if (!body.provider || !IDS.has(body.provider as KeyProviderId)) {
      return json({ error: `Unknown provider. Use one of: ${[...IDS].join(", ")}` }, 400);
    }
    const value = typeof body.value === "string" ? body.value : "";
    if (value.length > 500) return json({ error: "Key is too long" }, 400);

    setUserKey(user.id, body.provider as KeyProviderId, value);
    return json({ providers: keyStatus(user.id) });
  });
}
