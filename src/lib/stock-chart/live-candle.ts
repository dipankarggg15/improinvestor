import type { StockChartCandle } from "@/lib/stock-chart/service";

export function mergeLiveQuoteIntoDailyCandles(
  candles: readonly StockChartCandle[],
  quote: { readonly lastPrice: number; readonly previousClose: number | null; readonly lastTradedAt: string | null } | undefined,
) {
  if (!quote?.lastTradedAt || candles.length === 0 || !Number.isFinite(quote.lastPrice)) return [...candles];
  const liveDate = dateKeyInIndia(quote.lastTradedAt);
  const last = candles.at(-1)!;
  if (!liveDate || liveDate < last.time) return [...candles];

  const replacingCurrentDay = liveDate === last.time;
  const base = replacingCurrentDay ? candles.slice(0, -1) : [...candles];
  const open = replacingCurrentDay ? last.open : quote.previousClose ?? last.close;
  const high = replacingCurrentDay ? Math.max(last.high, quote.lastPrice) : Math.max(open, quote.lastPrice);
  const low = replacingCurrentDay ? Math.min(last.low, quote.lastPrice) : Math.min(open, quote.lastPrice);
  const nextClose = quote.lastPrice;
  const priorCloses = base.map((candle) => candle.close);

  return [...base, {
    time: liveDate,
    open,
    high,
    low,
    close: nextClose,
    volume: replacingCurrentDay ? last.volume : 0,
    sma50: rollingAverage([...priorCloses.slice(-49), nextClose], 50),
    sma200: rollingAverage([...priorCloses.slice(-199), nextClose], 200),
    ohlcComplete: false,
    volumeComplete: false,
  }];
}

function rollingAverage(values: readonly number[], period: number) {
  if (values.length < period) return null;
  return values.reduce((sum, value) => sum + value, 0) / period;
}

function dateKeyInIndia(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}
