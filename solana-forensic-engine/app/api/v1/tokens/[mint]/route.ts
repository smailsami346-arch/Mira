import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db/store";
import { summarizeToken } from "@/lib/heuristics/engine";
import { guard } from "@/lib/api/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { mint: string } }) {
  const rl = guard(req);
  if (rl) return rl;
  const repo = getRepo();
  const token = repo.getToken(params.mint);
  if (!token) {
    return NextResponse.json({ error: "token_not_found", hint: "POST /api/v1/ingest/backfill or /api/v1/demo/seed first" }, { status: 404 });
  }
  const inv = repo.listInvestigations().filter((i) => i.token_mint === params.mint).at(-1);
  const findings = inv ? repo.listFindings(inv.id) : [];
  const events = repo.listEventsByMint(params.mint, { limit: 100_000 });
  const wallets = new Map(repo.listWallets().map((w) => [w.address, w]));
  const summary = summarizeToken({ token, events, transactions: repo.listTransactions(), wallets }, findings);
  return NextResponse.json({
    ...token,
    risk_score: summary.risk_score,
    phase: summary.phase,
    findings_count: findings.length,
    investigation_id: inv?.id ?? null,
    top_findings: summary.top_findings,
  });
}
