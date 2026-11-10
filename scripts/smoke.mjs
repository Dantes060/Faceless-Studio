/**
 * End-to-end smoke test. Exercises signup → project → full pipeline → assets
 * against a running instance. Mock providers make it deterministic and free.
 *
 *   node scripts/smoke.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? process.env.BASE ?? "http://127.0.0.1:3100";

let cookie = "";
const log = (...a) => console.log(...a);
const fail = (msg) => {
  console.error("\n✗ FAIL:", msg);
  process.exit(1);
};

async function api(path, { method = "GET", body, raw = false } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const pair = c.split(";")[0];
    if (pair.startsWith("fx_session=")) cookie = pair;
  }
  if (raw) return res;
  const ct = res.headers.get("content-type") ?? "";
  let parsed;
  if (ct.includes("application/json")) parsed = await res.json();
  else parsed = await res.text();
  return { status: res.status, body: parsed, headers: res.headers };
}

async function waitFor(label, fn, timeoutMs = 60_000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 700));
  }
  fail(`${label} timed out after ${timeoutMs}ms`);
}

const email = `smoke+${Date.now()}@example.com`;

/* 1. signup */
const signup = await api("/api/auth/signup", { method: "POST", body: { email, password: "smoke-test-123" } });
if (signup.status !== 200) fail(`signup returned ${signup.status}: ${JSON.stringify(signup.body)}`);
if (!cookie) fail("no session cookie set on signup");
log("✓ signup + session cookie");

/* 2. balance starts at the welcome grant */
const credits0 = await api("/api/credits");
const startBalance = credits0.body.balance;
if (startBalance <= 0) fail(`expected welcome credits, got ${startBalance}`);
log(`✓ welcome credits: ${startBalance} cr`);

/* 3. create a project */
const created = await api("/api/projects", {
  method: "POST",
  body: { topic: "Why the Library of Alexandria's decline is misunderstood", niche: "history", sceneCount: 12, aspect: "9:16" },
});
if (created.status !== 200) fail(`create project ${created.status}: ${JSON.stringify(created.body)}`);
const id = created.body.id;
log("✓ project created:", id);

/* 4. run the whole pipeline in one batch */
const run = await api(`/api/projects/${id}/generate`, { method: "POST", body: { stage: "all" } });
if (run.status !== 200) fail(`generate ${run.status}: ${JSON.stringify(run.body)}`);
log(`✓ queued ${run.body.jobs.length} stages for ${run.body.balance} cr remaining`);

/* 5. wait for the queue to drain */
const snap = await waitFor("pipeline", async () => {
  const r = await api(`/api/projects/${id}`);
  const jobs = r.body.jobs ?? [];
  const active = jobs.filter((j) => j.status === "queued" || j.status === "running");
  if (active.length) return null;
  return r.body;
}, 120_000);

const failedJobs = snap.jobs.filter((j) => j.status === "failed");
if (failedJobs.length) fail(`jobs failed: ${JSON.stringify(failedJobs.map((j) => [j.kind, j.error]))}`);
if (snap.scenes.length !== 12) fail(`expected 12 scenes, got ${snap.scenes.length}`);
log(`✓ script: ${snap.scenes.length} scenes, ${snap.scenes[0].duration_sec}s each`);

/* 6. assets exist and are downloadable */
const images = snap.assets.filter((a) => a.kind === "image");
const clips = snap.assets.filter((a) => a.kind === "clip");
const audio = snap.assets.filter((a) => a.kind === "audio");
const exportAsset = snap.assets.filter((a) => a.kind === "export" || a.kind === "storyboard");
if (images.length !== 12) fail(`expected 12 stills, got ${images.length}`);
if (clips.length !== 12) fail(`expected 12 clips, got ${clips.length}`);
if (audio.length !== 1) fail(`expected 1 narration track, got ${audio.length}`);
if (exportAsset.length !== 1) fail(`expected 1 export, got ${exportAsset.length}`);
log(`✓ assets: ${images.length} stills, ${clips.length} clips, ${audio.length} audio, export=${exportAsset[0].kind}`);

const img = await api(images[0].url, { raw: true });
const imgBuf = await img.arrayBuffer();
if (img.status !== 200 || imgBuf.byteLength === 0) fail("image download failed");
if (!(img.headers.get("content-type") ?? "").startsWith("image/")) fail("image had wrong content-type");
log(`✓ asset streaming: ${(imgBuf.byteLength / 1024).toFixed(1)} kB ${img.headers.get("content-type")}`);

const audioDl = await api(audio[0].url, { raw: true });
const audioBuf = await audioDl.arrayBuffer();
if (audioDl.status !== 200 || audioBuf.byteLength < 1000) fail("narration download failed");
log(`✓ narration: ${(audioBuf.byteLength / 1024).toFixed(1)} kB`);

/* 7. ledger charged exactly once, no leak */
const credits1 = await api("/api/credits");
const spent = startBalance - credits1.body.balance;
const jobCosts = snap.jobs.reduce((a, j) => a + j.cost_credits, 0);
if (spent !== jobCosts) fail(`ledger mismatch: spent ${spent} vs queued ${jobCosts}`);
const debits = credits1.body.ledger.filter((l) => l.delta < 0);
if (debits.length !== 1) fail(`expected a single batch debit, got ${debits.length}`);
log(`✓ ledger: ${spent} cr debited in ${debits.length} transaction, balance ${credits1.body.balance}`);

/* 8. auth is enforced */
const anon = await fetch(`${BASE}/api/projects`);
if (anon.status !== 401) fail(`unauthenticated /api/projects returned ${anon.status}, expected 401`);
log("✓ auth enforced on API");

/* 9. re-running a finished stage is a no-op, not a second charge */
const noop = await api(`/api/projects/${id}/generate`, { method: "POST", body: { stage: "videos" } });
if (noop.status !== 200) fail(`re-run stage failed: ${noop.status} ${JSON.stringify(noop.body)}`);
if ((noop.body.jobs ?? []).length !== 0) fail("re-run queued work for shots that already exist");
log("✓ finished stage is a no-op (no double charge)");

/* 10. insufficient credits are rejected and the balance is untouched */
const p2 = await api("/api/projects", {
  method: "POST",
  body: { topic: "A second project that cannot be afforded", sceneCount: 12 },
});
const broke = await api(`/api/projects/${p2.body.id}/generate`, { method: "POST", body: { stage: "all" } });
if (broke.status !== 402) fail(`expected 402 for insufficient credits, got ${broke.status}`);
const after = await api("/api/credits");
if (after.body.balance !== credits1.body.balance) fail("balance changed on a rejected job");
log(`✓ insufficient credits rejected (402), balance still ${after.body.balance}`);

/* 11. per-account API keys: save, mask, source, clear — no plaintext leak */
await api("/api/auth/signup", {
  method: "POST",
  body: { email: `keys+${Date.now()}@example.com`, password: "smoke-test-123" },
});
const before = await api("/api/settings/keys");
if (before.status !== 200) fail(`GET keys returned ${before.status}`);
const openai0 = before.body.providers.find((p) => p.id === "openai");
const initialSource = openai0.source;

const secret = "sk-test-" + "9".repeat(40);
const saved = await api("/api/settings/keys", { method: "PUT", body: { provider: "openai", value: secret } });
if (saved.status !== 200) fail(`PUT keys returned ${saved.status}`);
const savedRow = saved.body.providers.find((p) => p.id === "openai");
if (savedRow.source !== "app") fail(`expected source "app", got ${savedRow.source}`);
if (!savedRow.masked || !savedRow.masked.endsWith("9999")) fail(`expected masked last-4, got ${savedRow.masked}`);
if (JSON.stringify(saved.body).includes(secret)) fail("plaintext key leaked in response");

const cleared = await api("/api/settings/keys", { method: "PUT", body: { provider: "openai", value: "" } });
const clearedRow = cleared.body.providers.find((p) => p.id === "openai");
if (clearedRow.source !== initialSource) fail(`expected source to revert to ${initialSource}, got ${clearedRow.source}`);
log("✓ per-account keys: save, mask, source, clear — no plaintext leak");

log("\nAll smoke checks passed.");
