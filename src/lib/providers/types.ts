export type LlmResult = {
  text: string;
  provider: string;
  model: string;
  live: boolean;
  ms: number;
};

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  readonly live: boolean;
  complete(args: {
    system: string;
    user: string;
    json?: boolean;
    temperature?: number;
    maxTokens?: number;
  }): Promise<LlmResult>;
}

export type Media = {
  data: Buffer;
  mime: string;
  meta?: Record<string, unknown>;
};

export interface ImageProvider {
  readonly name: string;
  readonly live: boolean;
  generate(args: { prompt: string; aspect: string; seed?: number }): Promise<Media>;
}

export interface VideoProvider {
  readonly name: string;
  readonly live: boolean;
  generate(args: {
    prompt: string;
    /** local still to animate (image-to-video) */
    imagePath?: string;
    mime?: string;
    durationSec: number;
    aspect: string;
    seed?: number;
  }): Promise<Media>;
}

export interface TtsProvider {
  readonly name: string;
  readonly live: boolean;
  speak(args: { text: string; voice?: string }): Promise<Media>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs = 120_000,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) {
      throw new ProviderError(`HTTP ${res.status} from ${new URL(url).host}`, res.status, text.slice(0, 800));
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new ProviderError("Provider returned non-JSON", res.status, text.slice(0, 800));
    }
  } finally {
    clearTimeout(timer);
  }
}
