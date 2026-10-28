import { describe, expect, it } from "vitest";

import { mergeLiveQuoteIntoIntradayBars, parseUpstoxIntradayCandles } from "@/lib/stock-chart/intraday";

describe("intraday chart helpers", () => {
  it("parses and sorts Upstox intraday candles", () => {
    const bars = parseUpstoxIntradayCandles({ data: { candles: [
      ["2026-10-27T09:16:00+05:30", 101, 103, 100, 102, 200],
      ["2026-10-27T09:15:00+05:30", 100, 102, 99, 101, 100],
    ] } });
    expect(bars.map((bar) => bar.open)).toEqual([100, 101]);
    expect(bars[0].time).toMatch(/^\d{10}$/);
  });

  it("updates the active candle and starts the next aligned candle", () => {
    const barStart = String(Date.parse("2026-10-27T09:35:00+05:30") / 1_000);
    const bars = [{ time: barStart, open: 100, high: 102, low: 99, close: 101, volume: 100 }];
    const active = mergeLiveQuoteIntoIntradayBars(bars, { lastPrice: 103, previousClose: 98, lastTradedAt: "2026-10-27T09:39:20+05:30" }, 300);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ high: 103, close: 103 });

    const next = mergeLiveQuoteIntoIntradayBars(bars, { lastPrice: 104, previousClose: 98, lastTradedAt: "2026-10-27T09:40:20+05:30" }, 300);
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ open: 101, close: 104, volume: 0 });
  });
});
