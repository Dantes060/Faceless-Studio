import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { keyStatus } from "@/lib/keys";
import { ApiKeysForm } from "@/components/ApiKeysForm";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl px-6 pb-24">
      <header className="flex items-center justify-between py-6">
        <Link href="/studio" className="btn-ghost px-3 py-1.5 text-xs">
          ← Studio
        </Link>
        <span className="text-sm font-bold">Settings</span>
      </header>

      <section className="pt-4">
        <h1 className="text-2xl font-black tracking-tight">API keys</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          Set your own keys here per account. An in-app key <b className="text-ink-200">overrides</b> the
          matching <code className="mono">.env</code> value; clearing it falls back to the server default.
          Keys are encrypted at rest with a local secret and never shown back in plaintext.
        </p>
      </section>

      <section className="mt-6">
        <ApiKeysForm initial={keyStatus(user.id)} />
      </section>

      <p className="mt-8 text-xs leading-relaxed text-ink-600">
        Model selection (which engine a stage uses) still comes from <code className="mono">.env</code> —
        e.g. <code className="mono">LLM_PROVIDER</code>, <code className="mono">KLING_MODEL</code>. The
        page above is for the secret keys only. To run without any keys, leave everything blank and the
        app generates placeholders.
      </p>
    </main>
  );
}
