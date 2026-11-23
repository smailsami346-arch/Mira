import { readU32LE, readU64LE } from "../base58";
import type { DecodedBase } from "./types";

export function decodeSystem(data: Uint8Array, accounts: string[], source: "outer" | "inner"): DecodedBase | null {
  if (data.length < 4) return null;
  const tag = readU32LE(data, 0);
  if (tag === 2 && data.length >= 12) {
    // SystemProgram::Transfer { lamports: u64 }
    return {
      kind: "SystemTransfer",
      source,
      accounts,
      from: accounts[0] ?? null,
      to: accounts[1] ?? null,
      amount: readU64LE(data, 4).toString(),
    };
  }
  return { kind: `SystemUnknown_${tag}`, source, accounts };
}
