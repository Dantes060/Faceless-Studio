/** Shared view types. No runtime imports — safe for the client bundle. */

export type Scene = {
  id: string;
  n: number;
  duration_sec: number;
  narration: string;
  on_screen_text: string;
  image_prompt: string;
  video_prompt: string;
  image_asset_id: string | null;
  clip_asset_id: string | null;
};

export type AssetView = {
  id: string;
  kind: string;
  scene_n: number | null;
  mime: string;
  bytes: number;
  created_at: number;
  url: string;
};

export type JobView = {
  id: string;
  kind: string;
  status: string;
  cost_credits: number;
  error: string | null;
  result_json: string | null;
  created_at: number;
};

export type ProjectView = {
  id: string;
  title: string;
  topic: string;
  niche: string;
  aspect: string;
  scene_count: number;
  status: string;
  style_lock: string;
  character_lock: string;
  script_json: string | null;
};

export type ProviderView = {
  mode: string;
  llm: { live: boolean; model: string };
  image: { live: boolean; model: string };
  video: { live: boolean; model: string };
  tts: { live: boolean; model: string };
};

export type Snapshot = {
  project: ProjectView;
  scenes: Scene[];
  assets: AssetView[];
  jobs: JobView[];
  balance: number;
  prices: { total: number; stages: Record<string, number> };
  providers: ProviderView;
};

export type KeyStatus = {
  id: string;
  label: string;
  hint: string;
  configured: boolean;
  source: "app" | "env" | null;
  masked: string | null;
};
