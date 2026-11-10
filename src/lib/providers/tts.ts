import { LLM, TTS } from "../config";
import { ProviderError, type Media, type TtsProvider } from "./types";
import { silentWav } from "./mock";

export class OpenAITts implements TtsProvider {
  readonly name = "openai-tts";
  readonly live = true;
  constructor(private readonly apiKey: string) {}

  async speak(args: { text: string; voice?: string }): Promise<Media> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 180_000);
    try {
      const res = await fetch(`${LLM.openaiBaseUrl}/audio/speech`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: TTS.model,
          voice: args.voice ?? TTS.voice,
          input: args.text,
          response_format: "mp3",
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new ProviderError(`TTS failed: HTTP ${res.status}`, res.status, (await res.text()).slice(0, 500));
      }
      return {
        data: Buffer.from(await res.arrayBuffer()),
        mime: res.headers.get("content-type") ?? "audio/mpeg",
        meta: { provider: this.name, model: TTS.model },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Silence sized to the script, so timing in the cut stays believable. */
export class MockTts implements TtsProvider {
  readonly name = "mock";
  readonly live = false;
  async speak(args: { text: string }): Promise<Media> {
    const words = args.text.trim().split(/\s+/).filter(Boolean).length;
    const seconds = Math.max(2, words / 2.6);
    return {
      data: silentWav(seconds),
      mime: "audio/wav",
      meta: { provider: "mock", seconds: Number(seconds.toFixed(2)), words },
    };
  }
}
