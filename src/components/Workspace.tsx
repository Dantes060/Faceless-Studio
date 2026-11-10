"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AssetView as Asset, JobView as Job, Scene, Snapshot } from "@/lib/types";


const STAGE_LABEL: Record<string, string> = {
  script: "Script & prompts",
  images: "Scene stills",
  videos: "Motion clips",
  tts: "Narration",
  assemble: "Assemble cut",
};

export function Workspace({ id, initialData }: { id: string; initialData?: Snapshot }) {
  const [data, setData] = useState<Snapshot | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
      const body = (await res.json()) as Snapshot & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not load project");
      if (alive.current) {
        setData(body);
        setError(null);
      }
    } catch (err) {
      if (alive.current) setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = setInterval(() => void load(), 2500);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [load]);

  async function run(stage: string) {
    setBusy(stage);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${id}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const body = (await res.json()) as { error?: string; jobs?: unknown[]; cost?: number };
      if (!res.ok) throw new Error(body.error ?? "Could not queue the job");
      setNote(stage === "all" ? "Queued the full pipeline." : `Queued ${STAGE_LABEL[stage] ?? stage}.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-sm text-ink-400">{error ?? "Loading project…"}</p>
      </main>
    );
  }

  const { project, scenes, assets, jobs, balance, prices, providers } = data;
  const images = assets.filter((a) => a.kind === "image");
  const clips = assets.filter((a) => a.kind === "clip");
  const audio = assets.filter((a) => a.kind === "audio").at(-1);
  const exported = assets.filter((a) => a.kind === "export").at(-1);
  const storyboard = assets.filter((a) => a.kind === "storyboard").at(-1);
  const activeJobs = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const isBusy = activeJobs.length > 0;
  const allRendered =
    scenes.length > 0 &&
    images.length >= scenes.length &&
    clips.length >= scenes.length &&
    Boolean(audio) &&
    Boolean(exported ?? storyboard);

  const progress: Record<string, { done: number; total: number }> = {
    script: { done: scenes.length > 0 ? 1 : 0, total: 1 },
    images: { done: images.length, total: scenes.length || project.scene_count },
    videos: { done: clips.length, total: scenes.length || project.scene_count },
    tts: { done: audio ? 1 : 0, total: 1 },
    assemble: { done: exported || storyboard ? 1 : 0, total: 1 },
  };

  const imageByScene = new Map(images.map((a) => [a.scene_n, a]));
  const publish = project.script_json
    ? (JSON.parse(project.script_json) as { publish?: { title: string; description: string; hashtags: string[] } }).publish
    : undefined;

  return (
    <main className="mx-auto max-w-6xl px-6 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-4 py-6">
        <div className="flex items-center gap-3">
          <Link href="/studio" className="btn-ghost px-3 py-1.5 text-xs">
            ← Projects
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-tight">{project.title}</h1>
            <p className="text-xs text-ink-500">
              {project.niche} · {project.scene_count} shots · {project.aspect} · {project.status}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="pill">
            <span className="tabular-nums text-lime-400">{balance} cr</span>
          </span>
          <button onClick={() => run("all")} disabled={isBusy || busy !== null} className="btn-primary">
            {isBusy ? "Rendering…" : allRendered ? `Re-render all · ${prices.total} cr` : `Run everything · ${prices.total} cr`}
          </button>
        </div>
      </header>

      {(error || note) && (
        <div
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            error
              ? "border-red-500/30 bg-red-500/10 text-red-300"
              : "border-lime-400/30 bg-lime-400/10 text-lime-200"
          }`}
        >
          {error ?? note}
        </div>
      )}

      <section className="card mb-6 grid gap-px overflow-hidden bg-ink-800/60 sm:grid-cols-5">
        {(["script", "images", "videos", "tts", "assemble"] as const).map((stage) => {
          const p = progress[stage];
          const done = p.done >= p.total && p.total > 0;
          const cost = prices.stages[stage] ?? 0;
          return (
            <div key={stage} className="bg-ink-900 px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">
                  {STAGE_LABEL[stage]}
                </span>
                {done && <span className="text-lime-400">✓</span>}
              </div>
              <div className="mt-2 text-sm tabular-nums text-ink-200">
                {p.done}/{p.total}
              </div>
              <button
                onClick={() => run(stage)}
                disabled={isBusy || busy !== null || cost === 0}
                className="mt-2 w-full rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-300 transition hover:border-lime-400/50 hover:text-ink-100 disabled:opacity-35"
              >
                {busy === stage ? "…" : done ? `Re-run · ${cost} cr` : `Run · ${cost} cr`}
              </button>
            </div>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {scenes.length === 0 ? (
            <div className="card grid place-items-center px-6 py-16 text-center">
              <p className="max-w-sm text-sm text-ink-400">
                No scenes yet. Run <span className="text-ink-200">Script &amp; prompts</span> — the engine
                writes the hook, the beats, and a locked prompt for every shot.
              </p>
            </div>
          ) : (
            <ol className="space-y-3">
              {scenes.map((s) => {
                const img = imageByScene.get(s.n);
                const clip = clips.find((c) => c.scene_n === s.n);
                return (
                  <li key={s.id} className="card flex gap-4 p-4">
                    <div className="h-28 w-16 shrink-0 overflow-hidden rounded-lg border border-ink-700 bg-ink-950">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img.url} alt={`scene ${s.n}`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-[10px] text-ink-600">no still</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="mono text-lime-400">{String(s.n).padStart(2, "0")}</span>
                        <span className="text-xs text-ink-500">{s.duration_sec}s</span>
                        {clip && <span className="pill">clip</span>}
                      </div>
                      <p className="mt-1 font-medium leading-snug">{s.narration}</p>
                      {s.on_screen_text && (
                        <p className="mt-1 text-[11px] uppercase tracking-widest text-ink-500">
                          on screen: {s.on_screen_text}
                        </p>
                      )}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-ink-500 hover:text-ink-300">
                          prompts
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-ink-950/80 p-3 text-[11px] leading-relaxed text-ink-400">
                          {`IMAGE\n${s.image_prompt}\n\nMOTION\n${s.video_prompt}`}
                        </pre>
                      </details>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Preview</h2>
            {exported ? (
              exported.mime.startsWith("video/") ? (
                <video src={exported.url} controls className="mt-3 w-full rounded-lg border border-ink-700" />
              ) : (
                <a href={exported.url} className="btn-ghost mt-3 w-full">
                  Download export
                </a>
              )
            ) : storyboard ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs leading-relaxed text-ink-400">
                  ffmpeg was not found, so this run produced a storyboard instead of an mp4.
                </p>
                <a href={storyboard.url} className="btn-ghost w-full">
                  Download storyboard
                </a>
              </div>
            ) : (
              <p className="mt-3 text-xs text-ink-500">Nothing rendered yet.</p>
            )}

            {audio && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Narration</h3>
                <audio src={audio.url} controls className="mt-2 w-full" />
              </div>
            )}
          </div>

          <div className="card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Locks</h2>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              <span className="text-ink-300">style:</span> {project.style_lock || "—"}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
              <span className="text-ink-300">character:</span> {project.character_lock || "—"}
            </p>
          </div>

          {publish && (
            <div className="card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Publish copy</h2>
              <p className="mt-2 text-sm font-semibold">{publish.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{publish.description}</p>
              <p className="mt-2 text-[11px] text-lime-400/90">{publish.hashtags.join(" ")}</p>
            </div>
          )}

          <div className="card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Jobs</h2>
            {jobs.length === 0 ? (
              <p className="mt-2 text-xs text-ink-500">No jobs yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {jobs.map((j) => (
                  <li key={j.id} className="text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink-300">{STAGE_LABEL[j.kind] ?? j.kind}</span>
                      <span
                        className={
                          j.status === "done"
                            ? "text-lime-400"
                            : j.status === "failed"
                              ? "text-red-400"
                              : "text-amber-300"
                        }
                      >
                        {j.status}
                      </span>
                    </div>
                    {j.error && <p className="mt-0.5 line-clamp-2 text-red-400/80">{j.error}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="px-1 text-[11px] leading-relaxed text-ink-600">
            text {providers.llm.live ? providers.llm.model : "mock"} · image{" "}
            {providers.image.live ? providers.image.model : "mock"} · video{" "}
            {providers.video.live ? providers.video.model : "mock"}
          </p>
        </aside>
      </div>
    </main>
  );
}
