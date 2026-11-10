import { getDb } from "./db";
import { CREDIT_USD } from "./config";

/**
 * Pricing, kept in one place and deliberately explicit.
 *
 * The economics that matter: video generation is ~80% of the cost of an
 * AI-visual faceless video. Everything else is rounding error. The estimator
 * exists so users see that before they press go.
 */

export const PRICE = {
  script: { base: 10, perScene: 1 },
  image: { perScene: 4 },
  video: { perScene5s: 18, perScene10s: 30 },
  tts: { base: 6 },
  assembly: { base: 4 },
  thumbnail: 5,
} as const;

export function scriptCost(sceneCount: number): number {
  return PRICE.script.base + Math.max(0, sceneCount) * PRICE.script.perScene;
}
export function imageCost(sceneCount: number): number {
  return Math.max(0, sceneCount) * PRICE.image.perScene;
}
export function videoCost(sceneCount: number, clipSeconds = 5): number {
  const unit = clipSeconds > 5 ? PRICE.video.perScene10s : PRICE.video.perScene5s;
  return Math.max(0, sceneCount) * unit;
}
export function fullPackageCost(sceneCount: number): {
  total: number;
  usd: number;
  lines: { label: string; credits: number; usd: number }[];
} {
  const lines = [
    { label: "Script + scene prompts", credits: scriptCost(sceneCount) },
    { label: "Scene images", credits: imageCost(sceneCount) },
    { label: "Video clips (5s)", credits: videoCost(sceneCount) },
    { label: "Narration", credits: PRICE.tts.base },
    { label: "Assembly / export", credits: PRICE.assembly.base },
  ].map((l) => ({ ...l, usd: round2(l.credits * CREDIT_USD) }));
  const total = lines.reduce((a, l) => a + l.credits, 0);
  return { total, usd: round2(total * CREDIT_USD), lines };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class InsufficientCredits extends Error {
  constructor(
    readonly needed: number,
    readonly available: number,
  ) {
    super(`Insufficient credits: need ${needed}, have ${available}`);
    this.name = "InsufficientCredits";
  }
}

export function balance(userId: string): number {
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(delta), 0) AS b FROM credit_ledger WHERE user_id = ?")
    .get(userId) as { b: number };
  return row.b;
}

/**
 * Debit inside an IMMEDIATE transaction so the balance check and the insert
 * cannot interleave with another writer. Never a mutable balance column.
 */
export function debit(args: {
  userId: string;
  amount: number;
  kind: string;
  ref?: string;
  memo?: string;
}): number {
  const { userId, amount, kind, ref = null, memo = "" } = args;
  if (amount <= 0) throw new Error("Debit amount must be positive");
  const db = getDb();
  const tx = db.transaction(() => {
    const { b } = db
      .prepare("SELECT COALESCE(SUM(delta), 0) AS b FROM credit_ledger WHERE user_id = ?")
      .get(userId) as { b: number };
    if (b < amount) throw new InsufficientCredits(amount, b);
    db.prepare(
      "INSERT INTO credit_ledger (user_id, delta, kind, ref, memo, created_at) VALUES (?,?,?,?,?,?)",
    ).run(userId, -amount, kind, ref, memo, Date.now());
    return b - amount;
  });
  return tx.immediate();
}

export function credit(args: {
  userId: string;
  amount: number;
  kind: string;
  ref?: string;
  memo?: string;
}): void {
  const { userId, amount, kind, ref = null, memo = "" } = args;
  if (amount <= 0) return;
  getDb()
    .prepare(
      "INSERT INTO credit_ledger (user_id, delta, kind, ref, memo, created_at) VALUES (?,?,?,?,?,?)",
    )
    .run(userId, amount, kind, ref, memo, Date.now());
}

export type LedgerEntry = {
  id: number;
  delta: number;
  kind: string;
  ref: string | null;
  memo: string;
  created_at: number;
};

export function ledger(userId: string, limit = 50): LedgerEntry[] {
  return getDb()
    .prepare(
      "SELECT id, delta, kind, ref, memo, created_at FROM credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?",
    )
    .all(userId, limit) as LedgerEntry[];
}
