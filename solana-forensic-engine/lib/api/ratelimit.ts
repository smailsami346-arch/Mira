import { NextResponse } from "next/server";

// In-memory token bucket per client IP. MVP: 100 req/min. Move to Redis in Beta.
const buckets = new Map<string, { tokens: number; updated: number }>();
const LIMIT = 100;
const WINDOW_MS = 60_000;

export function guard(req: Request): NextResponse | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: LIMIT, updated: now };
  b.tokens = Math.min(LIMIT, b.tokens + ((now - b.updated) / WINDOW_MS) * LIMIT);
  b.updated = now;
  if (b.tokens < 1) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return null;
}
