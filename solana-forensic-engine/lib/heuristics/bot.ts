import type { AnalysisContext, Heuristic, HeuristicResult } from "./types";
import { makeFinding, sigEvidence } from "./types";

const MAX_MEDIAN_INTER_TX_SEC = 0.2;
const MIN_AVG_COMPUTE_UNITS = 200_000;

function median(xs: number[]): number {
  if (!xs.length) return Infinity;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const botDetection: Heuristic = {
  id: "bot_detection",
  version: "0.1.0",
  run(ctx: AnalysisContext, investigationId: string): HeuristicResult {
    // map wallet -> its tx signatures via events
    const txBySig = new Map(ctx.transactions.map((t) => [t.signature, t]));
    const byWallet = new Map<string, { times: number[]; sigs: string[]; cus: number[] }>();
    for (const e of ctx.events) {
      const w = e.from_wallet;
      if (!w) continue;
      const rec = byWallet.get(w) ?? { times: [], sigs: [], cus: [] };
      if (!rec.sigs.includes(e.tx_signature)) {
        rec.sigs.push(e.tx_signature);
        rec.times.push(e.block_time);
        const cu = txBySig.get(e.tx_signature)?.compute_units;
        if (cu !== null && cu !== undefined) rec.cus.push(cu);
      }
      byWallet.set(w, rec);
    }

    const findings = [];
    for (const [wallet, rec] of byWallet) {
      const times = [...rec.times].sort((a, b) => a - b);
      const deltas = times.slice(1).map((t, i) => t - times[i]);
      const med = median(deltas);
      const avgCu = rec.cus.length ? rec.cus.reduce((a, b) => a + b, 0) / rec.cus.length : 0;
      if (med < MAX_MEDIAN_INTER_TX_SEC && avgCu > MIN_AVG_COMPUTE_UNITS && rec.sigs.length >= 4) {
        const w = ctx.wallets.get(wallet);
        if (w && !w.is_cex && !w.is_bridge) {
          ctx.wallets.set(wallet, { ...w, is_bot: true });
        }
        findings.push(
          makeFinding({
            investigation_id: investigationId,
            level: "HYPOTHESIS" as const,
            title: `Bot-like activity from ${wallet.slice(0, 8)}…`,
            description: `Median inter-transaction time ${med.toFixed(3)}s (< ${MAX_MEDIAN_INTER_TX_SEC}s) with avg compute units ${Math.round(avgCu)} across ${rec.sigs.length} txs.`,
            evidence: sigEvidence(rec.sigs.slice(0, 10)),
            confidence_score: 75,
            reasoning_summary:
              "Sub-second median inter-tx timing + high compute units is typical of automated bots. " +
              "A human operating a sniper bot also matches this pattern — classified as HYPOTHESIS, not ownership attribution.",
            data_sources: ["transaction timing", "computeUnitsConsumed"],
          }),
        );
      }
    }
    return { findings, clusters: [] };
  },
};
