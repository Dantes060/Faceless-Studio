import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { balance } from "@/lib/credits";
import { CREDIT_USD, MAX_SCENES } from "@/lib/config";
import { providerStatus, resolveEnvKeys } from "@/lib/keys";
import { NewProjectForm } from "@/components/NewProjectForm";

type ProjectCard = {
  id: string;
  title: string;
  topic: string;
  niche: string;
  aspect: string;
  scene_count: number;
  status: string;
  updated_at: number;
  exports: number;
};

export default async function StudioPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const projects = getDb()
    .prepare(
      `SELECT p.id, p.title, p.topic, p.niche, p.aspect, p.scene_count, p.status, p.updated_at,
              (SELECT COUNT(*) FROM assets a WHERE a.project_id = p.id AND a.kind = 'export') AS exports
         FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC`,
    )
    .all(user.id) as ProjectCard[];

  const credits = balance(user.id);
  const providers = providerStatus(resolveEnvKeys());

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-4 py-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-bold">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-lime-400 text-[11px] font-black text-ink-950">
            FS
          </span>
          Faceless Studio
        </Link>
        <div className="flex items-center gap-3">
          <span className="pill">
            <span className="tabular-nums text-lime-400">{credits} cr</span>
            <span className="text-ink-500">≈ ${(credits * CREDIT_USD).toFixed(2)}</span>
          </span>
          <Link href="/settings" className="btn-ghost">
            Settings
          </Link>
          <form action="/api/auth/logout" method="post">
            <button className="btn-ghost" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-4 pt-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-ink-400">
            {projects.length === 0 ? "Nothing here yet." : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <NewProjectForm maxScenes={MAX_SCENES} />
      </div>

      {projects.length === 0 ? (
        <div className="card mt-8 grid place-items-center px-6 py-16 text-center">
          <p className="max-w-md text-ink-400">
            Start with a topic you could talk about for sixty seconds. The script engine turns it into
            shots; you stay the director.
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/studio/${p.id}`}
                className="card flex items-center justify-between gap-4 px-5 py-4 transition hover:border-lime-400/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-semibold">{p.title}</h2>
                    <span className="pill shrink-0">{p.status}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-ink-500">
                    {p.niche} · {p.scene_count} shots · {p.aspect}
                    {p.exports > 0 ? ` · ${p.exports} export${p.exports === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <span className="text-ink-600">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-xs text-ink-500">
        Providers: text {providers.llm.live ? providers.llm.model : "mock"} · image{" "}
        {providers.image.live ? providers.image.model : "mock"} · video{" "}
        {providers.video.live ? providers.video.model : "mock"} · narration{" "}
        {providers.tts.live ? providers.tts.model : "mock"}
      </p>
    </main>
  );
}
