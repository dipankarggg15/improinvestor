import { requireOwner } from "@/lib/auth/server";
import { getUpstoxLiveQuoteHub } from "@/lib/market-data/upstox-live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();
const maximumClientSubscriptions = 250;

export async function GET(request: Request) {
  await requireOwner();
  const instrumentKeys = [...new Set(new URL(request.url).searchParams.getAll("instrumentKey"))]
    .filter(isValidInstrumentKey)
    .slice(0, maximumClientSubscriptions);
  if (instrumentKeys.length === 0) return new Response("At least one valid instrumentKey is required.", { status: 400 });

  const hub = getUpstoxLiveQuoteHub();
  const release = hub.retain(instrumentKeys);
  let interval: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let closeStream = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = () => {
        if (closed) return;
        const quotes = hub.snapshot(instrumentKeys);
        controller.enqueue(encoder.encode(`event: quotes\ndata: ${JSON.stringify({
          fetchedAt: new Date().toISOString(),
          source: hub.getStatus() === "live" ? "UPSTOX_STREAM" : "MEMORY_CACHE",
          status: hub.getStatus(),
          quotes,
        })}\n\n`));
      };
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      send();
      interval = setInterval(send, 1_000);
      closeStream = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        release();
        try { controller.close(); } catch { /* The browser may already have closed the stream. */ }
      };
      request.signal.addEventListener("abort", closeStream, { once: true });
    },
    cancel() {
      closeStream();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

function isValidInstrumentKey(value: string) {
  return value.length <= 160 && /^[A-Z0-9_]+\|[^\r\n]+$/.test(value);
}
