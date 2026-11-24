import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db/store";
import { guard } from "@/lib/api/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { address: string } }) {
  const rl = guard(req);
  if (rl) return rl;
  const repo = getRepo();
  const wallet = repo.getWallet(params.address);
  if (!wallet) return NextResponse.json({ error: "wallet_not_found" }, { status: 404 });
  const cluster = wallet.cluster_id ? repo.listClusters().find((c) => c.cluster_id === wallet.cluster_id) : undefined;
  const eventCount = repo.listEventsByWallet(params.address, 1_000_000).length;
  return NextResponse.json({ ...wallet, cluster: cluster ?? null, event_count: eventCount });
}
