import { z } from "zod";

/**
 * The scene contract. Everything downstream (image gen, video gen, TTS,
 * assembly) is driven by this JSON, so it is validated and repaired rather
 * than trusted.
 */

export const sceneSchema = z.object({
  n: z.coerce.number().int().min(1),
  duration_sec: z.coerce.number().min(2).max(15).default(5),
  narration: z.string().min(1),
  on_screen_text: z.string().default(""),
  image_prompt: z.string().min(1),
  video_prompt: z.string().min(1),
  sfx: z.string().default(""),
});

export const scriptSchema = z.object({
  title: z.string().min(1),
  hook: z.string().default(""),
  niche: z.string().default(""),
  total_duration_sec: z.coerce.number().default(0),
  style_lock: z.string().default(""),
  character_lock: z.string().default(""),
  publish: z
    .object({
      title: z.string().default(""),
      description: z.string().default(""),
      hashtags: z.array(z.string()).default([]),
    })
    .default({ title: "", description: "", hashtags: [] }),
  scenes: z.array(sceneSchema).min(1).max(60),
});

export type Scene = z.infer<typeof sceneSchema>;
export type Script = z.infer<typeof scriptSchema>;

/** Strip ```json fences and any chatter around the object. */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON object");
  }
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Validate, then repair the things models reliably get wrong: scene numbering,
 * runaway durations, missing lock strings, scene count drift.
 */
export function normalizeScript(raw: unknown, opts: { sceneCount: number; styleLock?: string; characterLock?: string }): Script {
  const parsed = scriptSchema.parse(raw);
  const scenes = parsed.scenes.slice(0, opts.sceneCount).map((s, i) => ({
    ...s,
    n: i + 1,
    duration_sec: Math.min(15, Math.max(2, Math.round(s.duration_sec))),
    on_screen_text: (s.on_screen_text ?? "").trim(),
    sfx: (s.sfx ?? "").trim(),
  }));
  const style_lock = parsed.style_lock?.trim() || opts.styleLock || "cinematic documentary, 35mm, shallow depth of field, teal-orange grade";
  const character_lock = parsed.character_lock?.trim() || opts.characterLock || "";
  return {
    ...parsed,
    style_lock,
    character_lock,
    total_duration_sec: scenes.reduce((a, s) => a + s.duration_sec, 0),
    publish: {
      title: parsed.publish?.title || parsed.title,
      description: parsed.publish?.description ?? "",
      hashtags: parsed.publish?.hashtags ?? [],
    },
    scenes,
  };
}

/** Compile the stored scene prompt into a provider-ready image prompt. */
export function compileImagePrompt(s: Scene, script: Script): string {
  const parts = [s.image_prompt.trim(), script.style_lock.trim(), script.character_lock.trim()]
    .filter(Boolean)
    .join(", ");
  return `${parts}. No text, no watermark, no logos.`;
}

/** Compile the stored scene prompt into a provider-ready motion prompt. */
export function compileVideoPrompt(s: Scene, script: Script): string {
  const parts = [
    s.video_prompt.trim(),
    script.style_lock.trim(),
    script.character_lock.trim(),
  ]
    .filter(Boolean)
    .join(", ");
  return `${parts}. Single continuous shot, ${Math.round(s.duration_sec)}s, no cuts, no on-screen text.`;
}
