import type { AnalysisContext, Heuristic, HeuristicResult } from "./types";
import { makeFinding, sigEvidence } from "./types";

const RUG_PCT = 80;
const SUDDEN_PCT = 50;
const SLOT_WINDOW = 3;

export const lpManipulation: Heuristic = {
  id: "lp_manipulation",
  version: "0.1.0",
  run(ctx: AnalysisContext, investigationId: string): HeuristicResult {
    const events = ctx.events;
    const pools = new Set([
      ...events.filter((e) => e.event_type === "AddLiquidity" && e.pool).map((e) => e.pool as string),
      ...events.filter((e) => e.event_type === "RemoveLiquidity" && e.pool).map((e) => e.pool as string),
    ]);
    const findings = [];

    for (const pool of pools) {
      const adds = events.filter((e) => e.event_type === "AddLiquidity" && e.pool === pool);
      const removes = events.filter((e) => e.event_type === "RemoveLiquidity" && e.pool === pool).sort((a, b) => a.slot - b.slot);
      const totalAdded = adds.reduce((a, e) => a + BigInt(e.amount || "0"), 0n);
      if (totalAdded <= 0n || removes.length === 0) continue;

      // group consecutive removals within SLOT_WINDOW slots
      const groups: (typeof removes)[] = [];
      for (const r of removes) {
        const last = groups[groups.length - 1];
        if (last && r.slot - last[last.length - 1].slot <= SLOT_WINDOW) last.push(r);
        else groups.push([r]);
      }
      for (const g of groups) {
        const removed = g.reduce((a, e) => a + BigInt(e.amount || "0"), 0n);
        const pct = Number((removed * 10000n) / totalAdded) / 100;
        if (pct < SUDDEN_PCT) continue;
        findings.push(
          makeFinding({
            investigation_id: investigationId,
            level: "FACT" as const,
            title: `Sudden LP removal: ${pct.toFixed(1)}% of pool liquidity removed within ${SLOT_WINDOW} slots`,
            description: `Pool ${pool.slice(0, 8)}…: ${g.length} removal tx(s) in slots ${g.map((e) => e.slot).join(", ")}, total ${removed.toString()} of ${totalAdded.toString()} added.`,
            evidence: sigEvidence(g.map((e) => e.tx_signature)),
            confidence_score: 100,
            reasoning_summary: "On-chain fact: liquidity removal events and amounts.",
            data_sources: ["AddLiquidity/RemoveLiquidity events"],
          }),
        );
        if (pct >= RUG_PCT) {
          findings.push(
            makeFinding({
              investigation_id: investigationId,
              level: "INFERENCE" as const,
              title: `Possible rug pull: ${pct.toFixed(1)}% of LP removed at once`,
              description: "Removing nearly all liquidity in a single burst is consistent with a rug pull.",
              evidence: sigEvidence(g.map((e) => e.tx_signature)),
              confidence_score: 80,
              reasoning_summary:
                "The removal itself is a FACT; 'rug pull' intent is an inference. Verify who received the withdrawn funds (LP token owner) before escalating.",
              data_sources: ["RemoveLiquidity events", "LP token ownership"],
            }),
          );
        }
      }
    }
    return { findings, clusters: [] };
  },
};
