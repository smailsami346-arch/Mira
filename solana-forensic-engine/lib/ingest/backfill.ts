import type { Repository } from "../db/repository";
import type { RpcClient } from "../rpc/client";
import { normalizeTransaction } from "../normalizer";
import { decodeTransaction, firstSigner } from "../decoder";
import { PROGRAM_IDS } from "../decoder/programs";
import { runEngine, summarizeToken } from "../heuristics/engine";
import type { NormalizedEvent, TokenRecord, TransactionRecord } from "../types";

// Backfills all transactions touching `mint`, normalizes them, stores events,
// then runs the full heuristic engine and stores findings + clusters.
export async function backfillToken(repo: Repository, rpc: RpcClient, mint: string, limit = 1000) {
  const sigs = await rpc.getSignaturesForAddress(mint, limit);
  const txs = await rpc.getTransactions(sigs.map((s) => s.signature));

  const events: NormalizedEvent[] = [];
  const transactions: TransactionRecord[] = [];
  let deployer: string | null = null;
  let launchpad: string | null = null;
  let decimals = 9;
  let supply = 0n;

  for (const tx of txs) {
    if (!tx) continue;
    const { events: ev, txRecord } = normalizeTransaction(tx);
    events.push(...ev);
    transactions.push(txRecord);
    const signer = firstSigner(tx);
    for (const d of decodeTransaction(tx)) {
      if (d.kind === "InitializeMint" && d.mint === mint) {
        deployer = deployer ?? signer;
        if (d.decimals !== undefined) decimals = d.decimals;
      }
      if (d.program_id === PROGRAM_IDS.PUMP_FUN) launchpad = "pump.fun";
      else if (d.program_id === PROGRAM_IDS.RAYDIUM_AMM_V4 && d.kind === "CreatePool" && d.mint === mint) {
        launchpad = launchpad ?? "raydium";
      }
    }
    for (const e of ev) {
      if (e.event_type === "Mint" && e.mint === mint) supply += BigInt(e.amount || "0");
      if (e.event_type === "Burn" && e.mint === mint) supply -= BigInt(e.amount || "0");
      for (const w of [e.from_wallet, e.to_wallet]) {
        if (w && !repo.getWallet(w)) {
          repo.upsertWallet({
            address: w,
            first_seen: e.block_time ? new Date(e.block_time * 1000).toISOString() : new Date().toISOString(),
            labels: [],
            risk_score: 0,
            cluster_id: null,
            is_bot: false,
            is_cex: false,
            is_bridge: false,
          });
        }
      }
    }
  }

  const existing = repo.getToken(mint);
  const token: TokenRecord = existing ?? {
    mint,
    symbol: mint.slice(0, 6),
    name: mint.slice(0, 6),
    decimals,
    supply: supply.toString(),
    created_at: new Date().toISOString(),
    slot: transactions.length ? Math.min(...transactions.map((t) => t.slot)) : 0,
    deployer: deployer ?? null,
    launchpad: launchpad ?? "unknown",
    metadata_uri: null,
  };
  repo.upsertToken({
    ...token,
    decimals,
    supply: supply > 0n ? supply.toString() : token.supply,
    deployer: deployer ?? token.deployer,
    launchpad: launchpad ?? token.launchpad,
  });

  repo.addTransactions(transactions);
  repo.addEvents(events);

  const investigation = repo.createInvestigation(mint, "backfill");
  const allEvents = repo.listEventsByMint(mint, { limit: 100_000 });
  const wallets = new Map(repo.listWallets().map((w) => [w.address, w]));
  const { findings, clusters } = runEngine(
    { token: repo.getToken(mint) as TokenRecord, events: allEvents, transactions, wallets },
    investigation.id,
  );
  repo.addFindings(findings);
  repo.addClusters(clusters);
  for (const w of wallets.values()) repo.upsertWallet(w); // persist heuristic mutations (e.g. is_bot)
  for (const c of clusters) {
    for (const m of c.members) {
      const w = repo.getWallet(m);
      if (w) repo.upsertWallet({ ...w, cluster_id: c.cluster_id });
    }
  }

  const summary = summarizeToken(
    { token: repo.getToken(mint) as TokenRecord, events: allEvents, transactions, wallets },
    findings,
  );
  repo.updateTokenSummary(mint, summary.risk_score, summary.phase);

  return {
    mint,
    txCount: transactions.length,
    eventCount: allEvents.length,
    findings: findings.length,
    clusters: clusters.length,
    investigationId: investigation.id,
    risk_score: summary.risk_score,
    phase: summary.phase,
  };
}
