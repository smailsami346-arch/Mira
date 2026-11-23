import { getRepo } from "@/lib/db/store";

export const dynamic = "force-dynamic";

// SSE stream of new normalized events for a mint (MVP replacement for WebSocket;
// Next.js route handlers don't support WS — use a dedicated WS server or Ably in Production).
// GET /api/v1/stream?mint=<MINT>
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mint = searchParams.get("mint") ?? "";
  const repo = getRepo();
  let last = repo.eventCount();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const timer = setInterval(() => {
        try {
          const all = repo.listEventsByMint(mint, { limit: 100_000 });
          const fresh = all.slice(last);
          last = all.length;
          for (const e of fresh) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
          }
        } catch {
          /* keep streaming */
        }
      }, 2000);
      req.signal.addEventListener("abort", () => clearInterval(timer));
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
