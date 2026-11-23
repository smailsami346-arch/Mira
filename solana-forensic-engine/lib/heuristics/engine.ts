import type { AnalysisContext, Heuristic } from "./types";
import { commonFunder } from "./commonFunder";
import { sniperBundle } from "./sniper";
import { washTrading } from "./wash";
import { sybilClustering } from "./sybil";
import { devTracking } from "./dev";
import { lpManipulation } from "./lp";
import { botDetection } from "./bot";
import { netFlow, classifyPhase } from "./netFlow";
import { computeRiskScore } from "../analysis/risk";
import type { ClusterRecord, Finding, Phase } from "../types";

// Plugin registry: new rules are added here without changing the engine.
export const HEURISTICS: Heuristic[] = [
  commonFunder,
  sniperBundle,
  washTrading,
  sybilClustering,
  devTracking,
  lpManipulation,
  botDetection,
];

export interface EngineResult {
  findings: Finding[];
  clusters: ClusterRecord[];
}

export function runEngine(ctx: AnalysisContext, investigationId: string): EngineResult {
  const findings: Finding[] = [];
  const clusters: ClusterRecord[] = [];
  for (const h of HEURISTICS) {
    try {
      const r = h.run(ctx, investigationId);
      findings.push(...r.findings);
      clusters.push(...r.clusters);
    } catch (err) {
      // A failing rule must never break the whole analysis run.
      console.error(`heuristic ${h.id} failed:`, err);
    }
  }
  return { findings, clusters };
}

export function summarizeToken(
  ctx: AnalysisContext,
  findings: Finding[],
): { risk_score: number; phase: Phase; top_findings: Finding[] } {
  const risk_score = computeRiskScore(findings);
  let phase: Phase = "unknown";
  if (ctx.token.deployer) {
    const net = netFlow(ctx.events, ctx.token.mint, [ctx.token.deployer], 3600, 24);
    phase = classifyPhase(net, BigInt(ctx.token.supply || "0"));
  }
  const top_findings = [...findings]
    .sort((a, b) =>
      (a.level === "FACT" ? 0 : 1) - (b.level === "FACT" ? 0 : 1) || b.confidence_score - a.confidence_score,
    )
    .slice(0, 5);
  return { risk_score, phase, top_findings };
}
