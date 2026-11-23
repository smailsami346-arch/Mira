import type { AnalysisContext, Heuristic, HeuristicResult } from "./types";
import { makeFinding, sigEvidence, tokenEventsOf } from "./types";

const MAX_SLOTS_AFTER_CREATE = 3;

export const sniperBundle: Heuristic = {
  id: "sniper_bundle",
  version: "0.1.0",
  run(ctx: AnalysisContext, investigationId: string): HeuristicResult {
    const events = tokenEventsOf(ctx);
    const pools = new Set(events.filter((e) => e.pool).map((e) => e.pool as string));
    const findings = [];

    for (const pool of pools) {
      const poolEvents = events.filter((e) => e.pool === pool);
      const createSlots = poolEvents.filter((e) => e.event_type === "CreatePool").map((e) => e.slot);
      const createdSlot = createSlots.length ? Math.min(...createSlots) : Math.min(...poolEvents.map((e) => e.slot));
      const swaps = poolEvents.filter((e) => e.event_type === "Swap" && e.from_wallet);
      const seen = new Set<string>();
      const early = swaps.filter((e) => {
        if (e.slot - createdSlot > MAX_SLOTS_AFTER_CREATE) return false;
        if (seen.has(e.from_wallet as string)) return false;
        seen.add(e.from_wallet as string);
        return true;
      });
      if (early.length < 2) continue;
      const sameSlot = new Map<number, number>();
      for (const e of early) sameSlot.set(e.slot, (sameSlot.get(e.slot) ?? 0) + 1);
      const bundleNote = [...sameSlot.values()].some((c) => c >= 3) ? " Multiple buys landed in the same slot (bundle-like)." : "";
      findings.push(
        makeFinding({
          investigation_id: investigationId,
          level: "INFERENCE" as const,
          title: `Sniper pattern: ${early.length} distinct wallets bought within ${MAX_SLOTS_AFTER_CREATE} slots of pool creation`,
          description:
            `Pool ${pool.slice(0, 8)}… was created at slot ${createdSlot}; wallets ` +
            `${early.map((e) => (e.from_wallet as string).slice(0, 8) + "…").join(", ")} executed their first swap ` +
            `in slots ${early.map((e) => e.slot).join(", ")}.${bundleNote} Consistent with sniper bots or insiders.`,
          evidence: sigEvidence(early.map((e) => e.tx_signature)),
          confidence_score: early.length >= 5 ? 90 : 70,
          reasoning_summary:
            "First-interaction swaps concentrated in the first 3 slots after pool creation. " +
            "Public sniper bots are expected; insider status requires linking buyers to the deployer (see dev_tracking).",
          data_sources: ["Swap events on pool", "CreatePool event", "getTransaction slots"],
        }),
      );
    }
    return { findings, clusters: [] };
  },
};
