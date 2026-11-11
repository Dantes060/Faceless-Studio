import { TTS } from "../config";
import { ProviderError, type Media, type TtsProvider } from "./types";
import { silentWav } from "./mock";

/**
 * OpenAI-compatible text-to-speech.
 *
 * Covers OpenAI (`gpt-4o-mini-tts`) and any self-hosted server that mirrors
 * `POST /v1/audio/speech` — notably VoiceStudio. Only baseUrl/apiKey/model
 * differ, so both share this adapter.
 *
 * Two details matter in production:
 *  - Both OpenAI and VoiceStudio cap `input` at 4096 characters, so long
 *    narration is chunked at sentence boundaries.
 *  - We ask for WAV and re-assemble a single correct RIFF header, instead of
 *    concatenating MP3 frames and hoping the player tolerates it.
 */

const MAX_CHARS = 3000;

export class OpenAiCompatibleTts implements TtsProvider {
  readonly live = true;

  constructor(
    readonly name: string,
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly model: string,
    private readonly defaultVoice: string,
  ) {}

  async speak(args: { text: string; voice?: string }): Promise<Media> {
    const voice = args.voice ?? this.defaultVoice;
    const chunks = chunkText(args.text, MAX_CHARS);
    if (chunks.length === 0) throw new ProviderError("Nothing to narrate");

    const parts: { data: Buffer; mime: string }[] = [];
    for (const chunk of chunks) {
      parts.push(await this.synthesize(chunk, voice));
    }

    const merged = concatWavParts(parts.map((p) => p.data));
    return {
      data: merged.data,
      mime: merged.mime,
      meta: {
        provider: this.name,
        model: this.model,
        voice,
        chunks: chunks.length,
      },
    };
  }

  private async synthesize(input: string, voice: string): Promise<{ data: Buffer; mime: string }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 300_000);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/audio/speech`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          input,
          voice,
          response_format: "wav",
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 500);
        throw new ProviderError(
          `${this.name} TTS failed: HTTP ${res.status}`,
          res.status,
          detail || undefined,
        );
      }
      return {
        data: Buffer.from(await res.arrayBuffer()),
        mime: res.headers.get("content-type") ?? "audio/wav",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Split on sentence boundaries so each request stays under the provider cap. */
export function chunkText(text: string, max = MAX_CHARS): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];

  const sentences = clean.match(/[^.!?\n]+[.!?]*\s*/g) ?? [clean];
  const out: string[] = [];
  let buf = "";

  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;

    if (s.length > max) {
      // A single monster sentence: hard-split it.
      if (buf) {
        out.push(buf);
        buf = "";
      }
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
      continue;
    }
    if (buf.length + s.length + 1 > max) {
      out.push(buf);
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

type WavFormat = { channels: number; sampleRate: number; bits: number };

function parseWav(b: Buffer): { format: WavFormat; data: Buffer } | null {
  if (b.length < 44 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }
  let pos = 12;
  let format: WavFormat | null = null;
  let data: Buffer | null = null;

  while (pos + 8 <= b.length) {
    const id = b.toString("ascii", pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt " && body + 16 <= b.length) {
      format = {
        channels: b.readUInt16LE(body + 2),
        sampleRate: b.readUInt32LE(body + 4),
        bits: b.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      data = b.subarray(body, Math.min(body + size, b.length));
    }
    pos = body + size + (size % 2);
  }
  if (!format || !data) return null;
  return { format, data };
}

function buildWav(data: Buffer, format: WavFormat): Buffer {
  const blockAlign = format.channels * Math.max(1, format.bits / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(format.channels, 22);
  header.writeUInt32LE(format.sampleRate, 24);
  header.writeUInt32LE(format.sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(format.bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Stitch chunk audio back into one file with a single valid header. */
export function concatWavParts(parts: Buffer[]): { data: Buffer; mime: string } {
  if (parts.length === 1) return { data: parts[0], mime: "audio/wav" };

  const parsed = parts.map(parseWav);
  if (parsed.every((p): p is { format: WavFormat; data: Buffer } => p !== null)) {
    return {
      data: buildWav(Buffer.concat(parsed.map((p) => p.data)), parsed[0].format),
      mime: "audio/wav",
    };
  }
  // Provider ignored response_format: fall back to raw concatenation.
  return { data: Buffer.concat(parts), mime: "audio/mpeg" };
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

/** Kept for the default OpenAI path so call sites stay readable. */
export function openAiTts(apiKey: string | undefined): TtsProvider {
  return new OpenAiCompatibleTts(
    "openai-tts",
    TTS.baseUrl,
    apiKey ?? TTS.apiKey,
    TTS.model,
    TTS.voice,
  );
}
