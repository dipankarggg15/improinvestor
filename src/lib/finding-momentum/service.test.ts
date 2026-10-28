import { describe, expect, it } from "vitest";

import {
  classifySelectedDate,
  findingMomentumRankingRules,
  findingMomentumOptions,
  latestSafeNseEodDate,
  parseFindingMomentumOption,
} from "@/lib/finding-momentum/service";
import {
  nseMomentumRawNoZScoreV2Config,
  nseMomentumRawSixTwelveV4Config,
  nseMomentumSixTwelveV4Config,
  nseParentMomentumFullUniverseV2Config,
  nseParentMomentumFullUniverseV3Config,
} from "@/lib/strategies/config";
import {
  rulesForNseMomentumVariant,
  rulesForParentNseMomentumVariant,
} from "@/lib/strategies/historical-run-service";

describe("Finding Momentum options", () => {
  it("offers every supported month pair in volatility-adjusted and raw modes", () => {
    expect(findingMomentumOptions.map((option) => ({
      value: option.value,
      months: option.months,
      rankingMode: option.rankingMode,
    }))).toEqual([
      { value: "volatility-1m-3m", months: [1, 3], rankingMode: "volatilityAdjusted" },
      { value: "volatility-3m-6m", months: [3, 6], rankingMode: "volatilityAdjusted" },
      { value: "volatility-6m-12m", months: [6, 12], rankingMode: "volatilityAdjusted" },
      { value: "raw-1m-3m", months: [1, 3], rankingMode: "rawAverage" },
      { value: "raw-3m-6m", months: [3, 6], rankingMode: "rawAverage" },
      { value: "raw-6m-12m", months: [6, 12], rankingMode: "rawAverage" },
    ]);
  });

  it("accepts known URL options and ignores invalid values", () => {
    expect(parseFindingMomentumOption("raw-3m-6m")).toBe("raw-3m-6m");
    expect(parseFindingMomentumOption("unsupported")).toBeUndefined();
    expect(parseFindingMomentumOption(undefined)).toBeUndefined();
  });

  it("caps refreshes at the latest completed NSE EOD in India time", () => {
    expect(latestSafeNseEodDate(new Date("2026-10-22T11:30:00.000Z")).toISOString().slice(0, 10)).toBe("2026-10-21");
    expect(latestSafeNseEodDate(new Date("2026-10-22T12:30:00.000Z")).toISOString().slice(0, 10)).toBe("2026-10-22");
  });

  it("distinguishes an in-progress import from a non-trading date", () => {
    expect(classifySelectedDate({
      selectedDate: new Date("2026-10-23T00:00:00.000Z"),
      rankingDateUsed: new Date("2026-10-21T00:00:00.000Z"),
      completedThrough: new Date("2026-10-21T00:00:00.000Z"),
      latestSafeDate: new Date("2026-10-25T00:00:00.000Z"),
    })).toBe("updating");

    expect(classifySelectedDate({
      selectedDate: new Date("2026-10-24T00:00:00.000Z"),
      rankingDateUsed: new Date("2026-10-23T00:00:00.000Z"),
      completedThrough: new Date("2026-10-25T00:00:00.000Z"),
      latestSafeDate: new Date("2026-10-25T00:00:00.000Z"),
    })).toBe("no-session");
  });

  it("keeps volatility options aligned with their respective strategy ranking rules", () => {
    const parentOneThree = rulesForParentNseMomentumVariant(nseParentMomentumFullUniverseV3Config);
    const parentThreeSix = rulesForParentNseMomentumVariant(nseParentMomentumFullUniverseV2Config);
    const momentumSixTwelve = rulesForNseMomentumVariant("NSE Momentum", nseMomentumSixTwelveV4Config);
    const expectedRules = [
      { value: "volatility-1m-3m", ...rankingFields(parentOneThree) },
      { value: "volatility-3m-6m", ...rankingFields(parentThreeSix) },
      { value: "volatility-6m-12m", ...rankingFields(momentumSixTwelve) },
    ];

    for (const expected of expectedRules) {
      const option = findingMomentumOptions.find((candidate) => candidate.value === expected.value)!;
      expect(findingMomentumRankingRules(option)).toEqual({
        momentumMonths: expected.momentumMonths,
        rankingMode: "volatilityAdjusted",
        minVolatilityReturnCount: expected.minVolatilityReturnCount,
      });
    }
  });

  it("keeps raw options on the strategy's direct-average methodology", () => {
    const rawOneThreeRules = rulesForNseMomentumVariant("NSE Momentum Raw", nseMomentumRawNoZScoreV2Config);
    const rawSixTwelveRules = rulesForNseMomentumVariant("NSE Momentum Raw", nseMomentumRawSixTwelveV4Config);
    const optionRules = Object.fromEntries(findingMomentumOptions
      .filter((option) => option.rankingMode === "rawAverage")
      .map((option) => [option.value, findingMomentumRankingRules(option)]));

    expect(optionRules["raw-1m-3m"]).toEqual({
      momentumMonths: [1, 3],
      rankingMode: rawOneThreeRules.rankingMode,
      minVolatilityReturnCount: rawOneThreeRules.minVolatilityReturnCount,
    });
    expect(optionRules["raw-3m-6m"]).toEqual({
      momentumMonths: [3, 6],
      rankingMode: "rawAverage",
      minVolatilityReturnCount: rawOneThreeRules.minVolatilityReturnCount,
    });
    expect(optionRules["raw-6m-12m"]).toEqual({
      momentumMonths: rawSixTwelveRules.momentumMonths,
      rankingMode: rawSixTwelveRules.rankingMode,
      minVolatilityReturnCount: rawSixTwelveRules.minVolatilityReturnCount,
    });
  });
});

function rankingFields(rules: {
  readonly momentumMonths?: readonly [number, number];
  readonly minVolatilityReturnCount: number;
}) {
  return {
    momentumMonths: rules.momentumMonths,
    minVolatilityReturnCount: rules.minVolatilityReturnCount,
  };
}
