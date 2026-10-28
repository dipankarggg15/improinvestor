import { describe, expect, it } from "vitest";

import {
  analyzeEarlyMomentumSetup,
  analyzeSwingSetup,
  analyzeYearLowSupportSetup,
  defaultSwingTargetRewardRisk,
  passesBreakoutRetestRelativeMomentum,
  passesOptionalRewardRiskFilter,
  parseSwingDate,
  parseSwingNumber,
  relativeMomentumPoints,
  shouldIncludeSwingSetup,
  type SwingPrice,
  type SwingRules,
} from "@/lib/swing-trading/service";
import { parseSwingFilterGroup, swingFilterGroups } from "@/lib/swing-trading/filter-groups";

const rules: SwingRules = {
  minimumAverageTradedValue: 5 * 10_000_000,
  maximumDistancePercent: 5,
  minimumTouches: 2,
};

describe("swing setup analysis", () => {
  it("finds a confirmed multi-touch support setup in a liquid uptrend", () => {
    const result = analyzeSwingSetup(pricesWithSupport(), rules);

    expect(result.qualityEligible).toBe(true);
    expect(result.setup).not.toBeNull();
    expect(result.setup?.status).toBe("CONFIRMED");
    expect(result.setup?.decision).toBe("TRADE_READY");
    expect(result.setup?.rewardRisk).toBeGreaterThanOrEqual(defaultSwingTargetRewardRisk);
    expect(result.setup?.touchCount).toBeGreaterThanOrEqual(3);
    expect(result.setup?.successfulBounceCount).toBeGreaterThanOrEqual(2);
    expect(result.setup?.score).toBeGreaterThan(0);
    expect(result.setup?.score).toBeLessThanOrEqual(100);
    expect(result.setup?.score).toBe(
      (result.setup?.supportQualityScore ?? 0)
      + (result.setup?.locationScore ?? 0)
      + (result.setup?.trendMomentumScore ?? 0)
      + (result.setup?.participationScore ?? 0)
      + (result.setup?.volatilityScore ?? 0)
      + (result.setup?.liquidityScore ?? 0),
    );
    expect(result.setup?.currentPrice).toBeGreaterThan(result.setup?.sma200 ?? Infinity);
    expect(result.setup?.stopPrice).toBeLessThan(result.setup?.supportLow ?? 0);
    expect(result.setup?.entryTrigger).toBeGreaterThan(result.setup?.currentPrice ?? Infinity);
  });

  it("rejects a support zone after price decisively breaks below it", () => {
    const prices = pricesWithSupport();
    const latest = prices.at(-1)!;
    prices[prices.length - 1] = { ...latest, open: 104, high: 104.5, low: 102, close: 103 };

    const result = analyzeSwingSetup(prices, rules);

    expect(result.qualityEligible).toBe(true);
    expect(result.setup).toBeNull();
  });

  it("does not label a close just below the support zone as at support", () => {
    const prices = pricesWithSupport();
    const latest = prices.at(-1)!;
    prices[prices.length - 1] = { ...latest, open: 107, high: 108, low: 106, close: 106.5 };

    const result = analyzeSwingSetup(prices, rules);

    expect(result.qualityEligible).toBe(true);
    expect(result.setup).toBeNull();
  });

  it("rejects an otherwise valid pattern when liquidity is below the configured floor", () => {
    const prices = pricesWithSupport().map((price) => ({ ...price, volume: 10_000 }));

    const result = analyzeSwingSetup(prices, rules);

    expect(result.qualityEligible).toBe(false);
    expect(result.setup).toBeNull();
  });

  it("keeps a confirmed setup Trade-ready when projected risk/reward is below 1:3", () => {
    const prices = pricesWithSupport();
    for (const index of [150, 160]) {
      prices[index] = { ...prices[index], open: 120, high: 125, low: 119, close: 122 };
    }

    const result = analyzeSwingSetup(prices, rules);

    expect(result.setup?.status).toBe("CONFIRMED");
    expect(result.setup?.rewardRisk).toBeLessThan(defaultSwingTargetRewardRisk);
    expect(result.setup?.decision).toBe("TRADE_READY");
  });

  it("keeps the original score unchanged unless relative momentum is requested", () => {
    const baseline = analyzeSwingSetup(pricesWithSupport(), rules);
    const enhanced = analyzeSwingSetup(pricesWithSupport(), rules, { z1M: 0.5, z3M: 1, combinedZ: 0.825, points: 11 });

    expect(baseline.setup?.relativeMomentumScore).toBeUndefined();
    expect(baseline.setup?.score).toBe(
      (baseline.setup?.supportQualityScore ?? 0)
      + (baseline.setup?.locationScore ?? 0)
      + (baseline.setup?.trendMomentumScore ?? 0)
      + (baseline.setup?.participationScore ?? 0)
      + (baseline.setup?.volatilityScore ?? 0)
      + (baseline.setup?.liquidityScore ?? 0),
    );
    expect(enhanced.setup?.relativeMomentumZScore).toBe(0.825);
    expect(enhanced.setup?.relativeMomentumScore).toBe(11);
    expect(enhanced.setup?.score).toBe(
      (enhanced.setup?.supportQualityScore ?? 0)
      + (enhanced.setup?.locationScore ?? 0)
      + (enhanced.setup?.trendMomentumScore ?? 0)
      + (enhanced.setup?.relativeMomentumScore ?? 0)
      + (enhanced.setup?.participationScore ?? 0)
      + (enhanced.setup?.volatilityScore ?? 0)
      + (enhanced.setup?.liquidityScore ?? 0),
    );
  });

  it("maps severe weakness to zero and caps strong relative momentum at fifteen points", () => {
    expect(relativeMomentumPoints(-1)).toBe(0);
    expect(relativeMomentumPoints(0)).toBe(6);
    expect(relativeMomentumPoints(1.5)).toBe(15);
    expect(relativeMomentumPoints(4)).toBe(15);
  });

  it("keeps only meaningfully positive Z-scores in the separate momentum filter", () => {
    expect(passesBreakoutRetestRelativeMomentum(undefined)).toBe(false);
    expect(passesBreakoutRetestRelativeMomentum(-0.2)).toBe(false);
    expect(passesBreakoutRetestRelativeMomentum(0.49)).toBe(false);
    expect(passesBreakoutRetestRelativeMomentum(0.5)).toBe(true);
    expect(passesBreakoutRetestRelativeMomentum(1.2)).toBe(true);
  });

  it("uses only Z-score eligibility for the separate momentum filter", () => {
    expect(shouldIncludeSwingSetup("breakout-retest")).toBe(true);
    expect(shouldIncludeSwingSetup("breakout-retest-momentum", 0.49)).toBe(false);
    expect(shouldIncludeSwingSetup("breakout-retest-momentum", 0.5)).toBe(true);
  });

  it("applies risk/reward only when the optional display filter is selected", () => {
    expect(passesOptionalRewardRiskFilter(null, 0)).toBe(true);
    expect(passesOptionalRewardRiskFilter(0.5, 0)).toBe(true);
    expect(passesOptionalRewardRiskFilter(null, 2)).toBe(false);
    expect(passesOptionalRewardRiskFilter(1.99, 2)).toBe(false);
    expect(passesOptionalRewardRiskFilter(2, 2)).toBe(true);
  });
});

describe("52-week-low support analysis", () => {
  it("ranks an established zone with multiple successful historical rebounds", () => {
    const result = analyzeYearLowSupportSetup(pricesAtYearLowSupport(), rules);

    expect(result.qualityEligible).toBe(true);
    expect(result.setup).not.toBeNull();
    expect(result.setup?.status).toBe("HOLDING");
    expect(result.setup?.decision).toBe("TRADE_READY");
    expect(result.setup?.touchCount).toBeGreaterThanOrEqual(3);
    expect(result.setup?.successfulBounceCount).toBeGreaterThanOrEqual(2);
    expect(result.setup?.supportAgeSessions).toBeGreaterThanOrEqual(60);
    expect(result.setup?.yearLow).not.toBeNull();
  });

  it("keeps a brief support undercut when price reclaims the zone", () => {
    const prices = pricesAtYearLowSupport();
    prices[238] = { ...prices[238], open: 89, high: 90, low: 86.5, close: 87.5 };

    const result = analyzeYearLowSupportSetup(prices, rules);

    expect(result.setup?.status).toBe("RECLAIMED");
  });

  it("removes a persistent break below the allowed support range", () => {
    const prices = pricesAtYearLowSupport();
    for (const index of [238, 239]) {
      prices[index] = { ...prices[index], open: 85, high: 86, low: 82, close: 83 };
    }

    const result = analyzeYearLowSupportSetup(prices, rules);

    expect(result.setup).toBeNull();
  });
});

describe("early momentum analysis", () => {
  it("finds a stock near its 52-week high with five-year headroom", () => {
    const prices = earlyMomentumPrices();
    const result = analyzeEarlyMomentumSetup(prices, { ...rules, maximumDistancePercent: 4 });

    expect(result.qualityEligible).toBe(true);
    expect(result.setup?.status).toBe("PREPARING");
    expect(result.setup?.distanceToHighPercent).toBeGreaterThanOrEqual(0);
    expect(result.setup?.distanceToHighPercent).toBeLessThanOrEqual(4);
    expect(result.setup?.longTermHighHeadroomPercent).toBeGreaterThanOrEqual(10);
    expect(result.setup?.extensionFromSma50Percent).toBeLessThanOrEqual(15);
    expect(result.setup?.return1MPercent).toBeDefined();
  });

  it("finds a stock above its 52-week high without requiring a one-day cross or volume confirmation", () => {
    const prices = earlyMomentumPrices();
    const priorHigh = Math.max(...prices.slice(-253, -1).map((price) => price.high));
    prices[prices.length - 1] = {
      ...prices.at(-1)!,
      open: priorHigh * 0.995,
      high: priorHigh * 1.035,
      low: priorHigh * 0.99,
      close: priorHigh * 1.025,
      volume: 100_000,
    };

    const result = analyzeEarlyMomentumSetup(prices, { ...rules, maximumDistancePercent: 4 });

    expect(result.setup?.status).toBe("ABOVE_HIGH");
  });

  it("keeps a stock without contraction or volume confirmation", () => {
    const prices = earlyMomentumPrices();
    for (let index = prices.length - 10; index < prices.length - 1; index += 1) {
      prices[index] = { ...prices[index]!, high: 123, low: 112 };
    }
    const priorHigh = Math.max(...prices.slice(-253, -1).map((price) => price.high));
    prices[prices.length - 1] = { ...prices.at(-1)!, high: priorHigh * 1.02, close: priorHigh * 1.01, volume: 500_000 };

    const result = analyzeEarlyMomentumSetup(prices, { ...rules, maximumDistancePercent: 4 });

    expect(result.qualityEligible).toBe(true);
    expect(result.setup).not.toBeNull();
  });

  it("rejects a 52-week high without meaningful headroom to the older high", () => {
    const prices = earlyMomentumPrices();
    prices[100] = { ...prices[100]!, high: 110 };

    const result = analyzeEarlyMomentumSetup(prices, { ...rules, maximumDistancePercent: 4 });

    expect(result.qualityEligible).toBe(true);
    expect(result.setup).toBeNull();
  });

  it("shows a high one-month return without using it as an exclusion", () => {
    const prices = earlyMomentumPrices();
    prices[578] = { ...prices[578]!, open: 90, low: 89, close: 90 };

    const result = analyzeEarlyMomentumSetup(prices, { ...rules, maximumDistancePercent: 4 });

    expect(result.setup?.return1MPercent).toBeGreaterThan(30);
    expect(result.setup).not.toBeNull();
  });
});

describe("swing setup query parsing", () => {
  it("keeps named filter groups separate and falls back to the configured scanner", () => {
    expect(swingFilterGroups.map((group) => group.value)).toEqual(["breakout-retest", "breakout-retest-momentum", "established-support", "early-momentum"]);
    expect(parseSwingFilterGroup("breakout-retest-momentum")).toBe("breakout-retest-momentum");
    expect(parseSwingFilterGroup("established-support")).toBe("established-support");
    expect(parseSwingFilterGroup("early-momentum")).toBe("early-momentum");
    expect(parseSwingFilterGroup("unknown")).toBe("breakout-retest");
  });

  it("accepts ISO dates and bounded numeric filters", () => {
    expect(parseSwingDate("2026-10-21")).toBe("2026-10-21");
    expect(parseSwingDate("")).toBeUndefined();
    expect(parseSwingNumber("2.5", { defaultValue: 3, min: 1, max: 5 })).toBe(2.5);
    expect(parseSwingNumber("20", { defaultValue: 3, min: 1, max: 5 })).toBe(3);
  });

  it("rejects malformed dates", () => {
    expect(() => parseSwingDate("21-10-2026")).toThrow("YYYY-MM-DD");
  });
});

function pricesWithSupport(): SwingPrice[] {
  const start = new Date("2025-01-01T00:00:00.000Z");
  const prices = Array.from({ length: 240 }, (_, index) => {
    const close = 100 + index * 0.05;
    return {
      tradingDate: addDays(start, index),
      open: close - 0.25,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000_000,
    };
  });

  for (const index of [170, 190, 215]) {
    for (let offset = -3; offset <= 3; offset += 1) {
      prices[index + offset] = {
        ...prices[index + offset],
        open: 109.8,
        high: 111,
        low: 109.5,
        close: 110,
      };
    }
    const close = 109;
    prices[index] = { ...prices[index], open: 109.5, high: 110, low: 108, close };
    prices[index + 1] = { ...prices[index + 1], open: 109, high: 113, low: 108.8, close: 112 };
  }

  prices[220] = { ...prices[220], open: 112, high: 150, low: 111.5, close: 145 };
  prices[239] = { ...prices[239], open: 109, high: 113.5, low: 107.2, close: 111.95 };
  return prices;
}

function pricesAtYearLowSupport(): SwingPrice[] {
  const start = new Date("2025-01-01T00:00:00.000Z");
  const prices = Array.from({ length: 240 }, (_, index) => ({
    tradingDate: addDays(start, index),
    open: 109.5,
    high: 111,
    low: 109,
    close: 110,
    volume: 1_000_000,
  }));

  for (const index of [30, 100, 170]) {
    prices[index] = { ...prices[index], open: 92, high: 93, low: 90, close: 91 };
    prices[index + 1] = { ...prices[index + 1], open: 92, high: 102, low: 91, close: 100, volume: 1_500_000 };
  }
  prices[239] = { ...prices[239], open: 91, high: 93, low: 89.5, close: 91.5, volume: 1_200_000 };
  return prices;
}

function earlyMomentumPrices(): SwingPrice[] {
  const start = new Date("2026-01-01T00:00:00.000Z");
  const prices = Array.from({ length: 600 }, (_, index) => {
    const close = index < 348
      ? 100
      : index < 580
        ? 110 + (index - 348) * 0.03
        : index < 590
          ? 116 + (index - 580) * 0.1
          : 117 + (index - 590) * 0.12;
    const currentTen = index >= 590;
    return {
      tradingDate: addDays(start, index),
      open: close - 0.3,
      high: close + (currentTen ? 0.5 : 2),
      low: close - (currentTen ? 0.5 : 2),
      close,
      volume: 1_000_000,
    };
  });
  prices[100] = { ...prices[100]!, high: 150 };
  return prices;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
