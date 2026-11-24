export type EventType =
  | "Transfer"
  | "Swap"
  | "Mint"
  | "Burn"
  | "AddLiquidity"
  | "RemoveLiquidity"
  | "CreatePool"
  | "BundleSnipe"
  | "Funding"
  | "SetAuthority";

export interface NormalizedEvent {
  tx_signature: string;
  event_type: EventType;
  from_wallet: string | null;
  to_wallet: string | null;
  amount: string;
  mint: string | null;
  pool: string | null;
  program_id: string;
  slot: number;
  block_time: number;
  meta?: Record<string, unknown>;
}

export interface TransactionRecord {
  signature: string;
  slot: number;
  block_time: number;
  fee: number;
  status: string;
  instructions_count: number;
  compute_units: number | null;
}

export interface WalletRecord {
  address: string;
  first_seen: string;
  labels: string[];
  risk_score: number;
  cluster_id: string | null;
  is_bot: boolean;
  is_cex: boolean;
  is_bridge: boolean;
}

export interface TokenRecord {
  mint: string;
  symbol: string | null;
  name: string | null;
  decimals: number;
  supply: string;
  created_at: string;
  slot: number;
  deployer: string | null;
  launchpad: string | null;
  metadata_uri: string | null;
  risk_score?: number;
  phase?: Phase;
}

export type Phase = "accumulation" | "distribution" | "neutral" | "unknown";

export interface ClusterRecord {
  cluster_id: string;
  heuristic: string;
  confidence: number;
  members: string[];
  token_mint: string;
  evidence: Evidence[];
}

export interface InvestigationRecord {
  id: string;
  token_mint: string;
  created_by: string;
  status: string;
  created_at: string;
}

export type FindingLevel = "FACT" | "INFERENCE" | "HYPOTHESIS";

export interface Evidence {
  type: "signature" | "slot" | "account";
  value: string;
  explorer_url?: string;
}

export interface Finding {
  id: string;
  investigation_id: string;
  level: FindingLevel;
  title: string;
  description: string;
  evidence: Evidence[];
  confidence_score: number;
  reasoning_summary: string;
  data_sources: string[];
  created_at: string;
}
