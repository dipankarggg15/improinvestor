import { describe, expect, it } from "vitest";

import {
  earlySuperstarsV1Config,
  momentum10V1Config,
  parseStrategyConfig,
  type StrategyConfig,
} from "@/lib/strategies/config";
import { evaluateStrategy, type StrategyMarketSnapshot } from "@/lib/strategies/engine";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const crore = 10_000_000;

describe("strategy config validation", () => {
  it("validates structured strategy configuration at runtime", () => {
    expect(() => parseStrategyConfig(momentum10V1Config)).not.toThrow();
    expect(() => parseStrategyConfig({ eligibility: {} })).toThrow();
  });
});

describe("evaluateStrategy", () => {
  it("applies Momentum 10 exact eligibility rules and ascending ranking", () => {
    const result = evaluateStrategy(momentum10V1Config, date("2025-12-31"), fixtureSnapshot());

    expect(result.evaluatedCount).toBe(19);
    expect(result.eligibleCount).toBeGreaterThan(10);
    expect(result.selectedCount).toBe(10);
    expect(result.candidates.find((candidate) => candidate.symbol === "CAP500")?.failureReasons).toContain("MARKET_CAP_TOO_LOW");
    expect(result.candidates.find((candidate) => candidate.symbol === "DEBT2")?.failureReasons).toContain("DEBT_EQUITY_TOO_HIGH");
    expect(result.candidates.find((candidate) => candidate.symbol === "RET50")?.failureReasons).toContain("RETURN_3M_TOO_LOW");
    expect(result.candidates.find((candidate) => candidate.symbol === "LOWLIQ")?.failureReasons).toContain("LIQUIDITY_TOO_LOW");

    const selected = result.candidates
      .filter((candidate) => candidate.selected)
      .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));

    expect(selected[0]?.returns.return1M).toBeLessThanOrEqual(selected[1]?.returns.return1M ?? 0);
  });

  it("applies Early Superstars exact eligibility rules and descending ranking", () => {
    const snapshot = fixtureSnapshot();
    const earlyCandidateIds = new Set(snapshot.candidates.slice(0, 3).map((candidate) => candidate.instrumentId));
    const result = evaluateStrategy(earlySuperstarsV1Config, date("2025-12-31"), {
      ...snapshot,
      prices: snapshot.prices.map((price) => {
        if (!earlyCandidateIds.has(price.instrumentId)) return price;
        if (price.tradingDate.getTime() === date("2025-11-30").getTime()) return { ...price, close: 90 };
        if (price.tradingDate.getTime() === date("2025-12-24").getTime()) return { ...price, close: 105 };
        return price;
      }),
    });

    expect(result.selectedCount).toBeGreaterThan(0);
    expect(result.candidates.find((candidate) => candidate.symbol === "CAP1999")?.failureReasons).toContain("MARKET_CAP_TOO_LOW");
    expect(result.candidates.find((candidate) => candidate.symbol === "RET1W5")?.failureReasons).toContain("RETURN_1W_TOO_LOW");
    expect(result.candidates.find((candidate) => candidate.symbol === "HOT1M")?.failureReasons).toContain("RETURN_1M_TOO_HIGH");
    expect(result.candidates.find((candidate) => candidate.symbol === "HOT3M")?.failureReasons).toContain("RETURN_3M_TOO_HIGH");

    const selected = result.candidates
      .filter((candidate) => candidate.selected)
      .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));

    expect(selected[0]?.returns.return1W).toBeGreaterThanOrEqual(selected[1]?.returns.return1W ?? 0);
  });

  it("selects fewer than 10 when fewer than 10 candidates qualify", () => {
    const config: StrategyConfig = {
      ...earlySuperstarsV1Config,
      eligibility: {
        ...earlySuperstarsV1Config.eligibility,
        returns: { return1W: { gt: 20 } },
      },
    };
    const result = evaluateStrategy(config, date("2025-12-31"), fixtureSnapshot(5));

    expect(result.eligibleCount).toBeLessThan(10);
    expect(result.selectedCount).toBe(result.eligibleCount);
  });

  it("does not select companies already held by the same strategy version", () => {
    const snapshot = fixtureSnapshot();
    const heldCompanyId = snapshot.candidates[0]?.companyId;
    const result = evaluateStrategy(momentum10V1Config, date("2025-12-31"), snapshot, {
      activeHoldingCompanyIds: new Set(heldCompanyId ? [heldCompanyId] : []),
    });

    expect(result.candidates.find((candidate) => candidate.companyId === heldCompanyId)?.qualified).toBe(true);
    expect(result.candidates.find((candidate) => candidate.companyId === heldCompanyId)?.selected).toBe(false);
    expect(result.selectedCount).toBe(10);
  });

  it("deduplicates dual listings by consuming one canonical instrument per company", () => {
    const snapshot = fixtureSnapshot(2);
    const result = evaluateStrategy(momentum10V1Config, date("2025-12-31"), {
      ...snapshot,
      candidates: [
        snapshot.candidates[0],
        { ...snapshot.candidates[0], instrumentId: "first-bse", symbol: "700001", exchange: "BSE" },
      ],
    });

    expect(result.evaluatedCount).toBe(2);
  });

  it("reports missing price history and missing fundamentals", () => {
    const snapshot = fixtureSnapshot(2);
    const result = evaluateStrategy(momentum10V1Config, date("2025-12-31"), {
      candidates: [
        snapshot.candidates[0],
        { ...snapshot.candidates[1], companyId: "missing-fundamentals", instrumentId: "missing-prices" },
      ],
      prices: snapshot.prices.filter((price) => price.instrumentId === snapshot.candidates[0].instrumentId),
      fundamentals: snapshot.fundamentals.filter((fundamental) => fundamental.companyId === snapshot.candidates[0].companyId),
    });

    const missing = result.candidates.find((candidate) => candidate.instrumentId === "missing-prices");
    expect(missing?.failureReasons).toContain("MISSING_FUNDAMENTALS");
    expect(missing?.failureReasons).toContain("INSUFFICIENT_PRICE_HISTORY");
  });

  it("uses historical fundamentals only on or before run date", () => {
    const snapshot = fixtureSnapshot(1);
    const candidate = snapshot.candidates[0];
    const result = evaluateStrategy(momentum10V1Config, date("2025-12-31"), {
      ...snapshot,
      fundamentals: [
        { companyId: candidate.companyId, asOfDate: date("2025-11-01"), marketCap: 400 * crore, debtToEquity: 0.5 },
        { companyId: candidate.companyId, asOfDate: date("2026-01-01"), marketCap: 4_000 * crore, debtToEquity: 0.5 },
      ],
    });

    expect(result.candidates[0]?.failureReasons).toContain("MARKET_CAP_TOO_LOW");
  });

  it("stores decision metrics on candidate evaluations", () => {
    const result = evaluateStrategy(momentum10V1Config, date("2025-12-31"), fixtureSnapshot(1));
    const candidate = result.candidates[0];

    expect(candidate?.marketCap).toBeTypeOf("number");
    expect(candidate?.averageTradedValue).toBeTypeOf("number");
    expect(candidate?.returns.return1W).toBeTypeOf("number");
    expect(candidate?.metricDates.return3M?.endDate).toBe("2025-12-31");
  });
});

function fixtureSnapshot(qualifierCount = 11): StrategyMarketSnapshot {
  const candidates = [
    ...Array.from({ length: qualifierCount }, (_, index) => makeCandidate(`winner-${index}`, `WIN${index}`)),
    makeCandidate("cap500", "CAP500"),
    makeCandidate("cap1999", "CAP1999"),
    makeCandidate("debt2", "DEBT2"),
    makeCandidate("ret50", "RET50"),
    makeCandidate("ret1w5", "RET1W5"),
    makeCandidate("hot1m", "HOT1M"),
    makeCandidate("hot3m", "HOT3M"),
    makeCandidate("lowliq", "LOWLIQ"),
  ];

  return {
    candidates,
    fundamentals: candidates.flatMap((candidate) => {
      const marketCap =
        candidate.symbol === "CAP500" ? 500 * crore : candidate.symbol === "CAP1999" ? 1_999 * crore : 3_000 * crore;
      const debtToEquity = candidate.symbol === "DEBT2" ? 2 : 1.2;
      return [
        { companyId: candidate.companyId, asOfDate: date("2025-10-01"), marketCap, debtToEquity },
        { companyId: candidate.companyId, asOfDate: date("2026-01-01"), marketCap: 10_000 * crore, debtToEquity: 0 },
      ];
    }),
    prices: candidates.flatMap((candidate, index) => makePrices(candidate.instrumentId, candidate.symbol, index)),
  };
}

function makeCandidate(companyId: string, symbol: string) {
  return {
    companyId,
    companyName: `${symbol} Limited`,
    isin: `INSYN${symbol}`,
    instrumentId: `${companyId}-nse`,
    symbol,
    exchange: "NSE" as const,
  };
}

function makePrices(instrumentId: string, symbol: string, index: number) {
  const start = 100;
  const oneYear = 105;
  const sixMonth = 110;
  const threeMonth =
    symbol === "RET50" ? 80 : symbol === "HOT3M" ? 100 : symbol === "LOWLIQ" ? 80 : 60 - index * 0.4;
  const oneMonth = symbol === "HOT1M" ? 60 : symbol === "RET1W5" ? 100 : 96 - index * 0.1;
  const end = symbol === "RET1W5" ? 104.9 : symbol === "HOT1M" ? 100 : symbol === "HOT3M" ? 160 : 120;
  const volume = symbol === "LOWLIQ" ? 1_000 : 1_000_000;

  return [
    { instrumentId, tradingDate: date("2024-12-31"), close: start, volume },
    { instrumentId, tradingDate: date("2025-06-30"), close: oneYear, volume },
    { instrumentId, tradingDate: date("2025-09-30"), close: sixMonth, volume },
    { instrumentId, tradingDate: date("2025-11-30"), close: threeMonth, volume },
    { instrumentId, tradingDate: date("2025-12-24"), close: oneMonth, volume },
    { instrumentId, tradingDate: date("2025-12-31"), close: end, volume },
    { instrumentId, tradingDate: date("2026-01-05"), close: 1_000, volume },
  ];
}
