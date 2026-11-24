import type { NormalizedEvent, Phase } from "../types";

export interface NetFlowBucket {
  window_start: number;
  in: string;
  out: string;
  net: string;
}

// Net token flow for a set of wallets over fixed windows.
// Only Transfer events of the given mint are counted (swaps are excluded to
// avoid double counting; use Swap side meta for trade flow).
export function netFlow(
  events: NormalizedEvent[],
  mint: string,
  members: string[],
  windowSec = 3600,
  buckets = 24,
  now?: number,
): NetFlowBucket[] {
  const set = new Set(members);
  const end = now ?? (events.length ? Math.max(...events.map((e) => e.block_time)) : 0);
  const start = end - buckets * windowSec;
  const acc = Array.from({ length: buckets }, (_, i) => ({
    window_start: start + i * windowSec,
    in: 0n,
    out: 0n,
  }));
  for (const e of events) {
    if (e.event_type !== "Transfer") continue;
    if (e.mint && e.mint !== mint) continue;
    if (e.block_time < start || e.block_time > end) continue;
    const idx = Math.min(buckets - 1, Math.floor((e.block_time - start) / windowSec));
    const amt = BigInt(e.amount || "0");
    if (e.to_wallet && set.has(e.to_wallet)) acc[idx].in += amt;
    if (e.from_wallet && set.has(e.from_wallet)) acc[idx].out += amt;
  }
  return acc.map((b) => ({
    window_start: b.window_start,
    in: b.in.toString(),
    out: b.out.toString(),
    net: (b.in - b.out).toString(),
  }));
}

// Phase classification for a member set: net inflow > +10% of supply => accumulation,
// net outflow < -10% => distribution (e.g. insider set dumping).
export function classifyPhase(net: NetFlowBucket[], supply: bigint): Phase {
  if (supply <= 0n) return "unknown";
  const total = net.reduce((a, b) => a + BigInt(b.net), 0n);
  const pct = Number((total * 10000n) / supply) / 100;
  if (pct > 10) return "accumulation";
  if (pct < -10) return "distribution";
  return "neutral";
}
