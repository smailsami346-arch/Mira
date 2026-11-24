import { describe, expect, it } from "vitest";
import { b58decode, b58encode, u64ToLE, readU64LE } from "../lib/base58";

describe("base58", () => {
  it("roundtrips arbitrary bytes", () => {
    const data = new Uint8Array([0, 0, 1, 255, 128, 3, 66]);
    expect(b58decode(b58encode(data))).toEqual(data);
  });

  it("matches known vector", () => {
    // "Hello World!" in base58 is a well-known test vector
    expect(b58encode(new TextEncoder().encode("Hello World!"))).toBe("2NEpo7TZRRrLZSi2U");
  });

  it("handles leading zero bytes", () => {
    expect(b58encode(new Uint8Array([0, 0, 1]))).toBe("112");
  });

  it("rejects invalid characters", () => {
    expect(() => b58decode("0OIl")).toThrow();
  });
});

describe("u64 LE helpers", () => {
  it("roundtrips u64", () => {
    const n = 123456789012345n;
    expect(readU64LE(u64ToLE(n), 0)).toBe(n);
  });
});
