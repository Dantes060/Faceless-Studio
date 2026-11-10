import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { ALLOW_SIGNUP, SIGNUP_FREE_CREDITS } from "./config";
import { credit } from "./credits";

const COOKIE = "fx_session";
const SESSION_DAYS = 30;

export type User = { id: string; email: string; created_at: number };

/* ------------------------------- passwords ------------------------------- */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

/* -------------------------------- accounts ------------------------------- */

export class AuthError extends Error {}

export function createUser(email: string, password: string): User {
  if (!ALLOW_SIGNUP) throw new AuthError("Signups are disabled");
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new AuthError("Enter a valid email");
  if (password.length < 8) throw new AuthError("Password must be at least 8 characters");

  const db = getDb();
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(normalized);
  if (exists) throw new AuthError("An account with that email already exists");

  const user: User = { id: crypto.randomUUID(), email: normalized, created_at: Date.now() };
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?,?,?,?)").run(
    user.id,
    user.email,
    hashPassword(password),
    user.created_at,
  );
  if (SIGNUP_FREE_CREDITS > 0) {
    credit({
      userId: user.id,
      amount: SIGNUP_FREE_CREDITS,
      kind: "grant",
      memo: "Welcome credits",
    });
  }
  return user;
}

export function authenticate(email: string, password: string): User {
  const row = getDb()
    .prepare("SELECT id, email, password_hash, created_at FROM users WHERE email = ?")
    .get(email.trim().toLowerCase()) as (User & { password_hash: string }) | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new AuthError("Wrong email or password");
  }
  return { id: row.id, email: row.email, created_at: row.created_at };
}

/* -------------------------------- sessions ------------------------------- */

export async function startSession(userId: string): Promise<void> {
  const id = crypto.randomBytes(32).toString("base64url");
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  getDb()
    .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?,?,?,?)")
    .run(id, userId, expires, Date.now());
  const jar = await cookies();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) getDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const row = getDb()
    .prepare(
      `SELECT u.id, u.email, u.created_at, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .get(id) as (User & { expires_at: number }) | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    getDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return null;
  }
  return { id: row.id, email: row.email, created_at: row.created_at };
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new AuthError("Not signed in");
  return user;
}
