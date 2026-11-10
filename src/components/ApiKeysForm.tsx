"use client";

import { useState } from "react";
import type { KeyStatus } from "@/lib/types";

export function ApiKeysForm({ initial }: { initial: KeyStatus[] }) {
  const [items, setItems] = useState<KeyStatus[]>(initial);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function apply(provider: string, value: string, label: string) {
    setBusy((b) => ({ ...b, [provider]: true }));
    setNotice(null);
    try {
      const res = await fetch("/api/settings/keys", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, value }),
      });
      const data = (await res.json()) as { providers?: KeyStatus[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setItems(data.providers ?? []);
      setInputs((i) => ({ ...i, [provider]: "" }));
      setNotice({ kind: "ok", text: `${label} ${value.trim() ? "saved" : "cleared"}.` });
    } catch (err) {
      setNotice({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy((b) => ({ ...b, [provider]: false }));
    }
  }

  return (
    <div className="space-y-3">
      {notice && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            notice.kind === "ok"
              ? "border-lime-400/30 bg-lime-400/10 text-lime-200"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {notice.text}
        </p>
      )}

      {items.map((p) => {
        const isBusy = busy[p.id];
        return (
          <div key={p.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{p.label}</h3>
                  {p.source === "app" && <span className="pill text-lime-300">in app</span>}
                  {p.source === "env" && <span className="pill text-sky-300">from .env</span>}
                  {!p.configured && <span className="pill text-ink-500">not set</span>}
                </div>
                <p className="mt-1 text-xs text-ink-400">{p.hint}</p>
                <p className="mono mt-2 text-ink-500">
                  current: {p.masked ?? "—"}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                className="input flex-1 font-mono"
                placeholder="Paste a new key to replace the current one…"
                value={inputs[p.id] ?? ""}
                onChange={(e) => setInputs((i) => ({ ...i, [p.id]: e.target.value }))}
                autoComplete="off"
                spellCheck={false}
              />
              <div className="flex gap-2">
                <button
                  className="btn-primary"
                  disabled={isBusy || !(inputs[p.id] ?? "").trim()}
                  onClick={() => apply(p.id, inputs[p.id] ?? "", p.label)}
                >
                  {isBusy ? "Saving…" : "Save"}
                </button>
                <button
                  className="btn-ghost"
                  disabled={isBusy || !p.configured}
                  onClick={() => apply(p.id, "", p.label)}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
