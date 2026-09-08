import { describe, expect, it } from "vitest";

import {
  simulateEarlySuperstarsHistorical,
  type HistoricalRunnerCandidate,
  type HistoricalRunnerPrice,
} from "@/lib/strategies/historical-runner";

const realSource = "UPSTOX_REAL" as const;

describe("Early Superstars historical runner", () => {
  it("selects the initial Top 10 by 1W return descending", () => {
    const market = marketWith(
      Array.from({ length: 12 }, (_, index) => qualifyingStock(`c${index}`, 90 - index)),
    );

    const result = simulate(market);
    const bought = result.events.filter((event) => event.eventType === "BUY");

    expect(bought).toHaveLength(10);
    expect(bought.map((event) => event.companyId)).toEqual(["c11", "c10", "c9", "c8", "c7", "c6", "c5", "c4", "c3", "c2"]);
    expect(result.positions.map((position) => position.entryRank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("applies available filters and excludes insufficient history", () => {
    const market = marketWith([
      qualifyingStock("pass", 90),
      qualifyingStock("low1w", 96),
      qualifyingStock("hot1m", 90, { oneMonthClose: 60 }),
      qualifyingStock("hot3m", 90, { threeMonthClose: 50 }),
      qualifyingStock("lowatv", 90, { volume: 0 }),
      qualifyingStock("missing", 90, { omitThreeMonth: true }),
    ]);

    const result = simulate(market);

    expect(result.positions.map((position) => position.companyId)).toEqual(["pass"]);
  });

  it("does not trigger at -14.99% and triggers at <= -15%", () => {
    const noStop = simulate(marketWith([qualifyingStock("hold", 90, { extra: [["2026-01-05", 85.01]] })]), {
      requestedEndDate: day("2026-01-06"),
    });
    const stopped = simulate(marketWith([qualifyingStock("stop", 90, { extra: [["2026-01-05", 85], ["2026-01-06", 84]] })]), {
      requestedEndDate: day("2026-01-07"),
    });

    expect(noStop.events.some((event) => event.eventType === "STOP_TRIGGERED")).toBe(false);
    expect(stopped.events.find((event) => event.eventType === "STOP_TRIGGERED")?.eventDate).toBe("2026-01-05");
  });

  it("detects stop on T, sells on T+1, screens replacement on sale date, and buys on T+2", () => {
    const market = marketWith([
      qualifyingStock("stop", 90, { extra: [["2026-01-05", 85], ["2026-01-06", 84], ["2026-01-07", 84]] }),
      qualifyingStock("replacement", 95, { extra: [["2025-12-30", 90], ["2026-01-06", 100], ["2026-01-07", 101]] }),
    ]);

    const result = simulate(market, { rules: { maxPositions: 1 } });

    expect(result.events.find((event) => event.eventType === "STOP_TRIGGERED")?.eventDate).toBe("2026-01-05");
    expect(result.events.find((event) => event.eventType === "SELL")?.eventDate).toBe("2026-01-06");
    expect(result.events.find((event) => event.eventType === "REPLACEMENT_SCREEN")?.eventDate).toBe("2026-01-06");
    expect(result.events.find((event) => event.eventType === "REPLACEMENT_SELECTED")?.details.scheduledBuyDate).toBe("2026-01-07");
    expect(result.positions.find((position) => position.companyId === "replacement")?.entryDate).toBe("2026-01-07");
    expect(result.positions.find((position) => position.companyId === "replacement")?.entryPrice).toBe(101);
  });

  it("handles multiple simultaneous stop-losses and fewer replacements than vacancies", () => {
    const market = marketWith([
      qualifyingStock("a", 90, { extra: [["2026-01-05", 85], ["2026-01-06", 84], ["2026-01-07", 84]] }),
      qualifyingStock("b", 89, { extra: [["2026-01-05", 85], ["2026-01-06", 84], ["2026-01-07", 84]] }),
      qualifyingStock("onlyReplacement", 95, { extra: [["2025-12-30", 90], ["2026-01-06", 100], ["2026-01-07", 100]] }),
    ]);

    const result = simulate(market, { rules: { maxPositions: 2 } });

    expect(result.events.filter((event) => event.eventType === "STOP_TRIGGERED")).toHaveLength(2);
    expect(result.events.filter((event) => event.eventType === "SELL")).toHaveLength(2);
    expect(result.events.filter((event) => event.eventType === "REPLACEMENT_SELECTED")).toHaveLength(1);
    expect(result.positions.some((position) => position.companyId === "onlyReplacement")).toBe(true);
  });

  it("excludes existing holdings from replacements", () => {
    const market = marketWith([
      qualifyingStock("stop", 80, { extra: [["2026-01-05", 85], ["2026-01-06", 84], ["2026-01-07", 84]] }),
      qualifyingStock("held", 90, { extra: [["2026-01-06", 100], ["2026-01-07", 100]] }),
      qualifyingStock("replacement", 95, { extra: [["2025-12-30", 90], ["2026-01-06", 100], ["2026-01-07", 100]] }),
    ]);

    const result = simulate(market, { rules: { maxPositions: 2 } });

    expect(result.positions.filter((position) => position.companyId === "held")).toHaveLength(1);
    expect(result.events.find((event) => event.eventType === "REPLACEMENT_SELECTED")?.companyId).toBe("replacement");
  });

  it("schedules the first monthly review one calendar month after entry using the next trading day", () => {
    const result = simulate(monthlyMarket("graduate", 10, 23), {
      requestedEndDate: day("2026-02-05"),
      rules: { maxPositions: 1 },
    });

    const review = result.events.find((event) => event.eventType === "MONTHLY_REVIEW");
    expect(review?.eventDate).toBe("2026-02-03");
    expect(review?.details.scheduledTargetDate).toBe("2026-02-02");
  });

  it("graduates Top-50 1M ranks and keeps reviewing graduated stocks", () => {
    const result = simulate(monthlyMarket("graduate", 10, 23, { secondReviewRank: 24 }), {
      requestedEndDate: day("2026-03-04"),
      rules: { maxPositions: 1 },
    });

    expect(result.events.some((event) => event.eventType === "GRADUATED")).toBe(true);
    expect(result.events.filter((event) => event.eventType === "MONTHLY_REVIEW")).toHaveLength(2);
    expect(result.positions[0]?.status).toBe("OPEN_AT_END");
  });

  it("exits rank >50 on the next trading day and can replace on the following day", () => {
    const market = monthlyMarket("fail", 10, 51, { includeReplacement: true });
    const result = simulate(market, {
      requestedEndDate: day("2026-02-06"),
      rules: { maxPositions: 1 },
    });

    expect(result.events.find((event) => event.eventType === "MONTHLY_RANK_FAILURE")?.eventDate).toBe("2026-02-03");
    expect(result.events.find((event) => event.eventType === "SELL")?.eventDate).toBe("2026-02-04");
    expect(result.events.find((event) => event.eventType === "REPLACEMENT_SELECTED")?.eventDate).toBe("2026-02-04");
    expect(result.positions.find((position) => position.companyId === "replacement")?.entryDate).toBe("2026-02-05");
  });

  it("uses actual trading dates for weekend requests", () => {
    const result = simulate(marketWith([qualifyingStock("weekend", 90)]), {
      requestedStartDate: day("2026-01-03"),
      requestedEndDate: day("2026-01-10"),
    });

    expect(result.effectiveStartDate).toBe("2026-01-05");
    expect(result.effectiveEndDate).toBe("2026-01-09");
  });

  it("prevents pending execution after the end date", () => {
    const result = simulate(marketWith([qualifyingStock("late", 90, { extra: [["2026-01-05", 85]] })]), {
      requestedEndDate: day("2026-01-05"),
    });

    expect(result.events.some((event) => event.eventType === "STOP_TRIGGERED")).toBe(true);
    expect(result.events.some((event) => event.eventType === "SELL")).toBe(false);
    expect(result.positions[0]?.status).toBe("OPEN_AT_END");
  });

  it("does not use future prices in ranking decisions", () => {
    const base = qualifyingStock("candidate", 90, { extra: [["2026-01-09", 1000]] });
    const result = simulate(marketWith([base]), {
      requestedEndDate: day("2026-01-05"),
    });

    expect(result.positions[0]?.entryReturn1W).toBeCloseTo(11.1111, 4);
  });

  it("requires UPSTOX_REAL data and does not silently apply unavailable market-cap or D/E filters", () => {
    const market = marketWith([qualifyingStock("real", 90)]);
    const syntheticPrice = { ...market.prices[0], marketDataSource: "SYNTHETIC" as "UPSTOX_REAL" };

    expect(() => simulate({ ...market, prices: [syntheticPrice, ...market.prices.slice(1)] })).toThrow("UPSTOX_REAL");

    const result = simulate(market);
    expect(result.positions).toHaveLength(1);
    expect(result.unavailableFilters.join(" ")).toContain("Market Cap");
    expect(result.unavailableFilters.join(" ")).toContain("D/E");
  });
});

function simulate(
  market: { readonly candidates: HistoricalRunnerCandidate[]; readonly prices: HistoricalRunnerPrice[] },
  options: {
    readonly requestedStartDate?: Date;
    readonly requestedEndDate?: Date;
    readonly rules?: { readonly maxPositions?: number };
  } = {},
) {
  return simulateEarlySuperstarsHistorical({
    requestedStartDate: options.requestedStartDate ?? day("2026-01-02"),
    requestedEndDate: options.requestedEndDate ?? day("2026-01-09"),
    candidates: market.candidates,
    prices: market.prices,
    rules: { minAverageTradedValue: 1, maxPositions: options.rules?.maxPositions ?? 10 },
  });
}

function marketWith(stocks: ReturnType<typeof qualifyingStock>[]) {
  return {
    candidates: stocks.map((stock) => stock.candidate),
    prices: stocks.flatMap((stock) => stock.prices).sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime()),
  };
}

function qualifyingStock(
  id: string,
  oneWeekClose: number,
  options: {
    readonly oneMonthClose?: number;
    readonly threeMonthClose?: number;
    readonly volume?: number;
    readonly omitThreeMonth?: boolean;
    readonly extra?: [string, number][];
  } = {},
) {
  const instrumentId = `${id}-i`;
  const volume = options.volume ?? 1000;
  return {
    candidate: candidate(id),
    prices: [
      ...(options.omitThreeMonth ? [] : [price(instrumentId, "2025-10-02", options.threeMonthClose ?? 80, volume)]),
      price(instrumentId, "2025-12-02", options.oneMonthClose ?? 90, volume),
      price(instrumentId, "2025-12-26", oneWeekClose, volume),
      price(instrumentId, "2026-01-02", 100, volume),
      price(instrumentId, "2026-01-05", 100, volume),
      price(instrumentId, "2026-01-06", 100, volume),
      price(instrumentId, "2026-01-07", 100, volume),
      price(instrumentId, "2026-01-08", 100, volume),
      price(instrumentId, "2026-01-09", 100, volume),
      ...(options.extra ?? []).map(([date, close]) => price(instrumentId, date, close, volume)),
    ],
  };
}

function monthlyMarket(id: string, firstMonthReturn: number, targetRank: number, options: { readonly secondReviewRank?: number; readonly includeReplacement?: boolean } = {}) {
  const held = qualifyingStock(id, 90, {
    extra: [
      ["2026-02-03", 100 + firstMonthReturn],
      ["2026-02-04", 100 + firstMonthReturn],
      ["2026-02-05", 100 + firstMonthReturn],
      ["2026-03-03", 110 + (options.secondReviewRank ? 5 : 0)],
    ],
  });
  const leaders = Array.from({ length: Math.max(targetRank - 1, options.secondReviewRank ? options.secondReviewRank - 1 : 0) }, (_, index) => {
    const leader = qualifyingStock(`leader${index}`, 95 + index * 0.01, {
      extra: [
        ["2026-01-03", 100],
        ["2026-02-03", 140 - index * 0.1],
        ["2026-02-04", 140 - index * 0.1],
        ["2026-02-05", 140 - index * 0.1],
        ["2026-02-06", 140 - index * 0.1],
        ["2026-03-03", 160 - index * 0.1],
      ],
    });
    return leader;
  });
  const replacement = options.includeReplacement
    ? [qualifyingStock("replacement", 95, { extra: [["2026-01-28", 90], ["2026-02-04", 100], ["2026-02-05", 100], ["2026-02-06", 100]] })]
    : [];
  return marketWith([held, ...leaders, ...replacement]);
}

function candidate(id: string): HistoricalRunnerCandidate {
  return {
    companyId: id,
    companyName: `${id} Ltd`,
    isin: `ISIN${id}`,
    instrumentId: `${id}-i`,
    symbol: id.toUpperCase(),
    exchange: "NSE",
    marketDataSource: realSource,
  };
}

function price(instrumentId: string, date: string, close: number, volume = 1000): HistoricalRunnerPrice {
  return { instrumentId, tradingDate: day(date), close, volume, marketDataSource: realSource };
}

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
