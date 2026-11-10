"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const NICHES = ["documentary", "history", "psychology", "business", "true crime", "motivation", "kids cartoon"];

export function NewProjectForm({ maxScenes }: { maxScenes: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [niche, setNiche] = useState("documentary");
  const [sceneCount, setSceneCount] = useState(12);
  const [aspect, setAspect] = useState("9:16");
  const [styleLock, setStyleLock] = useState("");
  const [characterLock, setCharacterLock] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, niche, sceneCount, aspect, styleLock, characterLock }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Could not create project");
      router.push(`/studio/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary px-5 py-2.5">
        + New project
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold">New project</h2>
          <p className="mt-1 text-sm text-ink-400">One topic. The script engine does the rest.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-ink-500 hover:text-ink-200">
          ✕
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label" htmlFor="topic">
            Topic or angle
          </label>
          <input
            id="topic"
            required
            minLength={3}
            className="input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Why Rome never recovered after 476 AD"
          />
        </div>

        <div>
          <label className="label" htmlFor="niche">
            Format
          </label>
          <select id="niche" className="input" value={niche} onChange={(e) => setNiche(e.target.value)}>
            {NICHES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="aspect">
            Aspect
          </label>
          <select id="aspect" className="input" value={aspect} onChange={(e) => setAspect(e.target.value)}>
            <option value="9:16">9:16 — Shorts / TikTok</option>
            <option value="16:9">16:9 — long form</option>
            <option value="1:1">1:1 — square</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="label" htmlFor="scenes">
            Shots — <span className="text-lime-400">{sceneCount}</span>
            <span className="ml-2 font-normal normal-case tracking-normal text-ink-500">
              ≈ {sceneCount * 5}s video
            </span>
          </label>
          <input
            id="scenes"
            type="range"
            min={3}
            max={maxScenes}
            step={1}
            value={sceneCount}
            onChange={(e) => setSceneCount(Number(e.target.value))}
            className="w-full accent-lime-400"
          />
        </div>

        <div>
          <label className="label" htmlFor="style">
            Style lock <span className="font-normal normal-case tracking-normal text-ink-500">(optional)</span>
          </label>
          <input
            id="style"
            className="input"
            value={styleLock}
            onChange={(e) => setStyleLock(e.target.value)}
            placeholder="cinematic documentary, 35mm, teal-orange"
          />
        </div>

        <div>
          <label className="label" htmlFor="character">
            Character lock <span className="font-normal normal-case tracking-normal text-ink-500">(optional)</span>
          </label>
          <input
            id="character"
            className="input"
            value={characterLock}
            onChange={(e) => setCharacterLock(e.target.value)}
            placeholder="34yo man, faded haircut, grey linen shirt"
          />
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Creating…" : "Create project"}
        </button>
        <span className="text-xs text-ink-500">Costs nothing until you generate.</span>
      </div>
    </form>
  );
}
