import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ASSET_DIR } from "./config";
import { getDb } from "./db";
import { latestAsset, listAssets, saveAsset } from "./storage";
import type { Script, Scene } from "./script";

/**
 * Assembly. If ffmpeg is present we render a real mp4; if it is not, we still
 * produce something useful: a shotlist/storyboard HTML with every image,
 * prompt, narration line and timing, plus the exact ffmpeg command to run.
 */

export type AssembleResult = {
  assetId: string;
  mime: string;
  kind: "video" | "storyboard";
  note: string;
};

const W = 1080;
const H = 1920;

function run(cmd: string, args: string[]): Promise<{ code: number }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (code: number) => {
      if (!settled) {
        settled = true;
        resolve({ code });
      }
    };
    try {
      // stdio "ignore" avoids named pipes, which constrained sandboxes block.
      const child = spawn(cmd, args, { stdio: "ignore", windowsHide: true });
      child.on("error", () => done(-1));
      child.on("close", (code) => done(code ?? -1));
    } catch {
      done(-1);
    }
  });
}

let ffmpegCache: boolean | null = null;

export async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegCache !== null) return ffmpegCache;
  const custom = process.env.FFMPEG_PATH;
  const { code } = await run(custom ?? "ffmpeg", ["-version"]);
  ffmpegCache = code === 0;
  return ffmpegCache;
}

export function buildSrt(scenes: Scene[]): string {
  const stamp = (ms: number) => {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    const f = ms % 1000;
    const p = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${p(h)}:${p(m)}:${p(s)},${p(f, 3)}`;
  };
  let t = 0;
  const blocks = scenes.map((s, i) => {
    const start = t;
    t += Math.round(s.duration_sec * 1000);
    const text = (s.on_screen_text || s.narration).trim();
    return `${i + 1}\n${stamp(start)} --> ${stamp(t)}\n${text}\n`;
  });
  return blocks.join("\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function storyboardHtml(project: { title: string; style_lock: string; character_lock: string }, script: Script, assets: { sceneN: number | null; url: string }[]): string {
  const byScene = new Map<number, string>();
  for (const a of assets) if (a.sceneN != null) byScene.set(a.sceneN, a.url);
  const rows = script.scenes
    .map((s) => {
      const img = byScene.get(s.n);
      return `<section class="shot">
  <div class="frame">${img ? `<img src="${img}" alt="scene ${s.n}">` : `<div class="noframe">no image</div>`}</div>
  <div class="meta">
    <div class="row"><span class="n">${String(s.n).padStart(2, "0")}</span><span class="dur">${s.duration_sec}s</span></div>
    <p class="narration">${esc(s.narration)}</p>
    <p class="caption">CAPTION: ${esc(s.on_screen_text || "—")}</p>
    <details><summary>image prompt</summary><pre>${esc(s.image_prompt)}</pre></details>
    <details><summary>video prompt</summary><pre>${esc(s.video_prompt)}</pre></details>
  </div>
</section>`;
    })
    .join("\n");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(project.title)} — storyboard</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;background:#0b0d12;color:#e6eaf1;font:15px/1.5 system-ui,sans-serif;padding:32px}
 h1{font-size:22px;margin:0 0 4px} .sub{color:#98a1b3;margin:0 0 28px;font-size:13px}
 .shot{display:grid;grid-template-columns:220px 1fr;gap:18px;padding:18px 0;border-top:1px solid #232733}
 .frame{background:#12141b;border:1px solid #232733;border-radius:10px;overflow:hidden;aspect-ratio:9/16;display:flex;align-items:center;justify-content:center}
 .frame img{width:100%;height:100%;object-fit:cover}
 .noframe{color:#4b5366;font-size:12px}
 .row{display:flex;gap:10px;align-items:baseline} .n{font:700 18px ui-monospace,monospace;color:#c9f24d}
 .dur{color:#6b7488;font-size:12px}
 .narration{font-weight:600;margin:6px 0}
 .caption{color:#98a1b3;font-size:12px;letter-spacing:.06em;margin:0 0 10px}
 details{margin-top:6px} summary{cursor:pointer;color:#6b7488;font-size:12px}
 pre{white-space:pre-wrap;background:#12141b;padding:10px;border-radius:8px;font-size:12px;color:#c3cad6;margin:6px 0 0}
 .locks{background:#12141b;border:1px solid #232733;border-radius:10px;padding:14px;margin-bottom:24px;font-size:12px;color:#98a1b3}
</style></head><body>
<h1>${esc(project.title)}</h1>
<p class="sub">${script.scenes.length} shots · ${script.total_duration_sec}s · storyboard export</p>
<div class="locks"><b>style_lock</b><br>${esc(project.style_lock)}<br><br><b>character_lock</b><br>${esc(project.character_lock)}</div>
${rows}
</body></html>`;
}

export async function assembleProject(projectId: string): Promise<AssembleResult> {
  const db = getDb();
  const project = db
    .prepare("SELECT id, title, style_lock, character_lock, script_json FROM projects WHERE id = ?")
    .get(projectId) as
    | { id: string; title: string; style_lock: string; character_lock: string; script_json: string | null }
    | undefined;
  if (!project?.script_json) throw new Error("Project has no script yet");
  const script = JSON.parse(project.script_json) as Script;

  const all = listAssets(projectId);
  const byScene = (kind: "image" | "clip", n: number) =>
    all.filter((a) => a.kind === kind && a.scene_n === n).at(-1);
  const narration = latestAsset(projectId, "audio");

  if (!(await hasFfmpeg())) {
    const assets = all
      .filter((a) => a.kind === "image" || a.kind === "clip")
      .map((a) => ({
        sceneN: a.scene_n,
        url: `data:${a.mime};base64,${fs.readFileSync(a.path).toString("base64")}`,
      }));
    const html = storyboardHtml(project, script, assets);
    const asset = saveAsset({
      projectId,
      kind: "storyboard",
      data: Buffer.from(html, "utf8"),
      mime: "text/html",
      meta: { note: "ffmpeg not found — storyboard instead of mp4" },
    });
    return {
      assetId: asset.id,
      mime: "text/html",
      kind: "storyboard",
      note: "ffmpeg not found on this machine. Exported a storyboard + shotlist HTML instead of mp4.",
    };
  }

  // Build one input per shot and concat them with the filter graph, which
  // tolerates a mix of stills and clips.
  const args: string[] = ["-y"];
  const filters: string[] = [];
  let idx = 0;
  let shots = 0;

  for (const s of script.scenes) {
    const clip = byScene("clip", s.n);
    const still = byScene("image", s.n);
    const src = clip ?? still;
    if (!src) continue;

    if (clip && clip.mime.startsWith("video/")) {
      args.push("-i", clip.path);
    } else {
      // still: loop it for the scene duration
      args.push("-loop", "1", "-t", String(s.duration_sec), "-i", src.path);
    }
    filters.push(
      `[${idx}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${shots}]`,
    );
    idx++;
    shots++;
  }

  if (shots === 0) throw new Error("No images or clips to assemble");

  let audioIdx = -1;
  if (narration) {
    args.push("-i", narration.path);
    audioIdx = idx;
  }

  filters.push(
    `${Array.from({ length: shots }, (_, i) => `[v${i}]`).join("")}concat=n=${shots}:v=1:a=0[vout]`,
  );

  const dir = path.join(ASSET_DIR, projectId);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `export-${Date.now()}.mp4`);
  args.push("-filter_complex", filters.join(";"), "-map", "[vout]");
  if (audioIdx >= 0) args.push("-map", `${audioIdx}:a`, "-c:a", "aac", "-b:a", "192k");
  args.push("-r", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outPath);

  const { code } = await run(process.env.FFMPEG_PATH ?? "ffmpeg", args);
  if (code !== 0 || !fs.existsSync(outPath)) {
    throw new Error(`ffmpeg failed (exit ${code}). Check FFMPEG_PATH and clip codecs.`);
  }

  const data = fs.readFileSync(outPath);
  fs.unlinkSync(outPath);
  const asset = saveAsset({
    projectId,
    kind: "export",
    data,
    mime: "video/mp4",
    meta: { shots, seconds: script.total_duration_sec },
  });
  return {
    assetId: asset.id,
    mime: "video/mp4",
    kind: "video",
    note: `Rendered ${shots} shots.`,
  };
}
