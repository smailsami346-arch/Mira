// Server-side only. RPC URLs come from env and are never sent to the client.
export interface RpcClient {
  getSignaturesForAddress(
    address: string,
    limit: number,
  ): Promise<Array<{ signature: string; slot: number; blockTime: number | null; err: unknown }>>;
  getTransactions(signatures: string[]): Promise<any[]>;
}

interface Provider {
  url: string;
  failures: number;
  openedUntil: number;
}

const CIRCUIT_AFTER_FAILURES = 3;
const CIRCUIT_OPEN_MS = 30_000;
const BATCH_SIZE = 100;

export class SolanaRpcClient implements RpcClient {
  private providers: Provider[];

  constructor(urls: string[]) {
    this.providers = urls.filter(Boolean).map((url) => ({ url, failures: 0, openedUntil: 0 }));
    if (this.providers.length === 0) throw new Error("No RPC URL configured (set SOLANA_RPC_URLS)");
  }

  private pick(): Provider {
    const now = Date.now();
    const healthy = this.providers.filter((p) => p.openedUntil <= now);
    const pool = healthy.length ? healthy : this.providers;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private async call<T>(method: string, params: unknown[], provider: Provider): Promise<T> {
    const res = await fetch(provider.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    const json: any = await res.json();
    if (json.error) throw new Error(json.error.message ?? "RPC error");
    return json.result as T;
  }

  private async withFallback<T>(fn: (p: Provider) => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < this.providers.length; attempt++) {
      const p = this.pick();
      try {
        return await fn(p);
      } catch (e) {
        lastErr = e;
        p.failures += 1;
        if (p.failures >= CIRCUIT_AFTER_FAILURES) p.openedUntil = Date.now() + CIRCUIT_OPEN_MS;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("All RPC providers failed");
  }

  async getSignaturesForAddress(address: string, limit: number) {
    return this.withFallback((p) =>
      this.call<Array<{ signature: string; slot: number; blockTime: number | null; err: unknown }>>(
        "getSignaturesForAddress",
        [address, { limit }],
        p,
      ),
    );
  }

  async getTransactions(signatures: string[]): Promise<any[]> {
    const out: any[] = [];
    for (let i = 0; i < signatures.length; i += BATCH_SIZE) {
      const chunk = signatures.slice(i, i + BATCH_SIZE);
      const batch = chunk.map((signature, idx) => ({
        jsonrpc: "2.0",
        id: idx,
        method: "getTransaction",
        params: [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
      }));
      const res = await this.withFallback(async (p) => {
        const r = await fetch(p.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(batch),
        });
        if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
        return (await r.json()) as any[];
      });
      for (const item of res) out.push(item?.result ?? null);
    }
    return out;
  }
}

export function getRpcClient(): RpcClient {
  const urls = (process.env.SOLANA_RPC_URLS ?? process.env.SOLANA_RPC_URL ?? "")
    .split(",")
    .map((s) => s.trim());
  return new SolanaRpcClient(urls);
}
