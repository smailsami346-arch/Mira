import { describe, expect, it } from "vitest";
import { runEngine, summarizeToken } from "../lib/heuristics/engine";
import { netFlow, classifyPhase } from "../lib/heuristics/netFlow";
import type { AnalysisContext } from "../lib/heuristics/types";
import type { NormalizedEvent, TokenRecord, TransactionRecord, WalletRecord } from "../lib/types";
import { PROGRAM_IDS } from "../lib/decoder/programs";

const MINT = "TestMint1111111111111111111111111111111111";
const DEV = "Dev11111111111111111111111111111111111111";
const FUNDER = "Fund111111111111111111111111111111111111";
const A = "WalletA11111111111111111111111111111111111";
const B = "WalletB11111111111111111111111111111111111";
const C = "WalletC11111111111111111111111111111111111";
const W1 = "WashA1111111111111111111111111111111111111";
const W2 = "WashB1111111111111111111111111111111111111";
const W3 = "WashC1111111111111111111111111111111111111";
const POOL = "Pool11111111111111111111111111111111111111";
const T0 = 1_730_000_000;

function ev(e: Omit<NormalizedEvent, "tx_signature" | "slot" | "block_time">, sig: string, slot: number, t: number): NormalizedEvent {
  return { ...e, tx_signature: sig.padEnd(64, "x"), slot, block_time: t };
}

function makeCtx(): AnalysisContext {
  const token: TokenRecord = {
    mint: MINT, symbol: "TST", name: "Test", decimals: 9, supply: "1000000000000",
    created_at: new Date(T0 * 1000).toISOString(), slot: 1000, deployer: DEV,
    launchpad: "pump.fun", metadata_uri: null,
  };
  const events: NormalizedEvent[] = [
    ev({ event_type: "Funding", from_wallet: FUNDER, to_wallet: A, amount: "2000000000", mint: null, pool: null, program_id: PROGRAM_IDS.SYSTEM }, "f1", 1001, T0 - 100),
    ev({ event_type: "Funding", from_wallet: FUNDER, to_wallet: B, amount: "2000000000", mint: null, pool: null, program_id: PROGRAM_IDS.SYSTEM }, "f2", 1002, T0 - 80),
    ev({ event_type: "Funding", from_wallet: FUNDER, to_wallet: C, amount: "2000000000", mint: null, pool: null, program_id: PROGRAM_IDS.SYSTEM }, "f3", 1003, T0 - 60),
    ev({ event_type: "CreatePool", from_wallet: DEV, to_wallet: POOL, amount: "0", mint: MINT, pool: POOL, program_id: PROGRAM_IDS.RAYDIUM_AMM_V4 }, "cp", 1010, T0),
    ev({ event_type: "Swap", from_wallet: A, to_wallet: POOL, amount: "50000000000", mint: MINT, pool: POOL, program_id: PROGRAM_IDS.PUMP_FUN, meta: { side: "buy" } }, "s1", 1011, T0 + 10),
    ev({ event_type: "Swap", from_wallet: B, to_wallet: POOL, amount: "80000000000", mint: MINT, pool: POOL, program_id: PROGRAM_IDS.PUMP_FUN, meta: { side: "buy" } }, "s2", 1012, T0 + 20),
    ev({ event_type: "Swap", from_wallet: C, to_wallet: POOL, amount: "30000000000", mint: MINT, pool: POOL, program_id: PROGRAM_IDS.PUMP_FUN, meta: { side: "buy" } }, "s3", 1012, T0 + 21),
    ev({ event_type: "Swap", from_wallet: DEV, to_wallet: POOL, amount: "200000000000", mint: MINT, pool: POOL, program_id: PROGRAM_IDS.PUMP_FUN, meta: { side: "sell" } }, "s4", 1050, T0 + 600),
    ev({ event_type: "Transfer", from_wallet: W1, to_wallet: W2, amount: "1000", mint: MINT, pool: null, program_id: PROGRAM_IDS.SPL_TOKEN }, "w1", 1100, T0 + 1000),
    ev({ event_type: "Transfer", from_wallet: W2, to_wallet: W3, amount: "1000", mint: MINT, pool: null, program_id: PROGRAM_IDS.SPL_TOKEN }, "w2", 1104, T0 + 1060),
    ev({ event_type: "Transfer", from_wallet: W3, to_wallet: W1, amount: "1000", mint: MINT, pool: null, program_id: PROGRAM_IDS.SPL_TOKEN }, "w3", 1108, T0 + 1120),
  ];
  const transactions: TransactionRecord[] = events.map((e) => ({
    signature: e.tx_signature, slot: e.slot, block_time: e.block_time, fee: 5000, status: "success", instructions_count: 2, compute_units: 100000,
  }));
  const wallets = new Map<string, WalletRecord>(
    [DEV, FUNDER, A, B, C, W1, W2, W3].map((address) => [
      address,
      { address, first_seen: new Date(T0 * 1000).toISOString(), labels: [], risk_score: 0, cluster_id: null, is_bot: false, is_cex: false, is_bridge: false },
    ]),
  );
  return { token, events, transactions, wallets };
}

describe("heuristics engine", () => {
  it("detects common funder among A,B,C", () => {
    const ctx = makeCtx();
    const { findings } = runEngine(ctx, "inv1");
    const cf = findings.find((f) => f.title.includes("Common funder"));
    expect(cf).toBeDefined();
    expect(cf?.level).toBe("INFERENCE");
    expect(cf?.confidence_score).toBeGreaterThanOrEqual(60);
    expect(cf?.evidence.length).toBe(3);
    expect(cf?.evidence[0].explorer_url).toContain("solscan.io/tx/");
  });

  it("detects sniper bundle on the pool", () => {
    const ctx = makeCtx();
    const { findings } = runEngine(ctx, "inv1");
    const sn = findings.find((f) => f.title.includes("Sniper pattern"));
    expect(sn).toBeDefined();
    expect(sn?.level).toBe("INFERENCE");
  });

  it("flags wash trading cycle as HYPOTHESIS", () => {
    const ctx = makeCtx();
    const { findings } = runEngine(ctx, "inv1");
    const wash = findings.find((f) => f.title.includes("wash trading"));
    expect(wash).toBeDefined();
    expect(wash?.level).toBe("HYPOTHESIS");
  });

  it("creates a sybil cluster for the funded wallets", () => {
    const ctx = makeCtx();
    const { clusters } = runEngine(ctx, "inv1");
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    expect(clusters[0].members).toEqual(expect.arrayContaining([A, B, C]));
  });

  it("flags early insider distribution by deployer", () => {
    const ctx = makeCtx();
    const { findings } = runEngine(ctx, "inv1");
    const dump = findings.find((f) => f.title.includes("Early insider distribution"));
    expect(dump).toBeDefined();
    expect(dump?.level).toBe("INFERENCE");
    expect(dump?.description).toContain("20.0%");
  });

  it("computes risk score and phase", () => {
    const ctx = makeCtx();
    const { findings } = runEngine(ctx, "inv1");
    const summary = summarizeToken(ctx, findings);
    expect(summary.risk_score).toBeGreaterThan(30);
    expect(["accumulation", "distribution", "neutral"]).toContain(summary.phase);
    expect(summary.top_findings.length).toBeLessThanOrEqual(5);
  });
});

describe("netFlow / classifyPhase", () => {
  it("classifies accumulation on net inflow", () => {
    const events: NormalizedEvent[] = [
      ev({ event_type: "Transfer", from_wallet: "X", to_wallet: A, amount: "200", mint: MINT, pool: null, program_id: PROGRAM_IDS.SPL_TOKEN }, "t1", 1, T0),
    ];
    const net = netFlow(events, MINT, [A], 3600, 1, T0 + 3600);
    expect(net[0].net).toBe("200");
    expect(classifyPhase(net, 1000n)).toBe("accumulation");
  });

  it("classifies distribution on net outflow", () => {
    const events: NormalizedEvent[] = [
      ev({ event_type: "Transfer", from_wallet: A, to_wallet: "X", amount: "200", mint: MINT, pool: null, program_id: PROGRAM_IDS.SPL_TOKEN }, "t2", 1, T0),
    ];
    const net = netFlow(events, MINT, [A], 3600, 1, T0 + 3600);
    expect(classifyPhase(net, 1000n)).toBe("distribution");
  });
});
