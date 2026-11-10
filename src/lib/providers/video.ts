import crypto from "node:crypto";
import fs from "node:fs";
import { KLING } from "../config";
import { fetchJson, ProviderError, type Media, type VideoProvider } from "./types";
import { svgStill } from "./mock";

/**
 * Kling AI (official API). Auth is a short-lived HS256 JWT signed with the
 * access/secret key pair — not a bearer API key.
 *
 * Flow: create task → poll task → download the resulting mp4 and store it
 * locally, so the app never depends on a provider URL surviving.
 */
export class KlingVideo implements VideoProvider {
  readonly name = "kling";
  readonly live = true;

  constructor(
    private readonly accessKey: string,
    private readonly secretKey: string,
  ) {}

  private token(): string {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "HS256", typ: "JWT" };
    const payload = { iss: this.accessKey, exp: now + 1800, nbf: now - 5 };
    const unsigned = `${b64(header)}.${b64(payload)}`;
    const sig = crypto.createHmac("sha256", this.secretKey).update(unsigned).digest("base64url");
    return `${unsigned}.${sig}`;
  }

  private headers() {
    return { "content-type": "application/json", authorization: `Bearer ${this.token()}` };
  }

  async generate(args: {
    prompt: string;
    imagePath?: string;
    mime?: string;
    durationSec: number;
    aspect: string;
  }): Promise<Media> {
    const i2v = Boolean(args.imagePath);
    const route = i2v ? "/v1/videos/image2video" : "/v1/videos/text2video";
    const duration = args.durationSec > 5 ? "10" : "5";

    const body: Record<string, unknown> = {
      model_name: KLING.model,
      prompt: args.prompt,
      negative_prompt: "blurry, distorted anatomy, warped face, text, watermark, logo, extra fingers",
      cfg_scale: 0.5,
      mode: KLING.mode,
      duration,
    };
    if (i2v) {
      body.image = fs.readFileSync(args.imagePath!).toString("base64");
    } else {
      body.aspect_ratio = args.aspect;
    }

    const created = (await fetchJson(
      `${KLING.baseUrl}${route}`,
      { method: "POST", headers: this.headers(), body: JSON.stringify(body) },
      120_000,
    )) as { code?: number; message?: string; data?: { task_id?: string; task_status?: string } };

    if (created.code !== 0 || !created.data?.task_id) {
      throw new ProviderError(`Kling rejected the job: ${created.message ?? "unknown"}`, undefined, JSON.stringify(created).slice(0, 500));
    }
    const taskId = created.data.task_id;

    const deadline = Date.now() + 10 * 60_000;
    let status = created.data.task_status ?? "submitted";
    let last: unknown = created;

    while (Date.now() < deadline) {
      if (status === "succeed") break;
      if (status === "failed") {
        throw new ProviderError("Kling task failed", undefined, JSON.stringify(last).slice(0, 500));
      }
      await sleep(5000);
      last = await fetchJson(`${KLING.baseUrl}${route}/${taskId}`, { headers: this.headers() }, 60_000);
      const poll = last as { code?: number; data?: { task_status?: string } };
      status = poll.data?.task_status ?? status;
    }
    if (status !== "succeed") throw new ProviderError("Kling task timed out");

    const result = last as {
      data?: { task_result?: { videos?: { url?: string; duration?: string }[] } };
    };
    const url = result.data?.task_result?.videos?.[0]?.url;
    if (!url) throw new ProviderError("Kling returned no video URL");

    const res = await fetch(url);
    if (!res.ok) throw new ProviderError(`Could not download Kling clip: HTTP ${res.status}`);
    return {
      data: Buffer.from(await res.arrayBuffer()),
      mime: res.headers.get("content-type") ?? "video/mp4",
      meta: { provider: this.name, model: KLING.model, task_id: taskId, mode: KLING.mode },
    };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Offline clip: a labelled still, so assembly still has something to lay down. */
export class MockVideo implements VideoProvider {
  readonly name = "mock";
  readonly live = false;
  async generate(args: {
    prompt: string;
    imagePath?: string;
    durationSec: number;
    aspect: string;
    seed?: number;
  }): Promise<Media> {
    return {
      data: svgStill({
        index: args.seed ?? 1,
        title: "scene clip",
        prompt: args.prompt,
        aspect: args.aspect,
        badge: "MOCK CLIP",
      }),
      mime: "image/svg+xml",
      meta: { provider: "mock", duration: args.durationSec },
    };
  }
}
