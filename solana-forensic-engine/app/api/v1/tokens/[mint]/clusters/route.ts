import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db/store";
import { guard } from "@/lib/api/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { mint: string } }) {
  const rl = guard(req);
  if (rl) return rl;
  const repo = getRepo();
  return NextResponse.json({ clusters: repo.listClusters(params.mint) });
}
