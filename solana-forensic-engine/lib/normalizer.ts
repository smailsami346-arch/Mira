import { decodeTransaction } from "./decoder";
import { PROGRAM_IDS } from "./decoder/programs";
import type { NormalizedEvent, TransactionRecord } from "./types";

// Inner SPL transfers are skipped only when the parent instruction decoded as a
// swap at the outer level (otherwise we'd double count). For undecoded parents
// (Jupiter, unknown routers, launchpad create) we keep the inner Transfer events.
const SKIP_INNER_PARENT_KINDS = new Set<string>(["PumpBuy", "PumpSell", "SwapBaseIn", "SwapBaseOut"]);

// Converts a raw getTransaction(jsonParsed) result into normalized events.
// SPL transfers that occur as inner instructions of a DEX/launchpad program
// are skipped to avoid double counting (the Swap event already represents them).
export function normalizeTransaction(tx: any): { events: NormalizedEvent[]; txRecord: TransactionRecord } {
  const sig: string = tx.transaction.signatures[0];
  const slot: number = tx.slot;
  const blockTime: number = tx.blockTime ?? 0;
  const meta = tx.meta ?? {};
  const decoded = decodeTransaction(tx);
  const events: NormalizedEvent[] = [];
  const base = { tx_signature: sig, slot, block_time: blockTime };

  for (const d of decoded) {
    const ev = (event_type: NormalizedEvent["event_type"], extra: Partial<NormalizedEvent> = {}): NormalizedEvent => ({
      ...base,
      event_type,
      from_wallet: null,
      to_wallet: null,
      amount: "0",
      mint: null,
      pool: null,
      program_id: d.program_id,
      meta: { source: d.source },
      ...extra,
    });

    switch (d.kind) {
      case "Transfer":
      case "TransferChecked":
        // skip SPL transfers executed as CPI inside a decoded swap instruction
        if (d.source === "inner" && d.parent_kind && SKIP_INNER_PARENT_KINDS.has(d.parent_kind)) break;
        events.push(ev("Transfer", { from_wallet: d.from ?? null, to_wallet: d.to ?? null, amount: d.amount ?? "0", mint: d.mint ?? null }));
        break;
      case "MintTo":
      case "MintToChecked":
        events.push(ev("Mint", { to_wallet: d.to ?? null, amount: d.amount ?? "0", mint: d.mint ?? null }));
        break;
      case "Burn":
      case "BurnChecked":
        events.push(ev("Burn", { from_wallet: d.from ?? null, amount: d.amount ?? "0", mint: d.mint ?? null }));
        break;
      case "SystemTransfer":
        events.push(ev("Funding", { from_wallet: d.from ?? null, to_wallet: d.to ?? null, amount: d.amount ?? "0" }));
        break;
      case "SwapBaseIn":
      case "SwapBaseOut":
        events.push(ev("Swap", {
          from_wallet: d.trader ?? null,
          to_wallet: d.pool ?? null,
          amount: d.amount ?? "0",
          pool: d.pool ?? null,
          meta: { source: d.source, side: d.side, amount2: d.amount2 },
        }));
        break;
      case "PumpBuy":
      case "PumpSell":
        events.push(ev("Swap", {
          from_wallet: d.trader ?? null,
          to_wallet: d.pool ?? null,
          amount: d.amount ?? "0",
          mint: d.mint ?? null,
          pool: d.pool ?? null,
          meta: { source: d.source, side: d.side, sol_amount: d.amount2 },
        }));
        break;
      case "Deposit":
        events.push(ev("AddLiquidity", { from_wallet: d.trader ?? null, to_wallet: d.pool ?? null, amount: d.amount ?? "0", pool: d.pool ?? null, meta: { source: d.source, amount2: d.amount2 } }));
        break;
      case "Withdraw":
        events.push(ev("RemoveLiquidity", { from_wallet: d.pool ?? null, to_wallet: d.trader ?? null, amount: d.amount ?? "0", pool: d.pool ?? null, meta: { source: d.source, amount2: d.amount2 } }));
        break;
      case "CreatePool":
        events.push(ev("CreatePool", { from_wallet: d.trader ?? null, to_wallet: d.pool ?? null, mint: d.mint ?? null, pool: d.pool ?? null }));
        break;
      case "JupiterRoute": {
        // Router-level swap: the actual token flows appear as inner SPL transfers
        // (kept as Transfer events). Emit a Swap marker with the tx signer as trader.
        const signer = firstSignerOf(tx);
        events.push(ev("Swap", {
          from_wallet: signer,
          to_wallet: null,
          amount: "0",
          pool: null,
          meta: { source: d.source, router: "jupiter_v6" },
        }));
        break;
      }
      case "SetAuthority":
        events.push(ev("SetAuthority", { to_wallet: d.new_authority ?? null, mint: d.mint ?? null, meta: { authority_type: d.authority_type } }));
        break;
      default:
        break;
    }
  }

  const txRecord: TransactionRecord = {
    signature: sig,
    slot,
    block_time: blockTime,
    fee: meta.fee ?? 0,
    status: meta.err ? "failed" : "success",
    instructions_count:
      (message_instructions(tx) ?? 0) +
      (meta.innerInstructions ?? []).reduce((a: number, g: any) => a + (g.instructions?.length ?? 0), 0),
    compute_units: meta.computeUnitsConsumed ?? null,
  };
  return { events, txRecord };
}

function message_instructions(tx: any): number {
  return tx?.transaction?.message?.instructions?.length ?? 0;
}

function firstSignerOf(tx: any): string | null {
  const keys = tx?.transaction?.message?.accountKeys ?? [];
  const k0 = keys[0];
  return (typeof k0 === "string" ? k0 : k0?.pubkey) ?? tx?.transaction?.signatures?.[0] ?? null;
}
