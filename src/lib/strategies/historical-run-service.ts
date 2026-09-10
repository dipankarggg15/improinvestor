import { Prisma, type PrismaClient } from "@prisma/client";

import {
  earlySuperstarsHistoricalRules,
  momentum10HistoricalRules,
  simulateMomentum10Historical,
  simulateEarlySuperstarsHistorical,
  type EarlySuperstarsRules,
  type HistoricalRunnerCandidate,
  type HistoricalRunnerPrice,
  type HistoricalStrategyRunResult,
} from "@/lib/strategies/historical-runner";

const realSource = "UPSTOX_REAL";
const priceLoadBatchSize = 500;
const priceLoadConcurrency = 1;
const maxPriceLoadAttempts = 3;

export async function runEarlySuperstarsHistorical(input: {
  readonly strategyId: string;
  readonly requestedStartDate: Date;
  readonly requestedEndDate: Date;
  readonly client: PrismaClient;
}) {
  const run = await createEarlySuperstarsHistoricalRun(input);
  return completeEarlySuperstarsHistoricalRun({ client: input.client, runId: run.id });
}

export async function createEarlySuperstarsHistoricalRun(input: {
  readonly strategyId: string;
  readonly requestedStartDate: Date;
  readonly requestedEndDate: Date;
  readonly client: PrismaClient;
}) {
  const { strategy, version } = await loadRunnableHistoricalStrategy(input.client, input.strategyId);

  if (input.requestedEndDate <= input.requestedStartDate) {
    throw new Error("End Date must be after Start Date.");
  }

  return input.client.historicalStrategyRun.create({
    data: {
      strategyId: strategy.id,
      strategyVersionId: version.id,
      status: "RUNNING",
      requestedStartDate: input.requestedStartDate,
      requestedEndDate: input.requestedEndDate,
      initialCapital: decimal(initialCapitalForStrategy(strategy.name), 2),
      unavailableFilters: [],
      limitations: [],
      assumptions: [],
    },
  });
}

export async function completeEarlySuperstarsHistoricalRun(input: {
  readonly client: PrismaClient;
  readonly runId: string;
}) {
  const run = await input.client.historicalStrategyRun.findUnique({
    where: { id: input.runId },
    include: { strategy: true, strategyVersion: true },
  });

  if (!run) throw new Error("Historical strategy run not found.");
  if (run.status === "COMPLETED") return run;

  try {
    const candidates = await loadRealCanonicalCandidates(input.client);
    const rules = isMomentum10HistoricalStrategy(run.strategy.name)
      ? null
      : rulesForEarlySuperstarsVariant(run.strategy.name, run.strategyVersion.config);
    const earliestLoadDate = rules
      ? addUtcDays(addUtcMonths(run.requestedStartDate, -3), -rules.entryMomentumDays)
      : addUtcMonths(run.requestedStartDate, -3);
    const prices = await loadRealPrices(
      input.client,
      earliestLoadDate,
      run.requestedEndDate,
      candidates.map((candidate) => candidate.instrumentId),
    );

    const result = isMomentum10HistoricalStrategy(run.strategy.name)
      ? simulateMomentum10Historical({
          requestedStartDate: run.requestedStartDate,
          requestedEndDate: run.requestedEndDate,
          candidates,
          prices,
        })
      : simulateEarlySuperstarsHistorical({
          requestedStartDate: run.requestedStartDate,
          requestedEndDate: run.requestedEndDate,
          candidates,
          prices,
          rules: rules ?? undefined,
        });

    return persistHistoricalRun(input.client, {
      runId: run.id,
      result,
    });
  } catch (error) {
    await input.client.historicalStrategyRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown historical run failure.",
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

async function loadRunnableHistoricalStrategy(client: PrismaClient, strategyId: string) {
  const strategy = await client.strategy.findUnique({
    where: { id: strategyId },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  if (!strategy) throw new Error("Strategy not found.");
  if (!isAutomatedHistoricalStrategy(strategy.name)) {
    throw new Error("Automated historical runs are currently available only for Early Superstars and Momentum 10.");
  }

  const version = strategy.versions[0];
  if (!version) throw new Error("No strategy version exists.");

  return { strategy, version };
}

export function isEarlySuperstarsHistoricalStrategy(name: string) {
  return name === "Early Superstars" || name.startsWith("Early Superstars ");
}

export function isMomentum10HistoricalStrategy(name: string) {
  return name === "Momentum 10 - Price Only";
}

export function isAutomatedHistoricalStrategy(name: string) {
  return isEarlySuperstarsHistoricalStrategy(name) || isMomentum10HistoricalStrategy(name);
}

function initialCapitalForStrategy(name: string) {
  return isMomentum10HistoricalStrategy(name)
    ? momentum10HistoricalRules.initialCapital
    : earlySuperstarsHistoricalRules.initialCapital;
}

export function rulesForEarlySuperstarsVariant(strategyName: string, config: unknown): EarlySuperstarsRules {
  const entryMomentumDays = entryMomentumDaysForEarlySuperstarsVariant(strategyName, config);
  return {
    ...earlySuperstarsHistoricalRules,
    entryMomentumDays,
    entryMomentumLabel: entryMomentumDays === 7 ? "1W" : "2W",
  };
}

export function entryMomentumDaysForEarlySuperstarsVariant(strategyName: string, config: unknown): 7 | 14 {
  if (config && typeof config === "object" && "earlySuperstars" in config) {
    const earlySuperstars = (config as { readonly earlySuperstars?: unknown }).earlySuperstars;
    if (earlySuperstars && typeof earlySuperstars === "object" && "entryMomentumDays" in earlySuperstars) {
      const entryMomentumDays = (earlySuperstars as { readonly entryMomentumDays?: unknown }).entryMomentumDays;
      if (entryMomentumDays === 7 || entryMomentumDays === 14) return entryMomentumDays;
    }
  }

  return strategyName.includes("1W Entry") ? 7 : 14;
}

export function entryMomentumLabelForEarlySuperstarsVariant(strategyName: string, config: unknown) {
  return entryMomentumDaysForEarlySuperstarsVariant(strategyName, config) === 7 ? "1W" : "2W";
}

export async function getHistoricalStrategyRun(input: {
  readonly client: PrismaClient;
  readonly strategyId: string;
  readonly runId: string;
}) {
  const run = await input.client.historicalStrategyRun.findFirst({
    where: { id: input.runId, strategyId: input.strategyId },
    include: {
      strategy: true,
      strategyVersion: true,
      positions: {
        include: {
          company: { select: { name: true, isin: true } },
          instrument: { select: { symbol: true, exchange: true } },
        },
        orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
      },
      events: { orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }] },
      dailyEquity: { orderBy: { date: "asc" } },
    },
  });

  if (!run) return null;

  const returnIfHeldToEndByPositionId = run.effectiveEndDate
    ? await loadReturnIfHeldToEndPercent({
        client: input.client,
        effectiveEndDate: run.effectiveEndDate,
        positions: run.positions.map((position) => ({
          id: position.id,
          instrumentId: position.instrumentId,
          entryDate: position.entryDate,
          entryPrice: position.entryPrice.toNumber(),
        })),
      })
    : new Map<string, number | null>();

  return {
    ...run,
    positions: run.positions.map((position) => ({
      ...position,
      returnIfHeldToEndPercent: returnIfHeldToEndByPositionId.get(position.id) ?? null,
    })),
  };
}

export function calculateReturnIfHeldToEndPercent(input: {
  readonly entryPrice: number;
  readonly endPrice: number | null;
}) {
  if (!input.endPrice || input.entryPrice <= 0) return null;
  return roundPercent(((input.endPrice / input.entryPrice) - 1) * 100);
}

export function annotateReturnIfHeldToEndPercent<TPosition extends {
  readonly id: string;
  readonly instrumentId: string;
  readonly entryDate: Date;
  readonly entryPrice: number;
}>(input: {
  readonly positions: readonly TPosition[];
  readonly prices: readonly {
    readonly instrumentId: string;
    readonly tradingDate: Date;
    readonly close: number;
  }[];
}) {
  const pricesByInstrument = new Map<string, { close: number; tradingDate: Date }[]>();
  for (const price of input.prices) {
    pricesByInstrument.set(price.instrumentId, [
      ...(pricesByInstrument.get(price.instrumentId) ?? []),
      price,
    ]);
  }
  for (const prices of pricesByInstrument.values()) {
    prices.sort((left, right) => right.tradingDate.getTime() - left.tradingDate.getTime());
  }

  return input.positions.map((position) => {
    const endPrice = pricesByInstrument
      .get(position.instrumentId)
      ?.find((price) => price.tradingDate >= position.entryDate)?.close ?? null;

    return {
      ...position,
      returnIfHeldToEndPercent: calculateReturnIfHeldToEndPercent({
        entryPrice: position.entryPrice,
        endPrice,
      }),
    };
  });
}

async function loadRealCanonicalCandidates(client: PrismaClient): Promise<HistoricalRunnerCandidate[]> {
  const companies = await client.company.findMany({
    where: { marketDataSource: realSource },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isin: true,
      instruments: {
        where: { active: true, marketDataSource: realSource },
        select: { id: true, exchange: true, symbol: true },
      },
    },
  });

  return companies
    .map((company) => {
      const instrument = company.instruments.find((item) => item.exchange === "NSE") ??
        company.instruments.find((item) => item.exchange === "BSE");
      return instrument
        ? {
            companyId: company.id,
            companyName: company.name,
            isin: company.isin,
            instrumentId: instrument.id,
            symbol: instrument.symbol,
            exchange: instrument.exchange,
            marketDataSource: realSource,
          } satisfies HistoricalRunnerCandidate
        : null;
    })
    .filter((candidate): candidate is HistoricalRunnerCandidate => candidate !== null);
}

async function loadRealPrices(
  client: PrismaClient,
  startDate: Date,
  endDate: Date,
  instrumentIds: readonly string[],
): Promise<HistoricalRunnerPrice[]> {
  if (instrumentIds.length === 0) return [];

  const batches = chunk(instrumentIds, priceLoadBatchSize);
  const priceBatches = await mapWithConcurrency(batches, priceLoadConcurrency, async (batchInstrumentIds) => {
    const batch = await loadDailyPriceBatch(client, {
      instrumentIds: batchInstrumentIds,
      startDate,
      endDate,
    });

    return batch.map((price) => ({
      instrumentId: price.instrumentId,
      tradingDate: price.tradingDate,
      close: price.close,
      volume: Number(price.volume),
      marketDataSource: price.marketDataSource as "UPSTOX_REAL",
    }));
  });

  return priceBatches.flat();
}

async function loadReturnIfHeldToEndPercent(input: {
  readonly client: PrismaClient;
  readonly effectiveEndDate: Date;
  readonly positions: readonly {
    readonly id: string;
    readonly instrumentId: string;
    readonly entryDate: Date;
    readonly entryPrice: number;
  }[];
}) {
  const instrumentIds = [...new Set(input.positions.map((position) => position.instrumentId))];
  const earliestEntryDate = input.positions
    .map((position) => position.entryDate)
    .sort((left, right) => left.getTime() - right.getTime())[0];

  if (!earliestEntryDate || instrumentIds.length === 0) return new Map<string, number | null>();

  const pricesForHeldReturn = await loadWithRetry(() => input.client.$queryRaw<{
    instrumentId: string;
    tradingDate: Date;
    close: number;
  }[]>`
    SELECT DISTINCT ON ("instrumentId")
      "instrumentId",
      "tradingDate",
      close::float8 AS close
    FROM "DailyPrice"
    WHERE "instrumentId" IN (${Prisma.join(instrumentIds)})
      AND "tradingDate" >= ${earliestEntryDate}
      AND "tradingDate" <= ${input.effectiveEndDate}
      AND "marketDataSource"::text = ${realSource}
    ORDER BY "instrumentId", "tradingDate" DESC
  `);

  return new Map(annotateReturnIfHeldToEndPercent({
    positions: input.positions,
    prices: pricesForHeldReturn,
  }).map((position) => [position.id, position.returnIfHeldToEndPercent]));
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

async function loadDailyPriceBatch(
  client: PrismaClient,
  input: {
    readonly instrumentIds: readonly string[];
    readonly startDate: Date;
    readonly endDate: Date;
  },
) {
  return loadWithRetry(() => client.$queryRaw<{
    instrumentId: string;
    tradingDate: Date;
    close: number;
    volume: number;
    marketDataSource: "UPSTOX_REAL";
  }[]>`
    SELECT
      "instrumentId",
      "tradingDate",
      close::float8 AS close,
      volume::float8 AS volume,
      "marketDataSource"::text AS "marketDataSource"
    FROM "DailyPrice"
    WHERE "instrumentId" IN (${Prisma.join(input.instrumentIds)})
      AND "tradingDate" >= ${input.startDate}
      AND "tradingDate" <= ${input.endDate}
      AND "marketDataSource"::text = ${realSource}
    ORDER BY "instrumentId" ASC, "tradingDate" ASC
  `);
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

async function persistHistoricalRun(
  client: PrismaClient,
  input: {
    readonly runId: string;
    readonly result: HistoricalStrategyRunResult;
  },
) {
  const result = input.result;
  return client.$transaction(async (tx) => {
    await tx.historicalStrategyDailyEquity.deleteMany({ where: { runId: input.runId } });
    await tx.historicalStrategyEvent.deleteMany({ where: { runId: input.runId } });
    await tx.historicalStrategyPosition.deleteMany({ where: { runId: input.runId } });

    const run = await tx.historicalStrategyRun.update({
      where: { id: input.runId },
      data: {
        status: "COMPLETED",
        effectiveStartDate: parseDate(result.effectiveStartDate),
        effectiveEndDate: parseDate(result.effectiveEndDate),
        initialCapital: decimal(result.initialCapital, 2),
        endingValue: decimal(result.endingValue, 2),
        totalReturnPercent: decimal(result.totalReturnPercent, 4),
        cagrPercent: nullableDecimal(result.cagrPercent, 4),
        maxDrawdownPercent: decimal(result.maxDrawdownPercent, 4),
        initialPositionCount: result.initialPositionCount,
        tradeCount: result.tradeCount,
        stopLossExitCount: result.stopLossExitCount,
        monthlyRankExitCount: result.monthlyRankExitCount,
        graduationCount: result.graduationCount,
        endingOpenPositionCount: result.endingOpenPositionCount,
        unavailableFilters: result.unavailableFilters,
        limitations: result.limitations,
        assumptions: result.assumptions,
        errorMessage: null,
        completedAt: new Date(),
      },
    });

    const positionIds = new Map<string, string>();
    for (const position of result.positions) {
      const created = await tx.historicalStrategyPosition.create({
        data: {
          runId: run.id,
          companyId: position.companyId,
          instrumentId: position.instrumentId,
          status: position.status,
          entryDate: parseDate(position.entryDate),
          entryPrice: decimal(position.entryPrice, 4),
          quantity: decimal(position.quantity, 6),
          allocation: decimal(position.allocation, 2),
          entryRank: position.entryRank,
          entryReturn1W: nullableDecimal(position.entryReturn1W, 4),
          stopTriggerDate: nullableDate(position.stopTriggerDate),
          stopTriggerPrice: nullableDecimal(position.stopTriggerPrice, 4),
          exitDate: nullableDate(position.exitDate),
          exitPrice: nullableDecimal(position.exitPrice, 4),
          exitReason: position.exitReason,
          realizedReturnPercent: nullableDecimal(position.realizedReturnPercent, 4),
          reviewHistory: position.reviewHistory as unknown as Prisma.InputJsonValue,
        },
      });
      positionIds.set(position.clientId, created.id);
    }

    await tx.historicalStrategyEvent.createMany({
      data: result.events.map((item) => ({
        runId: run.id,
        positionId: item.positionClientId ? positionIds.get(item.positionClientId) ?? null : null,
        companyId: item.companyId,
        instrumentId: item.instrumentId,
        eventDate: parseDate(item.eventDate),
        eventType: item.eventType,
        details: item.details as Prisma.InputJsonValue,
      })),
    });

    await tx.historicalStrategyDailyEquity.createMany({
      data: result.dailyEquity.map((point) => ({
        runId: run.id,
        date: parseDate(point.date),
        cash: decimal(point.cash, 2),
        investedValue: decimal(point.investedValue, 2),
        totalEquity: decimal(point.totalEquity, 2),
        cumulativeReturnPercent: decimal(point.cumulativeReturnPercent, 4),
        drawdownPercent: decimal(point.drawdownPercent, 4),
        openPositionCount: point.openPositionCount,
      })),
    });

    return run;
  }, { timeout: 120_000 });
}

export function parseHistoricalRunDate(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} is required.`);
  }
  return parseDate(value);
}

function nullableDate(value: string | null) {
  return value ? parseDate(value) : null;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function decimal(value: number, decimals: number) {
  return value.toFixed(decimals);
}

function nullableDecimal(value: number | null, decimals: number) {
  return value === null ? null : decimal(value, decimals);
}

function roundPercent(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function addUtcMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
