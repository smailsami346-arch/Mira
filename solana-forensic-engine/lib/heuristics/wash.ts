import type { AnalysisContext, Heuristic, HeuristicResult } from "./types";
import { makeFinding, sigEvidence, tokenEventsOf } from "./types";
import type { NormalizedEvent } from "../types";

interface Edge {
  to: string;
  amount: bigint;
  sig: string;
  time: number;
}

function findCycles(adj: Map<string, Edge[]>, maxDepth: number): { members: string[]; edges: Edge[] }[] {
  const cycles: { members: string[]; edges: Edge[] }[] = [];
  const seen = new Set<string>();

  const dfs = (start: string, node: string, path: string[], edges: Edge[], depth: number) => {
    if (depth > maxDepth) return;
    for (const e of adj.get(node) ?? []) {
      if (e.to === start && path.length >= 2) {
        const key = [...path].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push({ members: [...path], edges: [...edges, e] });
        }
      } else if (!path.includes(e.to) && depth < maxDepth) {
        dfs(start, e.to, [...path, e.to], [...edges, e], depth + 1);
      }
    }
  };

  for (const node of adj.keys()) dfs(node, node, [node], [], 1);
  return cycles;
}

function coefficientOfVariation(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean === 0) return 0;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance) / mean;
}

export const washTrading: Heuristic = {
  id: "wash_trading",
  version: "0.1.0",
  run(ctx: AnalysisContext, investigationId: string): HeuristicResult {
    const events = tokenEventsOf(ctx).filter(
      (e) => e.event_type === "Transfer" && e.from_wallet && e.to_wallet,
    ) as (NormalizedEvent & { from_wallet: string; to_wallet: string })[];

    const adj = new Map<string, Edge[]>();
    for (const t of events) {
      const arr = adj.get(t.from_wallet) ?? [];
      arr.push({ to: t.to_wallet, amount: BigInt(t.amount || "0"), sig: t.tx_signature, time: t.block_time });
      adj.set(t.from_wallet, arr);
    }

    const findings = [];
    for (const cycle of findCycles(adj, 4)) {
      const amounts = cycle.edges.map((e) => Number(e.amount));
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      if (mean === 0) continue;
      const maxDev = Math.max(...amounts.map((a) => Math.abs(a - mean) / mean));
      if (maxDev > 0.05) continue;
      const times = [...cycle.edges.map((e) => e.time)].sort((a, b) => a - b);
      const deltas = times.slice(1).map((t, i) => t - times[i]);
      const cv = coefficientOfVariation(deltas);
      if (deltas.length >= 2 && cv >= 0.3) continue;

      findings.push(
        makeFinding({
          investigation_id: investigationId,
          level: "HYPOTHESIS" as const,
          title: `Possible wash trading: circular transfers between ${cycle.members.length} wallets`,
          description:
            `Cycle ${cycle.members.map((m) => m.slice(0, 8) + "…").join(" → ")} with near-identical amounts ` +
            `(max deviation ${(maxDev * 100).toFixed(1)}%)` +
            (deltas.length >= 2 ? ` and regular timing (cv=${cv.toFixed(2)}).` : "."),
          evidence: sigEvidence(cycle.edges.map((e) => e.sig)),
          confidence_score: Math.min(75, 50 + Math.round((1 - maxDev) * 20) + (cv < 0.1 ? 10 : 0)),
          reasoning_summary:
            "Circular flow + matched volumes + regular timing is consistent with wash trading, but can also be " +
            "legitimate arbitrage or market-making. Always classified as HYPOTHESIS pending off-chain corroboration.",
          data_sources: ["Transfer events of analyzed token"],
        }),
      );
    }
    return { findings, clusters: [] };
  },
};
