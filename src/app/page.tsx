import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { CREDIT_USD } from "@/lib/config";
import { providerStatus, resolveEnvKeys } from "@/lib/keys";
import { fullPackageCost } from "@/lib/credits";

export default async function Home() {
  const user = await currentUser();
  const providers = providerStatus(resolveEnvKeys());
  const example = fullPackageCost(12);
  const liveCount = [providers.llm.live, providers.image.live, providers.video.live, providers.tts.live].filter(Boolean).length;

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24">
      <header className="flex items-center justify-between py-6">
        <span className="flex items-center gap-2 text-sm font-bold tracking-tight">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-lime-400 text-[11px] font-black text-ink-950">
            FS
          </span>
          Faceless Studio
        </span>
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <Link href="/studio" className="btn-primary">
              Open studio
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-ink-300 hover:text-ink-100">
                Sign in
              </Link>
              <Link href="/signup" className="btn-primary">
                Start free
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="pt-14">
        <span className="pill">
          <span className={`h-1.5 w-1.5 rounded-full ${liveCount > 0 ? "bg-lime-400" : "bg-amber-400"}`} />
          {liveCount > 0 ? `${liveCount}/4 providers live` : "mock mode — no keys needed to try it"}
        </span>
        <h1 className="mt-6 max-w-3xl text-5xl font-black leading-[1.05] tracking-tight md:text-6xl">
          Turn one idea into a{" "}
          <span className="text-lime-400">shootable shotlist</span>.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-300">
          A topic goes in. You get a scene-by-scene script with locked style and character,
          compiled image and motion prompts, generated stills and clips, narration, and a cut
          you can post. Runs on your own API keys.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={user ? "/studio" : "/signup"} className="btn-primary px-5 py-2.5">
            {user ? "Open studio" : "Create an account"}
          </Link>
          <Link href="/login" className="btn-ghost px-5 py-2.5">
            I already have one
          </Link>
        </div>
      </section>

      <section className="mt-20 grid gap-4 md:grid-cols-3">
        {[
          ["01", "Script", "Structured JSON: hook, beats, narration, on-screen text. One call, validated and repaired."],
          ["02", "Prompts", "Every scene compiled with the same style lock and character lock, so shots match."],
          ["03", "Render", "Stills, image-to-video clips, narration, then ffmpeg assembly into an mp4."],
        ].map(([n, title, body]) => (
          <div key={n} className="card p-5">
            <div className="mono text-lime-400">{n}</div>
            <h3 className="mt-3 text-base font-bold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-400">{body}</p>
          </div>
        ))}
      </section>

      <section className="card mt-16 overflow-hidden">
        <div className="border-b border-ink-700/70 px-6 py-5">
          <h2 className="text-lg font-bold">What a 12-shot vertical video costs</h2>
          <p className="mt-1 text-sm text-ink-400">
            Credits are ${CREDIT_USD.toFixed(2)} each. This is the shape of the economics: the
            script is cheap, the video model is the bill.
          </p>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {example.lines.map((l) => (
              <tr key={l.label} className="border-b border-ink-800/70 last:border-0">
                <td className="px-6 py-3 text-ink-200">{l.label}</td>
                <td className="px-6 py-3 text-right tabular-nums text-ink-400">{l.credits} cr</td>
                <td className="w-24 px-6 py-3 text-right tabular-nums text-ink-300">${l.usd.toFixed(2)}</td>
              </tr>
            ))}
            <tr className="bg-ink-850/60">
              <td className="px-6 py-3 font-bold">Total</td>
              <td className="px-6 py-3 text-right font-bold tabular-nums">{example.total} cr</td>
              <td className="px-6 py-3 text-right font-bold tabular-nums text-lime-400">${example.usd.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-500">
        <span>
          Running in {providers.mode} mode · text {providers.llm.live ? providers.llm.model : "mock"} · image{" "}
          {providers.image.live ? providers.image.model : "mock"} · video{" "}
          {providers.video.live ? providers.video.model : "mock"}
        </span>
        <span>Yours to self-host. No credits expire.</span>
      </footer>
    </main>
  );
}
