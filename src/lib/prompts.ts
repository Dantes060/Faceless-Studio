import type { Scene, Script } from "./script";

/**
 * The prompt layer. This is the part every "faceless studio" subscription
 * actually sells, so it lives in the repo instead of behind a paywall.
 */

export type Brief = {
  topic: string;
  niche: string;
  aspect: string;
  sceneCount: number;
  clipSeconds: number;
  styleLock?: string;
  characterLock?: string;
  tone?: string;
};

export function buildSystemPrompt(brief: Brief): string {
  return [
    "You are a short-form documentary director who writes faceless vertical video scripts that hold retention.",
    "Return a single JSON object only. No markdown, no commentary.",
    "",
    "Hard rules:",
    "1. The hook must land within the first 3 seconds and open a loop the viewer needs closed.",
    "2. One idea per scene. Narration is spoken text, max 14 words, no camera directions inside it.",
    "3. Every scene is a single continuous shot. No scene may contain a cut, montage, or text overlay request.",
    "4. style_lock and character_lock must be identical, verbatim, in every scene. Never rephrase them per scene.",
    "5. Escalate tension or novelty roughly every 4 scenes. End on a payoff, then one open question that invites comments.",
    "6. No invented statistics, quotes, or named sources. If a fact is uncertain, phrase it as a question or drop it.",
    "7. image_prompt describes a still frame: subject, framing, lens, light, environment. It must not mention motion.",
    "8. video_prompt describes exactly one camera move plus one subject action for a single ~" + brief.clipSeconds + "s clip.",
    "",
    `Format: vertical ${brief.aspect} unless told otherwise. Target ${brief.sceneCount} scenes.`,
  ].join("\n");
}

export function buildUserPrompt(brief: Brief): string {
  const style =
    brief.styleLock?.trim() ||
    "cinematic documentary, 35mm, shallow depth of field, volumetric haze, teal-orange grade";
  const character =
    brief.characterLock?.trim() ||
    "recurring subject: 34-year-old West African man, short faded haircut, thin beard, grey linen shirt, calm expression";

  const shape = {
    title: "string",
    hook: "string",
    niche: brief.niche,
    total_duration_sec: 0,
    style_lock: style,
    character_lock: character,
    publish: { title: "string", description: "string", hashtags: ["string"] },
    scenes: [
      {
        n: 1,
        duration_sec: brief.clipSeconds,
        narration: "max 14 words of spoken narration",
        on_screen_text: "3-5 word caption",
        image_prompt: "still frame description (no motion words)",
        video_prompt: "one camera move + one subject action",
        sfx: "optional sound cue",
      },
    ],
  };

  return [
    `Topic: ${brief.topic}`,
    `Niche/format: ${brief.niche}`,
    brief.tone ? `Tone: ${brief.tone}` : "",
    `Scenes: ${brief.sceneCount}`,
    `Aspect: ${brief.aspect}`,
    "",
    "Return JSON matching exactly this shape (scene 1 shown, produce all scenes):",
    JSON.stringify(shape, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

/* ------------------------------ mock engine ------------------------------ */
/**
 * Deterministic offline script generator so the whole pipeline can be
 * exercised with zero API keys. Deliberately shaped like real output.
 */
export function mockScript(brief: Brief): Script {
  const style =
    brief.styleLock?.trim() ||
    "cinematic documentary, 35mm, shallow depth of field, volumetric haze, teal-orange grade";
  const character =
    brief.characterLock?.trim() ||
    "recurring subject: 34-year-old West African man, short faded haircut, thin beard, grey linen shirt, calm expression";

  const beats = [
    { narr: `Nobody talks about this side of ${brief.topic}.`, text: "The untold part" },
    { narr: `It started small, in a place almost nobody was watching.`, text: "It started small" },
    { narr: `Then one decision changed the entire trajectory.`, text: "One decision" },
    { narr: `Most people would have walked away at this point.`, text: "Most would quit" },
    { narr: `Instead, they doubled down on the one thing that worked.`, text: "They doubled down" },
    { narr: `The numbers only make sense once you see the whole picture.`, text: "See the whole picture" },
    { narr: `Critics said it couldn't scale. It scaled anyway.`, text: "It scaled anyway" },
    { narr: `Here is where the story turns.`, text: "The turn" },
    { narr: `What looks like luck is usually a system running quietly.`, text: "Not luck" },
    { narr: `And that system is repeatable, if you are patient.`, text: "Repeatable" },
  ];

  const scenes: Scene[] = Array.from({ length: brief.sceneCount }, (_, i) => {
    const beat = beats[i % beats.length];
    const variant = Math.floor(i / beats.length);
    return {
      n: i + 1,
      duration_sec: brief.clipSeconds,
      narration: variant === 0 ? beat.narr : `${beat.narr.replace(/\.$/, "")}, again.`,
      on_screen_text: beat.text,
      image_prompt: `${beat.text}. ${character}. Wide environmental frame showing a quiet interior with practical light and dust in the air`,
      video_prompt: "Slow push in, subject turns slightly toward camera and settles",
      sfx: i === 0 ? "low sub drop" : "room tone",
    };
  });

  return {
    title: `${brief.topic}: the part nobody explains`,
    hook: scenes[0]?.narration ?? "",
    niche: brief.niche,
    total_duration_sec: scenes.reduce((a, s) => a + s.duration_sec, 0),
    style_lock: style,
    character_lock: character,
    publish: {
      title: `${brief.topic} — the part nobody explains`,
      description: `A short documentary on ${brief.topic}. Written for ${brief.niche}.`,
      hashtags: ["#documentary", "#storytime", "#explained"],
    },
    scenes,
  };
}
