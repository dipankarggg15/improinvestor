import { z } from "zod";

export const returnMetricKeys = ["return1W", "return1M", "return3M", "return6M", "return1Y"] as const;
export type ReturnMetricKey = (typeof returnMetricKeys)[number];

export const rankingMetricKeys = [
  "marketCap",
  "debtToEquity",
  "averageTradedValue",
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
