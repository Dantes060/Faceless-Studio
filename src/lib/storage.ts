import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ASSET_DIR } from "./config";
import { getDb } from "./db";

export type AssetKind = "image" | "clip" | "audio" | "export" | "storyboard" | "prompt_pdf";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "text/html": "html",
  "application/pdf": "pdf",
};

export function extFor(mime: string): string {
  return EXT[mime] ?? "bin";
}

export type Asset = {
  id: string;
  project_id: string;
  kind: AssetKind;
  scene_n: number | null;
  path: string;
  mime: string;
  bytes: number;
  meta_json: string;
  created_at: number;
};

export function saveAsset(args: {
  projectId: string;
  kind: AssetKind;
  sceneN?: number | null;
  data: Buffer;
  mime: string;
  meta?: Record<string, unknown>;
}): Asset {
  const dir = path.join(ASSET_DIR, args.projectId);
  fs.mkdirSync(dir, { recursive: true });
  const id = crypto.randomUUID();
  const name = `${args.kind}${args.sceneN != null ? `-${String(args.sceneN).padStart(3, "0")}` : ""}-${id.slice(0, 8)}.${extFor(args.mime)}`;
  const abs = path.join(dir, name);
  fs.writeFileSync(abs, args.data);

  const asset: Asset = {
    id,
    project_id: args.projectId,
    kind: args.kind,
    scene_n: args.sceneN ?? null,
    path: abs,
    mime: args.mime,
    bytes: args.data.length,
    meta_json: JSON.stringify(args.meta ?? {}),
    created_at: Date.now(),
  };
  getDb()
    .prepare(
      "INSERT INTO assets (id, project_id, kind, scene_n, path, mime, bytes, meta_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .run(asset.id, asset.project_id, asset.kind, asset.scene_n, asset.path, asset.mime, asset.bytes, asset.meta_json, asset.created_at);
  return asset;
}

export function getAsset(id: string): Asset | undefined {
  return getDb().prepare("SELECT * FROM assets WHERE id = ?").get(id) as Asset | undefined;
}

export function readAsset(id: string): { asset: Asset; data: Buffer } | null {
  const asset = getAsset(id);
  if (!asset || !fs.existsSync(asset.path)) return null;
  return { asset, data: fs.readFileSync(asset.path) };
}

export function listAssets(projectId: string, kind?: AssetKind): Asset[] {
  return kind
    ? (getDb()
        .prepare("SELECT * FROM assets WHERE project_id = ? AND kind = ? ORDER BY scene_n, created_at")
        .all(projectId, kind) as Asset[])
    : (getDb()
        .prepare("SELECT * FROM assets WHERE project_id = ? ORDER BY kind, scene_n, created_at")
        .all(projectId) as Asset[]);
}

export function latestAsset(projectId: string, kind: AssetKind): Asset | undefined {
  return getDb()
    .prepare("SELECT * FROM assets WHERE project_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1")
    .get(projectId, kind) as Asset | undefined;
}
