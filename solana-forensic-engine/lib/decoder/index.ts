import { b58decode } from "../base58";
import { PROGRAM_IDS } from "./programs";
import { decodeSplToken } from "./spl";
import { decodeSystem } from "./system";
import { decodeRaydium } from "./raydium";
import { decodePump } from "./pump";
import type { DecodedBase, DecodedInstruction } from "./types";

function dispatch(programId: string, data: Uint8Array, accounts: string[], source: "outer" | "inner"): DecodedBase | null {
  switch (programId) {
    case PROGRAM_IDS.SPL_TOKEN:
    case PROGRAM_IDS.TOKEN_2022:
      return decodeSplToken(data, accounts, source);
    case PROGRAM_IDS.SYSTEM:
      return decodeSystem(data, accounts, source);
    case PROGRAM_IDS.RAYDIUM_AMM_V4:
      return decodeRaydium(data, accounts, source);
    case PROGRAM_IDS.PUMP_FUN:
      return decodePump(data, accounts, source);
    case PROGRAM_IDS.JUPITER_V6:
      // Router instruction; token flows come from inner SPL transfers.
      return { kind: "JupiterRoute", source, accounts };
    default:
      return { kind: "UnknownProgram", source, accounts };
  }
}

function accountKeysOf(message: any): string[] {
  return (message?.accountKeys ?? []).map((k: any) => (typeof k === "string" ? k : k.pubkey));
}

// Decodes outer instructions and all inner (CPI) instructions of a
// getTransaction(encoding=jsonParsed) result.
export function decodeTransaction(tx: any): DecodedInstruction[] {
  const message = tx?.transaction?.message;
  if (!message) return [];
  const keys = accountKeysOf(message);
  const out: DecodedInstruction[] = [];

  const decodeOne = (ix: any, source: "outer" | "inner", parent?: { program_id: string; kind: string }) => {
    // "json" encoding uses programIdIndex; "jsonParsed" provides programId directly.
    const programId = typeof ix.programId === "string" ? ix.programId : keys[ix.programIdIndex];
    if (!programId || typeof ix.data !== "string") return;
    let data: Uint8Array;
    try {
      data = b58decode(ix.data);
    } catch {
      return;
    }
    const accounts = (ix.accounts ?? [])
      .map((i: number) => keys[i])
      .filter((a: string | undefined) => Boolean(a));
    const d = dispatch(programId, data, accounts, source);
    if (d) out.push({ program_id: programId, parent_program_id: parent?.program_id, parent_kind: parent?.kind, ...d });
  };

  const outerDecoded: { program_id: string; kind: string }[] = [];
  for (const ix of message.instructions ?? []) {
    const programId = typeof ix.programId === "string" ? ix.programId : keys[ix.programIdIndex];
    const before = out.length;
    decodeOne(ix, "outer");
    if (out.length > before && programId) outerDecoded.push({ program_id: programId, kind: out[out.length - 1].kind });
    else if (programId) outerDecoded.push({ program_id: programId, kind: "UnknownProgram" });
  }
  for (const group of tx?.meta?.innerInstructions ?? []) {
    const parent = outerDecoded[group.index];
    for (const ix of group.instructions ?? []) decodeOne(ix, "inner", parent);
  }
  return out;
}

export function firstSigner(tx: any): string | null {
  const keys = accountKeysOf(tx?.transaction?.message);
  return keys[0] ?? tx?.transaction?.signatures?.[0] ?? null;
}
