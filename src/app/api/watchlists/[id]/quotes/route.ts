import { NextResponse } from "next/server";

import { requireOwner } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { createUpstoxMarketDataProviderCore } from "@/lib/market-data/providers/upstox-core";
import { getUpstoxLiveQuoteHub } from "@/lib/market-data/upstox-live";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { readonly params: Promise<{ readonly id: string }> }) {
  try {
    await requireOwner();
    const { id } = await params;
    const items = await prisma.watchlistItem.findMany({
      where: { watchlistId: id, state: { not: "ARCHIVED" } },
      select: { instrument: { select: { instrumentKey: true } } },
      take: 500,
    });
    const instrumentKeys = items.map((item) => item.instrument.instrumentKey);
    const provider = createUpstoxMarketDataProviderCore({ token: process.env.UPSTOX_ANALYTICS_TOKEN });
    const quotes = provider.fetchCurrentQuotes
      ? await provider.fetchCurrentQuotes({ instrumentKeys })
      : await Promise.all(instrumentKeys.map((instrumentKey) => provider.fetchCurrentQuote({ instrumentKey })));
    getUpstoxLiveQuoteHub().seed(quotes.map((quote) => ({
      instrumentKey: quote.instrumentKey,
      lastPrice: Number(quote.lastPrice),
      previousClose: quote.previousClose === null ? null : Number(quote.previousClose),
      lastTradedAt: quote.lastTradedAt?.toISOString() ?? null,
    })));

    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      quotes: quotes.map((quote) => ({
        instrumentKey: quote.instrumentKey,
        lastPrice: Number(quote.lastPrice),
        previousClose: quote.previousClose === null ? null : Number(quote.previousClose),
        lastTradedAt: quote.lastTradedAt?.toISOString() ?? null,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Live quotes are unavailable." }, { status: 503 });
  }
}
