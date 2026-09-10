import type { MarketDataSource, Prisma, PrismaClient } from "@prisma/client";

import { parseStrategyConfig, strategyConfigForDisplay, type ReturnMetricKey, type StrategyConfig } from "@/lib/strategies/config";
import { getLiquidityStartDate, getStandardMetricDateTargets } from "@/lib/strategies/dates";
import {
  evaluateStrategy,
  type StrategyEngineCandidate,
  type StrategyFundamentalsPoint,
  type StrategyPricePoint,
} from "@/lib/strategies/engine";
import { getNextStrategyVersionNumber } from "@/lib/strategies/versioning";

const priceLoadBatchSize = 250;
const priceLoadConcurrency = 4;
const maxPriceLoadAttempts = 3;

export async function runCurrentStrategyVersion(input: {
  readonly strategyId: string;
  readonly runDate: Date;
  readonly client?: PrismaClient;
}) {
  const client = await getPrismaClient(input.client);
  const version = await client.strategyVersion.findFirst({
    where: {
      strategyId: input.strategyId,
      effectiveFrom: {
        lte: input.runDate,
      },
    },
    orderBy: {
      versionNumber: "desc",
    },
    include: {
      strategy: true,
    },
  });

  if (!version) {
    throw new Error("No effective strategy version exists for the selected run date.");
  }

  return runStrategyVersion({
    strategyId: input.strategyId,
    strategyVersionId: version.id,
    runDate: input.runDate,
    client,
  });
}

export async function runStrategyVersion(input: {
  readonly strategyId: string;
  readonly strategyVersionId: string;
  readonly runDate: Date;
  readonly client?: PrismaClient;
}) {
  const client = await getPrismaClient(input.client);
  const existing = await client.strategyRun.findUnique({
    where: {
      strategyVersionId_runDate: {
        strategyVersionId: input.strategyVersionId,
        runDate: input.runDate,
      },
    },
  });

  if (existing) {
    return existing;
  }

  const version = await client.strategyVersion.findUniqueOrThrow({
    where: {
      id: input.strategyVersionId,
    },
    include: {
      strategy: true,
    },
  });
  const config = strategyConfigForDisplay(version.strategy.name, version.config);
  const [snapshot, activeHoldings] = await Promise.all([
    loadStrategyMarketSnapshot(client, config, input.runDate),
    client.positionEpisode.findMany({
      where: {
        strategyVersionId: input.strategyVersionId,
        openedAt: { lte: input.runDate },
        OR: [{ closedAt: null }, { closedAt: { gt: input.runDate } }],
      },
      select: { companyId: true },
    }),
  ]);
  const evaluation = evaluateStrategy(config, input.runDate, snapshot, {
    activeHoldingCompanyIds: new Set(activeHoldings.map((holding) => holding.companyId)),
  });

  return client.$transaction(async (tx) => {
    const run = await tx.strategyRun.create({
      data: {
        strategyId: input.strategyId,
        strategyVersionId: input.strategyVersionId,
        runDate: input.runDate,
        status: "COMPLETED",
        startedAt: new Date(),
        completedAt: new Date(),
        evaluatedCount: evaluation.evaluatedCount,
        eligibleCount: evaluation.eligibleCount,
        selectedCount: evaluation.selectedCount,
      },
    });

    await tx.strategyCandidateSnapshot.createMany({
      data: evaluation.candidates.map((candidate) => ({
        strategyRunId: run.id,
        companyId: candidate.companyId,
        instrumentId: candidate.instrumentId,
        rank: candidate.rank,
        selected: candidate.selected,
        qualified: candidate.qualified,
        failureReasons: candidate.failureReasons,
        marketCap: toDecimalString(candidate.marketCap, 2),
        debtToEquity: toDecimalString(candidate.debtToEquity, 4),
        averageTradedValue: toDecimalString(candidate.averageTradedValue, 2),
        return1W: toDecimalString(candidate.returns.return1W, 4),
        return1M: toDecimalString(candidate.returns.return1M, 4),
        return3M: toDecimalString(candidate.returns.return3M, 4),
        return6M: toDecimalString(candidate.returns.return6M, 4),
        return1Y: toDecimalString(candidate.returns.return1Y, 4),
        rankingMetric: candidate.rankingMetric,
        rankingMetricValue: toDecimalString(candidate.rankingMetricValue, 4),
        metricTradingDates: candidate.metricDates,
        decisionMetrics: {
          marketCap: candidate.marketCap,
          debtToEquity: candidate.debtToEquity,
          averageTradedValue: candidate.averageTradedValue,
          returns: candidate.returns,
          rankingMetric: candidate.rankingMetric,
          rankingMetricValue: candidate.rankingMetricValue,
          failureReasons: candidate.failureReasons,
        },
      })),
    });

    return run;
  }, { timeout: 120_000 });
}

export async function createNextStrategyVersion(input: {
  readonly strategyId: string;
  readonly config?: StrategyConfig;
  readonly label?: string;
  readonly notes?: string;
  readonly effectiveFrom: Date;
  readonly client?: PrismaClient;
}) {
  const client = await getPrismaClient(input.client);
  const latest = await client.strategyVersion.findFirst({
    where: {
      strategyId: input.strategyId,
    },
    orderBy: {
      versionNumber: "desc",
    },
  });

  if (!latest && !input.config) {
    throw new Error("Cannot create a strategy version without a base version or config.");
  }

  return client.strategyVersion.create({
    data: {
      strategyId: input.strategyId,
      versionNumber: getNextStrategyVersionNumber(latest ? [latest.versionNumber] : []),
      label: input.label,
      notes: input.notes,
      effectiveFrom: input.effectiveFrom,
      config: (input.config ?? parseStrategyConfig(latest?.config)) as unknown as Prisma.InputJsonValue,
    },
  });
}

async function getPrismaClient(client?: PrismaClient) {
  if (client) {
    return client;
  }

  const dbModule = await import("@/lib/db/prisma");
  return dbModule.prisma;
}

export async function loadStrategyMarketSnapshot(
  client: PrismaClient,
  config: StrategyConfig,
  runDate: Date,
) {
  const targets = getStandardMetricDateTargets(runDate);
  const liquidityStart = getLiquidityStartDate(runDate, config.liquidity.lookback);
  const requiredMetricDates = requiredReturnMetricDates(config, targets);
  const earliestPriceDate = new Date(
    Math.min(
      ...(requiredMetricDates.length > 0 ? requiredMetricDates : Object.values(targets)).map((date) => date.getTime()),
      liquidityStart.getTime(),
    ),
  );
  const marketDataSource = await selectStrategyMarketDataSource(client);
  const companies = await client.company.findMany({
    where: { marketDataSource },
    select: {
      id: true,
      name: true,
      isin: true,
      instruments: {
        where: { active: true, marketDataSource },
        select: {
          id: true,
          exchange: true,
          symbol: true,
        },
      },
    },
  });
  const candidates = companies
    .map((company) => {
      const instrument =
        company.instruments.find((item) => item.exchange === "NSE") ??
        company.instruments.find((item) => item.exchange === "BSE");

      return instrument
        ? {
            companyId: company.id,
            companyName: company.name,
            isin: company.isin,
            instrumentId: instrument.id,
            symbol: instrument.symbol,
            exchange: instrument.exchange,
          }
        : null;
    })
    .filter((candidate): candidate is StrategyEngineCandidate => candidate !== null);
  const [prices, fundamentals] = await Promise.all([
    loadDailyPrices(client, {
      instrumentIds: candidates.map((candidate) => candidate.instrumentId),
      startDate: earliestPriceDate,
      endDate: runDate,
      marketDataSource,
    }),
    client.companyFundamentals.findMany({
      where: {
        companyId: {
          in: candidates.map((candidate) => candidate.companyId),
        },
        asOfDate: {
          lte: runDate,
        },
        marketDataSource,
      },
      orderBy: [{ companyId: "asc" }, { asOfDate: "desc" }],
      select: {
        companyId: true,
        asOfDate: true,
        marketCap: true,
        debtToEquity: true,
      },
    }),
  ]);

  return {
    candidates,
    prices: prices.map(
      (price): StrategyPricePoint => ({
        instrumentId: price.instrumentId,
        tradingDate: price.tradingDate,
        close: price.close.toNumber(),
        volume: Number(price.volume),
      }),
    ),
    fundamentals: fundamentals.map(
      (fundamental): StrategyFundamentalsPoint => ({
        companyId: fundamental.companyId,
        asOfDate: fundamental.asOfDate,
        marketCap: fundamental.marketCap?.toNumber() ?? null,
        debtToEquity: fundamental.debtToEquity?.toNumber() ?? null,
      }),
    ),
  };
}

async function selectStrategyMarketDataSource(client: PrismaClient): Promise<MarketDataSource> {
  const syntheticCompanyCount = await client.company.count({ where: { marketDataSource: "SYNTHETIC" } });
  return syntheticCompanyCount > 0 ? "SYNTHETIC" : "UPSTOX_REAL";
}

function requiredReturnMetricDates(
  config: StrategyConfig,
  targets: Record<ReturnMetricKey, Date>,
) {
  const metrics = new Set<ReturnMetricKey>([
    ...Object.keys(config.eligibility.returns ?? {}) as ReturnMetricKey[],
    ...(config.ranking.metric.startsWith("return") ? [config.ranking.metric as ReturnMetricKey] : []),
  ]);

  return [...metrics].map((metric) => targets[metric]);
}

async function loadDailyPrices(
  client: PrismaClient,
  input: {
    readonly instrumentIds: readonly string[];
    readonly startDate: Date;
    readonly endDate: Date;
    readonly marketDataSource: MarketDataSource;
  },
) {
  const batches = chunk(input.instrumentIds, priceLoadBatchSize);
  const priceBatches = await mapWithConcurrency(batches, priceLoadConcurrency, (instrumentIds) =>
    loadWithRetry(() => client.dailyPrice.findMany({
      where: {
        instrumentId: { in: instrumentIds },
        tradingDate: { gte: input.startDate, lte: input.endDate },
        marketDataSource: input.marketDataSource,
      },
      orderBy: [{ instrumentId: "asc" }, { tradingDate: "asc" }],
      select: {
        instrumentId: true,
        tradingDate: true,
        close: true,
        volume: true,
      },
    })),
  );

  return priceBatches.flat();
}

async function loadWithRetry<T>(load: () => Promise<T>) {
  for (let attempt = 1; attempt <= maxPriceLoadAttempts; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      if (attempt === maxPriceLoadAttempts || !isPrismaConnectionClosedError(error)) throw error;
      await delay(attempt * 500);
    }
  }

  throw new Error("Price load failed.");
}

function isPrismaConnectionClosedError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P1017";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, TResult>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<TResult>,
) {
  const results: TResult[] = [];
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await mapper(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function toDecimalString(value: number | null, decimals: number) {
  return value === null ? null : value.toFixed(decimals);
}
