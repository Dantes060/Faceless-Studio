import crypto from "node:crypto";
import { getDb } from "./db";
import { credit } from "./credits";

export type JobKind = "script" | "images" | "videos" | "tts" | "assemble" | "all";
export type JobStatus = "queued" | "running" | "done" | "failed";

export type Job = {
  id: string;
  project_id: string;
  user_id: string;
  kind: JobKind;
  status: JobStatus;
  payload_json: string;
  result_json: string | null;
  cost_credits: number;
  attempts: number;
  max_attempts: number;
  error: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
};

export function enqueue(args: {
  projectId: string;
  userId: string;
  kind: JobKind;
  payload?: Record<string, unknown>;
  cost: number;
}): Job {
  const job: Job = {
    id: crypto.randomUUID(),
    project_id: args.projectId,
    user_id: args.userId,
    kind: args.kind,
    status: "queued",
    payload_json: JSON.stringify(args.payload ?? {}),
    result_json: null,
    cost_credits: args.cost,
    attempts: 0,
    max_attempts: 2,
    error: null,
    created_at: Date.now(),
    started_at: null,
    finished_at: null,
  };
  getDb()
    .prepare(
      `INSERT INTO jobs (id, project_id, user_id, kind, status, payload_json, result_json, cost_credits, attempts, max_attempts, error, created_at, started_at, finished_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      job.id, job.project_id, job.user_id, job.kind, job.status, job.payload_json, job.result_json,
      job.cost_credits, job.attempts, job.max_attempts, job.error, job.created_at, job.started_at, job.finished_at,
    );
  return job;
}

/** Claim exactly one queued job. UPDATE…WHERE status='queued' makes this safe
 *  even if two processes poll at once. */
export function claimNext(): Job | null {
  const db = getDb();
  const tx = db.transaction((): Job | null => {
    const row = db
      .prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1")
      .get() as Job | undefined;
    if (!row) return null;
    const res = db
      .prepare("UPDATE jobs SET status = 'running', started_at = ?, attempts = attempts + 1 WHERE id = ? AND status = 'queued'")
      .run(Date.now(), row.id);
    if (res.changes !== 1) return null;
    return { ...row, status: "running", attempts: row.attempts + 1, started_at: Date.now() };
  });
  return tx.immediate();
}

export function complete(job: Job, result: Record<string, unknown>): void {
  getDb()
    .prepare("UPDATE jobs SET status = 'done', finished_at = ?, result_json = ?, error = NULL WHERE id = ?")
    .run(Date.now(), JSON.stringify(result), job.id);
}

/** Terminal failure: refund the charge exactly once, then mark failed. */
export function fail(job: Job, error: string, opts: { refund: boolean }): void {
  const db = getDb();
  const tx = db.transaction(() => {
    const cur = db.prepare("SELECT status, cost_credits FROM jobs WHERE id = ?").get(job.id) as
      | { status: string; cost_credits: number }
      | undefined;
    if (!cur || cur.status === "failed" || cur.status === "done") return;
    db.prepare("UPDATE jobs SET status = 'failed', finished_at = ?, error = ? WHERE id = ?").run(
      Date.now(),
      error.slice(0, 2000),
      job.id,
    );
    if (opts.refund && cur.cost_credits > 0) {
      credit({
        userId: job.user_id,
        amount: cur.cost_credits,
        kind: "refund",
        ref: job.id,
        memo: `Refund: ${job.kind} failed`,
      });
    }
  });
  tx.immediate();
}

/** Requeue for another attempt without refunding (transient provider error). */
export function retryLater(job: Job, error: string): boolean {
  if (job.attempts >= job.max_attempts) return false;
  getDb()
    .prepare("UPDATE jobs SET status = 'queued', error = ?, started_at = NULL WHERE id = ?")
    .run(error.slice(0, 2000), job.id);
  return true;
}

export function getJob(id: string): Job | undefined {
  return getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Job | undefined;
}

export function listJobs(projectId: string, limit = 20): Job[] {
  return getDb()
    .prepare("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(projectId, limit) as Job[];
}

export function hasActive(projectId: string): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS c FROM jobs WHERE project_id = ? AND status IN ('queued','running')")
    .get(projectId) as { c: number };
  return row.c > 0;
}
