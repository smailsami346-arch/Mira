import type { Repository } from "./repository";
import { runEngine, summarizeToken } from "../heuristics/engine";
import { PROGRAM_IDS } from "../decoder/programs";
import type { NormalizedEvent, TokenRecord, TransactionRecord, WalletRecord } from "../types";

export const DEMO_MINT = "DemoMint11111111111111111111111111111111111";
const DEV = "DevWallet111111111111111111111111111111111";
const FUNDER = "Funder11111111111111111111111111111111111";
const A = "SniperA1111111111111111111111111111111111";
const B = "SniperB1111111111111111111111111111111111";
const C = "SniperC1111111111111111111111111111111111";
const W1 = "Wash1111111111111111111111111111111111111";
const W2 = "Wash2222222222222222222222222222222222222";
const W3 = "Wash3333333333333333333333333333333333333";
const POOL = "Pool1111111111111111111111111111111111111";

const T0 = 1_730_000_000;
let slot = 1_000_000;

function sig(name: string): string {
  return (name + "Sig").padEnd(64, "x");
}

// Synthetic end-to-end scenario: deployer + common-funder snipers + wash cycle
// + early dev sell + bot-like wallet. Used for the demo UI without RPC access.
export function seedDemo(repo: Repository) {
  repo.reset();
  const token: TokenRecord = {
    mint: DEMO_MINT,
    symbol: "DEMO",
    name: "Demo Token",
    decimals: 9,
    supply: "1000000000000",
    created_at: new Date((T0 - 600) * 1000).toISOString(),
    slot,
    deployer: DEV,
    launchpad: "pump.fun",
    metadata_uri: null,
  };
  repo.upsertToken(token);

  for (const [addr, first] of [
    [DEV, T0 - 1000],
    [FUNDER, T0 - 400],
    [A, T0 - 300],
    [B, T0 - 290],
    [C, T0 - 280],
    [W1, T0 - 100],
    [W2, T0 - 100],
    [W3, T0 - 100],
  ] as const) {
    const w: WalletRecord = {
      address: addr,
      first_seen: new Date(first * 1000).toISOString(),
      labels: addr === DEV ? ["deployer"] : [],
      risk_score: 0,
      cluster_id: null,
      is_bot: false,
      is_cex: false,
      is_bridge: false,
    };
    repo.upsertWallet(w);
  }

  const events: NormalizedEvent[] = [];
  const transactions: TransactionRecord[] = [];
  const push = (
    e: Omit<NormalizedEvent, "tx_signature" | "slot" | "block_time">,
    s: string,
    sl: number,
    t: number,
    cu = 100_000,
  ) => {
    events.push({ ...e, tx_signature: s, slot: sl, block_time: t });
    transactions.push({ signature: s, slot: sl, block_time: t, fee: 5000, status: "success", instructions_count: 3, compute_units: cu });
  };

  push({ event_type: "Mint", from_wallet: null, to_wallet: DEV, amount: "1000000000000", mint: DEMO_MINT, pool: null, program_id: PROGRAM_IDS.SPL_TOKEN }, sig("mint"), slot, T0 - 600);

  push({ event_type: "Funding", from_wallet: FUNDER, to_wallet: A, amount: "2000000000", mint: null, pool: null, program_id: PROGRAM_IDS.SYSTEM }, sig("fund1"), slot + 1, T0 - 300);
  push({ event_type: "Funding", from_wallet: FUNDER, to_wallet: B, amount: "2000000000", mint: null, pool: null, program_id: PROGRAM_IDS.SYSTEM }, sig("fund2"), slot + 2, T0 - 280);
  push({ event_type: "Funding", from_wallet: FUNDER, to_wallet: C, amount: "2000000000", mint: null, pool: null, program_id: PROGRAM_IDS.SYSTEM }, sig("fund3"), slot + 3, T0 - 260);

  push({ event_type: "CreatePool", from_wallet: DEV, to_wallet: POOL, amount: "0", mint: DEMO_MINT, pool: POOL, program_id: PROGRAM_IDS.RAYDIUM_AMM_V4 }, sig("pool"), slot + 10, T0);

  push({ event_type: "Swap", from_wallet: A, to_wallet: POOL, amount: "50000000000", mint: DEMO_MINT, pool: POOL, program_id: PROGRAM_IDS.PUMP_FUN, meta: { side: "buy" } }, sig("buyA"), slot + 11, T0 + 15);
  push({ event_type: "Swap", from_wallet: B, to_wallet: POOL, amount: "80000000000", mint: DEMO_MINT, pool: POOL, program_id: PROGRAM_IDS.PUMP_FUN, meta: { side: "buy" } }, sig("buyB"), slot + 12, T0 + 30);
  push({ event_type: "Swap", from_wallet: C, to_wallet: POOL, amount: "30000000000", mint: DEMO_MINT, pool: POOL, program_id: PROGRAM_IDS.PUMP_FUN, meta: { side: "buy" } }, sig("buyC"), slot + 12, T0 + 31);

  push({ event_type: "Swap", from_wallet: DEV, to_wallet: POOL, amount: "200000000000", mint: DEMO_MINT, pool: POOL, program_id: PROGRAM_IDS.PUMP_FUN, meta: { side: "sell" } }, sig("devsell"), slot + 50, T0 + 600);

  push({ event_type: "Transfer", from_wallet: W1, to_wallet: W2, amount: "1000", mint: DEMO_MINT, pool: null, program_id: PROGRAM_IDS.SPL_TOKEN }, sig("w1"), slot + 100, T0 + 1000);
  push({ event_type: "Transfer", from_wallet: W2, to_wallet: W3, amount: "1000", mint: DEMO_MINT, pool: null, program_id: PROGRAM_IDS.SPL_TOKEN }, sig("w2"), slot + 104, T0 + 1060);
  push({ event_type: "Transfer", from_wallet: W3, to_wallet: W1, amount: "1000", mint: DEMO_MINT, pool: null, program_id: PROGRAM_IDS.SPL_TOKEN }, sig("w3"), slot + 108, T0 + 1120);

  for (let i = 0; i < 5; i++) {
    push({ event_type: "Transfer", from_wallet: B, to_wallet: A, amount: "1", mint: DEMO_MINT, pool: null, program_id: PROGRAM_IDS.SPL_TOKEN }, sig("bot" + i), slot + 200 + i, T0 + 2000 + i * 0.1, 300_000);
  }

  repo.addTransactions(transactions);
  repo.addEvents(events);

  const investigation = repo.createInvestigation(DEMO_MINT, "demo");
  const walletsMap = new Map(repo.listWallets().map((w) => [w.address, w]));
  const { findings, clusters } = runEngine(
    { token, events, transactions, wallets: walletsMap },
    investigation.id,
  );
  repo.addFindings(findings);
  repo.addClusters(clusters);
  for (const w of walletsMap.values()) repo.upsertWallet(w); // persist heuristic mutations (e.g. is_bot)
  for (const c of clusters) {
    for (const m of c.members) {
      const w = repo.getWallet(m);
      if (w) repo.upsertWallet({ ...w, cluster_id: c.cluster_id });
    }
  }
  const summary = summarizeToken({ token, events, transactions, wallets: walletsMap }, findings);
  repo.updateTokenSummary(DEMO_MINT, summary.risk_score, summary.phase);

  return {
    mint: DEMO_MINT,
    risk_score: summary.risk_score,
    phase: summary.phase,
    findings_count: findings.length,
    clusters_count: clusters.length,
    investigation_id: investigation.id,
    top_findings: summary.top_findings,
  };
}
