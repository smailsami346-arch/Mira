import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db/store";
import { guard } from "@/lib/api/ratelimit";

export const dynamic = "force-dynamic";

// GET /api/v1/wallets/:address/timeline?limit=200
export async function GET(req: Request, { params }: { params: { address: string } }) {
  const rl = guard(req);
  if (rl) return rl;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 200, 1000);
  const repo = getRepo();
  const items = repo.listEventsByWallet(params.address, limit);
  return NextResponse.json({ address: params.address, items });
}
