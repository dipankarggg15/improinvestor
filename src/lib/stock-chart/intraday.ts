import type { PriceBar } from "@/lib/stock-chart/indicators";

export type IntradayInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h";

export const intradayIntervals: readonly IntradayInterval[] = ["1m", "3m", "5m", "15m", "30m", "1h"];

export function upstoxIntervalParts(interval: IntradayInterval) {
  if (interval === "1h") return { unit: "hours", value: 1, seconds: 3_600 } as const;
  const minutes = Number.parseInt(interval, 10);
  return { unit: "minutes", value: minutes, seconds: minutes * 60 } as const;
}

export function parseUpstoxIntradayCandles(input: unknown): PriceBar[] {
  if (!isRecord(input) || !isRecord(input.data) || !Array.isArray(input.data.candles)) {
    throw new Error("Upstox intraday candle response was malformed.");
  }
  return input.data.candles.flatMap((raw) => {
    if (!Array.isArray(raw) || raw.length < 6) return [];
    const timestamp = typeof raw[0] === "string" ? Date.parse(raw[0]) : NaN;
    const [open, high, low, close, volume] = raw.slice(1, 6).map(Number);
    if (![timestamp, open, high, low, close, volume].every(Number.isFinite)) return [];
    return [{
      time: String(Math.floor(timestamp / 1_000)),
      open,
      high: Math.max(open, high, low, close),
      low: Math.min(open, high, low, close),
      close,
      volume: Math.max(0, volume),
    }];
  }).sort((left, right) => Number(left.time) - Number(right.time));
}

export function mergeLiveQuoteIntoIntradayBars(
  bars: readonly PriceBar[],
  quote: { readonly lastPrice: number; readonly previousClose: number | null; readonly lastTradedAt: string | null } | undefined,
  intervalSeconds: number,
) {
  if (!quote?.lastTradedAt || !Number.isFinite(quote.lastPrice)) return [...bars];
  const tradedAt = Math.floor(Date.parse(quote.lastTradedAt) / 1_000);
  if (!Number.isFinite(tradedAt)) return [...bars];
  const last = bars.at(-1);
  if (!last) {
    const time = tradedAt - (tradedAt % intervalSeconds);
    const open = quote.previousClose ?? quote.lastPrice;
    return [{ time: String(time), open, high: Math.max(open, quote.lastPrice), low: Math.min(open, quote.lastPrice), close: quote.lastPrice, volume: 0 }];
  }
  const lastStart = Number(last.time);
  if (!Number.isFinite(lastStart) || tradedAt < lastStart) return [...bars];
  if (tradedAt < lastStart + intervalSeconds) {
    return [...bars.slice(0, -1), {
      ...last,
      high: Math.max(last.high, quote.lastPrice),
      low: Math.min(last.low, quote.lastPrice),
      close: quote.lastPrice,
    }];
  }
  const bucketStart = lastStart + (Math.floor((tradedAt - lastStart) / intervalSeconds) * intervalSeconds);
  return [...bars, {
    time: String(bucketStart),
    open: last.close,
    high: Math.max(last.close, quote.lastPrice),
    low: Math.min(last.close, quote.lastPrice),
    close: quote.lastPrice,
    volume: 0,
  }];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
