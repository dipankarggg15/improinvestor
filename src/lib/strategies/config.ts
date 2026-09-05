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

export const momentum10V1Config = strategyConfigSchema.parse({
  eligibility: {
    marketCap: { gt: 500 * 10_000_000 },
    debtToEquity: { lt: 2 },
    averageTradedValue: { gte: 5 * 10_000_000 },
    returns: {
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

export const earlySuperstarsV1Config = strategyConfigSchema.parse({
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
