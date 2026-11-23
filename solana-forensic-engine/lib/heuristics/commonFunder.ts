import type { AnalysisContext, Heuristic, HeuristicResult } from "./types";
import { makeFinding, sigEvidence } from "./types";
import type { NormalizedEvent } from "../types";

export interface FunderGroup {
  funder: string;
  members: string[];
  spanSeconds: number;
  sigs: string[];
  touchedToken: number;
}

// Groups SOL funding transfers (SystemProgram::Transfer) by source wallet.
export function findFunderGroups(
  events: NormalizedEvent[],
  mint: string | null,
  windowSec = 300,
  minMembers = 3,
): FunderGroup[] {
  const fundings = events.filter((e) => e.event_type === "Funding" && e.from_wallet && e.to_wallet);
  const byFunder = new Map<string, NormalizedEvent[]>();
  for (const e of fundings) {
    const arr = byFunder.get(e.from_wallet as string) ?? [];
    arr.push(e);
    byFunder.set(e.from_wallet as string, arr);
  }
  const groups: FunderGroup[] = [];
  for (const [funder, arr] of byFunder) {
    const members = [...new Set(arr.map((e) => e.to_wallet as string))];
    if (members.length < minMembers) continue;
    const times = arr.map((e) => e.block_time);
    const spanSeconds = Math.max(...times) - Math.min(...times);
    if (spanSeconds > windowSec) continue;
    const touchedToken = mint
      ? members.filter((w) => events.some((e) => e.mint === mint && (e.from_wallet === w || e.to_wallet === w))).length
      : 0;
    groups.push({ funder, members, spanSeconds, sigs: arr.map((e) => e.tx_signature), touchedToken });
  }
  return groups;
}

export const commonFunder: Heuristic = {
  id: "common_funder",
  version: "0.1.0",
  run(ctx: AnalysisContext, investigationId: string): HeuristicResult {
    const groups = findFunderGroups(ctx.events, ctx.token.mint);
    const findings = groups
      .filter((g) => g.touchedToken >= 2)
      .map((g) => {
        const confidence = Math.min(
          95,
          50 + (g.members.length - 3) * 10 + 10 + (g.spanSeconds <= 60 ? 5 : 0),
        );
        return makeFinding({
          investigation_id: investigationId,
          level: "INFERENCE" as const,
          title: `Common funder: ${g.funder.slice(0, 8)}… funded ${g.members.length} wallets within ${g.spanSeconds}s`,
          description:
            `Wallets ${g.members.map((m) => m.slice(0, 8) + "…").join(", ")} were all funded by the same source ` +
            `${g.funder.slice(0, 8)}… within a ${g.spanSeconds}s window, and ${g.touchedToken} of them interacted with token ${ctx.token.mint.slice(0, 8)}…. ` +
            `This pattern is consistent with single-entity control (sybil / insider set).`,
          evidence: sigEvidence(g.sigs),
          confidence_score: confidence,
          reasoning_summary:
            "Same SOL funder + tight time window + shared interaction with the analyzed token. " +
            "CEX/bridge shared wallets are excluded upstream via labels (is_cex/is_bridge).",
          data_sources: ["SystemProgram::Transfer events (getTransaction inner instructions)"],
        });
      });
    return { findings, clusters: [] };
  },
};
