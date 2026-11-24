import { describe, expect, it } from "vitest";
import { decodeTransaction } from "../lib/decoder";
import { PROGRAM_IDS } from "../lib/decoder/programs";
import {
  makeFundingTx,
  makePumpBuyTx,
  makeRaydiumSwapTx,
  makeSplTransferCheckedTx,
  MINT,
  TRADER,
  AMM,
  BC,
  USER,
  SRC,
  DST,
} from "./fixtures";

describe("decoder", () => {
  it("decodes SPL TransferChecked with mint and amount", () => {
    const tx = makeSplTransferCheckedTx("sig1", 100, 1700000000, 5000n);
    const decoded = decodeTransaction(tx);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].program_id).toBe(PROGRAM_IDS.SPL_TOKEN);
    expect(decoded[0].kind).toBe("TransferChecked");
    expect(decoded[0].from).toBe(SRC);
    expect(decoded[0].to).toBe(DST);
    expect(decoded[0].mint).toBe(MINT);
    expect(decoded[0].amount).toBe("5000");
  });

  it("decodes SystemProgram transfer as funding", () => {
    const tx = makeFundingTx("sig2", "Funder111111111111111111111111111111111111", "Recipient1111111111111111111111111111111", 101, 1700000001, 2_000_000_000n);
    const decoded = decodeTransaction(tx);
    expect(decoded[0].kind).toBe("SystemTransfer");
    expect(decoded[0].amount).toBe("2000000000");
  });

  it("decodes Raydium SwapBaseIn with pool and trader", () => {
    const tx = makeRaydiumSwapTx("sig3", 102, 1700000002, 1000n, 900n);
    const decoded = decodeTransaction(tx);
    const swap = decoded.find((d) => d.kind === "SwapBaseIn");
    expect(swap).toBeDefined();
    expect(swap?.pool).toBe(AMM);
    expect(swap?.trader).toBe(TRADER);
    expect(swap?.amount).toBe("1000");
    expect(swap?.amount2).toBe("900");
  });

  it("decodes Pump.fun buy (outer + inner CPI)", () => {
    const tx = makePumpBuyTx("sig4", 103, 1700000003, 1_000_000n, 500_000_000n);
    const decoded = decodeTransaction(tx);
    const buy = decoded.find((d) => d.kind === "PumpBuy");
    expect(buy).toBeDefined();
    expect(buy?.side).toBe("buy");
    expect(buy?.mint).toBe(MINT);
    expect(buy?.pool).toBe(BC);
    expect(buy?.trader).toBe(USER);
    expect(buy?.amount).toBe("1000000");
    expect(buy?.amount2).toBe("500000000");
    // inner SPL transfer is decoded too (marked source=inner)
    const inner = decoded.find((d) => d.kind === "TransferChecked" && d.source === "inner");
    expect(inner).toBeDefined();
  });
});
