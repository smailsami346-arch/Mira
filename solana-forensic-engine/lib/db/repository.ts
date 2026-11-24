import type {
  ClusterRecord,
  Finding,
  InvestigationRecord,
  NormalizedEvent,
  TokenRecord,
  TransactionRecord,
  WalletRecord,
} from "../types";

export interface EventQuery {
  type?: string;
  limit?: number;
  offset?: number;
}

export interface Repository {
  reset(): void;
  upsertToken(t: TokenRecord): void;
  getToken(mint: string): TokenRecord | undefined;
  updateTokenSummary(mint: string, riskScore: number, phase: string): void;
  listTokens(): TokenRecord[];

  upsertWallet(w: WalletRecord): void;
  getWallet(address: string): WalletRecord | undefined;
  listWallets(): WalletRecord[];

  addTransaction(t: TransactionRecord): void;
  addTransactions(ts: TransactionRecord[]): void;
  getTransaction(sig: string): TransactionRecord | undefined;
  listTransactions(): TransactionRecord[];

  addEvents(e: NormalizedEvent[]): void;
  eventCount(): number;
  listEventsByMint(mint: string, q?: EventQuery): NormalizedEvent[];
  listEventsByWallet(address: string, limit?: number): NormalizedEvent[];

  addFindings(f: Finding[]): void;
  listFindings(investigationId: string): Finding[];

  createInvestigation(tokenMint: string, createdBy?: string): InvestigationRecord;
  getInvestigation(id: string): InvestigationRecord | undefined;
  listInvestigations(): InvestigationRecord[];

  addClusters(c: ClusterRecord[]): void;
  listClusters(tokenMint?: string): ClusterRecord[];
}

export class MemoryRepository implements Repository {
  private tokens = new Map<string, TokenRecord>();
  private wallets = new Map<string, WalletRecord>();
  private transactions = new Map<string, TransactionRecord>();
  private events: NormalizedEvent[] = [];
  private findings: Finding[] = [];
  private investigations = new Map<string, InvestigationRecord>();
  private clusters: ClusterRecord[] = [];

  reset(): void {
    this.tokens.clear();
    this.wallets.clear();
    this.transactions.clear();
    this.events = [];
    this.findings = [];
    this.investigations.clear();
    this.clusters = [];
  }

  upsertToken(t: TokenRecord): void {
    this.tokens.set(t.mint, { ...this.tokens.get(t.mint), ...t });
  }
  getToken(mint: string): TokenRecord | undefined {
    return this.tokens.get(mint);
  }
  updateTokenSummary(mint: string, riskScore: number, phase: string): void {
    const t = this.tokens.get(mint);
    if (t) this.tokens.set(mint, { ...t, risk_score: riskScore, phase: phase as TokenRecord["phase"] });
  }
  listTokens(): TokenRecord[] {
    return [...this.tokens.values()];
  }

  upsertWallet(w: WalletRecord): void {
    this.wallets.set(w.address, { ...this.wallets.get(w.address), ...w });
  }
  getWallet(address: string): WalletRecord | undefined {
    return this.wallets.get(address);
  }
  listWallets(): WalletRecord[] {
    return [...this.wallets.values()];
  }

  addTransaction(t: TransactionRecord): void {
    this.transactions.set(t.signature, t);
  }
  addTransactions(ts: TransactionRecord[]): void {
    for (const t of ts) this.addTransaction(t);
  }
  getTransaction(sig: string): TransactionRecord | undefined {
    return this.transactions.get(sig);
  }
  listTransactions(): TransactionRecord[] {
    return [...this.transactions.values()];
  }

  addEvents(e: NormalizedEvent[]): void {
    const seen = new Set(this.events.map((x) => `${x.tx_signature}:${x.event_type}:${x.slot}`));
    for (const ev of e) {
      const key = `${ev.tx_signature}:${ev.event_type}:${ev.slot}`;
      if (!seen.has(key)) {
        seen.add(key);
        this.events.push(ev);
      }
    }
  }
  eventCount(): number {
    return this.events.length;
  }
  listEventsByMint(mint: string, q: EventQuery = {}): NormalizedEvent[] {
    const pools = new Set(
      this.events.filter((e) => e.mint === mint && e.pool).map((e) => e.pool as string),
    );
    let out = this.events.filter((e) => e.mint === mint || (e.pool !== null && pools.has(e.pool)));
    if (q.type) out = out.filter((e) => e.event_type === q.type);
    out = [...out].sort((a, b) => a.block_time - b.block_time || a.slot - b.slot);
    const offset = q.offset ?? 0;
    const limit = q.limit ?? 100;
    return out.slice(offset, offset + limit);
  }
  listEventsByWallet(address: string, limit = 200): NormalizedEvent[] {
    return this.events
      .filter((e) => e.from_wallet === address || e.to_wallet === address)
      .sort((a, b) => b.block_time - a.block_time || b.slot - a.slot)
      .slice(0, limit);
  }

  addFindings(f: Finding[]): void {
    this.findings.push(...f);
  }
  listFindings(investigationId: string): Finding[] {
    return this.findings.filter((f) => f.investigation_id === investigationId);
  }

  createInvestigation(tokenMint: string, createdBy = "system"): InvestigationRecord {
    const inv: InvestigationRecord = {
      id: crypto.randomUUID(),
      token_mint: tokenMint,
      created_by: createdBy,
      status: "open",
      created_at: new Date().toISOString(),
    };
    this.investigations.set(inv.id, inv);
    return inv;
  }
  getInvestigation(id: string): InvestigationRecord | undefined {
    return this.investigations.get(id);
  }
  listInvestigations(): InvestigationRecord[] {
    return [...this.investigations.values()];
  }

  addClusters(c: ClusterRecord[]): void {
    this.clusters.push(...c);
  }
  listClusters(tokenMint?: string): ClusterRecord[] {
    return tokenMint ? this.clusters.filter((c) => c.token_mint === tokenMint) : this.clusters;
  }
}
