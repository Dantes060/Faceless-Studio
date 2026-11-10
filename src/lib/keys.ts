import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, FFMPEG_PATH, IMAGE, KLING, LLM, PROVIDER_MODE, TTS } from "./config";
import { getDb } from "./db";

/**
 * Per-account API keys, encrypted at rest.
 *
 * Resolution order: a user's in-app value wins, then the process env var.
 * Clearing the in-app value simply falls back to env, so `.env` remains the
 * safe "server default" and the UI is a per-account override.
 */

export type KeyProviderId = "openai" | "deepseek" | "kling_access" | "kling_secret";

export type KeyStatus = {
  id: KeyProviderId;
  label: string;
  hint: string;
  configured: boolean;
  source: "app" | "env" | null;
  masked: string | null;
};

export const KEY_PROVIDERS: { id: KeyProviderId; label: string; hint: string }[] = [
  {
    id: "openai",
    label: "OpenAI",
    hint: "Script (gpt-4o-mini), scene stills (gpt-image-1), narration (TTS)",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    hint: "Cheaper script generation — set LLM_PROVIDER=deepseek in .env",
  },
  {
    id: "kling_access",
    label: "Kling Access Key",
    hint: "Video generation (the access half of the API pair)",
  },
  {
    id: "kling_secret",
    label: "Kling Secret Key",
    hint: "Video generation (the secret half of the API pair)",
  },
];

export type ResolvedKeys = {
  openaiKey?: string;
  deepseekKey?: string;
  customLlmKey?: string;
  klingAccess?: string;
  klingSecret?: string;
};

export function resolveEnvKeys(): ResolvedKeys {
  return {
    openaiKey: LLM.openaiKey,
    deepseekKey: LLM.deepseekKey,
    customLlmKey: LLM.customKey,
    klingAccess: KLING.accessKey,
    klingSecret: KLING.secretKey,
  };
}

/* --------------------------------- crypto --------------------------------- */

function secretKey(): Buffer {
  const fromEnv = process.env.APP_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    return crypto.createHash("sha256").update(fromEnv).digest();
  }
  const file = path.join(DATA_DIR, "secret.key");
  let raw: string;
  if (fs.existsSync(file)) {
    raw = fs.readFileSync(file, "utf8").trim();
  } else {
    raw = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, raw, { mode: 0o600 });
  }
  return crypto.createHash("sha256").update(raw).digest();
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

function decryptSafe(payload: string): string | null {
  try {
    const [iv, tag, data] = payload.split(".").map((s) => Buffer.from(s, "base64"));
    if (!iv || !tag || !data) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null; // secret rotated or tampered — treat as unset
  }
}

/* ---------------------------------- store --------------------------------- */

export function setUserKey(userId: string, provider: KeyProviderId, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    getDb().prepare("DELETE FROM api_keys WHERE user_id = ? AND provider = ?").run(userId, provider);
    return;
  }
  getDb()
    .prepare(
      `INSERT INTO api_keys (user_id, provider, secret_enc, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(user_id, provider)
       DO UPDATE SET secret_enc = excluded.secret_enc, updated_at = excluded.updated_at`,
    )
    .run(userId, provider, encrypt(trimmed), Date.now());
}

function userKeyMap(userId: string): Partial<Record<KeyProviderId, string>> {
  const rows = getDb()
    .prepare("SELECT provider, secret_enc FROM api_keys WHERE user_id = ?")
    .all(userId) as { provider: string; secret_enc: string }[];
  const out: Partial<Record<KeyProviderId, string>> = {};
  for (const r of rows) {
    const plain = decryptSafe(r.secret_enc);
    if (plain) out[r.provider as KeyProviderId] = plain;
  }
  return out;
}

export function getResolvedKeys(userId: string): ResolvedKeys {
  const user = userKeyMap(userId);
  return {
    openaiKey: user.openai ?? LLM.openaiKey,
    deepseekKey: user.deepseek ?? LLM.deepseekKey,
    customLlmKey: LLM.customKey,
    klingAccess: user.kling_access ?? KLING.accessKey,
    klingSecret: user.kling_secret ?? KLING.secretKey,
  };
}

/* --------------------------------- status --------------------------------- */

export function isLiveFor(keys: ResolvedKeys, kind: "llm" | "image" | "video" | "tts"): boolean {
  if (PROVIDER_MODE === "mock") return false;
  if (PROVIDER_MODE === "live") return true;
  switch (kind) {
    case "llm":
      if (LLM.provider === "deepseek") return Boolean(keys.deepseekKey);
      if (LLM.provider === "custom") return Boolean(keys.customLlmKey && LLM.customBaseUrl);
      return Boolean(keys.openaiKey);
    case "image":
      return Boolean(keys.openaiKey);
    case "video":
      return Boolean(keys.klingAccess && keys.klingSecret);
    case "tts":
      return Boolean(keys.openaiKey);
  }
}

export function providerStatus(keys: ResolvedKeys) {
  return {
    mode: PROVIDER_MODE,
    llm: {
      live: isLiveFor(keys, "llm"),
      provider: LLM.provider,
      model: LLM.provider === "deepseek" ? LLM.deepseekModel : LLM.openaiModel,
    },
    image: { live: isLiveFor(keys, "image"), model: IMAGE.model },
    video: { live: isLiveFor(keys, "video"), model: KLING.model },
    tts: { live: isLiveFor(keys, "tts"), model: TTS.model },
    ffmpeg: Boolean(FFMPEG_PATH) || "path",
  };
}

function mask(value: string): string {
  return value.length > 8 ? `••••••${value.slice(-4)}` : "••••••";
}

export function keyStatus(userId: string): KeyStatus[] {
  const user = userKeyMap(userId);
  const env = resolveEnvKeys();
  const envByProvider: Record<KeyProviderId, string | undefined> = {
    openai: env.openaiKey,
    deepseek: env.deepseekKey,
    kling_access: env.klingAccess,
    kling_secret: env.klingSecret,
  };

  return KEY_PROVIDERS.map((p) => {
    const userVal = user[p.id];
    const envVal = envByProvider[p.id];
    const value = userVal ?? envVal;
    return {
      id: p.id,
      label: p.label,
      hint: p.hint,
      configured: Boolean(value),
      source: userVal ? "app" : envVal ? "env" : null,
      masked: value ? mask(value) : null,
    };
  });
}
