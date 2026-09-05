import { describe, expect, it } from "vitest";

import { buildDailyEquityCurve } from "@/lib/analytics/equity";

describe("equity curve", () => {
  it("reconstructs daily cash plus market value without future trade or price leakage", () => {
    const curve = buildDailyEquityCurve({
      initialCapital: "1000",
      startDate: day("2025-01-01"),
      endDate: day("2025-01-03"),
      trades: [
        trade("buy-1", "BUY", "2025-01-01", "5", "100"),
        trade("sell-1", "SELL", "2025-01-03", "5", "120"),
        trade("future-buy", "BUY", "2025-01-04", "1", "1"),
      ],
      prices: [
        price("2025-01-01", "100"),
        price("2025-01-02", "110"),
        price("2025-01-03", "120"),
        price("2025-01-04", "500"),
      ],
    });

    expect(curve).toHaveLength(3);
    expect(curve[0]?.cash.toString()).toBe("500");
    expect(curve[0]?.investedMarketValue.toString()).toBe("500");
    expect(curve[0]?.totalEquity.toString()).toBe("1000");
    expect(curve[1]?.totalEquity.toString()).toBe("1050");
    expect(curve[2]?.cash.toString()).toBe("1100");
    expect(curve[2]?.investedMarketValue.toString()).toBe("0");
    expect(curve[2]?.totalEquity.toString()).toBe("1100");
  });

  it("values positions open before the period with the latest prior close", () => {
    const curve = buildDailyEquityCurve({
      initialCapital: "1000",
      startDate: day("2025-01-02"),
      endDate: day("2025-01-03"),
      trades: [trade("buy-1", "BUY", "2025-01-01", "5", "100")],
      prices: [price("2025-01-01", "100"), price("2025-01-02", "100"), price("2025-01-03", "120")],
    });

    expect(curve[0]?.totalEquity.toString()).toBe("1000");
    expect(curve[1]?.totalEquity.toString()).toBe("1100");
  });
});

function trade(id: string, side: "BUY" | "SELL", tradeDate: string, quantity: string, price: string) {
  return { id, portfolioId: "p1", companyId: "c1", instrumentId: "i1", side, tradeDate: day(tradeDate), quantity, price, fees: "0" };
}

function price(tradingDate: string, close: string) {
  return { instrumentId: "i1", tradingDate: day(tradingDate), close };
}

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
