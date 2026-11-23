import { readU64LE } from "../base58";
import type { DecodedBase } from "./types";

// Raydium AMM v4 instruction tags (community parser mapping).
// TODO(Beta): verify against the on-chain IDL before production use.
const TAG = {
  INITIALIZE2: 1,
  DEPOSIT: 3,
  WITHDRAW: 4,
  SWAP_BASE_IN: 9,
  SWAP_BASE_OUT: 10,
} as const;

export function decodeRaydium(data: Uint8Array, accounts: string[], source: "outer" | "inner"): DecodedBase | null {
  if (data.length === 0) return null;
  const tag = data[0];
  const acc = (i: number): string | null => accounts[i] ?? null;
  const u64 = (o: number): string | undefined =>
    data.length >= o + 8 ? readU64LE(data, o).toString() : undefined;

  if (tag === TAG.SWAP_BASE_IN || tag === TAG.SWAP_BASE_OUT) {
    // accounts: 0 tokenProgram, 1 amm, 2 ammAuthority, 3 openOrders, 4 targetOrders,
    // 5 coinVault, 6 pcVault, 7 serumProgram, 8 serumMarket, 9 userSource, 10 userDest, 11 userOwner
    return {
      kind: tag === TAG.SWAP_BASE_IN ? "SwapBaseIn" : "SwapBaseOut",
      source,
      accounts,
      pool: acc(1),
      trader: acc(11),
      amount: u64(1),
      amount2: u64(9),
      side: tag === TAG.SWAP_BASE_IN ? "in" : "out",
    };
  }
  if (tag === TAG.DEPOSIT) {
    // accounts: 0 tokenProgram, 1 amm, ..., 9 userOwner
    return { kind: "Deposit", source, accounts, pool: acc(1), trader: acc(9), amount: u64(1), amount2: u64(9) };
  }
  if (tag === TAG.WITHDRAW) {
    return { kind: "Withdraw", source, accounts, pool: acc(1), trader: acc(9), amount: u64(1), amount2: u64(9) };
  }
  if (tag === TAG.INITIALIZE2) {
    // accounts: 0 tokenProgram, 1 amm, 2 ammAuthority, 3 openOrders, 4 targetOrders,
    // 5 lpMint, 6 coinMint, 7 pcMint, ..., 12 userWallet (creator)
    return { kind: "CreatePool", source, accounts, pool: acc(1), mint: acc(6), trader: acc(12) };
  }
  return { kind: `RaydiumUnknown_${tag}`, source, accounts };
}
