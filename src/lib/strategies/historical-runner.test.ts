import { describe, expect, it } from "vitest";

import { annotateReturnIfHeldToEndPercent } from "@/lib/strategies/historical-run-service";
import {
  simulateMomentum10Historical,
  simulateEarlySuperstarsHistorical,
  type EarlySuperstarsRules,
  type HistoricalRunnerCandidate,
  type HistoricalRunnerPrice,
  type Momentum10HistoricalRules,
} from "@/lib/strategies/historical-runner";

const realSource = "UPSTOX_REAL" as const;

describe("Momentum 10 price-only historical runner", () => {
  it("enters only 3M > 50, 1M between 4 and 21, sorted by 1M ascending", () => {
    const result = simulateMomentum(momentumMarketWith([
      momentumStock("r10", 10),
      momentumStock("r04", 4),
      momentumStock("r21", 21),
      momentumStock("low1m", 3.99),
      momentumStock("hot1m", 21.01),
      momentumStock("weak3m", 10, { threeMonthClose: 80 }),
      momentumStock("lowatv", 10, { volume: 0 }),
    ]), { rules: { maxPositions: 3 } });

    expect(result.positions.map((position) => position.companyId)).toEqual(["r04", "r10", "r21"]);
    expect(result.positions.map((position) => position.entryRank)).toEqual([1, 2, 3]);
  });

  it("uses a 40% emergency stop during the first 30 days", () => {
    const result = simulateMomentum(momentumMarketWith([
      momentumStock("stop", 10, { extra: [["2026-01-20", 60]] }),
    ]), { rules: { maxPositions: 1 } });

    expect(result.events.find((event) => event.eventType === "STOP_TRIGGERED")?.eventDate).toBe("2026-01-20");
    expect(result.positions[0]?.exitReason).toBe("STOP_LOSS");
  });

  it("does first review after 30 days and then every 14 days", () => {
    const result = simulateMomentum(momentumReviewMarket("keep", 20, 1, {
      secondReviewClose: 130,
    }), {
      requestedEndDate: day("2026-02-18"),
      rules: { maxPositions: 1 },
    });

    const reviews = result.events.filter((event) => event.eventType === "MONTHLY_REVIEW");
    expect(reviews.map((event) => event.eventDate)).toEqual(["2026-02-02", "2026-02-16"]);
    expect(reviews.map((event) => event.details.scheduledTargetDate)).toEqual(["2026-02-01", "2026-02-15"]);
    expect(result.positions[0]?.status).toBe("OPEN_AT_END");
  });

  it("exits at review when 1M rank is outside Top 30", () => {
    const result = simulateMomentum(momentumReviewMarket("rank31", 10, 31), {
      requestedEndDate: day("2026-02-03"),
      rules: { maxPositions: 1 },
    });

    const review = result.events.find((event) => event.eventType === "MONTHLY_REVIEW");
    expect(review?.details.rank).toBe(31);
    expect(review?.details.decision).toBe("RANK_FAILURE");
    expect(result.positions[0]?.exitReason).toBe("MONTHLY_RANK_FAILURE");
  });

  it("exits at review when 3M return drops below 50%", () => {
    const result = simulateMomentum(momentumMarketWith([
      momentumStock("weak3mReview", 10, { reviewClose: 100, reviewThreeMonthClose: 80 }),
    ]), {
      requestedEndDate: day("2026-02-03"),
      rules: { maxPositions: 1 },
    });

    const review = result.events.find((event) => event.eventType === "MONTHLY_REVIEW");
    expect(review?.details.return3M).toBeCloseTo(25, 4);
    expect(result.positions[0]?.exitReason).toBe("MONTHLY_RANK_FAILURE");
  });

  it("immediately replaces scheduled review exits using the original entry screen", () => {
    const result = simulateMomentum(momentumReviewMarket("exit", 10, 31, { includeReplacement: true }), {
      requestedEndDate: day("2026-02-03"),
      rules: { maxPositions: 1 },
    });

    expect(result.events.find((event) => event.eventType === "SELL")?.eventDate).toBe("2026-02-02");
    const replacementSelection = result.events.find((event) => event.eventType === "REPLACEMENT_SELECTED");
    expect(replacementSelection?.eventDate).toBe("2026-02-02");
    expect(replacementSelection?.details.scheduledBuyDate).toBe("2026-02-02");
    expect(replacementSelection?.companyId).not.toBe("exit");
    expect(result.positions.find((position) => position.entryDate === "2026-02-02")?.status).toBe("OPEN_AT_END");
  });
});

describe("Early Superstars historical runner", () => {
  it("selects the initial Top 10 by 2W return descending", () => {
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
      qualifyingStock("low2w", 96),
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
    const replacementSelection = result.events.find((event) => event.eventType === "REPLACEMENT_SELECTED");
    expect(replacementSelection?.details.scheduledBuyDate).toBe("2026-01-07");
    expect(replacementSelection?.details.entryMomentumLabel).toBe("2W");
    expect(replacementSelection?.details.entryMomentumReturn).toBeCloseTo(5.2632, 4);
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

  it("uses D minus 14 calendar days for the 2W entry return", () => {
    const result = simulate(marketWith([qualifyingStock("twoWeeks", 90, { oneWeekClose: 10 })]));

    const buy = result.events.find((event) => event.eventType === "BUY");
    expect(buy?.details.entryMomentumLabel).toBe("2W");
    expect(buy?.details.entryMomentumReturn).toBeCloseTo(11.1111, 4);
    expect((buy?.details.sourceDates as Record<string, { requestedStartDate: string }>).entryMomentum.requestedStartDate).toBe("2025-12-19");
    expect(buy?.details.entryReturn1M).toBeCloseTo(11.1111, 4);
    expect(buy?.details.entryReturn3M).toBeCloseTo(25, 4);
  });

  it("uses the first available comparison close on or after the 2W target date", () => {
    const result = simulate(marketWith([qualifyingStock("shift2w", 90, {
      omitTwoWeekTarget: true,
      extra: [["2025-12-22", 80]],
    })]));

    const buy = result.events.find((event) => event.eventType === "BUY");
    expect(buy?.details.entryMomentumReturn).toBe(25);
    expect((buy?.details.sourceDates as Record<string, { actualStartDate: string }>).entryMomentum.actualStartDate).toBe("2025-12-22");
  });

  it("requires 2W return to be greater than 5%", () => {
    const result = simulate(marketWith([
      qualifyingStock("pass", 94),
      qualifyingStock("fail", 95.2381),
    ]));

    expect(result.positions.map((position) => position.companyId)).toEqual(["pass"]);
  });

  it("still requires 1M, 3M, and ATV filters for entry", () => {
    const result = simulate(marketWith([
      qualifyingStock("pass", 90),
      qualifyingStock("hot1m", 90, { oneMonthClose: 60 }),
      qualifyingStock("hot3m", 90, { threeMonthClose: 50 }),
      qualifyingStock("lowatv", 90, { volume: 0 }),
    ]));

    expect(result.positions.map((position) => position.companyId)).toEqual(["pass"]);
  });

  it("ranks by 2W return instead of 1W return", () => {
    const result = simulate(marketWith([
      qualifyingStock("better1w", 92, { oneWeekClose: 50 }),
      qualifyingStock("better2w", 80, { oneWeekClose: 99 }),
    ]), {
      rules: { maxPositions: 2 },
    });

    expect(result.positions.map((position) => position.companyId)).toEqual(["better2w", "better1w"]);
  });

  it("can rank independently by 1W or 2W entry momentum", () => {
    const market = marketWith([
      qualifyingStock("strong1w", 90, { oneWeekClose: 70 }),
      qualifyingStock("strong2w", 80, { oneWeekClose: 95 }),
    ]);

    const oneWeek = simulate(market, {
      rules: { entryMomentumDays: 7, entryMomentumLabel: "1W", maxPositions: 2 },
    });
    const twoWeek = simulate(market, {
      rules: { entryMomentumDays: 14, entryMomentumLabel: "2W", maxPositions: 2 },
    });

    expect(oneWeek.positions.map((position) => position.companyId)).toEqual(["strong1w", "strong2w"]);
    expect(twoWeek.positions.map((position) => position.companyId)).toEqual(["strong2w", "strong1w"]);
  });

  it("uses D minus 7 calendar days for the 1W entry variant", () => {
    const result = simulate(marketWith([qualifyingStock("oneWeek", 10, { oneWeekClose: 90 })]), {
      rules: { entryMomentumDays: 7, entryMomentumLabel: "1W" },
    });

    const buy = result.events.find((event) => event.eventType === "BUY");
    expect(buy?.details.entryMomentumLabel).toBe("1W");
    expect(buy?.details.entryMomentumReturn).toBeCloseTo(11.1111, 4);
    expect((buy?.details.sourceDates as Record<string, { requestedStartDate: string }>).entryMomentum.requestedStartDate).toBe("2025-12-26");
  });

  it("uses the first available comparison close on or after the 1W target date", () => {
    const result = simulate(marketWith([qualifyingStock("shift1w", 90, {
      omitOneWeekTarget: true,
      extra: [["2025-12-29", 80]],
    })]), {
      rules: { entryMomentumDays: 7, entryMomentumLabel: "1W" },
    });

    const buy = result.events.find((event) => event.eventType === "BUY");
    expect(buy?.details.entryMomentumReturn).toBe(25);
    expect((buy?.details.sourceDates as Record<string, { actualStartDate: string }>).entryMomentum.actualStartDate).toBe("2025-12-29");
  });

  it("requires 1W return to be greater than 5% for the 1W entry variant", () => {
    const result = simulate(marketWith([
      qualifyingStock("pass", 90, { oneWeekClose: 94 }),
      qualifyingStock("fail", 90, { oneWeekClose: 95.2381 }),
    ]), {
      rules: { entryMomentumDays: 7, entryMomentumLabel: "1W" },
    });

    expect(result.positions.map((position) => position.companyId)).toEqual(["pass"]);
  });

  it("uses fresh 1W screening for stop-loss replacements in the 1W entry variant", () => {
    const market = marketWith([
      qualifyingStock("stop", 90, { oneWeekClose: 80, extra: [["2026-01-05", 85], ["2026-01-06", 84], ["2026-01-07", 84]] }),
      qualifyingStock("replacement", 99, { oneWeekClose: 90, extra: [["2025-12-30", 90], ["2026-01-06", 100], ["2026-01-07", 101]] }),
    ]);

    const result = simulate(market, {
      rules: { entryMomentumDays: 7, entryMomentumLabel: "1W", maxPositions: 1 },
    });

    const replacementSelection = result.events.find((event) => event.eventType === "REPLACEMENT_SELECTED");
    expect(replacementSelection?.eventDate).toBe("2026-01-06");
    expect(replacementSelection?.details.entryMomentumLabel).toBe("1W");
    expect(replacementSelection?.details.entryMomentumReturn).toBeCloseTo(11.1111, 4);
  });

  it("uses fresh 1W screening for rank-failure replacements in the 1W entry variant", () => {
    const market = sinceEntryReviewMarket("fail1w", 10, 31, { includeReplacement: true });
    const result = simulate(market, {
      requestedEndDate: day("2026-02-19"),
      rules: { entryMomentumDays: 7, entryMomentumLabel: "1W", maxPositions: 1 },
    });

    const replacementSelection = result.events.find((event) => event.eventType === "REPLACEMENT_SELECTED");
    expect(replacementSelection?.eventDate).toBe("2026-02-03");
    expect(replacementSelection?.details.entryMomentumLabel).toBe("1W");
    expect(replacementSelection?.details.entryMomentumReturn).toBeCloseTo(11.1111, 4);
  });

  it("schedules the first since-entry review one calendar month after entry", () => {
    const result = simulate(sinceEntryReviewMarket("keep", 10, 30), {
      requestedEndDate: day("2026-02-05"),
      rules: { maxPositions: 1 },
    });

    const review = result.events.find((event) => event.eventType === "RANK_REVIEW");
    expect(review?.eventDate).toBe("2026-02-02");
    expect(review?.details.scheduledTargetDate).toBe("2026-02-02");
    expect(review?.details.entryDate).toBe("2026-01-02");
    expect(review?.details.windowCalendarDays).toBe(31);
  });

  it("shifts a non-trading first review target to the first trading day on or after it", () => {
    const result = simulate(sinceEntryReviewMarket("shift", 10, 30, { includeFirstTarget: false }), {
      requestedEndDate: day("2026-02-05"),
      rules: { maxPositions: 1 },
    });

    const review = result.events.find((event) => event.eventType === "RANK_REVIEW");
    expect(review?.eventDate).toBe("2026-02-03");
    expect(review?.details.scheduledTargetDate).toBe("2026-02-02");
  });

  it("schedules subsequent reviews every 15 calendar days without drifting from shifted execution dates", () => {
    const result = simulate(sinceEntryReviewMarket("cadence", 10, 30, {
      includeFirstTarget: false,
      secondReviewTarget: "2026-02-17",
      thirdReviewTarget: "2026-03-04",
    }), {
      requestedEndDate: day("2026-03-06"),
      rules: { maxPositions: 1 },
    });

    const reviews = result.events.filter((event) => event.eventType === "RANK_REVIEW");
    expect(reviews.map((event) => event.details.scheduledTargetDate)).toEqual(["2026-02-02", "2026-02-17", "2026-03-04"]);
    expect(reviews.map((event) => event.eventDate)).toEqual(["2026-02-03", "2026-02-17", "2026-03-04"]);
  });

  it("uses the holding's original entry date as the since-entry comparison start", () => {
    const result = simulate(sinceEntryReviewMarket("window", 20, 30), {
      requestedEndDate: day("2026-02-05"),
      rules: { maxPositions: 1 },
    });

    const review = result.events.find((event) => event.eventType === "RANK_REVIEW");
    expect(review?.details.entryDate).toBe("2026-01-02");
    expect(review?.details.sinceEntryReturn).toBe(20);
  });

  it("ranks every universe stock using the same holding-owned comparison window", () => {
    const result = simulate(sinceEntryReviewMarket("sameWindow", 20, 2, {
      leaders: [
        { id: "leader", comparisonClose: 100, reviewClose: 130 },
        { id: "lateRocket", comparisonClose: 200, reviewClose: 250, oneWeekClose: 95 },
      ],
    }), {
      requestedEndDate: day("2026-02-05"),
      rules: { maxPositions: 1 },
    });

    const review = result.events.find((event) => event.eventType === "RANK_REVIEW");
    expect(review?.details.rank).toBe(3);
    expect(review?.details.validUniverseCount).toBe(3);
  });

  it("keeps rank 30 and fails rank 31", () => {
    const kept = simulate(sinceEntryReviewMarket("rank30", 10, 30), {
      requestedEndDate: day("2026-02-05"),
      rules: { maxPositions: 1 },
    });
    const failed = simulate(sinceEntryReviewMarket("rank31", 10, 31), {
      requestedEndDate: day("2026-02-05"),
      rules: { maxPositions: 1 },
    });

    expect(kept.events.find((event) => event.eventType === "RANK_REVIEW")?.details.decision).toBe("KEEP");
    expect(kept.positions[0]?.status).toBe("OPEN_AT_END");
    expect(failed.events.find((event) => event.eventType === "RANK_REVIEW")?.details.decision).toBe("RANK_FAILURE");
    expect(failed.positions[0]?.exitReason).toBe("RANK_FAILURE");
  });

  it("keeps a weak trailing-1M stock that remains Top-30 since entry", () => {
    const result = simulate(sinceEntryReviewMarket("longWinner", 10, 30, {
      preReviewClose: 105,
      reviewClose: 110,
      leaders: Array.from({ length: 29 }, (_, index) => ({
        id: `leader${index}`,
        comparisonClose: 100,
        preReviewClose: 104,
        reviewClose: 109 - index * 0.01,
      })),
    }), {
      requestedEndDate: day("2026-02-05"),
      rules: { maxPositions: 1 },
    });

    const review = result.events.find((event) => event.eventType === "RANK_REVIEW");
    expect(review?.details.sinceEntryReturn).toBe(10);
    expect(review?.details.rank).toBe(1);
    expect(review?.details.decision).toBe("KEEP");
    expect(result.positions[0]?.status).toBe("OPEN_AT_END");
  });

  it("rank failure preserves T to T+1 sell and T+2 replacement buy timing", () => {
    const market = sinceEntryReviewMarket("fail", 10, 31, { includeReplacement: true });
    const result = simulate(market, {
      requestedEndDate: day("2026-02-19"),
      rules: { maxPositions: 1 },
    });

    expect(result.events.find((event) => event.eventType === "RANK_FAILURE")?.eventDate).toBe("2026-02-02");
    expect(result.events.find((event) => event.eventType === "SELL")?.eventDate).toBe("2026-02-03");
    const replacementSelection = result.events.find((event) => event.eventType === "REPLACEMENT_SELECTED");
    expect(replacementSelection?.eventDate).toBe("2026-02-03");
    expect(replacementSelection?.details.entryMomentumLabel).toBe("2W");
    expect(replacementSelection?.details.entryMomentumReturn).toBeCloseTo(11.1111, 4);
    expect(result.positions.find((position) => position.companyId === "replacement")?.entryDate).toBe("2026-02-04");
  });

  it("keeps stop-loss priority over a due rank review", () => {
    const result = simulate(sinceEntryReviewMarket("stopFirst", 10, 31, {
      reviewClose: 84,
      includeReplacement: true,
    }), {
      requestedEndDate: day("2026-02-19"),
      rules: { maxPositions: 1 },
    });

    expect(result.events.find((event) => event.eventType === "STOP_TRIGGERED")?.eventDate).toBe("2026-02-02");
    expect(result.events.some((event) => event.eventType === "RANK_REVIEW" && event.companyId === "stopFirst")).toBe(false);
    expect(result.positions.find((position) => position.companyId === "stopFirst")?.exitReason).toBe("STOP_LOSS");
  });

  it("excludes missing-history universe stocks from since-entry ranking without crashing", () => {
    const result = simulate(sinceEntryReviewMarket("missingUniverse", 10, 1, {
      leaders: [{ id: "missing", comparisonClose: null, reviewClose: null }],
    }), {
      requestedEndDate: day("2026-02-18"),
      rules: { maxPositions: 1 },
    });

    const review = result.events.find((event) => event.eventType === "RANK_REVIEW");
    expect(review?.details.validUniverseCount).toBe(1);
    expect(review?.details.rank).toBe(1);
    expect(result.positions[0]?.status).toBe("OPEN_AT_END");
  });

  it("uses actual trading dates for weekend requests", () => {
    const result = simulate(marketWith([qualifyingStock("weekend", 90)]), {
      requestedStartDate: day("2026-01-03"),
      requestedEndDate: day("2026-01-10"),
    });

    expect(result.effectiveStartDate).toBe("2026-01-05");
    expect(result.effectiveEndDate).toBe("2026-01-09");
  });

  it("shifts the effective start forward until required 3-month lookback exists", () => {
    const result = simulate(marketWith([{
      candidate: candidate("lookback"),
      prices: [
        price("lookback-i", "2025-09-08", 80),
        price("lookback-i", "2025-11-10", 90),
        price("lookback-i", "2025-12-01", 90),
        price("lookback-i", "2025-12-08", 100),
        price("lookback-i", "2025-12-09", 100),
        price("lookback-i", "2025-12-10", 100),
      ],
    }]), {
      requestedStartDate: day("2025-12-01"),
      requestedEndDate: day("2025-12-10"),
      rules: { maxPositions: 1 },
    });

    expect(result.effectiveStartDate).toBe("2025-12-08");
    expect(result.positions[0]?.entryDate).toBe("2025-12-08");
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

  it("calculates entry-to-end return for a closed STOP_LOSS position without using exit price", () => {
    const result = simulate(marketWith([
      qualifyingStock("stop", 90, {
        extra: [["2026-01-05", 85], ["2026-01-06", 83], ["2026-01-09", 140]],
      }),
    ]), { requestedEndDate: day("2026-01-09") });
    const position = result.positions.find((item) => item.exitReason === "STOP_LOSS");

    expect(position?.realizedReturnPercent).not.toBe(40);
    expect(annotatedReturn(position, 140)).toBe(40);
  });

  it("keeps the existing if-held-to-end metric correct for a closed rank-failure position", () => {
    const result = simulate(sinceEntryReviewMarket("fail", 10, 31, { includeReplacement: true }), {
      requestedEndDate: day("2026-02-19"),
      rules: { maxPositions: 1 },
    });
    const position = result.positions.find((item) => item.exitReason === "RANK_FAILURE" && item.companyId === "fail");

    expect(position?.realizedReturnPercent).toBe(10);
    expect(annotatedReturn(position, 125)).toBe(25);
  });

  it("calculates entry-to-end return for an OPEN_AT_END position", () => {
    const result = simulate(marketWith([
      qualifyingStock("open", 90, { extra: [["2026-01-09", 130]] }),
    ]), { requestedEndDate: day("2026-01-09") });
    const position = result.positions.find((item) => item.status === "OPEN_AT_END");

    expect(annotatedReturn(position, 130)).toBe(30);
  });

  it("returns null when no end-date price exists after the position entry", () => {
    const result = simulate(marketWith([qualifyingStock("missingEnd", 90)]), {
      requestedEndDate: day("2026-01-09"),
    });
    const position = result.positions[0];
    if (!position) throw new Error("Expected a position.");

    const [annotated] = annotateReturnIfHeldToEndPercent({
      positions: [{
        id: position.clientId,
        instrumentId: position.instrumentId,
        entryDate: day("2026-01-10"),
        entryPrice: position.entryPrice,
      }],
      prices: [{ instrumentId: position.instrumentId, tradingDate: day("2026-01-09"), close: 140 }],
    });

    expect(annotated?.returnIfHeldToEndPercent).toBeNull();
  });

  it("does not alter strategy accounting when deriving if-held-to-end returns", () => {
    const result = simulate(marketWith([
      qualifyingStock("stop", 90, {
        extra: [["2026-01-05", 85], ["2026-01-06", 83], ["2026-01-09", 140]],
      }),
      qualifyingStock("replacement", 95, { extra: [["2026-01-06", 100], ["2026-01-09", 130]] }),
    ]), {
      requestedEndDate: day("2026-01-09"),
      rules: { maxPositions: 1 },
    });
    const accounting = {
      totalReturnPercent: result.totalReturnPercent,
      endingValue: result.endingValue,
      tradeCount: result.tradeCount,
      events: result.events.map((event) => event.eventType),
      positions: result.positions.map((position) => ({
        companyId: position.companyId,
        status: position.status,
        exitReason: position.exitReason,
        realizedReturnPercent: position.realizedReturnPercent,
      })),
    };

    annotateReturnIfHeldToEndPercent({
      positions: result.positions.map((position) => ({
        id: position.clientId,
        instrumentId: position.instrumentId,
        entryDate: day(position.entryDate),
        entryPrice: position.entryPrice,
      })),
      prices: result.positions.map((position) => ({
        instrumentId: position.instrumentId,
        tradingDate: day(result.effectiveEndDate),
        close: position.entryPrice * 1.4,
      })),
    });

    expect({
      totalReturnPercent: result.totalReturnPercent,
      endingValue: result.endingValue,
      tradeCount: result.tradeCount,
      events: result.events.map((event) => event.eventType),
      positions: result.positions.map((position) => ({
        companyId: position.companyId,
        status: position.status,
        exitReason: position.exitReason,
        realizedReturnPercent: position.realizedReturnPercent,
      })),
    }).toEqual(accounting);
  });
});

function annotatedReturn(position: { readonly clientId: string; readonly instrumentId: string; readonly entryDate: string; readonly entryPrice: number } | undefined, endPrice: number) {
  if (!position) throw new Error("Expected a position.");
  const [annotated] = annotateReturnIfHeldToEndPercent({
    positions: [{
      id: position.clientId,
      instrumentId: position.instrumentId,
      entryDate: day(position.entryDate),
      entryPrice: position.entryPrice,
    }],
    prices: [{ instrumentId: position.instrumentId, tradingDate: day("2026-12-31"), close: endPrice }],
  });

  return annotated?.returnIfHeldToEndPercent ?? null;
}

function simulateMomentum(
  market: { readonly candidates: HistoricalRunnerCandidate[]; readonly prices: HistoricalRunnerPrice[] },
  options: {
    readonly requestedStartDate?: Date;
    readonly requestedEndDate?: Date;
    readonly rules?: Partial<Momentum10HistoricalRules>;
  } = {},
) {
  return simulateMomentum10Historical({
    requestedStartDate: options.requestedStartDate ?? day("2026-01-02"),
    requestedEndDate: options.requestedEndDate ?? day("2026-02-20"),
    candidates: market.candidates,
    prices: market.prices,
    rules: { minAverageTradedValue: 1, ...options.rules },
  });
}

function simulate(
  market: { readonly candidates: HistoricalRunnerCandidate[]; readonly prices: HistoricalRunnerPrice[] },
  options: {
    readonly requestedStartDate?: Date;
    readonly requestedEndDate?: Date;
    readonly rules?: Partial<EarlySuperstarsRules>;
  } = {},
) {
  return simulateEarlySuperstarsHistorical({
    requestedStartDate: options.requestedStartDate ?? day("2026-01-02"),
    requestedEndDate: options.requestedEndDate ?? day("2026-01-09"),
    candidates: market.candidates,
    prices: market.prices,
    rules: { minAverageTradedValue: 1, maxPositions: options.rules?.maxPositions ?? 10, ...options.rules },
  });
}

function marketWith(stocks: ReturnType<typeof qualifyingStock>[]) {
  return {
    candidates: stocks.map((stock) => stock.candidate),
    prices: stocks.flatMap((stock) => stock.prices).sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime()),
  };
}

function momentumMarketWith(stocks: ReturnType<typeof momentumStock>[]) {
  return {
    candidates: stocks.map((stock) => stock.candidate),
    prices: stocks.flatMap((stock) => stock.prices).sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime()),
  };
}

function momentumStock(
  id: string,
  oneMonthReturn: number,
  options: {
    readonly threeMonthClose?: number;
    readonly reviewClose?: number;
    readonly reviewThreeMonthClose?: number;
    readonly secondReviewClose?: number;
    readonly volume?: number;
    readonly extra?: [string, number][];
  } = {},
) {
  const instrumentId = `${id}-i`;
  const volume = options.volume ?? 1000;
  const entryClose = 100;
  const oneMonthClose = entryClose / (1 + oneMonthReturn / 100);
  const reviewClose = options.reviewClose ?? 120;
  const secondReviewClose = options.secondReviewClose ?? reviewClose;
  return {
    candidate: candidate(id),
    prices: [
      price(instrumentId, "2025-10-02", options.threeMonthClose ?? 60, volume),
      price(instrumentId, "2025-11-03", options.reviewThreeMonthClose ?? 70, volume),
      price(instrumentId, "2025-11-17", options.reviewThreeMonthClose ?? 70, volume),
      price(instrumentId, "2025-12-02", oneMonthClose, volume),
      price(instrumentId, "2026-01-02", entryClose, volume),
      price(instrumentId, "2026-01-05", entryClose, volume),
      price(instrumentId, "2026-01-20", entryClose, volume),
      price(instrumentId, "2026-02-02", reviewClose, volume),
      price(instrumentId, "2026-02-03", reviewClose, volume),
      price(instrumentId, "2026-02-16", secondReviewClose, volume),
      price(instrumentId, "2026-02-17", secondReviewClose, volume),
      price(instrumentId, "2026-02-18", secondReviewClose, volume),
      price(instrumentId, "2026-02-20", secondReviewClose, volume),
      ...(options.extra ?? []).map(([date, close]) => price(instrumentId, date, close, volume)),
    ],
  };
}

function momentumReviewMarket(
  id: string,
  heldOneMonthReturn: number,
  targetRank: number,
  options: {
    readonly includeReplacement?: boolean;
    readonly secondReviewClose?: number;
  } = {},
) {
  const held = momentumStock(id, 10, {
    reviewClose: 100 * (1 + heldOneMonthReturn / 100),
    secondReviewClose: options.secondReviewClose,
  });
  const leaders = Array.from({ length: Math.max(targetRank - 1, 0) }, (_, index) =>
    momentumStock(`leader${index}`, 10, {
      reviewClose: 100 * (1 + (heldOneMonthReturn + targetRank - index) / 100),
    }),
  );
  const replacement = options.includeReplacement
    ? [momentumReplacementStock()]
    : [];
  return momentumMarketWith([held, ...leaders, ...replacement]);
}

function momentumReplacementStock() {
  const instrumentId = "replacement-i";
  return {
    candidate: candidate("replacement"),
    prices: [
      price(instrumentId, "2025-10-02", 60),
      price(instrumentId, "2025-11-03", 70),
      price(instrumentId, "2025-11-17", 70),
      price(instrumentId, "2025-12-02", 99),
      price(instrumentId, "2026-01-02", 100),
      price(instrumentId, "2026-01-05", 100),
      price(instrumentId, "2026-02-02", 105),
      price(instrumentId, "2026-02-03", 105),
      price(instrumentId, "2026-02-16", 105),
      price(instrumentId, "2026-02-20", 105),
    ],
  };
}

function qualifyingStock(
  id: string,
  twoWeekClose: number,
  options: {
    readonly oneWeekClose?: number;
    readonly oneMonthClose?: number;
    readonly threeMonthClose?: number;
    readonly volume?: number;
    readonly omitThreeMonth?: boolean;
    readonly omitTwoWeekTarget?: boolean;
    readonly omitOneWeekTarget?: boolean;
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
      ...(options.omitTwoWeekTarget ? [] : [price(instrumentId, "2025-12-19", twoWeekClose, volume)]),
      ...(options.omitOneWeekTarget ? [] : [price(instrumentId, "2025-12-26", options.oneWeekClose ?? twoWeekClose, volume)]),
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

function sinceEntryReviewMarket(
  id: string,
  heldReturn: number,
  targetRank: number,
  options: {
    readonly includeFirstTarget?: boolean;
    readonly secondReviewTarget?: string;
    readonly thirdReviewTarget?: string;
    readonly includeReplacement?: boolean;
    readonly preReviewClose?: number;
    readonly reviewClose?: number;
    readonly leaders?: {
      readonly id: string;
      readonly comparisonClose: number | null;
      readonly preReviewClose?: number;
      readonly reviewClose: number | null;
      readonly oneWeekClose?: number;
    }[];
  } = {},
) {
  const includeFirstTarget = options.includeFirstTarget ?? true;
  const reviewClose = options.reviewClose ?? 100 + heldReturn;
  const held = qualifyingStock(id, 90, {
    extra: [
      ...(options.preReviewClose ? [["2026-01-30", options.preReviewClose] as [string, number]] : []),
      ...(includeFirstTarget ? [["2026-02-02", reviewClose] as [string, number]] : []),
      ["2026-02-03", reviewClose],
      ["2026-02-04", reviewClose],
      ["2026-02-05", reviewClose],
      ["2026-02-17", reviewClose + 5],
      ["2026-02-18", reviewClose + 5],
      ["2026-02-19", reviewClose + 5],
      ...(options.secondReviewTarget ? [[options.secondReviewTarget, reviewClose + 5] as [string, number]] : []),
      ...(options.thirdReviewTarget ? [[options.thirdReviewTarget, reviewClose + 10] as [string, number]] : []),
      ["2026-03-04", reviewClose + 10],
      ["2026-03-05", reviewClose + 10],
      ["2026-03-06", reviewClose + 10],
      ["2026-03-20", reviewClose + 10],
    ],
  });
  const leaders = options.leaders
    ? options.leaders.map((leader) => reviewLeader(leader.id, { ...leader, includeFirstTarget }))
    : Array.from({ length: Math.max(targetRank - 1, 0) }, (_, index) => reviewLeader(`leader${index}`, {
        comparisonClose: 100,
        reviewClose: reviewClose + targetRank - index,
        includeFirstTarget,
      }));
  const replacement = options.includeReplacement
    ? [qualifyingStock("replacement", 95, { extra: [["2026-01-20", 90], ["2026-01-27", 90], ["2026-02-03", 100], ["2026-02-04", 101], ["2026-02-05", 101]] })]
    : [];
  return marketWith([held, ...leaders, ...replacement]);
}

function reviewLeader(
  id: string,
  options: {
    readonly comparisonClose: number | null;
    readonly preReviewClose?: number;
    readonly reviewClose: number | null;
    readonly oneWeekClose?: number;
    readonly includeFirstTarget?: boolean;
  },
) {
  return {
    candidate: candidate(id),
    prices: [
      price(`${id}-i`, "2025-10-02", 80),
      price(`${id}-i`, "2025-12-02", 90),
      price(`${id}-i`, "2025-12-19", 90),
      price(`${id}-i`, "2025-12-26", options.oneWeekClose ?? 90),
      ...(options.comparisonClose === null ? [] : [price(`${id}-i`, "2026-01-02", options.comparisonClose)]),
      ...(options.preReviewClose ? [price(`${id}-i`, "2026-01-30", options.preReviewClose)] : []),
      ...(options.reviewClose === null ? [] : [
        ...(options.includeFirstTarget === false ? [] : [price(`${id}-i`, "2026-02-02", options.reviewClose)]),
        price(`${id}-i`, "2026-02-03", options.reviewClose),
        price(`${id}-i`, "2026-02-04", options.reviewClose),
        price(`${id}-i`, "2026-02-05", options.reviewClose),
        price(`${id}-i`, "2026-02-17", options.reviewClose + 5),
        price(`${id}-i`, "2026-03-04", options.reviewClose + 10),
        price(`${id}-i`, "2026-03-05", options.reviewClose + 10),
        price(`${id}-i`, "2026-03-06", options.reviewClose + 10),
        price(`${id}-i`, "2026-03-20", options.reviewClose + 10),
      ]),
    ],
  };
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
