import { describe, expect, it } from "vitest";

import { mergeLiveQuoteIntoDailyCandles } from "@/lib/stock-chart/live-candle";

describe("mergeLiveQuoteIntoDailyCandles", () => {
  it("appends a forming candle for a newer live trading day", () => {
    const result = mergeLiveQuoteIntoDailyCandles([candle("2026-10-26", 100, 105, 98, 102)], {
      lastPrice: 108,
      previousClose: 102,
      lastTradedAt: "2026-10-27T05:30:00.000Z",
    });

    expect(result.at(-1)).toMatchObject({ time: "2026-10-27", open: 102, high: 108, low: 102, close: 108, volume: 0 });
  });

  it("updates rather than duplicates an existing current-day candle", () => {
    const result = mergeLiveQuoteIntoDailyCandles([candle("2026-10-27", 100, 106, 99, 104)], {
      lastPrice: 98,
      previousClose: 101,
      lastTradedAt: "2026-10-27T08:00:00.000Z",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ open: 100, high: 106, low: 98, close: 98 });
  });
});

function candle(time: string, open: number, high: number, low: number, close: number) {
  return { time, open, high, low, close, volume: 1_000, sma50: null, sma200: null };
}
