-- Solana Forensic Engine — PostgreSQL DDL (TimescaleDB-ready)
-- Mirrors prisma/schema.prisma. token_events should be a Timescale hypertable
-- partitioned by block_time in production.

CREATE TABLE IF NOT EXISTS tokens (
  mint TEXT PRIMARY KEY,
  symbol TEXT,
  name TEXT,
  decimals INT DEFAULT 9,
  supply NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ,
  slot BIGINT,
  deployer TEXT,
  launchpad TEXT,
  metadata_uri TEXT,
  risk_score INT DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  phase TEXT DEFAULT 'unknown'
);

CREATE TABLE IF NOT EXISTS wallets (
  address TEXT PRIMARY KEY,
  first_seen TIMESTAMPTZ,
  labels TEXT[] DEFAULT '{}',
  risk_score INT DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  cluster_id UUID,
  is_bot BOOLEAN DEFAULT FALSE,
  is_cex BOOLEAN DEFAULT FALSE,
  is_bridge BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS wallet_clusters (
  cluster_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  heuristic TEXT NOT NULL,
  confidence INT CHECK (confidence BETWEEN 0 AND 100),
  members TEXT[] NOT NULL,
  token_mint TEXT,
  evidence JSONB DEFAULT '[]'
);

ALTER TABLE wallets
  ADD CONSTRAINT fk_wallet_cluster FOREIGN KEY (cluster_id)
  REFERENCES wallet_clusters(cluster_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS transactions (
  signature TEXT PRIMARY KEY,
  slot BIGINT,
  block_time TIMESTAMPTZ,
  fee BIGINT,
  status TEXT,
  instructions_count INT,
  compute_units BIGINT
);

CREATE TABLE IF NOT EXISTS token_events (
  tx_signature TEXT REFERENCES transactions(signature),
  event_type TEXT NOT NULL,
  from_wallet TEXT,
  to_wallet TEXT,
  amount NUMERIC,
  mint TEXT,
  pool TEXT,
  program_id TEXT,
  slot BIGINT,
  block_time TIMESTAMPTZ NOT NULL,
  meta JSONB DEFAULT '{}',
  PRIMARY KEY (tx_signature, event_type, slot)
);
-- SELECT create_hypertable('token_events', 'block_time');

CREATE TABLE IF NOT EXISTS liquidity_events (
  id BIGSERIAL PRIMARY KEY,
  pool TEXT NOT NULL,
  event_type TEXT NOT NULL,
  amount_token NUMERIC,
  amount_sol NUMERIC,
  provider TEXT,
  block_time TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT REFERENCES tokens(mint),
  created_by TEXT,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id UUID REFERENCES investigations(id),
  level TEXT CHECK (level IN ('FACT','INFERENCE','HYPOTHESIS')),
  title TEXT NOT NULL,
  description TEXT,
  evidence JSONB NOT NULL DEFAULT '[]',
  confidence_score INT CHECK (confidence_score BETWEEN 0 AND 100),
  reasoning_summary TEXT,
  data_sources TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labels (
  address TEXT,
  label_type TEXT NOT NULL,
  source TEXT,
  verified BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (address, label_type)
);

CREATE INDEX IF NOT EXISTS idx_events_mint_time ON token_events(mint, block_time);
CREATE INDEX IF NOT EXISTS idx_events_from ON token_events(from_wallet, block_time);
CREATE INDEX IF NOT EXISTS idx_events_to ON token_events(to_wallet, block_time);
CREATE INDEX IF NOT EXISTS idx_events_pool ON token_events(pool, block_time);
CREATE INDEX IF NOT EXISTS idx_tx_slot ON transactions(slot);
CREATE INDEX IF NOT EXISTS idx_findings_inv ON findings(investigation_id, created_at);
