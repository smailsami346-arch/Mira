import type { ClusterRecord, Evidence, Finding, NormalizedEvent, TokenRecord, TransactionRecord, WalletRecord } from "../types";

export interface AnalysisContext {
  token: TokenRecord;
  events: NormalizedEvent[];
  transactions: TransactionRecord[];
  wallets: Map<string, WalletRecord>;
}

export interface HeuristicResult {
  findings: Finding[];
  clusters: ClusterRecord[];
}

export interface Heuristic {
  id: string;
  version: string;
  run(ctx: AnalysisContext, investigationId: string): HeuristicResult;
}

export function makeFinding(partial: Omit<Finding, "id" | "created_at">): Finding {
  return { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...partial };
}

export function sigEvidence(sigs: string[]): Evidence[] {
  return sigs.map((s) => ({
    type: "signature" as const,
    value: s,
    explorer_url: `https://solscan.io/tx/${s}`,
  }));
}

export function slotEvidence(slots: number[]): Evidence[] {
  return slots.map((s) => ({ type: "slot" as const, value: String(s) }));
}

export function tokenEventsOf(ctx: AnalysisContext): NormalizedEvent[] {
  const pools = new Set(
    ctx.events.filter((e) => e.mint === ctx.token.mint && e.pool).map((e) => e.pool as string),
  );
  return ctx.events.filter((e) => e.mint === ctx.token.mint || (e.pool !== null && pools.has(e.pool)));
}
