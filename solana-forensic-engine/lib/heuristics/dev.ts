import type { AnalysisContext, Heuristic, HeuristicResult } from "./types";
import { makeFinding, sigEvidence, tokenEventsOf } from "./types";

const MAX_GRAPH_DISTANCE = 2;
const EARLY_WINDOW_SEC = 3600;
const EARLY_SELL_PCT = 5;

// BFS over directed edges (from -> to) of all token-related events.
export function insiderSet(ctx: AnalysisContext): Set<string> {
  const deployer = ctx.token.deployer;
  const result = new Set<string>();
  if (!deployer) return result;
  const events = tokenEventsOf(ctx);
  const adj = new Map<string, string[]>();
  for (const e of events) {
    if (e.from_wallet && e.to_wallet) {
      const arr = adj.get(e.from_wallet) ?? [];
      arr.push(e.to_wallet);
      adj.set(e.from_wallet, arr);
    }
  }
  const queue: [string, number][] = [[deployer, 0]];
  const dist = new Map<string, number>([[deployer, 0]]);
  while (queue.length) {
    const [node, d] = queue.shift()!;
    if (d >= MAX_GRAPH_DISTANCE) continue;
    for (const next of adj.get(node) ?? []) {
      if (!dist.has(next)) {
        dist.set(next, d + 1);
        queue.push([next, d + 1]);
      }
    }
  }
  for (const [w, d] of dist) if (d <= MAX_GRAPH_DISTANCE) result.add(w);
  return result;
}

export const devTracking: Heuristic = {
  id: "dev_insider_tracking",
  version: "0.1.0",
  run(ctx: AnalysisContext, investigationId: string): HeuristicResult {
    const deployer = ctx.token.deployer;
    if (!deployer) return { findings: [], clusters: [] };
    const events = tokenEventsOf(ctx);
    const insiders = insiderSet(ctx);
    const findings = [];

    const swaps = events.filter((e) => e.event_type === "Swap" && e.from_wallet);
    const firstSwapTime = swaps.length ? Math.min(...swaps.map((e) => e.block_time)) : ctx.token.slot ? 0 : 0;
    const earlySwaps = swaps.filter(
      (e) => insiders.has(e.from_wallet as string) && e.block_time <= firstSwapTime + EARLY_WINDOW_SEC,
    );
    const earlySells = earlySwaps.filter((e) => e.meta?.side === "sell");
    const soldAmount = earlySells.reduce((a, e) => a + BigInt(e.amount || "0"), 0n);
    const supply = BigInt(ctx.token.supply || "0");

    if (earlySwaps.length) {
      findings.push(
        makeFinding({
          investigation_id: investigationId,
          level: "FACT" as const,
          title: `Deployer-linked wallets executed ${earlySwaps.length} swaps within 1h of first trading`,
          description: `Wallets within graph distance ${MAX_GRAPH_DISTANCE} of deployer ${deployer.slice(0, 8)}… traded early.`,
          evidence: sigEvidence(earlySwaps.map((e) => e.tx_signature)),
          confidence_score: 100,
          reasoning_summary: "Direct on-chain fact: swap transactions by deployer-linked wallets in the first hour.",
          data_sources: ["Swap events", "wallet graph (distance <= 2 from deployer)"],
        }),
      );
    }
    if (supply > 0n && earlySells.length) {
      const pct = Number((soldAmount * 10000n) / supply) / 100;
      if (pct >= EARLY_SELL_PCT) {
        findings.push(
          makeFinding({
            investigation_id: investigationId,
            level: "INFERENCE" as const,
            title: `Early insider distribution: deployer-linked wallets sold ${pct.toFixed(1)}% of supply in the first hour`,
            description: `Early sell volume ${soldAmount.toString()} raw units = ${pct.toFixed(1)}% of total supply.`,
            evidence: sigEvidence(earlySells.map((e) => e.tx_signature)),
            confidence_score: 85,
            reasoning_summary:
              "Deployer-linked wallets (graph distance <= 2) sold a large share of supply immediately after launch. " +
              "Volume fact is on-chain; the 'insider' attribution is an inference from graph proximity + timing.",
            data_sources: ["Swap events with side=sell", "token supply", "wallet graph"],
          }),
        );
      }
    }

    const authorityChanges = events.filter(
      (e) => e.event_type === "SetAuthority" && e.mint === ctx.token.mint && e.meta?.authority_type === 0,
    );
    for (const e of authorityChanges) {
      findings.push(
        makeFinding({
          investigation_id: investigationId,
          level: "FACT" as const,
          title: "Mint authority transferred",
          description: `Mint authority of ${ctx.token.mint.slice(0, 8)}… was set to ${String(e.to_wallet).slice(0, 12)}…`,
          evidence: sigEvidence([e.tx_signature]),
          confidence_score: 100,
          reasoning_summary: "On-chain SetAuthority(MintTokens) instruction observed.",
          data_sources: ["SPL Token SetAuthority instruction"],
        }),
      );
    }
    return { findings, clusters: [] };
  },
};
