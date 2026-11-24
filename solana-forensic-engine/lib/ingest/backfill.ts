import type { Repository } from "../db/repository";
import type { RpcClient } from "../rpc/client";
import { normalizeTransaction } from "../normalizer";
import { decodeTransaction, firstSigner } from "../decoder";
import { PROGRAM_IDS } from "../decoder/programs";
import { runEngine, summarizeToken } from "../heuristics/engine";
import type { NormalizedEvent, TokenRecord, TransactionRecord } from "../types";

export interface BackfillOptions {
  /** recent signatures to fetch (newest first) */
  limit?: number;
  /** how many signature pages of `limit` to walk back (to reach the launch window) */
  maxPages?: number;
  /** oldest signatures to fetch (launch window: creation + early snipers) */
  launchWindow?: number;
}

// Backfills a token: pages signatures back to the launch window, fetches
// transactions (newest `limit` + oldest `launchWindow`), decodes, normalizes,
// stores, then runs the full heuristic engine.
export async function backfillToken(
  repo: Repository,
  rpc: RpcClient,
  mint: string,
  opts: number | BackfillOptions = 1000,
) {
  const o: BackfillOptions = typeof opts === "number" ? { limit: opts } : opts;
  const limit = o.limit ?? 1000;
  const maxPages = o.maxPages ?? 5;
  const launchWindow = o.launchWindow ?? 200;

  // page signatures backwards (getSignaturesForAddress returns newest first)
  const sigs: Array<{ signature: string; slot: number }> = [];
  let before: string | undefined;
  let pages = 0;
  while (pages < maxPages) {
    const batch = await rpc.getSignaturesForAddress(mint, limit, before);
    if (!batch.length) break;
    sigs.push(...batch.map((s) => ({ signature: s.signature, slot: s.slot })));
    before = batch[batch.length - 1].signature;
    pages++;
    if (batch.length < limit) break; // reached the beginning
  }
  // fetch newest `limit` + oldest `launchWindow` (launch/creation window)
  const selected = [...sigs.slice(0, limit), ...sigs.slice(-launchWindow)];
  const uniqSigs = [...new Map(selected.map((s) => [s.signature, s.signature])).values()];
  const txs = await rpc.getTransactions(uniqSigs);

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
      if (d.program_id === PROGRAM_IDS.PUMP_FUN) launchpad = launchpad ?? "pump.fun";
      else if (d.program_id === "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA") launchpad = launchpad ?? "pump.fun AMM";
      else if (d.program_id === PROGRAM_IDS.RAYDIUM_AMM_V4 && d.kind === "CreatePool" && d.mint === mint) launchpad = launchpad ?? "raydium";
      else if (d.program_id === PROGRAM_IDS.JUPITER_V6) launchpad = launchpad ?? "jupiter";
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
    slot: sigs.length ? Math.min(...sigs.map((s) => s.slot)) : 0,
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
    slot: sigs.length ? Math.min(...sigs.map((s) => s.slot)) : token.slot,
  });

  repo.addTransactions(transactions);
  repo.addEvents(events);

  const investigation = repo.createInvestigation(mint, "backfill");
  const allEvents = repo.listEventsByMint(mint, { limit: 100_000 });
  const wallets = new Map(repo.listWallets().map((w) => [w.address, w]));
  const current = repo.getToken(mint) as TokenRecord;
  const { findings, clusters } = runEngine({ token: current, events: allEvents, transactions, wallets }, investigation.id);
  repo.addFindings(findings);
  repo.addClusters(clusters);
  for (const w of wallets.values()) repo.upsertWallet(w); // persist heuristic mutations (e.g. is_bot)
  for (const c of clusters) {
    for (const m of c.members) {
      const w = repo.getWallet(m);
      if (w) repo.upsertWallet({ ...w, cluster_id: c.cluster_id });
    }
  }

  const summary = summarizeToken({ token: current, events: allEvents, transactions, wallets }, findings);
  repo.updateTokenSummary(mint, summary.risk_score, summary.phase);

  return {
    mint,
    signatures: sigs.length,
    pages,
    txCount: transactions.length,
    eventCount: allEvents.length,
    findings: findings.length,
    clusters: clusters.length,
    investigationId: investigation.id,
    risk_score: summary.risk_score,
    phase: summary.phase,
    deployer,
    launchpad,
  };
}
