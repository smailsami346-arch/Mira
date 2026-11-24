// Server-side only. RPC URLs come from env and are never sent to the client.
export interface RpcClient {
  getSignaturesForAddress(
    address: string,
    limit: number,
    before?: string,
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SolanaRpcClient implements RpcClient {
  private providers: Provider[];
  private batch: boolean;
  private delayMs: number;

  constructor(urls: string[], opts: { batch?: boolean; delayMs?: number } = {}) {
    this.providers = urls.filter(Boolean).map((url) => ({ url, failures: 0, openedUntil: 0 }));
    if (this.providers.length === 0) throw new Error("No RPC URL configured (set SOLANA_RPC_URLS)");
    this.batch = opts.batch ?? true;
    this.delayMs = opts.delayMs ?? 250;
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
    const maxAttempts = Math.max(this.providers.length, 3);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const p = this.pick();
      try {
        return await fn(p);
      } catch (e) {
        lastErr = e;
        p.failures += 1;
        if (p.failures >= CIRCUIT_AFTER_FAILURES) p.openedUntil = Date.now() + CIRCUIT_OPEN_MS;
        const msg = e instanceof Error ? e.message : String(e);
        // exponential backoff; longer on rate limits (429)
        const base = msg.includes("429") || /rate.?limit/i.test(msg) ? 2000 : 500;
        await sleep(base * (attempt + 1));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("All RPC providers failed");
  }

  private getTransactionOne(p: Provider, signature: string, maxVer: number) {
    return this.call<any>("getTransaction", [
      signature,
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: maxVer },
    ], p);
  }

  async getSignaturesForAddress(address: string, limit: number, before?: string) {
    const opts: Record<string, unknown> = { limit };
    if (before) opts.before = before;
    return this.withFallback((p) =>
      this.call<Array<{ signature: string; slot: number; blockTime: number | null; err: unknown }>>(
        "getSignaturesForAddress",
        [address, opts],
        p,
      ),
    );
  }

  // Fetches transactions, tolerating per-item errors. Transactions with version 1
  // are retried with maxSupportedTransactionVersion: 1 (newer mainnet txs).
  async getTransactions(signatures: string[]): Promise<any[]> {
    const out: any[] = new Array(signatures.length).fill(null);
    const needV1: number[] = [];

    const fetchIdxs = async (idxs: number[], maxVer: number) => {
      if (!this.batch) {
        // Some providers (e.g. publicnode) reject batched getTransaction — send
        // individually with a small concurrency pool to stay under rate limits.
        const CONC = 4;
        let cursor = 0;
        const worker = async () => {
          while (cursor < idxs.length) {
            const i = idxs[cursor++];
            try {
              out[i] = (await this.withFallback((p) => this.getTransactionOne(p, signatures[i], maxVer))) ?? null;
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              if (maxVer === 0 && msg.includes("version (1)")) needV1.push(i);
            }
            await sleep(this.delayMs);
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONC, idxs.length) }, () => worker()));
        return;
      }
      for (let k = 0; k < idxs.length; k += BATCH_SIZE) {
        const chunk = idxs.slice(k, k + BATCH_SIZE);
        const batch = chunk.map((i, j) => ({
          jsonrpc: "2.0",
          id: j,
          method: "getTransaction",
          params: [signatures[i], { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: maxVer }],
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
        chunk.forEach((i, j) => {
          const item = res[j];
          if (item?.result) out[i] = item.result;
          else if (maxVer === 0 && String(item?.error?.message ?? "").includes("version (1)")) needV1.push(i);
        });
        await sleep(this.delayMs);
      }
    };

    await fetchIdxs(
      signatures.map((_, i) => i),
      0,
    );
    if (needV1.length) {
      await fetchIdxs([...new Set(needV1)], 1);
    }
    return out;
  }
}

export function getRpcClient(): RpcClient {
  const urls = (process.env.SOLANA_RPC_URLS ?? process.env.SOLANA_RPC_URL ?? "")
    .split(",")
    .map((s) => s.trim());
  // publicnode rejects batched getTransaction
  const batch = !urls.some((u) => u.includes("publicnode"));
  return new SolanaRpcClient(urls, { batch });
}
