import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db/store";
import { guard } from "@/lib/api/ratelimit";

export const dynamic = "force-dynamic";

// GET /api/v1/tokens/:mint/events?type=Swap&limit=100&cursor=<offset>
export async function GET(req: Request, { params }: { params: { mint: string } }) {
  const rl = guard(req);
  if (rl) return rl;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
  const offset = Number(searchParams.get("cursor")) || 0;
  const type = searchParams.get("type") ?? undefined;
  const repo = getRepo();
  if (!repo.getToken(params.mint)) {
    return NextResponse.json({ error: "token_not_found" }, { status: 404 });
  }
  const events = repo.listEventsByMint(params.mint, { type, limit, offset });
  return NextResponse.json({
    events,
    next_cursor: offset + events.length,
    has_more: events.length === limit,
  });
}
