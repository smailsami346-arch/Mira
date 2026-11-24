import type { AnalysisContext, Heuristic, HeuristicResult } from "./types";
import { makeFinding, sigEvidence } from "./types";
import { findFunderGroups } from "./commonFunder";
import type { ClusterRecord } from "../types";

// Signal weights: commonFunder 1.5, syncedTiming (<=60s) 1, sharedToken 1, sameAmountPattern 0.5
const WEIGHTS = { commonFunder: 1.5, syncedTiming: 1, sharedToken: 1, sameAmount: 0.5 } as const;
const CLUSTER_THRESHOLD = 3;

export const sybilClustering: Heuristic = {
  id: "sybil_clustering",
  version: "0.1.0",
  run(ctx: AnalysisContext, investigationId: string): HeuristicResult {
    const groups = findFunderGroups(ctx.events, ctx.token.mint);
    const tokenTransfers = ctx.events.filter(
      (e) => e.event_type === "Transfer" && e.mint === ctx.token.mint && e.from_wallet && e.to_wallet,
    );
    const findings = [];
    const clusters: ClusterRecord[] = [];

    for (const g of groups) {
      if (g.members.length < 3) continue;
      const memberSet = new Set(g.members);
      const internal = tokenTransfers.filter((e) => memberSet.has(e.from_wallet as string) && memberSet.has(e.to_wallet as string));
      const amounts = new Map<string, number>();
      for (const e of internal) amounts.set(e.amount, (amounts.get(e.amount) ?? 0) + 1);
      const sameAmount = [...amounts.values()].some((c) => c >= 3);

      let score = WEIGHTS.commonFunder;
      if (g.spanSeconds <= 60) score += WEIGHTS.syncedTiming;
      if (g.touchedToken >= 2) score += WEIGHTS.sharedToken;
      if (sameAmount) score += WEIGHTS.sameAmount;
      if (score < CLUSTER_THRESHOLD) continue;

      const confidence = Math.min(95, Math.round((score / 4) * 100));
      const clusterId = crypto.randomUUID();
      clusters.push({
        cluster_id: clusterId,
        heuristic: "sybil_clustering",
        confidence,
        members: g.members,
        token_mint: ctx.token.mint,
        evidence: sigEvidence(g.sigs),
      });
      findings.push(
        makeFinding({
          investigation_id: investigationId,
          level: "INFERENCE" as const,
          title: `Sybil cluster detected: ${g.members.length} wallets (score ${score.toFixed(1)}/4)`,
          description:
            `Signals: common funder (${g.funder.slice(0, 8)}…), span ${g.spanSeconds}s, ` +
            `${g.touchedToken} members touched the token${sameAmount ? ", repeated identical transfer amounts" : ""}.`,
          evidence: sigEvidence(g.sigs),
          confidence_score: confidence,
          reasoning_summary:
            "Multiple independent signals converging on one funding source. " +
            "Shared CEX/bridge wallets are excluded via labels before clustering.",
          data_sources: ["Funding events", "Transfer events", "wallet_clusters"],
        }),
      );
    }
    return { findings, clusters };
  },
};
