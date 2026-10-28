import { describe, expect, it } from "vitest";

import { annotateReturnIfHeldToEndPercent, rulesForParentNseMomentumVariant, rulesForNseMomentumVariant } from "@/lib/strategies/historical-run-service";
import { nseParentMomentumFullUniverseV9Config, nseParentMomentumSurvivorsV1Config, nseParentMomentumSurvivorsV2Config, nseParentMomentumSurvivorsV3Config, nseMomentumAfter10V2Config, nseMomentumLossProtectionV1Config, nseMomentumLossProtectionV2Config, nseMomentumLossProtectionV3Config, nseMomentumLossProtectionV4Config, nseMomentumLossProtectionV5Config, nseMomentumLossProtectionV6Config, nseMomentumLossProtectionV7Config, nseMomentumRawSixTwelveV3Config, nseMomentumSixTwelveV3Config, nseMomentumStrengthV2Config, nseMomentumTwoPhaseV1Config, nseMomentumTwoPhaseV2Config, nseMomentumTwoPhaseV3Config, nseMomentumWinnersV7Config, nseMomentumWinnersV8Config, nseMomentumWinnersV9Config, nseMomentumWinnersV10Config } from "@/lib/strategies/config";
import {
  simulateMomentum10Historical,
  simulateNseMomentumHistorical,
  simulateParentNseMomentumHistorical,
  simulateEarlySuperstarsHistorical,
  type EarlySuperstarsRules,
  type HistoricalRunnerCandidate,
  type HistoricalRunnerPrice,
  type Momentum10HistoricalRules,
  type NseMomentumHistoricalRules,
  type ParentNseMomentumHistoricalRules,
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

describe("NSE Momentum historical runner", () => {
  it("maps the three drawdown policies and the market-breadth regime policy", () => {
    expect(rulesForNseMomentumVariant("NSE Momentum Loss Protection", nseMomentumLossProtectionV1Config).lossProtection)
      .toMatchObject({ enabled: true, peakDrawdownPercent: 20, reentryMode: "nextCalendarYear" });
    expect(rulesForNseMomentumVariant("NSE Momentum Loss Protection", nseMomentumLossProtectionV2Config).lossProtection)
      .toMatchObject({ enabled: true, peakDrawdownPercent: 20, reentryMode: "cooldownMonths", cooldownMonths: 3 });
    expect(rulesForNseMomentumVariant("NSE Momentum Loss Protection", nseMomentumLossProtectionV3Config).lossProtection)
      .toMatchObject({ enabled: true, peakDrawdownPercent: 20, reentryMode: "marketBreadth200Day", cooldownMonths: 1, recoveryLookbackSessions: 200, recoveryBreadthPercent: 50 });
    expect(rulesForNseMomentumVariant("NSE Momentum Loss Protection", nseMomentumLossProtectionV4Config).lossProtection)
      .toMatchObject({ enabled: true, exitMode: "marketBreadth200Day", reentryMode: "marketBreadth200Day", cooldownMonths: 0, recoveryLookbackSessions: 200, recoveryBreadthPercent: 50 });
    expect(rulesForNseMomentumVariant("NSE Momentum Loss Protection", nseMomentumLossProtectionV5Config).lossProtection)
      .toMatchObject({ enabled: true, exitMode: "peakDrawdown", peakDrawdownPercent: 20, liquidationPercent: 50, reentryMode: "marketBreadth200Day", cooldownMonths: 1, recoveryLookbackSessions: 200, recoveryBreadthPercent: 50 });
    expect(rulesForNseMomentumVariant("NSE Momentum Loss Protection", nseMomentumLossProtectionV6Config).lossProtection)
      .toMatchObject({ enabled: true, exitMode: "peakDrawdown", peakDrawdownPercent: 25, drawdownReference: "initialCapital", liquidationPercent: 100, maxTriggers: 1, reentryMode: "marketBreadth200Day", cooldownMonths: 0, recoveryLookbackSessions: 200, recoveryBreadthPercent: 50, recoveryConfirmationSessions: 5 });
    expect(rulesForNseMomentumVariant("NSE Momentum Loss Protection", nseMomentumLossProtectionV7Config).lossProtection)
      .toMatchObject({ enabled: true, exitMode: "peakDrawdown", peakDrawdownPercent: 25, drawdownReference: "initialCapital", liquidationPercent: 100, maxTriggers: 1, reentryMode: "marketBreadth200Day", cooldownMonths: 6, recoveryLookbackSessions: 200, recoveryBreadthPercent: 50, recoveryConfirmationSessions: 5 });
  });

  it("applies V6's initial-capital loss protection once and requires five breadth-positive sessions", () => {
    const instrumentId = "one-shot-protected-i";
    const prices = dateKeys("2025-01-02", "2026-05-05").map((date) => {
      const close = date < "2026-02-02" ? 100
        : date < "2026-03-01" ? 74
        : date < "2026-04-01" ? 110
        : 50;
      return price(instrumentId, date, close);
    });
    const result = simulateNseMomentum({ candidates: [candidate("one-shot-protected")], prices }, {
      requestedStartDate: day("2026-01-02"),
      requestedEndDate: day("2026-05-05"),
      rules: {
        ...rulesForNseMomentumVariant("NSE Momentum Loss Protection", nseMomentumLossProtectionV6Config),
        maxPositions: 1,
        maxEntryRank: 1,
        maxNewPositionWeightPercent: null,
        minVolatilityReturnCount: 20,
        rankingMode: "rawAverage",
        skipLikelyUpperCircuitBuys: false,
      },
    });

    const triggers = result.events.filter((event) => event.eventType === "LOSS_PROTECTION_TRIGGERED");
    const reentry = result.events.find((event) => event.eventType === "LOSS_PROTECTION_REENTRY");
    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.eventDate).toBe("2026-02-02");
    expect(triggers[0]?.details).toMatchObject({ drawdownReference: "initialCapital", drawdownBase: 1_000_000, thresholdPercent: 25, triggerNumber: 1, maxTriggers: 1 });
    expect(result.dailyEquity.find((point) => point.date === "2026-03-04")?.openPositionCount).toBe(0);
    expect(reentry?.eventDate).toBe("2026-03-05");
    expect(reentry?.details.recoveryConfirmationSessions).toBe(5);
    expect(result.positions.filter((position) => position.entryDate === "2026-03-05")).toHaveLength(1);
    expect(result.dailyEquity.find((point) => point.date === "2026-04-01")?.totalEquity).toBeLessThan(750_000);
    expect(result.dailyEquity.find((point) => point.date === "2026-04-01")?.openPositionCount).toBe(1);
  });

  it("keeps V7 in cash for six hard months before counting five breadth-positive sessions", () => {
    const instrumentId = "six-month-protected-i";
    const prices = dateKeys("2025-01-02", "2026-09-05").map((date) => {
      const close = date < "2026-02-02" ? 100 : date < "2026-03-01" ? 74 : 110;
      return price(instrumentId, date, close);
    });
    const result = simulateNseMomentum({ candidates: [candidate("six-month-protected")], prices }, {
      requestedStartDate: day("2026-01-02"),
      requestedEndDate: day("2026-09-05"),
      rules: {
        ...rulesForNseMomentumVariant("NSE Momentum Loss Protection", nseMomentumLossProtectionV7Config),
        maxPositions: 1,
        maxEntryRank: 1,
        maxNewPositionWeightPercent: null,
        minVolatilityReturnCount: 20,
        rankingMode: "rawAverage",
        skipLikelyUpperCircuitBuys: false,
      },
    });

    const trigger = result.events.find((event) => event.eventType === "LOSS_PROTECTION_TRIGGERED");
    const reentry = result.events.find((event) => event.eventType === "LOSS_PROTECTION_REENTRY");
    expect(trigger?.eventDate).toBe("2026-02-02");
    expect(result.dailyEquity.find((point) => point.date === "2026-08-01")?.openPositionCount).toBe(0);
    expect(result.dailyEquity.find((point) => point.date === "2026-08-05")?.openPositionCount).toBe(0);
    expect(reentry?.eventDate).toBe("2026-08-06");
    expect(reentry?.details).toMatchObject({ reentryNotBefore: "2026-08-02", recoveryConfirmationSessions: 5 });
  });

  it("uses NSE 200-day breadth as V4's entry, exit, and re-entry regime without waiting for a 20% drawdown", () => {
    const instrumentId = "breadth-i";
    const prices = dateKeys("2025-01-02", "2026-04-05").map((date) => {
      const close = date < "2026-01-02" ? 100 : date < "2026-02-02" ? 101 : date < "2026-04-01" ? 95 : 105;
      return price(instrumentId, date, close);
    });
    const result = simulateNseMomentum({ candidates: [candidate("breadth")], prices }, {
      requestedStartDate: day("2026-01-02"),
      requestedEndDate: day("2026-04-05"),
      rules: {
        ...rulesForNseMomentumVariant("NSE Momentum Loss Protection", nseMomentumLossProtectionV4Config),
        maxPositions: 1,
        maxEntryRank: 1,
        maxNewPositionWeightPercent: null,
        minVolatilityReturnCount: 20,
        rankingMode: "rawAverage",
        skipLikelyUpperCircuitBuys: false,
      },
    });

    const trigger = result.events.find((event) => event.eventType === "LOSS_PROTECTION_TRIGGERED");
    const reentry = result.events.find((event) => event.eventType === "LOSS_PROTECTION_REENTRY");
    expect(trigger?.eventDate).toBe("2026-02-02");
    expect(trigger?.details).toMatchObject({ exitMode: "marketBreadth200Day", marketBreadthPercent: 0, requiredMarketBreadthPercent: 50 });
    expect(result.positions.find((position) => position.exitReason === "MARKET_BREADTH_PROTECTION")?.exitDate).toBe("2026-02-02");
    expect(result.dailyEquity.find((point) => point.date === "2026-03-01")?.openPositionCount).toBe(0);
    expect(reentry?.eventDate).toBe("2026-04-01");
    expect(reentry?.details.recoveryBreadthPercent).toBe(100);
  });

  it("keeps the delayed 50% tranche in cash for exactly one year and combines both five-year sleeves", () => {
    const instrumentId = "two-phase-i";
    const prices = dateKeys("2024-01-02", "2030-01-02").map((date, index) => price(instrumentId, date, 100 + index * 0.05));
    const phasedRules = {
      ...rulesForNseMomentumVariant("NSE Momentum Two-Phase Allocation", nseMomentumTwoPhaseV1Config),
      maxPositions: 1,
      maxEntryRank: 1,
      maxNewPositionWeightPercent: null,
      minVolatilityReturnCount: 20,
      rankingMode: "rawAverage" as const,
      skipLikelyUpperCircuitBuys: false,
    };
    const phased = simulateNseMomentum({ candidates: [candidate("two-phase")], prices }, {
      requestedStartDate: day("2025-01-02"),
      requestedEndDate: day("2030-01-02"),
      rules: phasedRules,
    });
    const fullyInvested = simulateNseMomentum({ candidates: [candidate("two-phase")], prices }, {
      requestedStartDate: day("2025-01-02"),
      requestedEndDate: day("2030-01-02"),
      rules: {
        ...phasedRules,
        capitalDeployment: { enabled: false, initialPercent: 100, delayedPercent: 0, delayMonths: 12 },
      },
    });

    expect(phased.initialCapital).toBe(1_000_000);
    expect(phased.dailyEquity.find((point) => point.date === "2026-01-01")?.cash).toBeCloseTo(500_000, 2);
    expect(phased.dailyEquity.find((point) => point.date === "2026-01-02")?.cash).toBeCloseTo(0, 2);
    expect(phased.events.filter((item) => item.eventType === "INITIAL_SELECTION").map((item) => item.eventDate)).toEqual(["2025-01-02", "2026-01-02"]);
    expect(phased.positions).toHaveLength(2);
    expect(phased.cagrPercent).toBeLessThan(fullyInvested.cagrPercent!);
    expect(phased.assumptions[0]).toContain("50% of total capital starts on 2025-01-02");
  });

  it("starts the V2 delayed sleeve exactly six months after the first sleeve", () => {
    const instrumentId = "two-phase-six-month-i";
    const prices = dateKeys("2024-01-02", "2027-01-02").map((date, index) => price(instrumentId, date, 100 + index * 0.05));
    const result = simulateNseMomentum({ candidates: [candidate("two-phase-six-month")], prices }, {
      requestedStartDate: day("2025-01-02"),
      requestedEndDate: day("2027-01-02"),
      rules: {
        ...rulesForNseMomentumVariant("NSE Momentum Two-Phase Allocation", nseMomentumTwoPhaseV2Config),
        maxPositions: 1,
        maxEntryRank: 1,
        maxNewPositionWeightPercent: null,
        minVolatilityReturnCount: 20,
        rankingMode: "rawAverage" as const,
        skipLikelyUpperCircuitBuys: false,
      },
    });

    expect(result.dailyEquity.find((point) => point.date === "2025-07-01")?.cash).toBeCloseTo(500_000, 2);
    expect(result.dailyEquity.find((point) => point.date === "2025-07-02")?.cash).toBeCloseTo(0, 2);
    expect(result.events.filter((item) => item.eventType === "INITIAL_SELECTION").map((item) => item.eventDate)).toEqual(["2025-01-02", "2025-07-02"]);
    expect(result.positions).toHaveLength(2);
    expect(result.assumptions[0]).toContain("6 months later on 2025-07-02");
  });

  it("uses the previous close as the initial ranking date and records the requested execution date", () => {
    const market = parentNseMomentumMarketWith([
      parentNseMomentumStock("previousLeader", {
        twelveMonthStartClose: 50,
        sixMonthStartClose: 80,
        preFirstRebalanceClose: 100,
        firstRebalanceClose: 60,
        secondRebalanceClose: 60,
      }),
      parentNseMomentumStock("entryDayLeader", {
        twelveMonthStartClose: 70,
        sixMonthStartClose: 90,
        preFirstRebalanceClose: 100,
        firstRebalanceClose: 140,
        secondRebalanceClose: 140,
      }),
    ]);
    const result = simulateNseMomentum(market, {
      requestedStartDate: day("2026-01-02"),
      requestedEndDate: day("2026-01-10"),
      rules: {
        ...rulesForNseMomentumVariant("NSE Momentum", nseMomentumSixTwelveV3Config),
        initialRankingLagSessions: 1,
        maxPositions: 1,
        maxEntryRank: 1,
        maxNewPositionWeightPercent: null,
        minVolatilityReturnCount: 20,
        rankingMode: "rawAverage",
        skipLikelyUpperCircuitBuys: false,
      },
    });

    expect(result.events.find((item) => item.eventType === "INITIAL_SELECTION")?.details).toMatchObject({
      rankingAsOfDate: "2026-01-01",
      executionDate: "2026-01-02",
    });
  });

  it("changes only V2's ranking window to 1M/3M volatility z-scores in two-phase V3", () => {
    const expected = structuredClone(nseMomentumTwoPhaseV2Config);
    delete expected.nseMomentum!.momentumMonths;

    expect(nseMomentumTwoPhaseV3Config).toEqual(expected);
    expect(rulesForNseMomentumVariant("NSE Momentum Two-Phase Allocation", nseMomentumTwoPhaseV3Config)).toMatchObject({
      momentumMonths: undefined,
      rankingMode: "volatilityAdjusted",
      maxPositions: 25,
      maxEntryRank: 25,
      holdingRankThreshold: 50,
      maxNewPositionWeightPercent: 5,
      useAvailableCashForReplacements: true,
      skipLikelyUpperCircuitBuys: true,
      capitalDeployment: {
        enabled: true,
        initialPercent: 50,
        delayedPercent: 50,
        delayMonths: 6,
      },
    });
  });

  it("liquidates at a 20% decline from peak, stays in cash, and re-enters next year", () => {
    const instrumentId = "protected-i";
    const prices = dateKeys("2025-01-02", "2027-01-05").map((date, index) => {
      let close = (date < "2025-07-01" ? 60 : date < "2026-01-02" ? 80 : 100) + (index % 2 === 0 ? 0.2 : -0.2);
      if (date >= "2026-03-02" && date < "2026-04-01") close = 125;
      if (date >= "2026-04-01") close = 95 + (index % 2 === 0 ? 0.2 : -0.2);
      if (date >= "2026-07-01") close = 100 + (index % 2 === 0 ? 0.2 : -0.2);
      return price(instrumentId, date, close);
    });
    const stablePrices = dateKeys("2025-01-02", "2027-01-05").map((date, index) => {
      const close = (date < "2025-07-01" ? 90 : date < "2026-01-02" ? 95 : date < "2026-07-01" ? 100 : 110) + (index % 2 === 0 ? 0.2 : -0.2);
      return price("stable-i", date, close);
    });
    const result = simulateNseMomentum({ candidates: [candidate("protected"), candidate("stable")], prices: [...prices, ...stablePrices] }, {
      requestedStartDate: day("2026-01-02"),
      requestedEndDate: day("2027-01-05"),
      rules: {
        ...rulesForNseMomentumVariant("NSE Momentum Loss Protection", nseMomentumLossProtectionV1Config),
        maxPositions: 1,
        maxEntryRank: 1,
        maxNewPositionWeightPercent: null,
        minVolatilityReturnCount: 20,
        rankingMode: "rawAverage",
        skipLikelyUpperCircuitBuys: false,
      },
    });

    const trigger = result.events.find((event) => event.eventType === "LOSS_PROTECTION_TRIGGERED");
    const reentry = result.events.find((event) => event.eventType === "LOSS_PROTECTION_REENTRY");
    expect(trigger?.eventDate).toBe("2026-04-01");
    expect(trigger?.details.drawdownPercent).toBeLessThanOrEqual(-20);
    expect(result.positions.find((position) => position.exitReason === "DRAWDOWN_PROTECTION")?.exitDate).toBe("2026-04-01");
    expect(result.dailyEquity.find((point) => point.date === "2026-06-01")?.openPositionCount).toBe(0);
    expect(reentry?.eventDate).toBe("2027-01-01");
    expect(result.positions.some((position) => position.entryDate === "2027-01-01" && position.status === "OPEN_AT_END")).toBe(true);
  });

  it("sells half the portfolio at V5's 20% peak drawdown and restores only the reserved half after breadth recovery", () => {
    const instrumentId = "half-protected-i";
    const prices = dateKeys("2025-01-02", "2026-06-05").map((date, index) => {
      let close = date < "2025-07-01" ? 60 : date < "2026-01-02" ? 80 : 100;
      if (date >= "2026-03-02" && date < "2026-04-01") close = 125;
      if (date >= "2026-04-01") close = 95;
      return price(instrumentId, date, close + (index % 2 === 0 ? 0.2 : -0.2));
    });
    const stablePrices = dateKeys("2025-01-02", "2026-06-05").map((date, index) => {
      const close = (date < "2025-07-01" ? 90 : date < "2026-01-02" ? 95 : 100) + (index % 2 === 0 ? 0.2 : -0.2);
      return price("half-stable-i", date, close);
    });
    const result = simulateNseMomentum({ candidates: [candidate("half-protected"), candidate("half-stable")], prices: [...prices, ...stablePrices] }, {
      requestedStartDate: day("2026-01-02"),
      requestedEndDate: day("2026-06-05"),
      rules: {
        ...rulesForNseMomentumVariant("NSE Momentum Loss Protection", nseMomentumLossProtectionV5Config),
        maxPositions: 1,
        maxEntryRank: 1,
        maxNewPositionWeightPercent: null,
        minVolatilityReturnCount: 20,
        rankingMode: "rawAverage",
        skipLikelyUpperCircuitBuys: false,
      },
    });

    const trigger = result.events.find((event) => event.eventType === "LOSS_PROTECTION_TRIGGERED");
    const partialSale = result.events.find((event) => event.eventType === "SELL" && event.details.partial === true);
    const reentry = result.events.find((event) => event.eventType === "LOSS_PROTECTION_REENTRY");
    const restoreBuy = result.events.find((event) => event.eventType === "BUY" && event.details.protectionRestore === true);
    const triggerEquity = result.dailyEquity.find((point) => point.date === "2026-04-01");
    expect(trigger?.eventDate).toBe("2026-04-01");
    expect(trigger?.details.liquidationPercent).toBe(50);
    expect(partialSale?.details).toMatchObject({ liquidationPercent: 50, partial: true });
    expect(triggerEquity?.openPositionCount).toBe(1);
    expect(triggerEquity?.cash).toBeGreaterThan(450_000);
    expect(triggerEquity?.investedValue).toBeGreaterThan(450_000);
    expect(reentry?.eventDate).toBe("2026-05-01");
    expect(reentry?.details.liquidationPercent).toBe(50);
    expect(restoreBuy?.eventDate).toBe("2026-05-01");
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]?.status).toBe("OPEN_AT_END");
    expect(result.dailyEquity.find((point) => point.date === "2026-05-01")?.cash).toBeCloseTo(0, 2);
  });

  it("makes Raw V3 identical to NSE Momentum V3 except for direct raw-average ranking", () => {
    const expected = structuredClone(nseMomentumSixTwelveV3Config);
    expected.nseMomentum!.rankingMode = "rawAverage";
    expect(nseMomentumRawSixTwelveV3Config).toEqual(expected);
    expect(rulesForNseMomentumVariant("NSE Momentum Raw", nseMomentumRawSixTwelveV3Config)).toMatchObject({
      rankingMode: "rawAverage", momentumMonths: [6, 12], maxPositions: 25,
      maxEntryRank: 25, holdingRankThreshold: 50, minBuyReturn1M: null, minBuyReturn3M: null,
    });
  });

  it("ranks Raw V3 by the direct average of 6M and 12M returns without volatility or z-scores", () => {
    const market = parentNseMomentumMarketWith([
      parentNseMomentumStock("highRaw", { twelveMonthStartClose: 50, sixMonthStartClose: 80, firstRebalanceClose: 100, secondRebalanceClose: 100, volatilitySwing: 30 }),
      parentNseMomentumStock("lowerRaw", { twelveMonthStartClose: 70, sixMonthStartClose: 90, firstRebalanceClose: 100, secondRebalanceClose: 100, volatilitySwing: 0.2 }),
    ]);
    const result = simulateNseMomentum(market, {
      rules: { ...rulesForNseMomentumVariant("NSE Momentum Raw", nseMomentumRawSixTwelveV3Config), minVolatilityReturnCount: 20, skipLikelyUpperCircuitBuys: false },
    });
    const buys = result.events.filter(event => event.eventType === "BUY");
    expect(buys.map(event => event.companyId)).toEqual(["highRaw", "lowerRaw"]);
    expect(buys[0]?.details.momentumScore).toBeCloseTo(62.5, 4);
    expect(buys[0]?.details.return6M).toBeCloseTo(25, 4);
    expect(buys[0]?.details.return12M).toBeCloseTo(100, 4);
    expect(buys[0]?.details.annualizedVolatility).toBeNull();
    expect(buys[0]?.details.z6M).toBeNull();
    expect(buys[0]?.details.z12M).toBeNull();
    expect(buys[0]?.details.rankingMode).toBe("rawAverage");
  });
  it("changes only the winner allocation percentage to 20 in V10", () => {
    const expected = structuredClone(nseMomentumWinnersV9Config);
    expected.nseMomentum!.winnerReinvestment!.winnerBudgetPercent = 20;
    expect(nseMomentumWinnersV10Config).toEqual(expected);
    expect(rulesForNseMomentumVariant("NSE Momentum Winners", nseMomentumWinnersV10Config).winnerReinvestment)
      .toEqual({ enabled: true, winnerReturnPercent: 50, winnerBudgetPercent: 20 });
  });
  it("changes only the winner allocation percentage to 30 in V9", () => {
    const expected = structuredClone(nseMomentumWinnersV8Config);
    expected.nseMomentum!.winnerReinvestment!.winnerBudgetPercent = 30;
    expect(nseMomentumWinnersV9Config).toEqual(expected);
    expect(rulesForNseMomentumVariant("NSE Momentum Winners", nseMomentumWinnersV9Config).winnerReinvestment)
      .toEqual({ enabled: true, winnerReturnPercent: 50, winnerBudgetPercent: 30 });
  });
  it("changes only the winner allocation percentage in V8", () => {
    const expected = structuredClone(nseMomentumWinnersV7Config);
    expected.nseMomentum!.winnerReinvestment!.winnerBudgetPercent = 50;
    expect(nseMomentumWinnersV8Config).toEqual(expected);
    expect(rulesForNseMomentumVariant("NSE Momentum Winners", nseMomentumWinnersV8Config).winnerReinvestment)
      .toEqual({ enabled: true, winnerReturnPercent: 50, winnerBudgetPercent: 50 });
  });
  it("adds only the preserved winner allocation to the new 6M/12M Top 25 rules", () => {
    const { winnerReinvestment, ...base } = nseMomentumWinnersV7Config.nseMomentum!;
    expect({ ...nseMomentumWinnersV7Config, nseMomentum: base }).toEqual(nseMomentumSixTwelveV3Config);
    expect(winnerReinvestment).toEqual({ enabled: true, winnerReturnPercent: 50, winnerBudgetPercent: 100 });
    expect(rulesForNseMomentumVariant("NSE Momentum Winners", nseMomentumWinnersV7Config)).toMatchObject({
      momentumMonths: [6, 12], maxPositions: 25, maxEntryRank: 25, holdingRankThreshold: 50,
      winnerReinvestment, maxNewPositionWeightPercent: 5, minBuyReturn1M: null, minBuyReturn3M: null,
    });
  });

  it("uses 6M/12M reviews to allocate all exit proceeds to winners, or replacements when no winner qualifies", () => {
    const run = (winnerPrice: number, config = nseMomentumWinnersV7Config) => simulateNseMomentum(parentNseMomentumMarketWith([
      parentNseMomentumStock("winner", { twelveMonthStartClose: 50, sixMonthStartClose: 80, firstRebalanceClose: 100, secondRebalanceClose: winnerPrice }),
      parentNseMomentumStock("exit", { twelveMonthStartClose: 60, sixMonthStartClose: 85, firstRebalanceClose: 100, secondRebalanceClose: 5 }),
      parentNseMomentumStock("replacement", { twelveMonthStartClose: 100, sixMonthStartClose: 100, firstRebalanceClose: 100, secondRebalanceClose: 130 }),
    ]), {
      requestedEndDate: day("2026-02-02"),
      rules: { ...rulesForNseMomentumVariant("NSE Momentum Winners", config), maxPositions: 2, holdingRankThreshold: 2, minVolatilityReturnCount: 20, skipLikelyUpperCircuitBuys: false, maxNewPositionWeightPercent: null },
    });
    const result = run(160);
    const exited = result.positions.find(p => p.companyId === "exit")!;
    const winner = result.positions.find(p => p.companyId === "winner")!;
    const add = result.events.find(e => e.eventType === "WINNER_REINVESTMENT")!;
    expect(add.details.allocation).toBeCloseTo(exited.quantity * exited.exitPrice!, 2);
    expect(winner.entryDate).toBe("2026-01-02");
    expect(winner.exitDate).toBeNull();
    expect(winner.quantity).toBeGreaterThan(5000);
    expect(result.positions.some(p => p.companyId === "replacement")).toBe(false);
    expect(result.events.find(e => e.eventType === "MONTHLY_REVIEW")?.details.z12M).toEqual(expect.any(Number));
    const noWinner = run(120);
    expect(noWinner.events.some(e => e.eventType === "WINNER_REINVESTMENT")).toBe(false);
    expect(noWinner.positions.find(p => p.companyId === "replacement")?.entryDate).toBe("2026-02-02");
    const half = run(160, nseMomentumWinnersV8Config);
    const halfExit = half.positions.find(p => p.companyId === "exit")!;
    const halfProceeds = halfExit.quantity * halfExit.exitPrice! / 2;
    expect(half.events.find(e => e.eventType === "WINNER_REINVESTMENT")?.details.allocation).toBeCloseTo(halfProceeds, 2);
    expect(half.positions.find(p => p.companyId === "replacement")?.allocation).toBeCloseTo(halfProceeds, 2);
    const halfNoWinner = run(120, nseMomentumWinnersV8Config);
    const noWinnerExit = halfNoWinner.positions.find(p => p.companyId === "exit")!;
    expect(halfNoWinner.positions.find(p => p.companyId === "replacement")?.allocation).toBeCloseTo(noWinnerExit.quantity * noWinnerExit.exitPrice!, 2);
    const thirty = run(160, nseMomentumWinnersV9Config);
    const thirtyExit = thirty.positions.find(p => p.companyId === "exit")!;
    const proceeds = thirtyExit.quantity * thirtyExit.exitPrice!;
    expect(thirty.events.find(e => e.eventType === "WINNER_REINVESTMENT")?.details.allocation).toBeCloseTo(proceeds * 0.3, 2);
    expect(thirty.positions.find(p => p.companyId === "replacement")?.allocation).toBeCloseTo(proceeds * 0.7, 2);
    const thirtyNoWinner = run(120, nseMomentumWinnersV9Config);
    const thirtyNoWinnerExit = thirtyNoWinner.positions.find(p => p.companyId === "exit")!;
    expect(thirtyNoWinner.events.some(e => e.eventType === "WINNER_REINVESTMENT")).toBe(false);
    expect(thirtyNoWinner.positions.find(p => p.companyId === "replacement")?.allocation).toBeCloseTo(thirtyNoWinnerExit.quantity * thirtyNoWinnerExit.exitPrice!, 2);
    const twenty = run(160, nseMomentumWinnersV10Config);
    const twentyExit = twenty.positions.find(p => p.companyId === "exit")!;
    const twentyProceeds = twentyExit.quantity * twentyExit.exitPrice!;
    expect(twenty.events.find(e => e.eventType === "WINNER_REINVESTMENT")?.details.allocation).toBeCloseTo(twentyProceeds * 0.2, 2);
    expect(twenty.positions.find(p => p.companyId === "replacement")?.allocation).toBeCloseTo(twentyProceeds * 0.8, 2);
  });

  it("maps V3 to 6M/12M Top 25 entries and Top 50 retention without short-horizon strength filters", () => {
    const rules = rulesForNseMomentumVariant("NSE Momentum", nseMomentumSixTwelveV3Config);
    expect(rules).toMatchObject({ momentumMonths: [6, 12], maxPositions: 25, maxEntryRank: 25, holdingRankThreshold: 50, minBuyReturn1M: null, minBuyReturn3M: null, applyBuyStrengthFilterOnReview: false, maxNewPositionWeightPercent: 5, useAvailableCashForReplacements: true });
    expect(rulesForNseMomentumVariant("NSE Momentum", nseMomentumStrengthV2Config)).toMatchObject({ maxPositions: 20, maxEntryRank: null, momentumMonths: undefined, minBuyReturn1M: 5, minBuyReturn3M: 50 });
  });

  it("maps NSE Momentum After 10 V2 to rank 1 entries, 30 positions, and Top 60 retention", () => {
    expect(rulesForNseMomentumVariant("NSE Momentum After 10", nseMomentumAfter10V2Config)).toMatchObject({
      skipTopRanks: 0,
      maxPositions: 30,
      holdingRankThreshold: 60,
    });
  });

  it("uses the shared 6M/12M score at entry and review, keeps rank 50, and exits rank 51", () => {
    const market = parentNseMomentumMarketWith(Array.from({ length: 60 }, (_, i) =>
      parentNseMomentumStock(`stock${String(i).padStart(2, "0")}`, {
        twelveMonthStartClose: 40 + i,
        sixMonthStartClose: 60 + i / 2,
        firstRebalanceClose: 100,
        secondRebalanceClose: 105 + i / 3,
      })));
    const end = day("2026-02-02");
    const rules = { ...rulesForNseMomentumVariant("NSE Momentum", nseMomentumSixTwelveV3Config), minVolatilityReturnCount: 20, skipLikelyUpperCircuitBuys: false };
    const parent = simulateParentNseMomentum(market, { requestedEndDate: end, rules: { maxPositions: 60, rebalanceFrequencyMonths: 1, minVolatilityReturnCount: 20 } });
    const all = simulateNseMomentum(market, { requestedEndDate: end, rules: { ...rules, maxPositions: 60, maxEntryRank: 60 } });
    const reference = parent.events.filter(e => e.eventType === "REBALANCE" && e.companyId);
    for (const event of all.events.filter(e => e.eventType === "BUY" || e.eventType === "MONTHLY_REVIEW")) {
      const expected = reference.find(e => e.companyId === event.companyId && e.eventDate === event.eventDate)!;
      expect(expected).toBeDefined();
      expect(event.details.momentumScore).toBe(expected.details.momentumScore);
      expect(event.details.z6M).toBe(expected.details.z6M);
      expect(event.details.z12M).toBe(expected.details.z12M);
    }
    const reviews = all.events.filter(e => e.eventType === "MONTHLY_REVIEW");
    expect(reviews.find(e => e.details.rank === 50)?.details.decision).toBe("KEEP");
    expect(reviews.find(e => e.details.rank === 26)?.details.decision).toBe("KEEP");
    expect(reviews.find(e => e.details.rank === 51)?.details.decision).toBe("RANK_FAILURE");
    const rank50 = reviews.find(e => e.details.rank === 50)!;
    const survivor = all.positions.find(p => p.companyId === rank50.companyId)!;
    expect(survivor.exitDate).toBeNull();
    expect(all.events.filter(e => e.eventType === "BUY" && e.companyId === survivor.companyId)).toHaveLength(1);

    const capped = simulateNseMomentum(market, { requestedEndDate: end, rules });
    expect(capped.initialPositionCount).toBe(25);
    expect(capped.dailyEquity.every(e => e.openPositionCount <= 25)).toBe(true);
    expect(capped.positions.every(p => p.entryRank! <= 25)).toBe(true);
  });

  it("fills V3 vacancies from the next executable ranks after the preferred top 25", () => {
    const market = parentNseMomentumMarketWith(Array.from({ length: 30 }, (_, i) =>
      parentNseMomentumStock(`entry${i}`, { twelveMonthStartClose: 40 + i, sixMonthStartClose: 60 + i, firstRebalanceClose: 100, secondRebalanceClose: 110 })));
    const rules = { ...rulesForNseMomentumVariant("NSE Momentum", nseMomentumSixTwelveV3Config), minVolatilityReturnCount: 20, skipLikelyUpperCircuitBuys: false, skipTopRanks: 25 };
    const result = simulateNseMomentum(market, { rules });
    expect(result.initialPositionCount).toBe(5);
    expect(result.positions.slice(0, 5).map(position => position.entryRank)).toEqual([26, 27, 28, 29, 30]);
  });

  it("ranks by volatility-adjusted cross-sectional z-score momentum instead of raw returns", () => {
    const result = simulateNseMomentum(nseMomentumMarketWith([
      nseMomentumStock("highRawHighVol", {
        oneMonthStartClose: 80,
        threeMonthStartClose: 70,
        endClose: 100,
        volatilitySwing: 30,
      }),
      nseMomentumStock("steadyLeader", {
        oneMonthStartClose: 90,
        threeMonthStartClose: 85,
        endClose: 100,
        volatilitySwing: 0.2,
      }),
      nseMomentumStock("steadyLag", {
        oneMonthStartClose: 98,
        threeMonthStartClose: 97,
        endClose: 100,
        volatilitySwing: 0.2,
      }),
    ]), { rules: { maxPositions: 2, minVolatilityReturnCount: 20 } });

    expect(result.positions.map((position) => position.companyId)).toEqual(["steadyLeader", "steadyLag"]);
    expect(result.positions.some((position) => position.companyId === "highRawHighVol")).toBe(false);
    expect(result.events.find((event) => event.companyId === "steadyLeader" && event.eventType === "BUY")?.details.momentumScore).toBeGreaterThan(0);
  });

  it("can rank NSE Momentum by raw 1M and 3M returns without volatility adjustment", () => {
    const market = nseMomentumMarketWith([
      nseMomentumStock("highRawHighVol", {
        oneMonthStartClose: 80,
        threeMonthStartClose: 70,
        endClose: 100,
        volatilitySwing: 30,
      }),
      nseMomentumStock("steadyLeader", {
        oneMonthStartClose: 90,
        threeMonthStartClose: 85,
        endClose: 100,
        volatilitySwing: 0.2,
      }),
      nseMomentumStock("steadyLag", {
        oneMonthStartClose: 98,
        threeMonthStartClose: 97,
        endClose: 100,
        volatilitySwing: 0.2,
      }),
    ]);

    const raw = simulateNseMomentum(market, {
      rules: { maxPositions: 1, minVolatilityReturnCount: 20, rankingMode: "rawReturns" },
    });
    const adjusted = simulateNseMomentum(market, {
      rules: { maxPositions: 1, minVolatilityReturnCount: 20, rankingMode: "volatilityAdjusted" },
    });

    expect(raw.positions.map((position) => position.companyId)).toEqual(["highRawHighVol"]);
    expect(adjusted.positions.map((position) => position.companyId)).toEqual(["steadyLeader"]);
    expect(raw.events.find((event) => event.companyId === "highRawHighVol" && event.eventType === "BUY")?.details.annualizedVolatility).toBe(0);
  });

  it("can rank NSE Momentum by direct raw return average without z-score normalization", () => {
    const market = nseMomentumMarketWith([
      nseMomentumStock("strong3m", {
        oneMonthStartClose: 99,
        threeMonthStartClose: 60,
        endClose: 100,
        volatilitySwing: 0.2,
      }),
      nseMomentumStock("balanced", {
        oneMonthStartClose: 80,
        threeMonthStartClose: 80,
        endClose: 100,
        volatilitySwing: 0.2,
      }),
      nseMomentumStock("low", {
        oneMonthStartClose: 98,
        threeMonthStartClose: 98,
        endClose: 100,
        volatilitySwing: 0.2,
      }),
    ]);

    const result = simulateNseMomentum(market, {
      rules: { maxPositions: 1, minVolatilityReturnCount: 20, rankingMode: "rawAverage" },
    });
    const buy = result.events.find((event) => event.companyId === "strong3m" && event.eventType === "BUY");

    expect(result.positions.map((position) => position.companyId)).toEqual(["strong3m"]);
    expect(buy?.details.momentumScore).toBeCloseTo(33.8384, 4);
    expect(buy?.details.z1M).toBeCloseTo(1.0101, 4);
    expect(buy?.details.z3M).toBeCloseTo(66.6667, 4);
  });

  it("does not stop-loss and replaces only at the common monthly review using exit proceeds", () => {
    const result = simulateNseMomentum(nseMomentumMarketWith([
      nseMomentumStock("initialLeader", {
        oneMonthStartClose: 90,
        threeMonthStartClose: 85,
        endClose: 100,
        reviewOneMonthStartClose: 100,
        reviewThreeMonthStartClose: 100,
        reviewClose: 50,
        volatilitySwing: 0.2,
      }),
      nseMomentumStock("replacement", {
        oneMonthStartClose: 98,
        threeMonthStartClose: 97,
        endClose: 100,
        reviewOneMonthStartClose: 90,
        reviewThreeMonthStartClose: 85,
        reviewClose: 120,
        volatilitySwing: 0.2,
      }),
    ]), {
      requestedEndDate: day("2026-02-05"),
      rules: { maxPositions: 1, holdingRankThreshold: 1, minVolatilityReturnCount: 20 },
    });

    expect(result.events.some((event) => event.eventType === "STOP_TRIGGERED")).toBe(false);
    expect(result.events.find((event) => event.eventType === "MONTHLY_REVIEW")?.eventDate).toBe("2026-02-02");
    expect(result.positions.find((position) => position.companyId === "initialLeader")?.exitReason).toBe("MONTHLY_RANK_FAILURE");
    const replacement = result.positions.find((position) => position.companyId === "replacement");
    expect(replacement?.entryDate).toBe("2026-02-02");
    expect(replacement?.allocation).toBeCloseTo(500_000, 4);
  });

  it("reinvests part of review exit proceeds into qualified winners before buying replacements", () => {
    const result = simulateNseMomentum(nseMomentumMarketWith([
      nseMomentumStock("winner", {
        oneMonthStartClose: 90,
        threeMonthStartClose: 85,
        endClose: 100,
        reviewOneMonthStartClose: 100,
        reviewThreeMonthStartClose: 95,
        reviewClose: 160,
        volatilitySwing: 0.2,
      }),
      nseMomentumStock("loser", {
        oneMonthStartClose: 91,
        threeMonthStartClose: 86,
        endClose: 100,
        reviewOneMonthStartClose: 100,
        reviewThreeMonthStartClose: 100,
        reviewClose: 50,
        volatilitySwing: 0.2,
      }),
      nseMomentumStock("replacement", {
        oneMonthStartClose: 99,
        threeMonthStartClose: 98,
        endClose: 100,
        reviewOneMonthStartClose: 90,
        reviewThreeMonthStartClose: 85,
        reviewClose: 120,
        volatilitySwing: 0.2,
      }),
    ]), {
      requestedEndDate: day("2026-02-05"),
      rules: {
        maxPositions: 2,
        holdingRankThreshold: 2,
        minVolatilityReturnCount: 20,
        winnerReinvestment: {
          enabled: true,
          winnerReturnPercent: 50,
          winnerBudgetPercent: 100,
        },
      },
    });

    const winnerAdd = result.events.find((event) => event.eventType === "WINNER_REINVESTMENT");
    const replacement = result.positions.find((position) => position.companyId === "replacement");
    const winner = result.positions.find((position) => position.companyId === "winner");

    expect(result.positions.find((position) => position.companyId === "loser")?.exitReason).toBe("MONTHLY_RANK_FAILURE");
    expect(winnerAdd?.companyId).toBe("winner");
    expect(winnerAdd?.details.allocation).toBeCloseTo(250_000, 4);
    expect(winnerAdd?.details.winnerReturnPercent).toBeCloseTo(60, 4);
    expect(replacement).toBeUndefined();
    expect(winner?.allocation).toBeCloseTo(750_000, 4);
    expect(winner?.entryPrice).toBeCloseTo(114.2857, 4);
  });

  it("waits to top up an upper-circuit winner instead of sending winner proceeds to replacements", () => {
    const result = simulateNseMomentum(nseMomentumMarketWith([
      nseMomentumStock("winner", {
        oneMonthStartClose: 90,
        threeMonthStartClose: 85,
        endClose: 100,
        reviewOneMonthStartClose: 100,
        reviewThreeMonthStartClose: 95,
        reviewClose: 160,
        volatilitySwing: 0.2,
        extra: [["2026-02-01", 152.38], ["2026-02-02", 160, { high: 160, low: 160 }]],
      }),
      nseMomentumStock("loser", {
        oneMonthStartClose: 91,
        threeMonthStartClose: 86,
        endClose: 100,
        reviewOneMonthStartClose: 100,
        reviewThreeMonthStartClose: 100,
        reviewClose: 50,
        volatilitySwing: 0.2,
      }),
      nseMomentumStock("replacement", {
        oneMonthStartClose: 99,
        threeMonthStartClose: 98,
        endClose: 100,
        reviewOneMonthStartClose: 90,
        reviewThreeMonthStartClose: 85,
        reviewClose: 120,
        volatilitySwing: 0.2,
      }),
    ]), {
      requestedEndDate: day("2026-02-05"),
      rules: {
        maxPositions: 2,
        holdingRankThreshold: 2,
        minVolatilityReturnCount: 20,
        winnerReinvestment: {
          enabled: true,
          winnerReturnPercent: 50,
          winnerBudgetPercent: 100,
        },
      },
    });

    const winnerAdd = result.events.find((event) => event.eventType === "WINNER_REINVESTMENT");
    const winnerSkip = result.events.find((event) =>
      event.eventType === "BUY_SKIPPED_UPPER_CIRCUIT" &&
      event.companyId === "winner" &&
      event.details.source === "WINNER_REINVESTMENT"
    );
    const replacement = result.positions.find((position) => position.companyId === "replacement");
    const winner = result.positions.find((position) => position.companyId === "winner");

    expect(winnerAdd?.eventDate).toBe("2026-02-03");
    expect(winnerAdd?.details.allocation).toBeCloseTo(250_000, 4);
    expect(winnerSkip?.details.winnerReturnPercent).toBeCloseTo(60, 4);
    expect(winnerSkip?.details.pendingAllocation).toBeCloseTo(250_000, 4);
    expect(replacement).toBeUndefined();
    expect(winner?.allocation).toBeCloseTo(750_000, 4);
  });

  it("can skip the first 10 ranks and buy the next available 20", () => {
    const result = simulateNseMomentum(nseMomentumMarketWith(
      Array.from({ length: 35 }, (_, index) => nseMomentumStock(`rank${index + 1}`, {
        oneMonthStartClose: 50 + index,
        threeMonthStartClose: 45 + index,
        endClose: 100,
        volatilitySwing: 0.2,
      })),
    ), { rules: { maxPositions: 20, minVolatilityReturnCount: 20, skipTopRanks: 10 } });

    expect(result.positions).toHaveLength(20);
    expect(result.positions.map((position) => position.entryRank)).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    ]);
  });

  it("skips candidates that touch an inferred upper-circuit band and takes the next ranked stock", () => {
    const upperCircuitLeader = nseMomentumStock("upperCircuitLeader", {
      oneMonthStartClose: 60,
      threeMonthStartClose: 50,
      endClose: 104,
      volatilitySwing: 0.2,
      extra: [["2026-01-01", 100, { high: 100, low: 100 }], ["2026-01-02", 104, { high: 105, low: 98 }]],
    });
    const nextAvailable = nseMomentumStock("nextAvailable", {
      oneMonthStartClose: 99,
      threeMonthStartClose: 98,
      endClose: 100,
      volatilitySwing: 0.2,
    });
    const result = simulateNseMomentum(nseMomentumMarketWith([upperCircuitLeader, nextAvailable]), {
      rules: { maxPositions: 1, maxEntryRank: 1, minVolatilityReturnCount: 20 },
    });

    expect(result.positions.map((position) => position.companyId)).toEqual(["nextAvailable"]);
    expect(result.events.find((event) => event.eventType === "BUY_SKIPPED_UPPER_CIRCUIT")).toMatchObject({
      companyId: "upperCircuitLeader",
      details: { high: 105, previousClose: 100 },
    });
  });

  it("records a missing execution price and continues below the preferred entry ranks", () => {
    const unavailableLeader = nseMomentumStock("unavailableLeader", {
      oneMonthStartClose: 60,
      threeMonthStartClose: 50,
      endClose: 104,
      volatilitySwing: 0.2,
    });
    const availableBackup = nseMomentumStock("availableBackup", {
      oneMonthStartClose: 99,
      threeMonthStartClose: 98,
      endClose: 100,
      volatilitySwing: 0.2,
    });
    unavailableLeader.prices = unavailableLeader.prices.filter((row) => row.tradingDate.toISOString().slice(0, 10) !== "2026-01-02");

    const result = simulateNseMomentum(nseMomentumMarketWith([unavailableLeader, availableBackup]), {
      rules: { maxPositions: 1, maxEntryRank: 1, minVolatilityReturnCount: 20 },
    });

    expect(result.positions.map((position) => position.companyId)).toEqual(["availableBackup"]);
    expect(result.events.find((event) => event.eventType === "BUY_SKIPPED_NO_EXECUTION_PRICE")).toMatchObject({
      companyId: "unavailableLeader",
      details: { rank: 1 },
    });
  });

  it("recognizes a 2% price band even when the stock was not locked for the full session", () => {
    const twoPercentBandLeader = nseMomentumStock("twoPercentBandLeader", {
      oneMonthStartClose: 60,
      threeMonthStartClose: 50,
      endClose: 101.5,
      volatilitySwing: 0.2,
      extra: [["2026-01-01", 100, { high: 100, low: 100 }], ["2026-01-02", 101.5, { high: 102, low: 99 }]],
    });
    const nextAvailable = nseMomentumStock("twoPercentNext", {
      oneMonthStartClose: 99,
      threeMonthStartClose: 98,
      endClose: 100,
      volatilitySwing: 0.2,
    });
    const result = simulateNseMomentum(nseMomentumMarketWith([twoPercentBandLeader, nextAvailable]), {
      rules: { maxPositions: 1, minVolatilityReturnCount: 20 },
    });

    expect(result.positions.map((position) => position.companyId)).toEqual(["twoPercentNext"]);
    expect(result.events.find((event) => event.eventType === "BUY_SKIPPED_UPPER_CIRCUIT")).toMatchObject({
      companyId: "twoPercentBandLeader",
      details: { high: 102, previousClose: 100 },
    });
  });

  it("skips new buys that do not meet absolute 1M and 3M strength filters", () => {
    const result = simulateNseMomentum(nseMomentumMarketWith([
      nseMomentumStock("strong", {
        oneMonthStartClose: 90,
        threeMonthStartClose: 75,
        endClose: 100,
        volatilitySwing: 0.2,
      }),
      nseMomentumStock("weak3m", {
        oneMonthStartClose: 80,
        threeMonthStartClose: 95,
        endClose: 100,
        volatilitySwing: 0.2,
      }),
    ]), {
      rules: {
        maxPositions: 2,
        minVolatilityReturnCount: 20,
        minBuyReturn1M: 5,
        minBuyReturn3M: 20,
        maxNewPositionWeightPercent: 5,
      },
    });

    expect(result.positions.map((position) => position.companyId)).toEqual(["strong"]);
    expect(result.dailyEquity[0]?.cash).toBeCloseTo(950_000, 4);
    expect(result.events.find((event) => event.eventType === "BUY_SKIPPED_STRENGTH_FILTER")?.companyId).toBe("weak3m");
  });

  it("caps replacement allocation and leaves unused proceeds in cash when few candidates qualify", () => {
    const result = simulateNseMomentum(nseMomentumMarketWith([
      nseMomentumStock("winner", {
        oneMonthStartClose: 90,
        threeMonthStartClose: 85,
        endClose: 100,
        reviewOneMonthStartClose: 100,
        reviewThreeMonthStartClose: 95,
        reviewClose: 160,
        volatilitySwing: 0.2,
      }),
      nseMomentumStock("loser", {
        oneMonthStartClose: 91,
        threeMonthStartClose: 86,
        endClose: 100,
        reviewOneMonthStartClose: 100,
        reviewThreeMonthStartClose: 100,
        reviewClose: 50,
        volatilitySwing: 0.2,
      }),
      nseMomentumStock("replacement", {
        oneMonthStartClose: 99,
        threeMonthStartClose: 98,
        endClose: 100,
        reviewOneMonthStartClose: 90,
        reviewThreeMonthStartClose: 85,
        reviewClose: 120,
        volatilitySwing: 0.2,
      }),
    ]), {
      requestedEndDate: day("2026-02-05"),
      rules: {
        maxPositions: 2,
        holdingRankThreshold: 2,
        minVolatilityReturnCount: 20,
        minBuyReturn1M: 5,
        minBuyReturn3M: 15,
        maxNewPositionWeightPercent: 5,
        useAvailableCashForReplacements: true,
      },
    });

    const replacement = result.positions.find((position) => position.companyId === "replacement");
    const replacementSelection = result.events.find((event) => event.eventType === "REPLACEMENT_SELECTED");

    expect(replacement?.allocation).toBeCloseTo(50_250, 4);
    expect(replacementSelection?.details.allocation).toBeCloseTo(50_250, 4);
    expect(result.dailyEquity.find((point) => point.date === "2026-02-02")?.cash).toBeCloseTo(874_750, 4);
  });

  it("prioritizes former holdings that re-enter the top 50 before fresh replacement candidates", () => {
    const result = simulateNseMomentum(nseMomentumMarketWith([
      nseMomentumStock("held", {
        oneMonthStartClose: 50,
        threeMonthStartClose: 50,
        endClose: 100,
        reviewOneMonthStartClose: 100,
        reviewThreeMonthStartClose: 100,
        reviewClose: 200,
        volatilitySwing: 0.2,
        priceEndDate: "2026-03-05",
        extra: [["2026-03-02", 250]],
      }),
      nseMomentumStock("former", {
        oneMonthStartClose: 55,
        threeMonthStartClose: 55,
        endClose: 100,
        reviewOneMonthStartClose: 100,
        reviewThreeMonthStartClose: 100,
        reviewClose: 80,
        volatilitySwing: 0.2,
        priceEndDate: "2026-03-05",
        extra: [["2026-03-02", 150]],
      }),
      nseMomentumStock("replacement", {
        oneMonthStartClose: 90,
        threeMonthStartClose: 90,
        endClose: 100,
        reviewOneMonthStartClose: 100,
        reviewThreeMonthStartClose: 100,
        reviewClose: 180,
        volatilitySwing: 0.2,
        priceEndDate: "2026-03-05",
        extra: [["2026-03-02", 100]],
      }),
      nseMomentumStock("fresh", {
        oneMonthStartClose: 95,
        threeMonthStartClose: 95,
        endClose: 100,
        reviewOneMonthStartClose: 100,
        reviewThreeMonthStartClose: 100,
        reviewClose: 120,
        volatilitySwing: 0.2,
        priceEndDate: "2026-03-05",
        extra: [["2026-03-02", 300]],
      }),
    ]), {
      requestedEndDate: day("2026-03-05"),
      rules: {
        maxPositions: 2,
        holdingRankThreshold: 1,
        minVolatilityReturnCount: 20,
        rankingMode: "rawAverage",
        minBuyReturn1M: 5,
        minBuyReturn3M: 50,
        formerHoldingReentry: {
          enabled: true,
          maxRank: 50,
          reentryBudgetPercentOfExitProceeds: null,
        },
      },
    });

    const formerReentry = result.events.find((event) =>
      event.eventType === "REPLACEMENT_SELECTED" &&
      event.companyId === "former" &&
      event.eventDate === "2026-03-02"
    );

    expect(result.positions.find((position) => position.companyId === "former")?.exitDate).toBe("2026-02-02");
    expect(formerReentry?.details.rank).toBeLessThanOrEqual(50);
    expect(formerReentry?.details.reentryPriority).toBe(true);
    expect(result.positions.filter((position) => position.companyId === "former")).toHaveLength(2);
    expect(result.positions.find((position) => position.companyId === "fresh")).toBeUndefined();
  });

  it("sells reviewed holdings when trailing 3M return falls below the configured threshold", () => {
    const result = simulateNseMomentum(nseMomentumMarketWith([
      nseMomentumStock("weak3mHold", {
        oneMonthStartClose: 50,
        threeMonthStartClose: 50,
        endClose: 100,
        reviewOneMonthStartClose: 90,
        reviewThreeMonthStartClose: 90,
        reviewClose: 120,
        volatilitySwing: 0.2,
      }),
      nseMomentumStock("strong3mHold", {
        oneMonthStartClose: 55,
        threeMonthStartClose: 55,
        endClose: 100,
        reviewOneMonthStartClose: 90,
        reviewThreeMonthStartClose: 70,
        reviewClose: 120,
        volatilitySwing: 0.2,
      }),
    ]), {
      requestedEndDate: day("2026-02-05"),
      rules: {
        maxPositions: 2,
        minVolatilityReturnCount: 20,
        rankingMode: "rawAverage",
        reviewExitMode: "threeMonthReturnThreshold",
        minReviewReturn3M: 50,
      },
    });

    const weakReview = result.events.find((event) => event.eventType === "MONTHLY_REVIEW" && event.companyId === "weak3mHold");
    const strongReview = result.events.find((event) => event.eventType === "MONTHLY_REVIEW" && event.companyId === "strong3mHold");

    expect(weakReview?.details.return3M).toBeCloseTo(33.3333, 4);
    expect(weakReview?.details.decision).toBe("RANK_FAILURE");
    expect(weakReview?.details.reason).toBe("Trailing 3M return is below 50%.");
    expect(result.positions.find((position) => position.companyId === "weak3mHold")?.exitReason).toBe("MONTHLY_RANK_FAILURE");
    expect(strongReview?.details.return3M).toBeCloseTo(71.4286, 4);
    expect(strongReview?.details.decision).toBe("KEEP");
    expect(result.positions.find((position) => position.companyId === "strong3mHold")?.reviewHistory[0]?.sinceEntryReturn).toBeCloseTo(71.43, 2);
    expect(result.positions.find((position) => position.companyId === "strong3mHold")?.reviewHistory[0]?.reviewMetricLabel).toBe("3M return");
    expect(result.positions.find((position) => position.companyId === "strong3mHold")?.status).toBe("OPEN_AT_END");
  });
});

describe("Parent-style NSE Momentum historical runner", () => {
  it("keeps identical monthly protections across the three momentum windows", () => {
    const variants = [
      [nseParentMomentumSurvivorsV1Config, [1, 3]],
      [nseParentMomentumSurvivorsV2Config, [3, 6]],
      [nseParentMomentumSurvivorsV3Config, [6, 12]],
    ] as const;

    for (const [config, momentumMonths] of variants) {
      expect(rulesForParentNseMomentumVariant(config)).toMatchObject({
        portfolioManagement: "retainSurvivors",
        maxPositions: 25,
        momentumMonths,
        rebalanceFrequencyMonths: 1,
        skipLikelyUpperCircuitBuys: true,
        likelyUpperCircuitMinGainPercent: 1.8,
      });
      expect(config.nseMomentum?.universeMode).toBe("nseIneOrdinaryEquity");
    }
  });

  it("leaves a locked upper-circuit Top 25 allocation in cash", () => {
    const market = parentNseMomentumMarketWith([
      parentNseMomentumStock("alpha", { twelveMonthStartClose: 50, sixMonthStartClose: 80, firstRebalanceClose: 100, secondRebalanceClose: 110 }),
      parentNseMomentumStock("locked", { twelveMonthStartClose: 60, sixMonthStartClose: 85, preFirstRebalanceClose: 90, firstRebalanceClose: 99, secondRebalanceClose: 110, upperCircuitDates: ["2026-01-02"] }),
      parentNseMomentumStock("outside", { twelveMonthStartClose: 90, sixMonthStartClose: 95, firstRebalanceClose: 100, secondRebalanceClose: 110 }),
    ]);
    const result = simulateParentNseMomentum(market, {
      requestedEndDate: day("2026-01-10"),
      rules: { maxPositions: 3, rebalanceFrequencyMonths: 1, minVolatilityReturnCount: 20, portfolioManagement: "retainSurvivors", skipLikelyUpperCircuitBuys: true },
    });

    expect(result.events.some(event => event.eventType === "BUY_SKIPPED_UPPER_CIRCUIT" && event.companyId === "locked")).toBe(true);
    expect(result.positions.map(position => position.companyId).sort()).toEqual(["alpha", "outside"]);
    expect(result.dailyEquity.at(-1)?.cash).toBeCloseTo(1_000_000 / 3, 2);
  });

  it("keeps the parent baseline equal-weight while the new versions retain survivors", () => {
    expect(rulesForParentNseMomentumVariant(nseParentMomentumSurvivorsV3Config)).toMatchObject({ portfolioManagement: "retainSurvivors", maxPositions: 25, momentumMonths: [6, 12], rebalanceFrequencyMonths: 1 });
    expect(rulesForParentNseMomentumVariant(nseParentMomentumFullUniverseV9Config).portfolioManagement).toBe("equalWeight");
  });

  it("keeps survivors continuous with uncapped drift and no monthly trades", () => {
    const market = parentNseMomentumMarketWith([
      parentNseMomentumStock("alpha", { twelveMonthStartClose: 50, sixMonthStartClose: 80, firstRebalanceClose: 100, secondRebalanceClose: 1000 }),
      parentNseMomentumStock("bravo", { twelveMonthStartClose: 60, sixMonthStartClose: 85, firstRebalanceClose: 100, secondRebalanceClose: 110 }),
    ]);
    const options = { requestedEndDate: day("2026-07-05"), rules: { maxPositions: 2, rebalanceFrequencyMonths: 1, minVolatilityReturnCount: 20 } };
    const baseline = simulateParentNseMomentum(market, options);
    const drift = simulateParentNseMomentum(market, { ...options, rules: { ...options.rules, portfolioManagement: "retainSurvivors" } });
    expect(drift.positions).toHaveLength(2);
    expect(drift.positions.every(p => p.entryDate === "2026-01-02" && p.exitDate === null && p.quantity === 5000)).toBe(true);
    expect(drift.events.filter(e => e.eventType === "SELL")).toHaveLength(0);
    expect(drift.tradeCount).toBe(2);
    expect(baseline.tradeCount).toBeGreaterThan(drift.tradeCount);
    const selections = (r: typeof drift) => r.events.filter(e => e.eventType === "REBALANCE" && e.companyId).map(e => [e.eventDate, e.companyId, e.details.rank, e.details.momentumScore]);
    expect(selections(drift)).toEqual(selections(baseline));
    expect(drift.events.some(e => e.companyId === "alpha" && e.details.action === "SURVIVOR_UNCHANGED" && Number(e.details.portfolioWeightPercent) > 85)).toBe(true);
    expect(drift.report.portfolioStats.maxPositionWeightSymbol).toBe("ALPHA");
    expect(drift.report.portfolioStats.maxPositionWeightPercent).toBeGreaterThan(85);
    expect(drift.report.tradingStats).toMatchObject({ buys: 2, sells: 0, totalTransactions: 2 });
  });

  it("sells only departures and funds replacement entries without touching survivors", () => {
    const market = parentNseMomentumMarketWith([
      parentNseMomentumStock("alpha", { twelveMonthStartClose: 50, sixMonthStartClose: 80, firstRebalanceClose: 100, secondRebalanceClose: 120 }),
      parentNseMomentumStock("bravo", { twelveMonthStartClose: 60, sixMonthStartClose: 85, firstRebalanceClose: 100, secondRebalanceClose: 5 }),
      parentNseMomentumStock("charlie", { twelveMonthStartClose: 100, sixMonthStartClose: 100, firstRebalanceClose: 100, secondRebalanceClose: 150 }),
    ]);
    const result = simulateParentNseMomentum(market, { requestedEndDate: day("2026-03-02"), rules: { maxPositions: 2, rebalanceFrequencyMonths: 1, minVolatilityReturnCount: 20, portfolioManagement: "retainSurvivors" } });
    const first = result.positions.filter(p => p.entryDate === "2026-01-02");
    expect(first.map(p => p.companyId).sort()).toEqual(["alpha", "bravo"]);
    const exits = result.events.filter(e => e.eventType === "SELL");
    expect(exits).toHaveLength(1);
    expect(exits[0].companyId).toBe("bravo");
    const survivor = result.positions.find(p => p.companyId === "alpha")!;
    const exited = result.positions.find(p => p.companyId === "bravo")!;
    const entrant = result.positions.find(p => p.companyId === "charlie")!;
    expect(survivor.quantity).toBe(5000);
    expect(survivor.exitDate).toBeNull();
    expect(entrant.entryDate).toBe("2026-02-02");
    expect(entrant.allocation).toBeCloseTo(exited.quantity * exited.exitPrice!, 2);
    expect(result.tradeCount).toBe(4);
    expect(result.dailyEquity.every(e => e.openPositionCount <= 2 && e.cash >= -0.01)).toBe(true);
  });

  it("splits unequal exit proceeds equally across multiple entrants", () => {
    const market = parentNseMomentumMarketWith([
      parentNseMomentumStock("alpha", { twelveMonthStartClose: 50, sixMonthStartClose: 80, firstRebalanceClose: 100, secondRebalanceClose: 120 }),
      parentNseMomentumStock("bravo", { twelveMonthStartClose: 60, sixMonthStartClose: 85, firstRebalanceClose: 100, secondRebalanceClose: 5 }),
      parentNseMomentumStock("delta", { twelveMonthStartClose: 70, sixMonthStartClose: 90, firstRebalanceClose: 100, secondRebalanceClose: 7 }),
      parentNseMomentumStock("charlie", { twelveMonthStartClose: 100, sixMonthStartClose: 100, firstRebalanceClose: 100, secondRebalanceClose: 150 }),
      parentNseMomentumStock("echo", { twelveMonthStartClose: 100, sixMonthStartClose: 100, firstRebalanceClose: 100, secondRebalanceClose: 130 }),
    ]);
    const result = simulateParentNseMomentum(market, { requestedEndDate: day("2026-02-03"), rules: { maxPositions: 3, rebalanceFrequencyMonths: 1, minVolatilityReturnCount: 20, portfolioManagement: "retainSurvivors" } });
    const exits = result.positions.filter(p => p.exitDate !== null);
    const entrants = result.positions.filter(p => p.entryDate === "2026-02-02");
    expect(exits.map(p => p.companyId).sort()).toEqual(["bravo", "delta"]);
    expect(entrants.map(p => p.companyId).sort()).toEqual(["charlie", "echo"]);
    const proceeds = exits.reduce((sum, p) => sum + p.quantity * p.exitPrice!, 0);
    for (const entrant of entrants) expect(entrant.allocation).toBeCloseTo(proceeds / 2, 2);
    expect(result.positions.find(p => p.companyId === "alpha")?.quantity).toBeCloseTo(1_000_000 / 3 / 100, 4);
  });

  it.each(["bravo", "charlie"])("preserves cash and position limits when %s has no review-date execution price", (missing) => {
    const market = parentNseMomentumMarketWith([
      parentNseMomentumStock("alpha", { twelveMonthStartClose: 50, sixMonthStartClose: 80, firstRebalanceClose: 100, secondRebalanceClose: 120 }),
      parentNseMomentumStock("bravo", { twelveMonthStartClose: 60, sixMonthStartClose: 85, firstRebalanceClose: 100, secondRebalanceClose: 5 }),
      parentNseMomentumStock("charlie", { twelveMonthStartClose: 100, sixMonthStartClose: 100, firstRebalanceClose: 100, secondRebalanceClose: 150 }),
    ]);
    market.prices = market.prices.filter(p => !(p.instrumentId === `${missing}-i` && p.tradingDate.getTime() === day("2026-02-02").getTime()));
    const result = simulateParentNseMomentum(market, { requestedEndDate: day("2026-03-02"), rules: { maxPositions: 2, rebalanceFrequencyMonths: 1, minVolatilityReturnCount: 20, portfolioManagement: "retainSurvivors" } });
    expect(result.positions.find(p => p.companyId === "charlie")?.entryDate).toBe("2026-03-02");
    expect(result.positions.find(p => p.companyId === "alpha")?.quantity).toBe(5000);
    expect(result.positions.filter(p => p.companyId === "alpha")).toHaveLength(1);
    expect(result.dailyEquity.every(e => e.openPositionCount <= 2 && e.cash >= -0.01)).toBe(true);
    if (missing === "charlie") expect(result.dailyEquity.find(e => e.date === "2026-02-02")!.cash).toBeGreaterThan(0);
    else expect(result.positions.find(p => p.companyId === "bravo")?.exitDate).toBe("2026-03-02");
  });
  it("uses 6M and 12M volatility-adjusted z-score momentum with semiannual equal-weight rebalances", () => {
    const result = simulateParentNseMomentum(parentNseMomentumMarketWith([
      parentNseMomentumStock("alpha", {
        twelveMonthStartClose: 50,
        sixMonthStartClose: 80,
        firstRebalanceClose: 100,
        secondRebalanceClose: 110,
      }),
      parentNseMomentumStock("bravo", {
        twelveMonthStartClose: 60,
        sixMonthStartClose: 85,
        firstRebalanceClose: 100,
        secondRebalanceClose: 90,
      }),
      parentNseMomentumStock("charlie", {
        twelveMonthStartClose: 90,
        sixMonthStartClose: 95,
        firstRebalanceClose: 100,
        secondRebalanceClose: 200,
      }),
    ]), {
      requestedEndDate: day("2026-07-05"),
      rules: { maxPositions: 2, minVolatilityReturnCount: 20 },
    });

    const portfolioRebalances = result.events.filter((event) => event.eventType === "REBALANCE" && event.companyId === null);
    const selectedRebalances = result.events.filter((event) => event.eventType === "REBALANCE" && event.companyId !== null);

    expect(portfolioRebalances.map((event) => event.eventDate)).toEqual(["2026-01-02", "2026-07-02"]);
    expect(portfolioRebalances.map((event) => event.details.eligibleStockCount)).toEqual([3, 3]);
    expect(selectedRebalances.filter((event) => event.eventDate === "2026-01-02").map((event) => event.companyId)).toEqual(["bravo", "charlie"]);
    expect(selectedRebalances.filter((event) => event.eventDate === "2026-07-02").map((event) => event.companyId)).toEqual(["charlie", "alpha"]);
    expect(selectedRebalances[0]?.details).toMatchObject({
      return6M: expect.any(Number),
      return12M: expect.any(Number),
      annualizedVolatility: expect.any(Number),
      adjusted6M: expect.any(Number),
      adjusted12M: expect.any(Number),
      z6M: expect.any(Number),
      z12M: expect.any(Number),
      momentumScore: expect.any(Number),
      portfolioWeightPercent: 50,
    });
    expect(result.events.some((event) => event.eventType === "MONTHLY_REVIEW")).toBe(false);
    expect(result.positions.filter((position) => position.exitReason === "REBALANCE")).toHaveLength(2);
    expect(result.positions.filter((position) => position.entryDate === "2026-07-02").map((position) => position.companyId)).toEqual(["charlie", "alpha"]);
  });

  it("requires 12 months of price history before a stock can qualify", () => {
    const missing = parentNseMomentumStock("missing", {
      twelveMonthStartClose: 50,
      sixMonthStartClose: 70,
      firstRebalanceClose: 100,
      secondRebalanceClose: 120,
      omitTwelveMonthStart: true,
    });
    const result = simulateParentNseMomentum(parentNseMomentumMarketWith([
      missing,
      parentNseMomentumStock("qualifiedA", {
        twelveMonthStartClose: 60,
        sixMonthStartClose: 80,
        firstRebalanceClose: 100,
        secondRebalanceClose: 110,
      }),
      parentNseMomentumStock("qualifiedB", {
        twelveMonthStartClose: 65,
        sixMonthStartClose: 85,
        firstRebalanceClose: 100,
        secondRebalanceClose: 115,
      }),
    ]), {
      rules: { maxPositions: 2, minVolatilityReturnCount: 20 },
    });

    expect(result.events.find((event) => event.eventType === "REBALANCE" && event.companyId === null)?.details.eligibleStockCount).toBe(2);
    expect(result.positions.some((position) => position.companyId === "missing")).toBe(false);
  });

  it("can run the controlled V2 with 3M and 6M momentum while keeping quarterly Top 50 rebalances", () => {
    const result = simulateParentNseMomentum(parentNseMomentumMarketWith([
      parentNseMomentumStock("shortLeader", {
        twelveMonthStartClose: 90,
        sixMonthStartClose: 90,
        threeMonthStartClose: 50,
        firstRebalanceClose: 100,
        secondRebalanceClose: 120,
      }),
      parentNseMomentumStock("mediumLeader", {
        twelveMonthStartClose: 70,
        sixMonthStartClose: 50,
        threeMonthStartClose: 95,
        firstRebalanceClose: 100,
        secondRebalanceClose: 130,
      }),
      parentNseMomentumStock("laggard", {
        twelveMonthStartClose: 60,
        sixMonthStartClose: 90,
        threeMonthStartClose: 95,
        firstRebalanceClose: 100,
        secondRebalanceClose: 80,
      }),
    ]), {
      requestedEndDate: day("2026-07-05"),
      rules: { maxPositions: 2, minVolatilityReturnCount: 20, momentumMonths: [3, 6], rebalanceFrequencyMonths: 3 },
    });

    const portfolioRebalances = result.events.filter((event) => event.eventType === "REBALANCE" && event.companyId === null);
    const selected = result.events.find((event) => event.eventType === "REBALANCE" && event.companyId !== null);

    expect(portfolioRebalances.map((event) => event.eventDate)).toEqual(["2026-01-02", "2026-04-02", "2026-07-02"]);
    expect(portfolioRebalances[0]?.details.ranking).toBe("0.50 * z3M + 0.50 * z6M desc");
    expect(portfolioRebalances[0]?.details.rebalanceFrequencyMonths).toBe(3);
    expect(selected?.details).toMatchObject({
      return3M: expect.any(Number),
      return6M: expect.any(Number),
      adjusted3M: expect.any(Number),
      adjusted6M: expect.any(Number),
      z3M: expect.any(Number),
      z6M: expect.any(Number),
      momentumScore: expect.any(Number),
      portfolioWeightPercent: 50,
    });
    expect(selected?.details).not.toHaveProperty("return12M");
    expect(result.events.some((event) => event.eventType === "MONTHLY_REVIEW")).toBe(false);
  });

  it("can run V3 with 1M and 3M momentum while rebalancing monthly", () => {
    const result = simulateParentNseMomentum(parentNseMomentumMarketWith([
      parentNseMomentumStock("oneMonthLeader", {
        twelveMonthStartClose: 90,
        sixMonthStartClose: 85,
        threeMonthStartClose: 80,
        oneMonthStartClose: 50,
        firstRebalanceClose: 100,
        secondRebalanceClose: 120,
      }),
      parentNseMomentumStock("threeMonthLeader", {
        twelveMonthStartClose: 90,
        sixMonthStartClose: 80,
        threeMonthStartClose: 50,
        oneMonthStartClose: 95,
        firstRebalanceClose: 100,
        secondRebalanceClose: 130,
      }),
      parentNseMomentumStock("laggard", {
        twelveMonthStartClose: 60,
        sixMonthStartClose: 80,
        threeMonthStartClose: 90,
        oneMonthStartClose: 95,
        firstRebalanceClose: 100,
        secondRebalanceClose: 80,
      }),
    ]), {
      requestedEndDate: day("2026-04-05"),
      rules: { maxPositions: 2, minVolatilityReturnCount: 20, momentumMonths: [1, 3], rebalanceFrequencyMonths: 1 },
    });

    const portfolioRebalances = result.events.filter((event) => event.eventType === "REBALANCE" && event.companyId === null);
    const selected = result.events.find((event) => event.eventType === "REBALANCE" && event.companyId !== null);

    expect(portfolioRebalances.map((event) => event.eventDate)).toEqual(["2026-01-02", "2026-02-02", "2026-03-02", "2026-04-02"]);
    expect(portfolioRebalances[0]?.details.ranking).toBe("0.50 * z1M + 0.50 * z3M desc");
    expect(portfolioRebalances[0]?.details.rebalanceFrequencyMonths).toBe(1);
    expect(selected?.details).toMatchObject({
      return1M: expect.any(Number),
      return3M: expect.any(Number),
      adjusted1M: expect.any(Number),
      adjusted3M: expect.any(Number),
      z1M: expect.any(Number),
      z3M: expect.any(Number),
      momentumScore: expect.any(Number),
      portfolioWeightPercent: 50,
    });
    expect(selected?.details).not.toHaveProperty("return6M");
    expect(result.events.some((event) => event.eventType === "MONTHLY_REVIEW")).toBe(false);
  });

  it("can run V4 with 6M and 12M momentum while selecting fewer stocks", () => {
    const result = simulateParentNseMomentum(parentNseMomentumMarketWith([
      parentNseMomentumStock("leader", {
        twelveMonthStartClose: 50,
        sixMonthStartClose: 80,
        firstRebalanceClose: 100,
        secondRebalanceClose: 120,
      }),
      parentNseMomentumStock("second", {
        twelveMonthStartClose: 60,
        sixMonthStartClose: 85,
        firstRebalanceClose: 100,
        secondRebalanceClose: 110,
      }),
      parentNseMomentumStock("excluded", {
        twelveMonthStartClose: 90,
        sixMonthStartClose: 95,
        firstRebalanceClose: 100,
        secondRebalanceClose: 105,
      }),
    ]), {
      requestedEndDate: day("2026-01-10"),
      rules: { maxPositions: 2, minVolatilityReturnCount: 20, momentumMonths: [6, 12], rebalanceFrequencyMonths: 6 },
    });

    const portfolioRebalance = result.events.find((event) => event.eventType === "REBALANCE" && event.companyId === null);
    const selected = result.events.filter((event) => event.eventType === "REBALANCE" && event.companyId !== null);

    expect(portfolioRebalance?.details.selectedCount).toBe(2);
    expect(portfolioRebalance?.details.ranking).toBe("0.50 * z6M + 0.50 * z12M desc");
    expect(portfolioRebalance?.details.rebalanceFrequencyMonths).toBe(6);
    expect(selected).toHaveLength(2);
    expect(selected[0]?.details).toMatchObject({
      return6M: expect.any(Number),
      return12M: expect.any(Number),
      portfolioWeightPercent: 50,
    });
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

function simulateNseMomentum(
  market: { readonly candidates: HistoricalRunnerCandidate[]; readonly prices: HistoricalRunnerPrice[] },
  options: {
    readonly requestedStartDate?: Date;
    readonly requestedEndDate?: Date;
    readonly rules?: Partial<NseMomentumHistoricalRules>;
  } = {},
) {
  return simulateNseMomentumHistorical({
    requestedStartDate: options.requestedStartDate ?? day("2026-01-02"),
    requestedEndDate: options.requestedEndDate ?? day("2026-02-20"),
    candidates: market.candidates,
    prices: market.prices,
    rules: { initialRankingLagSessions: 0, ...options.rules },
  });
}

function nseMomentumMarketWith(stocks: ReturnType<typeof nseMomentumStock>[]) {
  return {
    candidates: stocks.map((stock) => stock.candidate),
    prices: stocks.flatMap((stock) => stock.prices).sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime()),
  };
}

function simulateParentNseMomentum(
  market: { readonly candidates: HistoricalRunnerCandidate[]; readonly prices: HistoricalRunnerPrice[] },
  options: {
    readonly requestedStartDate?: Date;
    readonly requestedEndDate?: Date;
    readonly rules?: Partial<ParentNseMomentumHistoricalRules>;
  } = {},
) {
  return simulateParentNseMomentumHistorical({
    requestedStartDate: options.requestedStartDate ?? day("2026-01-02"),
    requestedEndDate: options.requestedEndDate ?? day("2026-01-10"),
    candidates: market.candidates,
    prices: market.prices,
    rules: options.rules,
  });
}

function parentNseMomentumMarketWith(stocks: ReturnType<typeof parentNseMomentumStock>[]) {
  return {
    candidates: stocks.map((stock) => stock.candidate),
    prices: stocks.flatMap((stock) => stock.prices).sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime()),
  };
}

function parentNseMomentumStock(
  id: string,
  options: {
    readonly twelveMonthStartClose: number;
    readonly sixMonthStartClose: number;
    readonly threeMonthStartClose?: number;
    readonly oneMonthStartClose?: number;
    readonly firstRebalanceClose: number;
    readonly secondRebalanceClose: number;
    readonly preFirstRebalanceClose?: number;
    readonly volatilitySwing?: number;
    readonly omitTwelveMonthStart?: boolean;
    readonly upperCircuitDates?: readonly string[];
  },
) {
  const instrumentId = `${id}-i`;
  const overrides = new Map<string, number>([
    ...(options.omitTwelveMonthStart ? [] : [["2025-01-02", options.twelveMonthStartClose] as [string, number]]),
    ["2025-07-02", options.sixMonthStartClose],
    ...(options.threeMonthStartClose === undefined ? [] : [["2025-10-02", options.threeMonthStartClose] as [string, number]]),
    ...(options.oneMonthStartClose === undefined ? [] : [["2025-12-02", options.oneMonthStartClose] as [string, number]]),
    ...(options.preFirstRebalanceClose === undefined ? [] : [["2026-01-01", options.preFirstRebalanceClose] as [string, number]]),
    ["2026-01-02", options.firstRebalanceClose],
    ["2026-07-02", options.secondRebalanceClose],
    ["2026-07-05", options.secondRebalanceClose],
  ]);
  const swing = options.volatilitySwing ?? 0.2;

  return {
    candidate: candidate(id),
    prices: dateKeys("2025-01-02", "2026-07-05").map((date, index) => {
      const override = overrides.get(date);
      const anchor = date < "2026-01-02" ? options.firstRebalanceClose : options.secondRebalanceClose;
      const base = anchor + (index % 2 === 0 ? swing : -swing);
      const close = override ?? Math.max(base, 1);
      const locked = options.upperCircuitDates?.includes(date) ?? false;
      return price(instrumentId, date, close, 1000, locked ? { open: close, high: close, low: close } : undefined);
    }).filter((row) => !(options.omitTwelveMonthStart && row.tradingDate.toISOString().slice(0, 10) === "2025-01-02")),
  };
}

function nseMomentumStock(
  id: string,
  options: {
    readonly oneMonthStartClose: number;
    readonly threeMonthStartClose: number;
    readonly endClose: number;
    readonly reviewOneMonthStartClose?: number;
    readonly reviewThreeMonthStartClose?: number;
    readonly reviewClose?: number;
    readonly volatilitySwing: number;
    readonly priceEndDate?: string;
    readonly extra?: Array<[string, number, { readonly open?: number; readonly high?: number; readonly low?: number }?]>;
  },
) {
  const instrumentId = `${id}-i`;
  const overrides = new Map<string, number>([
    ["2025-10-02", options.threeMonthStartClose],
    ["2025-12-02", options.oneMonthStartClose],
    ["2026-01-02", options.endClose],
    ["2026-01-05", options.endClose],
    ["2026-01-20", options.reviewOneMonthStartClose ?? options.endClose],
    ["2026-02-02", options.reviewClose ?? options.endClose],
    ["2026-02-03", options.reviewClose ?? options.endClose],
    ["2026-02-04", options.reviewClose ?? options.endClose],
    ["2026-02-05", options.reviewClose ?? options.endClose],
  ]);
  if (options.reviewThreeMonthStartClose !== undefined) {
    overrides.set("2025-11-02", options.reviewThreeMonthStartClose);
  }
  const ohlcOverrides = new Map((options.extra ?? []).map(([date, close, ohlc]) => [date, { close, ohlc }]));

  return {
    candidate: candidate(id),
    prices: dateKeys("2025-01-02", options.priceEndDate ?? "2026-02-20").map((date, index) => {
      const extra = ohlcOverrides.get(date);
      const override = extra?.close ?? overrides.get(date);
      const base = options.endClose + (index % 2 === 0 ? options.volatilitySwing : -options.volatilitySwing);
      return price(instrumentId, date, override ?? Math.max(base, 1), 1000, extra?.ohlc);
    }),
  };
}

function dateKeys(start: string, end: string) {
  const keys: string[] = [];
  const cursor = day(start);
  const last = day(end);
  while (cursor <= last) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
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

function price(
  instrumentId: string,
  date: string,
  close: number,
  volume = 1000,
  ohlc: { readonly open?: number; readonly high?: number; readonly low?: number } = {},
): HistoricalRunnerPrice {
  return {
    instrumentId,
    tradingDate: day(date),
    open: ohlc.open ?? close,
    high: ohlc.high ?? close * 1.01,
    low: ohlc.low ?? close * 0.99,
    close,
    volume,
    marketDataSource: realSource,
  };
}

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
