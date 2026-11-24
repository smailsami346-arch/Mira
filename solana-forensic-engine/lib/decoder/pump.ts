import { readU64LE } from "../base58";
import type { DecodedBase } from "./types";

// Anchor 8-byte sighash: first 8 bytes of sha256("global:buy" / "global:sell").
const BUY_SIGHASH = [0x66, 0x06, 0x3d, 0x12, 0x01, 0xda, 0xeb, 0xea];
const SELL_SIGHASH = [0x33, 0xe6, 0x85, 0xa4, 0x01, 0x7f, 0x83, 0xad];

function matches(data: Uint8Array, sighash: number[]): boolean {
  if (data.length < 8) return false;
  return sighash.every((b, i) => data[i] === b);
}

export function decodePump(data: Uint8Array, accounts: string[], source: "outer" | "inner"): DecodedBase | null {
  if (data.length < 8) return { kind: "PumpUnknown", source, accounts };
  const isBuy = matches(data, BUY_SIGHASH);
  const isSell = matches(data, SELL_SIGHASH);
  if (!isBuy && !isSell) return { kind: "PumpUnknown", source, accounts };
  const acc = (i: number): string | null => accounts[i] ?? null;
  const u64 = (o: number): string | undefined =>
    data.length >= o + 8 ? readU64LE(data, o).toString() : undefined;
  // buy/sell accounts: 0 global, 1 feeRecipient, 2 mint, 3 bondingCurve,
  // 4 associatedBondingCurve, 5 associatedUser, 6 user, 7 systemProgram, ...
  // data: 8-byte sighash + amount u64 + maxSolCost/minSolOutput u64
  return {
    kind: isBuy ? "PumpBuy" : "PumpSell",
    source,
    accounts,
    side: isBuy ? "buy" : "sell",
    mint: acc(2),
    pool: acc(3),
    trader: acc(6),
    amount: u64(8),
    amount2: u64(16),
  };
}
