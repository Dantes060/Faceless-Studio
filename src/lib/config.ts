import path from "node:path";

/**
 * Central configuration. Everything is env-driven so the same build runs in
 * mock mode (no keys, no spend) and live mode (real providers).
 */

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

export const DATA_DIR = path.resolve(env("FACELESS_DATA_DIR") ?? "./data");
export const ASSET_DIR = path.join(DATA_DIR, "assets");

export type ProviderMode = "auto" | "mock" | "live";

export const PROVIDER_MODE: ProviderMode =
  (env("PROVIDER_MODE") as ProviderMode | undefined) ?? "auto";

export const LLM = {
  provider: (env("LLM_PROVIDER") ?? "openai") as "openai" | "deepseek" | "custom",
  openaiKey: env("OPENAI_API_KEY"),
  openaiBaseUrl: env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
  openaiModel: env("OPENAI_MODEL") ?? "gpt-4o-mini",
  deepseekKey: env("DEEPSEEK_API_KEY"),
  deepseekBaseUrl: env("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com/v1",
  deepseekModel: env("DEEPSEEK_MODEL") ?? "deepseek-chat",
  customKey: env("LLM_API_KEY"),
  customBaseUrl: env("LLM_BASE_URL"),
  customModel: env("LLM_MODEL"),
};

export const IMAGE = {
  openaiKey: env("OPENAI_API_KEY"),
  model: env("IMAGE_MODEL") ?? "gpt-image-1",
  /** gpt-image-1 accepts 1024x1024 | 1024x1536 | 1536x1024 */
  sizeVertical: env("IMAGE_SIZE_VERTICAL") ?? "1024x1536",
  sizeLandscape: env("IMAGE_SIZE_LANDSCAPE") ?? "1536x1024",
};

export const KLING = {
  accessKey: env("KLING_ACCESS_KEY"),
  secretKey: env("KLING_SECRET_KEY"),
  baseUrl: env("KLING_BASE_URL") ?? "https://api.klingai.com",
  model: env("KLING_MODEL") ?? "kling-v1-6",
  mode: (env("KLING_MODE") ?? "std") as "std" | "pro",
};

export const TTS = {
  openaiKey: env("OPENAI_API_KEY"),
  model: env("TTS_MODEL") ?? "gpt-4o-mini-tts",
  voice: env("TTS_VOICE") ?? "alloy",
};

export const FFMPEG_PATH = env("FFMPEG_PATH");

/** USD value of one credit, used only for display + cost estimates. */
export const CREDIT_USD = Number(env("CREDIT_USD") ?? "0.05");

export const ALLOW_SIGNUP = (env("ALLOW_SIGNUP") ?? "true") !== "false";
export const SIGNUP_FREE_CREDITS = Number(env("SIGNUP_FREE_CREDITS") ?? "500");

export const MAX_SCENES = Number(env("MAX_SCENES") ?? "40");
