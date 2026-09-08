import { Prisma, type PrismaClient } from "@prisma/client";

import {
  earlySuperstarsHistoricalRules,
  simulateEarlySuperstarsHistorical,
  type HistoricalRunnerCandidate,
  type HistoricalRunnerPrice,
  type HistoricalStrategyRunResult,
} from "@/lib/strategies/historical-runner";

const realSource = "UPSTOX_REAL";
const priceLoadBatchSize = 400;

export async function runEarlySuperstarsHistorical(input: {
  readonly strategyId: string;
  readonly requestedStartDate: Date;
  readonly requestedEndDate: Date;
  readonly client: PrismaClient;
}) {
  const strategy = await input.client.strategy.findUnique({
    where: { id: input.strategyId },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  if (!strategy) throw new Error("Strategy not found.");
  if (strategy.name !== "Early Superstars") {
    throw new Error("Automated historical runs are currently available only for Early Superstars.");
  }
  const version = strategy.versions[0];
  if (!version) throw new Error("No Early Superstars strategy version exists.");
  if (input.requestedEndDate <= input.requestedStartDate) {
    throw new Error("End Date must be after Start Date.");
  }

  const earliestLoadDate = addUtcDays(addUtcMonths(input.requestedStartDate, -3), -7);
  const candidates = await loadRealCanonicalCandidates(input.client);
  const prices = await loadRealPrices(
    input.client,
    earliestLoadDate,
    input.requestedEndDate,
    candidates.map((candidate) => candidate.instrumentId),
  );

  const result = simulateEarlySuperstarsHistorical({
    requestedStartDate: input.requestedStartDate,
    requestedEndDate: input.requestedEndDate,
    candidates,
    prices,
    rules: earlySuperstarsHistoricalRules,
  });

  return persistHistoricalRun(input.client, {
    strategyId: strategy.id,
    strategyVersionId: version.id,
    result,
  });
}

export async function getHistoricalStrategyRun(input: {
  readonly client: PrismaClient;
  readonly strategyId: string;
  readonly runId: string;
}) {
  return input.client.historicalStrategyRun.findFirst({
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
  const prices: HistoricalRunnerPrice[] = [];

  for (let index = 0; index < instrumentIds.length; index += priceLoadBatchSize) {
    const batchInstrumentIds = instrumentIds.slice(index, index + priceLoadBatchSize);
    const batch = await client.dailyPrice.findMany({
      where: {
        instrumentId: { in: batchInstrumentIds },
        tradingDate: { gte: startDate, lte: endDate },
        marketDataSource: realSource,
      },
      orderBy: [{ instrumentId: "asc" }, { tradingDate: "asc" }],
      select: {
        instrumentId: true,
        tradingDate: true,
        close: true,
        volume: true,
        marketDataSource: true,
      },
    });

    prices.push(...batch.map((price) => ({
      instrumentId: price.instrumentId,
      tradingDate: price.tradingDate,
      close: price.close.toNumber(),
      volume: Number(price.volume),
      marketDataSource: price.marketDataSource as "UPSTOX_REAL",
    })));
  }

  return prices;
}

async function persistHistoricalRun(
  client: PrismaClient,
  input: {
    readonly strategyId: string;
    readonly strategyVersionId: string;
    readonly result: HistoricalStrategyRunResult;
  },
) {
  const result = input.result;
  return client.$transaction(async (tx) => {
    const run = await tx.historicalStrategyRun.create({
      data: {
        strategyId: input.strategyId,
        strategyVersionId: input.strategyVersionId,
        status: "COMPLETED",
        requestedStartDate: parseDate(result.requestedStartDate),
        requestedEndDate: parseDate(result.requestedEndDate),
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
