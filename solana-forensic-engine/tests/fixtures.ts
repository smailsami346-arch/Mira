import { b58encode, u64ToLE } from "../lib/base58";
import { PROGRAM_IDS } from "../lib/decoder/programs";

export const MINT = "Mint11111111111111111111111111111111111111";
export const SRC = "Src111111111111111111111111111111111111111";
export const DST = "Dst111111111111111111111111111111111111111";
export const OWNER = "Owner11111111111111111111111111111111111111";
export const AMM = "Amm111111111111111111111111111111111111111";
export const TRADER = "Trader11111111111111111111111111111111111111";
export const BC = "Bonding111111111111111111111111111111111111";
export const USER = "User111111111111111111111111111111111111111";
export const FUNDER = "Funder11111111111111111111111111111111111";

// Builds a minimal getTransaction(jsonParsed)-shaped object.
export function makeTx(opts: {
  sig: string;
  slot: number;
  blockTime: number;
  accountKeys: string[];
  instructions: Array<{ programIdIndex: number; accounts: number[]; data: Uint8Array }>;
  innerInstructions?: Array<{ index: number; instructions: Array<{ programIdIndex: number; accounts: number[]; data: Uint8Array }> }>;
  computeUnitsConsumed?: number;
  err?: unknown;
}) {
  return {
    slot: opts.slot,
    blockTime: opts.blockTime,
    transaction: {
      signatures: [opts.sig],
      message: {
        accountKeys: opts.accountKeys,
        instructions: opts.instructions.map((ix) => ({
          programIdIndex: ix.programIdIndex,
          accounts: ix.accounts,
          data: b58encode(ix.data),
        })),
      },
    },
    meta: {
      fee: 5000,
      err: opts.err ?? null,
      computeUnitsConsumed: opts.computeUnitsConsumed ?? 100_000,
      innerInstructions: (opts.innerInstructions ?? []).map((g) => ({
        index: g.index,
        instructions: g.instructions.map((ix) => ({
          programIdIndex: ix.programIdIndex,
          accounts: ix.accounts,
          data: b58encode(ix.data),
        })),
      })),
    },
  };
}

export function splTransferCheckedData(amount: bigint, decimals = 9): Uint8Array {
  return new Uint8Array([12, ...u64ToLE(amount), decimals]);
}

export function systemTransferData(lamports: bigint): Uint8Array {
  const b = new Uint8Array(12);
  new DataView(b.buffer).setUint32(0, 2, true);
  new DataView(b.buffer).setBigUint64(4, lamports, true);
  return b;
}

export function raydiumSwapBaseInData(amountIn: bigint, minOut: bigint): Uint8Array {
  return new Uint8Array([9, ...u64ToLE(amountIn), ...u64ToLE(minOut)]);
}

export const PUMP_BUY_SIGHASH = [0x66, 0x06, 0x3d, 0x12, 0x01, 0xda, 0xeb, 0xea];

export function pumpBuyData(amount: bigint, maxSol: bigint): Uint8Array {
  return new Uint8Array([...PUMP_BUY_SIGHASH, ...u64ToLE(amount), ...u64ToLE(maxSol)]);
}

export function makeSplTransferCheckedTx(sig: string, slot: number, blockTime: number, amount: bigint) {
  const keys = [SRC, MINT, DST, OWNER, PROGRAM_IDS.SPL_TOKEN];
  return makeTx({
    sig,
    slot,
    blockTime,
    accountKeys: keys,
    instructions: [{ programIdIndex: 4, accounts: [0, 1, 2, 3], data: splTransferCheckedData(amount) }],
  });
}

export function makeFundingTx(sig: string, from: string, to: string, slot: number, blockTime: number, lamports: bigint) {
  const keys = [from, to, PROGRAM_IDS.SYSTEM];
  return makeTx({
    sig,
    slot,
    blockTime,
    accountKeys: keys,
    instructions: [{ programIdIndex: 2, accounts: [0, 1], data: systemTransferData(lamports) }],
  });
}

export function makeRaydiumSwapTx(sig: string, slot: number, blockTime: number, amountIn: bigint, minOut: bigint) {
  const keys = [
    PROGRAM_IDS.SPL_TOKEN, AMM, "Auth1", "OpenOrders1", "Target1", "CoinVault1", "PcVault1",
    "SerumProg1", "Market1", "UserSrc1", "UserDst1", TRADER, PROGRAM_IDS.RAYDIUM_AMM_V4,
  ];
  return makeTx({
    sig,
    slot,
    blockTime,
    accountKeys: keys,
    instructions: [{ programIdIndex: 12, accounts: Array.from({ length: 12 }, (_, i) => i), data: raydiumSwapBaseInData(amountIn, minOut) }],
  });
}

export function makePumpBuyTx(sig: string, slot: number, blockTime: number, amount: bigint, maxSol: bigint) {
  const keys = ["Global1", "Fee1", MINT, BC, "AssocBC1", "AssocUser1", USER, PROGRAM_IDS.SYSTEM, "Ata1", PROGRAM_IDS.SPL_TOKEN, "EvAuth1", PROGRAM_IDS.PUMP_FUN];
  return makeTx({
    sig,
    slot,
    blockTime,
    accountKeys: keys,
    instructions: [{ programIdIndex: 11, accounts: Array.from({ length: 8 }, (_, i) => i), data: pumpBuyData(amount, maxSol) }],
    innerInstructions: [
      {
        index: 0,
        instructions: [{ programIdIndex: 9, accounts: [0, 1, 2, 3], data: splTransferCheckedData(amount) }],
      },
    ],
  });
}
