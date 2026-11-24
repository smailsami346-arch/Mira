export interface DecodedInstruction {
  program_id: string;
  parent_program_id?: string;
  parent_kind?: string;
  kind: string;
  source: "outer" | "inner";
  accounts: string[];
  amount?: string;
  amount2?: string;
  mint?: string | null;
  from?: string | null;
  to?: string | null;
  trader?: string | null;
  pool?: string | null;
  authority_type?: number;
  new_authority?: string | null;
  decimals?: number;
  side?: "buy" | "sell" | "in" | "out";
}

export type DecodedBase = Omit<DecodedInstruction, "program_id">;
