import type { AnalysisContext } from "../heuristics/types";
import { tokenEventsOf } from "../heuristics/types";

export interface GraphNode {
  id: string;
  labels: string[];
  risk_score: number;
  is_bot: boolean;
  cluster_id: string | null;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: "transfer" | "swap" | "funding" | "liquidity" | "other";
  amount: string;
  slot: number;
  sig: string;
}

const EDGE_TYPE_MAP: Record<string, GraphEdge["type"]> = {
  Transfer: "transfer",
  Swap: "swap",
  Funding: "funding",
  AddLiquidity: "liquidity",
  RemoveLiquidity: "liquidity",
};

export function buildGraph(
  ctx: AnalysisContext,
  opts: { seed?: string; depth?: number; edgeType?: string } = {},
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const events = tokenEventsOf(ctx);
  const edges: GraphEdge[] = [];
  for (const e of events) {
    if (!e.from_wallet || !e.to_wallet) continue;
    const type = EDGE_TYPE_MAP[e.event_type] ?? "other";
    if (opts.edgeType && type !== opts.edgeType) continue;
    edges.push({ from: e.from_wallet, to: e.to_wallet, type, amount: e.amount, slot: e.slot, sig: e.tx_signature });
  }

  // BFS from seed (default: deployer) up to depth
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    for (const [a, b] of [[e.from, e.to], [e.to, e.from]] as const) {
      const arr = adjacency.get(a) ?? [];
      arr.push(b);
      adjacency.set(a, arr);
    }
  }
  let nodeIds: Set<string>;
  const seed = opts.seed ?? ctx.token.deployer;
  if (seed) {
    const depth = opts.depth ?? 2;
    nodeIds = new Set([seed]);
    const queue: [string, number][] = [[seed, 0]];
    while (queue.length) {
      const [node, d] = queue.shift()!;
      if (d >= depth) continue;
      for (const next of adjacency.get(node) ?? []) {
        if (!nodeIds.has(next)) {
          nodeIds.add(next);
          queue.push([next, d + 1]);
        }
      }
    }
  } else {
    nodeIds = new Set(edges.flatMap((e) => [e.from, e.to]));
  }

  const nodes: GraphNode[] = [...nodeIds].map((id) => {
    const w = ctx.wallets.get(id);
    return {
      id,
      labels: w?.labels ?? [],
      risk_score: w?.risk_score ?? 0,
      is_bot: w?.is_bot ?? false,
      cluster_id: w?.cluster_id ?? null,
    };
  });
  const filteredEdges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
  return { nodes, edges: filteredEdges };
}
