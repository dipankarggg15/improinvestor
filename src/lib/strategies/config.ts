import { z } from "zod";

export const returnMetricKeys = ["return1W", "return1M", "return3M", "return6M", "return1Y"] as const;
export type ReturnMetricKey = (typeof returnMetricKeys)[number];

export const rankingMetricKeys = [
  "marketCap",
  "debtToEquity",
  "averageTradedValue",
  "momentumScore",
  ...returnMetricKeys,
] as const;
export type RankingMetricKey = (typeof rankingMetricKeys)[number];

const thresholdSchema = z.object({
  gt: z.number().optional(),
  gte: z.number().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
});

export const strategyConfigSchema = z.object({
  earlySuperstars: z.object({
    entryMomentumDays: z.union([z.literal(7), z.literal(14)]),
  }).optional(),
  nseMomentum: z.object({
    methodology: z.enum(["custom", "parentStyleFullUniverse"]).optional(),
    universeMode: z.enum(["nseIneOrdinaryEquity"]).optional(),
    rankingMode: z.enum(["volatilityAdjusted", "rawReturns", "rawAverage"]).optional(),
    momentumMonths: z.tuple([z.literal(6), z.literal(12)]).optional(),
    maxEntryRank: z.number().int().positive().optional(),
    parentMomentumMonths: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
    parentPortfolioManagement: z.enum(["equalWeight", "retainSurvivors"]).optional(),
    rebalanceFrequencyMonths: z.number().int().positive().optional(),
    skipTopRanks: z.number().int().min(0),
    minBuyReturn1M: z.number().optional(),
    minBuyReturn3M: z.number().optional(),
    applyBuyStrengthFilterOnReview: z.boolean().optional(),
    maxNewPositionWeightPercent: z.number().positive().optional(),
    useAvailableCashForReplacements: z.boolean().optional(),
    skipLikelyUpperCircuitBuys: z.boolean().optional(),
    likelyUpperCircuitMinGainPercent: z.number().positive().optional(),
    winnerReinvestment: z.object({
      enabled: z.boolean(),
      winnerReturnPercent: z.number(),
      winnerBudgetPercent: z.number().min(0).max(100),
    }).optional(),
    formerHoldingReentry: z.object({
      enabled: z.boolean(),
      maxRank: z.number().int().positive(),
      reentryBudgetPercentOfExitProceeds: z.number().min(0).max(100).optional(),
    }).optional(),
    holdingRankThreshold: z.number().int().positive().optional(),
    reviewExitMode: z.enum(["rankThreshold", "threeMonthReturnThreshold"]).optional(),
    minReviewReturn3M: z.number().optional(),
    lossProtection: z.object({
      enabled: z.boolean(),
      exitMode: z.enum(["peakDrawdown", "marketBreadth200Day"]).optional(),
      peakDrawdownPercent: z.number().positive().max(100).optional(),
      drawdownReference: z.enum(["peak", "initialCapital"]).optional(),
      liquidationPercent: z.number().positive().max(100).optional(),
      maxTriggers: z.number().int().positive().optional(),
      reentryMode: z.enum(["nextCalendarYear", "cooldownMonths", "marketBreadth200Day"]),
      cooldownMonths: z.number().int().nonnegative().optional(),
      recoveryLookbackSessions: z.number().int().positive().optional(),
      recoveryBreadthPercent: z.number().positive().max(100).optional(),
      recoveryConfirmationSessions: z.number().int().positive().optional(),
    }).optional(),
    capitalDeployment: z.object({
      enabled: z.boolean(),
      initialPercent: z.number().positive().max(100),
      delayedPercent: z.number().positive().max(100),
      delayMonths: z.number().int().positive(),
    }).optional(),
  }).optional(),
  eligibility: z.object({
    marketCap: thresholdSchema.optional(),
    debtToEquity: thresholdSchema.optional(),
    averageTradedValue: thresholdSchema.optional(),
    returns: z.partialRecord(z.enum(returnMetricKeys), thresholdSchema).optional(),
  }),
  liquidity: z.object({
    lookback: z.discriminatedUnion("type", [
      z.object({ type: z.literal("calendarMonths"), months: z.number().int().positive() }),
      z.object({ type: z.literal("tradingSessions"), sessions: z.number().int().positive() }),
    ]),
  }),
  ranking: z.object({
    metric: z.enum(rankingMetricKeys),
    direction: z.enum(["asc", "desc"]),
  }),
  selection: z.object({
    maxPositions: z.number().int().positive(),
  }),
});

export type StrategyConfig = z.infer<typeof strategyConfigSchema>;

export function parseStrategyConfig(config: unknown): StrategyConfig {
  return strategyConfigSchema.parse(config);
}

export function strategyConfigForDisplay(strategyName: string, config: unknown): StrategyConfig {
  const parsed = parseStrategyConfig(config);
  if (!strategyName.startsWith("Momentum 10")) return parsed;

  return {
    ...parsed,
    eligibility: {
      ...parsed.eligibility,
      marketCap: undefined,
      debtToEquity: undefined,
      returns: {
        ...parsed.eligibility.returns,
        return1M: { gte: 4, lte: 21 },
        return3M: { gt: 50 },
      },
    },
  };
}

export const momentum10V1Config = strategyConfigSchema.parse({
  eligibility: {
    averageTradedValue: { gte: 5 * 10_000_000 },
    returns: {
      return1M: { gte: 4, lte: 21 },
      return3M: { gt: 50 },
    },
  },
  liquidity: {
    lookback: { type: "calendarMonths", months: 1 },
  },
  ranking: {
    metric: "return1M",
    direction: "asc",
  },
  selection: {
    maxPositions: 10,
  },
});

export const nseMomentumV1Config = strategyConfigSchema.parse({
  nseMomentum: {
    skipTopRanks: 0,
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 20,
  },
});

export const nseParentMomentumFullUniverseV1Config = strategyConfigSchema.parse({
  nseMomentum: {
    methodology: "parentStyleFullUniverse",
    rankingMode: "volatilityAdjusted",
    rebalanceFrequencyMonths: 6,
    skipTopRanks: 0,
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 50,
  },
});

export const nseParentMomentumFullUniverseV2Config = strategyConfigSchema.parse({
  nseMomentum: {
    methodology: "parentStyleFullUniverse",
    rankingMode: "volatilityAdjusted",
    parentMomentumMonths: [3, 6],
    rebalanceFrequencyMonths: 3,
    skipTopRanks: 0,
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 50,
  },
});

export const nseParentMomentumFullUniverseV3Config = strategyConfigSchema.parse({
  nseMomentum: {
    methodology: "parentStyleFullUniverse",
    rankingMode: "volatilityAdjusted",
    parentMomentumMonths: [1, 3],
    rebalanceFrequencyMonths: 1,
    skipTopRanks: 0,
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 50,
  },
});

export const nseParentMomentumFullUniverseV4Config = strategyConfigSchema.parse({
  nseMomentum: {
    methodology: "parentStyleFullUniverse",
    rankingMode: "volatilityAdjusted",
    parentMomentumMonths: [6, 12],
    rebalanceFrequencyMonths: 6,
    skipTopRanks: 0,
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 40,
  },
});

export const nseParentMomentumFullUniverseV5Config = strategyConfigSchema.parse({
  nseMomentum: {
    methodology: "parentStyleFullUniverse",
    rankingMode: "volatilityAdjusted",
    parentMomentumMonths: [6, 12],
    rebalanceFrequencyMonths: 6,
    skipTopRanks: 0,
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 30,
  },
});

export const nseParentMomentumFullUniverseV6Config = strategyConfigSchema.parse({
  nseMomentum: {
    methodology: "parentStyleFullUniverse",
    rankingMode: "volatilityAdjusted",
    parentMomentumMonths: [6, 12],
    rebalanceFrequencyMonths: 6,
    skipTopRanks: 0,
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 20,
  },
});

export const nseParentMomentumFullUniverseV7Config = strategyConfigSchema.parse({
  nseMomentum: {
    methodology: "parentStyleFullUniverse",
    rankingMode: "volatilityAdjusted",
    parentMomentumMonths: [6, 12],
    rebalanceFrequencyMonths: 6,
    skipTopRanks: 0,
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 25,
  },
});

export const nseParentMomentumFullUniverseV8Config = strategyConfigSchema.parse({
  nseMomentum: {
    methodology: "parentStyleFullUniverse",
    rankingMode: "volatilityAdjusted",
    parentMomentumMonths: [6, 12],
    rebalanceFrequencyMonths: 3,
    skipTopRanks: 0,
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 25,
  },
});

export const nseParentMomentumFullUniverseV9Config = strategyConfigSchema.parse({
  nseMomentum: {
    methodology: "parentStyleFullUniverse",
    rankingMode: "volatilityAdjusted",
    parentMomentumMonths: [6, 12],
    rebalanceFrequencyMonths: 1,
    skipTopRanks: 0,
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 25,
  },
});

export const nseParentMomentumFullUniverseV10Config = strategyConfigSchema.parse({
  ...nseParentMomentumFullUniverseV9Config,
  nseMomentum: {
    ...nseParentMomentumFullUniverseV9Config.nseMomentum,
    universeMode: "nseIneOrdinaryEquity",
  },
});

const nseParentMomentumMonthlyRebalanceBaseConfig = strategyConfigSchema.parse({
  ...nseParentMomentumFullUniverseV9Config,
  nseMomentum: {
    ...nseParentMomentumFullUniverseV9Config.nseMomentum,
    parentPortfolioManagement: "retainSurvivors",
    rebalanceFrequencyMonths: 1,
    skipLikelyUpperCircuitBuys: true,
    likelyUpperCircuitMinGainPercent: 4.5,
    universeMode: "nseIneOrdinaryEquity",
  },
});

export const nseParentMomentumSurvivorsV1Config = strategyConfigSchema.parse({
  ...nseParentMomentumMonthlyRebalanceBaseConfig,
  nseMomentum: {
    ...nseParentMomentumMonthlyRebalanceBaseConfig.nseMomentum,
    parentMomentumMonths: [1, 3],
  },
});

export const nseParentMomentumSurvivorsV2Config = strategyConfigSchema.parse({
  ...nseParentMomentumMonthlyRebalanceBaseConfig,
  nseMomentum: {
    ...nseParentMomentumMonthlyRebalanceBaseConfig.nseMomentum,
    parentMomentumMonths: [3, 6],
  },
});

export const nseParentMomentumSurvivorsV3Config = strategyConfigSchema.parse({
  ...nseParentMomentumMonthlyRebalanceBaseConfig,
  nseMomentum: {
    ...nseParentMomentumMonthlyRebalanceBaseConfig.nseMomentum,
    parentMomentumMonths: [6, 12],
  },
});

export const nseMomentumStrengthV2Config = strategyConfigSchema.parse({
  nseMomentum: {
    skipTopRanks: 0,
    minBuyReturn1M: 5,
    minBuyReturn3M: 50,
    applyBuyStrengthFilterOnReview: true,
    maxNewPositionWeightPercent: 5,
    useAvailableCashForReplacements: true,
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 20,
  },
});

export const nseMomentumSixTwelveV3Config = strategyConfigSchema.parse({
  ...nseMomentumStrengthV2Config,
  nseMomentum: {
    ...nseMomentumStrengthV2Config.nseMomentum,
    momentumMonths: [6, 12],
    maxEntryRank: 25,
    minBuyReturn1M: undefined,
    minBuyReturn3M: undefined,
    applyBuyStrengthFilterOnReview: false,
  },
  selection: { maxPositions: 25 },
});

export const nseMomentumSixTwelveV4Config = strategyConfigSchema.parse({
  ...nseMomentumSixTwelveV3Config,
  nseMomentum: {
    ...nseMomentumSixTwelveV3Config.nseMomentum,
    universeMode: "nseIneOrdinaryEquity",
  },
});

export const nseMomentumLossProtectionV1Config = strategyConfigSchema.parse({
  ...nseMomentumSixTwelveV4Config,
  nseMomentum: {
    ...nseMomentumSixTwelveV4Config.nseMomentum,
    holdingRankThreshold: 50,
    lossProtection: {
      enabled: true,
      peakDrawdownPercent: 20,
      reentryMode: "nextCalendarYear",
    },
  },
});

export const nseMomentumLossProtectionV2Config = strategyConfigSchema.parse({
  ...nseMomentumSixTwelveV4Config,
  nseMomentum: {
    ...nseMomentumSixTwelveV4Config.nseMomentum,
    holdingRankThreshold: 50,
    lossProtection: {
      enabled: true,
      peakDrawdownPercent: 20,
      reentryMode: "cooldownMonths",
      cooldownMonths: 3,
    },
  },
});

export const nseMomentumLossProtectionV3Config = strategyConfigSchema.parse({
  ...nseMomentumSixTwelveV4Config,
  nseMomentum: {
    ...nseMomentumSixTwelveV4Config.nseMomentum,
    holdingRankThreshold: 50,
    lossProtection: {
      enabled: true,
      peakDrawdownPercent: 20,
      reentryMode: "marketBreadth200Day",
      cooldownMonths: 1,
      recoveryLookbackSessions: 200,
      recoveryBreadthPercent: 50,
    },
  },
});

export const nseMomentumLossProtectionV4Config = strategyConfigSchema.parse({
  ...nseMomentumSixTwelveV4Config,
  nseMomentum: {
    ...nseMomentumSixTwelveV4Config.nseMomentum,
    holdingRankThreshold: 50,
    lossProtection: {
      enabled: true,
      exitMode: "marketBreadth200Day",
      reentryMode: "marketBreadth200Day",
      cooldownMonths: 0,
      recoveryLookbackSessions: 200,
      recoveryBreadthPercent: 50,
    },
  },
});

export const nseMomentumLossProtectionV5Config = strategyConfigSchema.parse({
  ...nseMomentumSixTwelveV4Config,
  nseMomentum: {
    ...nseMomentumSixTwelveV4Config.nseMomentum,
    holdingRankThreshold: 50,
    lossProtection: {
      enabled: true,
      exitMode: "peakDrawdown",
      peakDrawdownPercent: 20,
      liquidationPercent: 50,
      reentryMode: "marketBreadth200Day",
      cooldownMonths: 1,
      recoveryLookbackSessions: 200,
      recoveryBreadthPercent: 50,
    },
  },
});

export const nseMomentumLossProtectionV6Config = strategyConfigSchema.parse({
  ...nseMomentumSixTwelveV4Config,
  nseMomentum: {
    ...nseMomentumSixTwelveV4Config.nseMomentum,
    holdingRankThreshold: 50,
    lossProtection: {
      enabled: true,
      exitMode: "peakDrawdown",
      peakDrawdownPercent: 25,
      drawdownReference: "initialCapital",
      liquidationPercent: 100,
      maxTriggers: 1,
      reentryMode: "marketBreadth200Day",
      cooldownMonths: 0,
      recoveryLookbackSessions: 200,
      recoveryBreadthPercent: 50,
      recoveryConfirmationSessions: 5,
    },
  },
});

export const nseMomentumLossProtectionV7Config = strategyConfigSchema.parse({
  ...nseMomentumLossProtectionV6Config,
  nseMomentum: {
    ...nseMomentumLossProtectionV6Config.nseMomentum,
    lossProtection: {
      ...nseMomentumLossProtectionV6Config.nseMomentum?.lossProtection,
      cooldownMonths: 6,
    },
  },
});

export const nseMomentumTwoPhaseV1Config = strategyConfigSchema.parse({
  ...nseMomentumSixTwelveV4Config,
  nseMomentum: {
    ...nseMomentumSixTwelveV4Config.nseMomentum,
    capitalDeployment: {
      enabled: true,
      initialPercent: 50,
      delayedPercent: 50,
      delayMonths: 12,
    },
  },
});

export const nseMomentumTwoPhaseV2Config = strategyConfigSchema.parse({
  ...nseMomentumSixTwelveV4Config,
  nseMomentum: {
    ...nseMomentumSixTwelveV4Config.nseMomentum,
    capitalDeployment: {
      enabled: true,
      initialPercent: 50,
      delayedPercent: 50,
      delayMonths: 6,
    },
  },
});

export const nseMomentumRawV1Config = strategyConfigSchema.parse({
  nseMomentum: {
    rankingMode: "rawReturns",
    skipTopRanks: 0,
    minBuyReturn1M: 5,
    minBuyReturn3M: 50,
    maxNewPositionWeightPercent: 5,
    useAvailableCashForReplacements: true,
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 20,
  },
});

export const nseMomentumRawNoZScoreV2Config = strategyConfigSchema.parse({
  nseMomentum: {
    rankingMode: "rawAverage",
    skipTopRanks: 0,
    minBuyReturn1M: 5,
    minBuyReturn3M: 50,
    maxNewPositionWeightPercent: 5,
    useAvailableCashForReplacements: true,
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 20,
  },
});

export const nseMomentumRawSixTwelveV3Config = strategyConfigSchema.parse({
  ...nseMomentumSixTwelveV3Config,
  nseMomentum: {
    ...nseMomentumSixTwelveV3Config.nseMomentum,
    rankingMode: "rawAverage",
  },
});

export const nseMomentumRawSixTwelveV4Config = strategyConfigSchema.parse({
  ...nseMomentumRawSixTwelveV3Config,
  nseMomentum: {
    ...nseMomentumRawSixTwelveV3Config.nseMomentum,
    universeMode: "nseIneOrdinaryEquity",
  },
});

export const nseMomentumRawWinnersV1Config = strategyConfigSchema.parse({
  nseMomentum: {
    rankingMode: "rawAverage",
    skipTopRanks: 0,
    minBuyReturn1M: 5,
    minBuyReturn3M: 50,
    maxNewPositionWeightPercent: 5,
    useAvailableCashForReplacements: true,
    winnerReinvestment: {
      enabled: true,
      winnerReturnPercent: 50,
      winnerBudgetPercent: 100,
    },
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 20,
  },
});

export const nseMomentumRawComebackWinnersV1Config = strategyConfigSchema.parse({
  nseMomentum: {
    rankingMode: "rawAverage",
    skipTopRanks: 0,
    minBuyReturn1M: 5,
    minBuyReturn3M: 50,
    maxNewPositionWeightPercent: 5,
    useAvailableCashForReplacements: true,
    winnerReinvestment: {
      enabled: true,
      winnerReturnPercent: 50,
      winnerBudgetPercent: 100,
    },
    formerHoldingReentry: {
      enabled: true,
      maxRank: 20,
    },
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 20,
  },
});

export const nseMomentumRawComebackWinnersV2Config = strategyConfigSchema.parse({
  ...nseMomentumRawComebackWinnersV1Config,
  nseMomentum: {
    ...nseMomentumRawComebackWinnersV1Config.nseMomentum,
    applyBuyStrengthFilterOnReview: false,
    formerHoldingReentry: {
      enabled: true,
      maxRank: 50,
      reentryBudgetPercentOfExitProceeds: 5,
    },
  },
});

export const nseMomentumAfter10V1Config = strategyConfigSchema.parse({
  nseMomentum: {
    skipTopRanks: 10,
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 20,
  },
});

export const nseMomentumAfter10V2Config = strategyConfigSchema.parse({
  ...nseMomentumAfter10V1Config,
  nseMomentum: {
    ...nseMomentumAfter10V1Config.nseMomentum,
    skipTopRanks: 0,
    holdingRankThreshold: 60,
  },
  selection: {
    maxPositions: 30,
  },
});

export const nseMomentumWinnersV1Config = strategyConfigSchema.parse({
  nseMomentum: {
    skipTopRanks: 0,
    winnerReinvestment: {
      enabled: true,
      winnerReturnPercent: 50,
      winnerBudgetPercent: 100,
    },
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 20,
  },
});

export const nseMomentumWinnersV7Config = strategyConfigSchema.parse({
  ...nseMomentumSixTwelveV3Config,
  nseMomentum: {
    ...nseMomentumSixTwelveV3Config.nseMomentum,
    winnerReinvestment: nseMomentumWinnersV1Config.nseMomentum!.winnerReinvestment,
  },
});

export const nseMomentumWinnersV8Config = strategyConfigSchema.parse({
  ...nseMomentumWinnersV7Config,
  nseMomentum: {
    ...nseMomentumWinnersV7Config.nseMomentum,
    winnerReinvestment: {
      ...nseMomentumWinnersV7Config.nseMomentum!.winnerReinvestment!,
      winnerBudgetPercent: 50,
    },
  },
});

export const nseMomentumWinnersV9Config = strategyConfigSchema.parse({
  ...nseMomentumWinnersV8Config,
  nseMomentum: {
    ...nseMomentumWinnersV8Config.nseMomentum,
    winnerReinvestment: {
      ...nseMomentumWinnersV8Config.nseMomentum!.winnerReinvestment!,
      winnerBudgetPercent: 30,
    },
  },
});

export const nseMomentumWinnersV10Config = strategyConfigSchema.parse({
  ...nseMomentumWinnersV9Config,
  nseMomentum: {
    ...nseMomentumWinnersV9Config.nseMomentum,
    winnerReinvestment: {
      ...nseMomentumWinnersV9Config.nseMomentum!.winnerReinvestment!,
      winnerBudgetPercent: 20,
    },
  },
});

export const nseMomentumWinnersV11Config = strategyConfigSchema.parse({
  ...nseMomentumWinnersV10Config,
  nseMomentum: {
    ...nseMomentumWinnersV10Config.nseMomentum,
    universeMode: "nseIneOrdinaryEquity",
  },
});

export const nseMomentumAfter10WinnersV1Config = strategyConfigSchema.parse({
  nseMomentum: {
    skipTopRanks: 10,
    winnerReinvestment: {
      enabled: true,
      winnerReturnPercent: 50,
      winnerBudgetPercent: 100,
    },
  },
  eligibility: {},
  liquidity: {
    lookback: { type: "calendarMonths", months: 12 },
  },
  ranking: {
    metric: "momentumScore",
    direction: "desc",
  },
  selection: {
    maxPositions: 20,
  },
});

export const earlySuperstars2WEntryConfig = strategyConfigSchema.parse({
  earlySuperstars: {
    entryMomentumDays: 14,
  },
  eligibility: {
    marketCap: { gte: 2_000 * 10_000_000 },
    debtToEquity: { lt: 2 },
    averageTradedValue: { gte: 5 * 10_000_000 },
    returns: {
      return1W: { gt: 5 },
      return1M: { lt: 50 },
      return3M: { lt: 50 },
    },
  },
  liquidity: {
    lookback: { type: "calendarMonths", months: 1 },
  },
  ranking: {
    metric: "return1W",
    direction: "desc",
  },
  selection: {
    maxPositions: 10,
  },
});

export const earlySuperstars1WEntryConfig = strategyConfigSchema.parse({
  earlySuperstars: {
    entryMomentumDays: 7,
  },
  eligibility: {
    marketCap: { gte: 2_000 * 10_000_000 },
    debtToEquity: { lt: 2 },
    averageTradedValue: { gte: 5 * 10_000_000 },
    returns: {
      return1W: { gt: 5 },
      return1M: { lt: 50 },
      return3M: { lt: 50 },
    },
  },
  liquidity: {
    lookback: { type: "calendarMonths", months: 1 },
  },
  ranking: {
    metric: "return1W",
    direction: "desc",
  },
  selection: {
    maxPositions: 10,
  },
});

export const earlySuperstarsV1Config = earlySuperstars2WEntryConfig;
