import { NextResponse } from "next/server";

import { requireOwner } from "@/lib/auth/server";
import { intradayIntervals, parseUpstoxIntradayCandles, type IntradayInterval, upstoxIntervalParts } from "@/lib/stock-chart/intraday";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireOwner();
    const search = new URL(request.url).searchParams;
    const instrumentKey = search.get("instrumentKey") ?? "";
    const interval = search.get("interval") ?? "";
    if (!isValidInstrumentKey(instrumentKey) || !intradayIntervals.includes(interval as IntradayInterval)) {
      return NextResponse.json({ error: "A valid instrumentKey and interval are required." }, { status: 400 });
    }
    const token = process.env.UPSTOX_ANALYTICS_TOKEN;
    if (!token) return NextResponse.json({ error: "Missing UPSTOX_ANALYTICS_TOKEN." }, { status: 503 });

    const parts = upstoxIntervalParts(interval as IntradayInterval);
    const url = `https://api.upstox.com/v3/historical-candle/intraday/${encodeURIComponent(instrumentKey)}/${parts.unit}/${parts.value}`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return NextResponse.json({ error: `Upstox intraday request failed with status ${response.status}.` }, { status: 502 });
    }
    const bars = parseUpstoxIntradayCandles(await response.json());
    return NextResponse.json({ interval, bars, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Intraday candles are unavailable." }, { status: 503 });
  }
}

function isValidInstrumentKey(value: string) {
  return value.length <= 160 && /^[A-Z0-9_]+\|[^\r\n]+$/.test(value);
}
