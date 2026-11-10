import { IMAGE, LLM } from "../config";
import { fetchJson, ProviderError, type ImageProvider, type Media } from "./types";
import { svgStill } from "./mock";

/**
 * gpt-image-1 / DALL·E via the Images API. Kept behind the ImageProvider
 * interface so Flux (fal/Replicate) or Imagen can be dropped in without
 * touching the worker.
 */
export class OpenAIImage implements ImageProvider {
  readonly name = "openai-images";
  readonly live = true;
  constructor(private readonly apiKey: string, private readonly model = IMAGE.model) {}

  async generate(args: { prompt: string; aspect: string; seed?: number }): Promise<Media> {
    const size =
      args.aspect === "16:9"
        ? IMAGE.sizeLandscape
        : args.aspect === "1:1"
          ? "1024x1024"
          : IMAGE.sizeVertical;

    const json = (await fetchJson(
      `${LLM.openaiBaseUrl}/images/generations`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, prompt: args.prompt, n: 1, size }),
      },
      240_000,
    )) as {
      data?: { b64_json?: string; url?: string }[];
      error?: { message?: string };
    };

    const first = json.data?.[0];
    if (!first) throw new ProviderError(json.error?.message ?? "No image returned");

    if (first.b64_json) {
      return {
        data: Buffer.from(first.b64_json, "base64"),
        mime: "image/png",
        meta: { provider: this.name, model: this.model, size },
      };
    }
    if (first.url) {
      const res = await fetch(first.url);
      if (!res.ok) throw new ProviderError(`Could not download image: HTTP ${res.status}`);
      return {
        data: Buffer.from(await res.arrayBuffer()),
        mime: res.headers.get("content-type") ?? "image/png",
        meta: { provider: this.name, model: this.model, size, url: first.url },
      };
    }
    throw new ProviderError("Image response had neither b64_json nor url");
  }
}

export class MockImage implements ImageProvider {
  readonly name = "mock";
  readonly live = false;

  async generate(args: {
    prompt: string;
    aspect: string;
    seed?: number;
  }): Promise<Media> {
    // Deterministic index is passed via seed by the worker.
    return {
      data: svgStill({
        index: (args.seed ?? 0) || 1,
        title: "scene still",
        prompt: args.prompt,
        aspect: args.aspect,
      }),
      mime: "image/svg+xml",
      meta: { provider: "mock" },
    };
  }
}
