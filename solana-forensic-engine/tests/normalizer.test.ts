import { describe, expect, it } from "vitest";
import { normalizeTransaction } from "../lib/normalizer";
import { makePumpBuyTx, makeSplTransferCheckedTx } from "./fixtures";

describe("normalizer", () => {
  it("maps PumpBuy to a Swap event and skips the inner SPL transfer (no double count)", () => {
    const tx = makePumpBuyTx("sigA", 200, 1700000100, 1000n, 500n);
    const { events, txRecord } = normalizeTransaction(tx);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe("Swap");
    expect(events[0].meta?.side).toBe("buy");
    expect(events[0].mint).toBeTruthy();
    expect(txRecord.signature).toBe("sigA");
    expect(txRecord.status).toBe("success");
  });

  it("maps SPL TransferChecked to a Transfer event", () => {
    const tx = makeSplTransferCheckedTx("sigB", 201, 1700000101, 777n);
    const { events } = normalizeTransaction(tx);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe("Transfer");
    expect(events[0].amount).toBe("777");
  });

  it("marks failed transactions", () => {
    const tx = makeSplTransferCheckedTx("sigC", 202, 1700000102, 1n);
    (tx.meta as any).err = { InstructionError: [0, "Custom"] };
    const { txRecord } = normalizeTransaction(tx);
    expect(txRecord.status).toBe("failed");
  });
});
