import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db/store";
import { getRpcClient } from "@/lib/rpc/client";
import { backfillToken } from "@/lib/ingest/backfill";
import { guard } from "@/lib/api/ratelimit";

export const dynamic = "force-dynamic";

// POST { "mint": "...", "limit": 1000 }
// Server-side only: RPC keys stay in env, never exposed to the client.
export async function POST(req: Request) {
  const rl = guard(req);
  if (rl) return rl;
  const body = await req.json().catch(() => ({}));
  const mint = body?.mint;
  if (typeof mint !== "string" || mint.length < 32) {
    return NextResponse.json({ error: "mint_required" }, { status: 400 });
  }
  try {
    const rpc = getRpcClient();
    const result = await backfillToken(getRepo(), rpc, mint, {
      limit: Number(body?.limit) || 200,
      maxPages: Number(body?.maxPages) || 10,
      launchWindow: Number(body?.launchWindow) || 200,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: "ingest_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
