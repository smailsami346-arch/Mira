import { readU64LE } from "../base58";
import type { DecodedBase } from "./types";

// SPL Token / Token-2022 core instructions share the same u8 discriminator layout.
// Token-2022 extensions use additional instruction types; they are surfaced as
// SplUnknown_<tag> here and decoded properly in the Advanced phase.
export function decodeSplToken(data: Uint8Array, accounts: string[], source: "outer" | "inner"): DecodedBase | null {
  if (data.length === 0) return null;
  const tag = data[0];
  const acc = (i: number): string | null => accounts[i] ?? null;
  const amt = (o: number): string | undefined =>
    data.length >= o + 8 ? readU64LE(data, o).toString() : undefined;

  switch (tag) {
    case 0: // InitializeMint
    case 20: // InitializeMint2
      return { kind: "InitializeMint", source, accounts, mint: acc(0), decimals: data[1] };
    case 3: // Transfer
      return { kind: "Transfer", source, accounts, from: acc(0), to: acc(1), amount: amt(1) };
    case 7: // MintTo
      return { kind: "MintTo", source, accounts, mint: acc(0), to: acc(1), amount: amt(1) };
    case 8: // Burn
      return { kind: "Burn", source, accounts, from: acc(0), mint: acc(1), amount: amt(1) };
    case 12: // TransferChecked
      return { kind: "TransferChecked", source, accounts, from: acc(0), mint: acc(1), to: acc(2), amount: amt(1) };
    case 14: // MintToChecked
      return { kind: "MintToChecked", source, accounts, mint: acc(0), to: acc(1), amount: amt(1) };
    case 15: // BurnChecked
      return { kind: "BurnChecked", source, accounts, from: acc(0), mint: acc(1), amount: amt(1) };
    case 6: // SetAuthority (authority_type: 0 MintTokens, 1 FreezeAccount, 2 AccountOwner, 3 CloseAccount)
      return { kind: "SetAuthority", source, accounts, mint: acc(0), authority_type: data[1], new_authority: acc(2) };
    default:
      return { kind: `SplUnknown_${tag}`, source, accounts };
  }
}
