// Temporary: verify pages render server-side without runtime errors.
import Database from "better-sqlite3";

const BASE = "http://127.0.0.1:3100";
const db = new Database("./data/studio.db", { readonly: true });
const project = db
  .prepare("SELECT id, title, user_id FROM projects WHERE script_json IS NOT NULL ORDER BY created_at DESC LIMIT 1")
  .get();
const user = db.prepare("SELECT email FROM users WHERE id = ?").get(project.user_id);
const scene = db
  .prepare("SELECT narration FROM scenes WHERE project_id = ? ORDER BY n LIMIT 1")
  .get(project.id);
if (!user || !project || !scene) {
  console.error("no seeded data");
  process.exit(1);
}

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: user.email, password: "smoke-test-123" }),
});
if (!login.ok) {
  console.error("login failed", login.status, await login.text());
  process.exit(1);
}
const cookie = login.headers.getSetCookie()[0].split(";")[0];

const checks = [
  { path: "/", cookie: "", markers: ["Faceless Studio", "shootable shotlist"] },
  { path: "/login", cookie: "", markers: ["Sign in", "Create an account"] },
  { path: "/signup", cookie: "", markers: ["Create your studio"] },
  { path: "/studio", cookie, markers: ["Projects", project.title] },
  { path: `/studio/${project.id}`, cookie, markers: [project.title, "Script &amp; prompts", scene.narration] },
  { path: "/settings", cookie, markers: ["API keys", "OpenAI", "Kling Access Key"] },
];

let bad = 0;
for (const c of checks) {
  const res = await fetch(BASE + c.path, {
    headers: c.cookie ? { cookie: c.cookie } : {},
    redirect: "manual",
  });
  const html = await res.text();
  const missing = c.markers.filter((m) => !html.includes(m));
  const errorFlag = /Application error|Internal Server Error/i.test(html);
  const ok = res.status === 200 && missing.length === 0 && !errorFlag;
  if (!ok) bad++;
  console.log(
    `${ok ? "✓" : "✗"} ${c.path.padEnd(44)} ${res.status} ${String(html.length).padStart(6)}B` +
      (missing.length ? ` missing=${JSON.stringify(missing)}` : "") +
      (errorFlag ? " RUNTIME-ERROR" : ""),
  );
}
process.exit(bad ? 1 : 0);
