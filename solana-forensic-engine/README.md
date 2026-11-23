# Solana Forensic Engine (MVP)

On-chain forensic analysis for Solana tokens: ingestion → decoding → normalized
events → heuristics (FACT / INFERENCE / HYPOTHESIS findings with evidence) →
REST/SSE API → dark-mode RTL dashboard.

## Quick start

```bash
pnpm install
pnpm test          # unit tests (decoder, normalizer, heuristics)
pnpm typecheck     # tsc --noEmit
pnpm build         # production build
pnpm dev           # http://localhost:3000
```

No RPC key is needed for the demo: open the app and press **"Load demo data"**
(POST `/api/v1/demo/seed`) to ingest a synthetic token scenario and inspect
findings on `/token/<mint>`.

## Real ingestion

```bash
export SOLANA_RPC_URLS="https://your-helius-url,https://your-triton-url"
# then:
curl -X POST localhost:3000/api/v1/ingest/backfill -d '{"mint":"<MINT>","limit":1000}' -H 'content-type: application/json'
```

RPC keys stay server-side (backend proxy only); every API route is rate-limited
(in-memory token bucket, 100 req/min/IP in MVP; move to Redis in Beta).

## Architecture (MVP slice)

```
app/api/v1/*            REST routes + SSE stream (rate-limited)
lib/rpc/client.ts       multi-provider JSON-RPC client, circuit breaker, batching (100)
lib/ingest/backfill.ts  getSignaturesForAddress -> batched getTransaction -> decode -> store -> analyze
lib/decoder/*           SPL Token / Token-2022, System, Raydium AMM v4, Pump.fun (outer + inner CPI)
lib/normalizer.ts       decoded instructions -> NormalizedEvent[]
lib/heuristics/*        common_funder, sniper_bundle, wash_trading, sybil, dev_tracking, lp_manipulation, bot_detection
lib/analysis/*          graph builder, risk scoring, phase classification
lib/db/*                Repository interface + in-memory impl (Prisma schema in prisma/ for Beta)
```

## Output levels

Every finding carries `level` (FACT | INFERENCE | HYPOTHESIS), `evidence[]`
(signatures with explorer links), `confidence_score` (0–100),
`reasoning_summary` and `data_sources[]`.

## Known MVP limitations / TODOs

- Raydium/Pump.fun instruction tags are based on community parsers — verify
  against the on-chain IDL before production use.
- WebSocket is exposed as SSE (`/api/v1/stream?mint=`) in the MVP; Next.js App
  Router route handlers don't support WS natively — use a separate WS server or
  Pusher/Ably in Production.
- Repository is in-memory; switch to Prisma/Neon (schema included) in Beta.
- PDF export is stubbed (JSON only) in MVP.
- Token-2022 extensions (transfer fee, confidential) are decoded as core
  instructions only; extension-aware decoding is on the roadmap.
