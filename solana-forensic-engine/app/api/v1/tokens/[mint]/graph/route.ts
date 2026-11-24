import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db/store";
import { buildGraph } from "@/lib/analysis/graph";
import { guard } from "@/lib/api/ratelimit";

export const dynamic = "force-dynamic";

// GET /api/v1/tokens/:mint/graph?depth=2&edge=swap
export async function GET(req: Request, { params }: { params: { mint: string } }) {
  const rl = guard(req);
  if (rl) return rl;
  const { searchParams } = new URL(req.url);
  const repo = getRepo();
  const token = repo.getToken(params.mint);
  if (!token) return NextResponse.json({ error: "token_not_found" }, { status: 404 });
  const events = repo.listEventsByMint(params.mint, { limit: 100_000 });
  const wallets = new Map(repo.listWallets().map((w) => [w.address, w]));
  const graph = buildGraph(
    { token, events, transactions: repo.listTransactions(), wallets },
    {
      seed: searchParams.get("seed") ?? token.deployer ?? undefined,
      depth: Number(searchParams.get("depth")) || 2,
      edgeType: searchParams.get("edge") ?? undefined,
    },
  );
  return NextResponse.json(graph);
}
