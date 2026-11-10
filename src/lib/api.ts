import { NextResponse } from "next/server";
import { AuthError } from "./auth";
import { InsufficientCredits } from "./credits";
import { ProviderError } from "./providers/types";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Uniform error mapping so routes stay thin and clients get stable codes. */
export async function route(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 401);
    if (err instanceof InsufficientCredits) {
      return json({ error: err.message, code: "insufficient_credits", needed: err.needed, available: err.available }, 402);
    }
    if (err instanceof ProviderError) {
      return json({ error: err.message, code: "provider_error", detail: err.body }, 502);
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[api]", err);
    return json({ error: message }, 400);
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
