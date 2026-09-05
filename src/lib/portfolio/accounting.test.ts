import { describe, expect, it } from "vitest";

import { calculatePortfolioLedger, valuePortfolio, type LedgerTrade } from "@/lib/portfolio/accounting";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("portfolio accounting", () => {
  it("starts with opening cash", () => {
    const ledger = calculatePortfolioLedger("1000000", []);

    expect(ledger.cash.toNumber()).toBe(1_000_000);
    expect(ledger.positions).toHaveLength(0);
  });

  it("records a single BUY with fees included in cost basis", () => {
    const ledger = calculatePortfolioLedger("1000000", [
      buy({ quantity: "10", price: "100", fees: "20" }),
    ]);

    expect(ledger.cash.toNumber()).toBe(998_980);
    expect(ledger.positions[0]?.costBasis.toNumber()).toBe(1_020);
    expect(ledger.positions[0]?.averageCost.toNumber()).toBe(102);
  });

  it("uses weighted-average cost across multiple BUYs", () => {
    const ledger = calculatePortfolioLedger("1000000", [
      buy({ quantity: "10", price: "100", fees: "20" }),
      buy({ quantity: "10", price: "120", fees: "20" }),
    ]);

    expect(ledger.positions[0]?.quantity.toNumber()).toBe(20);
    expect(ledger.positions[0]?.costBasis.toNumber()).toBe(2_240);
    expect(ledger.positions[0]?.averageCost.toNumber()).toBe(112);
  });

  it("rejects insufficient cash", () => {
    expect(() =>
      calculatePortfolioLedger("1000", [buy({ quantity: "10", price: "100", fees: "20" })]),
    ).toThrow(/negative cash/i);
  });

  it("supports manual SELL, partial SELL, realized P&L, and sell fees", () => {
    const ledger = calculatePortfolioLedger("1000000", [
      buy({ quantity: "10", price: "100", fees: "20" }),
      buy({ quantity: "10", price: "120", fees: "20" }),
      sell({ quantity: "5", price: "150", fees: "10" }),
    ]);

    expect(ledger.positions[0]?.quantity.toNumber()).toBe(15);
    expect(ledger.positions[0]?.averageCost.toNumber()).toBe(112);
    expect(ledger.positions[0]?.costBasis.toNumber()).toBe(1_680);
    expect(ledger.realizedPnl.toNumber()).toBe(180);
  });

  it("rejects overselling and preserves closed positions in the closed list", () => {
    expect(() =>
      calculatePortfolioLedger("1000000", [
        buy({ quantity: "10", price: "100", fees: "20" }),
        sell({ quantity: "11", price: "100", fees: "0" }),
      ]),
    ).toThrow(/exceeds/i);

    const ledger = calculatePortfolioLedger("1000000", [
      buy({ quantity: "10", price: "100", fees: "20" }),
      sell({ quantity: "10", price: "110", fees: "10" }),
    ]);
    expect(ledger.positions).toHaveLength(0);
    expect(ledger.closedPositions).toHaveLength(1);
    expect(ledger.realizedPnl.toNumber()).toBe(70);
  });

  it("keeps the same company independent across two portfolios", () => {
    const ledger = calculatePortfolioLedger("1000000", [
      buy({ portfolioId: "portfolio-a", quantity: "10", price: "100", fees: "0" }),
      buy({ portfolioId: "portfolio-b", quantity: "5", price: "200", fees: "0" }),
    ]);

    expect(ledger.positions).toHaveLength(2);
  });

  it("values a portfolio historically without future trades or prices", () => {
    const valuation = valuePortfolio(
      "1000000",
      [
        buy({ quantity: "10", price: "100", fees: "0", tradeDate: date("2025-01-01") }),
        buy({ quantity: "10", price: "200", fees: "0", tradeDate: date("2025-02-01") }),
      ],
      [
        { instrumentId: "instrument-a", tradingDate: date("2025-01-15"), close: "120" },
        { instrumentId: "instrument-a", tradingDate: date("2025-03-01"), close: "500" },
      ],
      date("2025-01-31"),
    );

    expect(valuation.positions[0]?.quantity.toNumber()).toBe(10);
    expect(valuation.positions[0]?.currentPrice?.toNumber()).toBe(120);
    expect(valuation.currentMarketValue.toNumber()).toBe(1_200);
    expect(valuation.cash.toNumber()).toBe(999_000);
  });

  it("does not reset first purchase date after additional buys or partial sells", () => {
    const ledger = calculatePortfolioLedger("1000000", [
      buy({ quantity: "10", price: "100", tradeDate: date("2025-01-01") }),
      buy({ quantity: "5", price: "110", tradeDate: date("2025-01-15") }),
      sell({ quantity: "4", price: "120", tradeDate: date("2025-02-01") }),
    ]);

    expect(ledger.positions[0]?.firstPurchaseDate?.toISOString().slice(0, 10)).toBe("2025-01-01");
  });

  it("resets first purchase date after a full close and later rebuy", () => {
    const ledger = calculatePortfolioLedger("1000000", [
      buy({ quantity: "10", price: "100", tradeDate: date("2025-01-01") }),
      sell({ quantity: "10", price: "120", tradeDate: date("2025-02-01") }),
      buy({ quantity: "3", price: "90", tradeDate: date("2025-03-01") }),
    ]);

    expect(ledger.closedPositions).toHaveLength(1);
    expect(ledger.positions[0]?.firstPurchaseDate?.toISOString().slice(0, 10)).toBe("2025-03-01");
  });

  it("keeps decimal money precision for fractional quantities", () => {
    const ledger = calculatePortfolioLedger("1000.00", [
      buy({ quantity: "0.3", price: "10.10", fees: "0.01" }),
      buy({ quantity: "0.2", price: "10.20", fees: "0.01" }),
    ]);

    expect(ledger.positions[0]?.quantity.toString()).toBe("0.5");
    expect(ledger.positions[0]?.costBasis.toString()).toBe("5.09");
  });
});

function buy(overrides: Partial<LedgerTrade> = {}): LedgerTrade {
  return {
    portfolioId: "portfolio-a",
    companyId: "company-a",
    instrumentId: "instrument-a",
    side: "BUY",
    tradeDate: date("2025-01-01"),
    quantity: "1",
    price: "100",
    fees: "0",
    ...overrides,
  };
}

function sell(overrides: Partial<LedgerTrade> = {}): LedgerTrade {
  return {
    ...buy(overrides),
    side: "SELL",
  };
}
