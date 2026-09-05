import { z } from "zod";

import { parseStrategyConfig, type StrategyConfig } from "@/lib/strategies/config";

export const counterfactualOverrideSchema = z.object({
  entry: z.object({
    minMarketCap: z.number().optional(),
    minReturn3M: z.number().optional(),
    minAverageTradedValue: z.number().optional(),
    maxDebtToEquity: z.number().optional(),
    maxPositions: z.number().int().positive().optional(),
    rankingMetric: z.enum(["return1W", "return1M", "return3M", "return6M", "return1Y", "marketCap", "averageTradedValue"]).optional(),
    rankingDirection: z.enum(["asc", "desc"]).optional(),
  }).optional(),
  momentum: z.object({
    gracePeriodDays: z.number().int().positive().optional(),
    reviewIntervalDays: z.number().int().positive().optional(),
    holdingRankThreshold: z.number().int().positive().optional(),
  }).optional(),
  earlySuperstars: z.object({
    phase1DurationDays: z.number().int().positive().optional(),
    phase1RankThreshold: z.number().int().positive().optional(),
    phase2RankThreshold: z.number().int().positive().optional(),
    emergencyStopPercent: z.number().negative().optional(),
  }).optional(),
  costs: z.object({
    fixedFee: z.number().min(0).optional(),
    percentFee: z.number().min(0).optional(),
  }).optional(),
});

export type CounterfactualOverrides = z.infer<typeof counterfactualOverrideSchema>;

export type EffectiveCounterfactualConfig = {
  readonly strategyConfig: StrategyConfig;
  readonly costs: {
    readonly fixedFee: number;
    readonly percentFee: number;
  };
  readonly execution: {
    readonly entryPrice: "SIGNAL_DATE_CLOSE";
    readonly reviewSellPrice: "REVIEW_DATE_CLOSE";
    readonly stopPrice: "STOP_LEVEL_OR_OPEN_IF_GAPPED";
    readonly reviewHolidayConvention: "FIRST_TRADING_DAY_ON_OR_AFTER";
  };
  readonly momentum: {
    readonly gracePeriodDays: number;
    readonly reviewIntervalDays: number;
    readonly holdingRankThreshold: number;
  };
  readonly earlySuperstars: {
    readonly phase1DurationDays: number;
    readonly phase1RankThreshold: number;
    readonly phase2RankThreshold: number;
    readonly emergencyStopPercent: number;
    readonly reviewIntervalDays: number;
  };
};

export function buildEffectiveCounterfactualConfig(baseConfig: unknown, overridesInput: unknown): EffectiveCounterfactualConfig {
  const base = parseStrategyConfig(baseConfig);
  const overrides = counterfactualOverrideSchema.parse(overridesInput ?? {});
  return {
    strategyConfig: {
      ...base,
      eligibility: {
        ...base.eligibility,
        marketCap: overrides.entry?.minMarketCap === undefined
          ? base.eligibility.marketCap
          : { gte: overrides.entry.minMarketCap },
        debtToEquity: overrides.entry?.maxDebtToEquity === undefined
          ? base.eligibility.debtToEquity
          : { lt: overrides.entry.maxDebtToEquity },
        averageTradedValue: overrides.entry?.minAverageTradedValue === undefined
          ? base.eligibility.averageTradedValue
          : { gte: overrides.entry.minAverageTradedValue },
        returns: {
          ...base.eligibility.returns,
          ...(overrides.entry?.minReturn3M === undefined ? {} : { return3M: { gt: overrides.entry.minReturn3M } }),
        },
      },
      ranking: {
        metric: overrides.entry?.rankingMetric ?? base.ranking.metric,
        direction: overrides.entry?.rankingDirection ?? base.ranking.direction,
      },
      selection: {
        maxPositions: overrides.entry?.maxPositions ?? base.selection.maxPositions,
      },
    },
    costs: {
      fixedFee: overrides.costs?.fixedFee ?? 20,
      percentFee: overrides.costs?.percentFee ?? 0,
    },
    execution: {
      entryPrice: "SIGNAL_DATE_CLOSE",
      reviewSellPrice: "REVIEW_DATE_CLOSE",
      stopPrice: "STOP_LEVEL_OR_OPEN_IF_GAPPED",
      reviewHolidayConvention: "FIRST_TRADING_DAY_ON_OR_AFTER",
    },
    momentum: {
      gracePeriodDays: overrides.momentum?.gracePeriodDays ?? 30,
      reviewIntervalDays: overrides.momentum?.reviewIntervalDays ?? 14,
      holdingRankThreshold: overrides.momentum?.holdingRankThreshold ?? 30,
    },
    earlySuperstars: {
      phase1DurationDays: overrides.earlySuperstars?.phase1DurationDays ?? 90,
      phase1RankThreshold: overrides.earlySuperstars?.phase1RankThreshold ?? 50,
      phase2RankThreshold: overrides.earlySuperstars?.phase2RankThreshold ?? 30,
      emergencyStopPercent: overrides.earlySuperstars?.emergencyStopPercent ?? -15,
      reviewIntervalDays: 14,
    },
  };
}
