import { Prisma, type PrismaClient } from "@prisma/client";

import { createUpstoxMarketDataProviderCore } from "@/lib/market-data/providers/upstox-core";
import { runUpstoxRealMarketSync } from "@/lib/market-data/upstox-sync";
import {
  rankNseMomentumForDate,
  type HistoricalRunnerCandidate,
  type HistoricalRunnerPrice,
  type NseMomentumRankedCandidate,
} from "@/lib/strategies/historical-runner";

const realSource = "UPSTOX_REAL";
const nseInstrumentKeyPrefix = "NSE_EQ|INE";
const priceLoadBatchSize = 500;

export type FindingMomentumResult = {
  readonly selectedDate: string;
  readonly latestLocalCompletedTradingDate: string | null;
  readonly latestUpstoxCompletedTradingDate: string | null;
  readonly dataUpdatedThrough: string | null;
  readonly rankingDateUsed: string | null;
  readonly sync: {
    readonly checked: boolean;
    readonly ran: boolean;
    readonly startDate: string | null;
    readonly endDate: string | null;
    readonly candlesUpserted: number;
    readonly skipped: number;
    readonly failed: number;
    readonly error: string | null;
  };
  readonly eligibleUniverseCount: number;
  readonly rows: FindingMomentumRow[];
};

export type FindingMomentumRow = {
  readonly rank: number;
  readonly company: string;
  readonly symbol: string;
  readonly close: number;
  readonly return1M: number;
  readonly return3M: number;
  readonly annualizedVolatilityPercent: number;
  readonly riskAdjusted1M: number;
  readonly riskAdjusted3M: number;
  readonly z1M: number;
  readonly z3M: number;
  readonly momentumScore: number;
};

export async function getFindingMomentum(input: {
  readonly client: PrismaClient;
  readonly selectedDate?: string;
  readonly now?: Date;
}): Promise<FindingMomentumResult> {
  const provider = createUpstoxMarketDataProviderCore({
    token: process.env.UPSTOX_ANALYTICS_TOKEN,
  });
  const localBeforeSync = await latestLocalNsePriceDate(input.client);
  const freshness = await safeLatestCompletedUpstoxNseTradingDate(input.client, provider, input.now);
  const sync = freshness.date
    ? await safeEnsureFreshNseDailyPrices({
        client: input.client,
        provider,
        localDate: localBeforeSync,
        upstoxDate: freshness.date,
      })
    : {
        checked: true,
        ran: false,
        startDate: null,
        endDate: null,
        candlesUpserted: 0,
        skipped: 0,
        failed: 0,
        error: freshness.error,
      };
  const dataUpdatedThrough = await latestLocalNsePriceDate(input.client);
  const selectedDate = input.selectedDate ?? dateKey(freshness.date ?? dataUpdatedThrough ?? new Date());
  const rankingDateUsed = await latestLocalTradingDateOnOrBefore(input.client, parseDate(selectedDate));

  if (!rankingDateUsed) {
    return {
      selectedDate,
      latestLocalCompletedTradingDate: nullableDateKey(localBeforeSync),
      latestUpstoxCompletedTradingDate: nullableDateKey(freshness.date),
      dataUpdatedThrough: nullableDateKey(dataUpdatedThrough),
      rankingDateUsed: null,
      sync,
      eligibleUniverseCount: 0,
      rows: [],
    };
  }

  const candidates = await loadNseCandidates(input.client);
  const prices = await loadNsePrices(input.client, {
    instrumentIds: candidates.map((candidate) => candidate.instrumentId),
    startDate: addUtcMonths(rankingDateUsed, -13),
    endDate: rankingDateUsed,
  });
  const ranked = rankNseMomentumForDate({
    rankingDate: rankingDateUsed,
    candidates,
    prices,
  });

  return {
    selectedDate,
    latestLocalCompletedTradingDate: nullableDateKey(localBeforeSync),
    latestUpstoxCompletedTradingDate: nullableDateKey(freshness.date),
    dataUpdatedThrough: nullableDateKey(dataUpdatedThrough),
    rankingDateUsed: dateKey(rankingDateUsed),
    sync,
    eligibleUniverseCount: ranked.length,
    rows: ranked.slice(0, 60).map((candidate) => toFindingMomentumRow(candidate, prices, rankingDateUsed)),
  };
}

async function ensureFreshNseDailyPrices(input: {
  readonly client: PrismaClient;
  readonly provider: ReturnType<typeof createUpstoxMarketDataProviderCore>;
  readonly localDate: Date | null;
  readonly upstoxDate: Date;
}): Promise<FindingMomentumResult["sync"]> {
  if (input.localDate && dateKey(input.localDate) >= dateKey(input.upstoxDate)) {
    return {
      checked: true,
      ran: false,
      startDate: null,
      endDate: dateKey(input.upstoxDate),
      candlesUpserted: 0,
      skipped: 0,
      failed: 0,
      error: null,
    };
  }

  const startDate = input.localDate ? addUtcDays(input.localDate, 1) : addUtcMonths(input.upstoxDate, -13);
  const result = await runUpstoxRealMarketSync({
    client: input.client,
    provider: input.provider,
    mode: "incremental",
    exchanges: ["NSE"],
    startDate,
    endDate: input.upstoxDate,
    concurrency: 4,
    progressEvery: 100,
  });

  return {
    checked: true,
    ran: true,
    startDate: dateKey(startDate),
    endDate: dateKey(input.upstoxDate),
    candlesUpserted: result.candlesUpserted,
    skipped: result.skipped,
    failed: result.failed,
    error: result.failed > 0 ? `${result.failed} Upstox instrument(s) failed during incremental sync.` : null,
  };
}

async function safeEnsureFreshNseDailyPrices(input: {
  readonly client: PrismaClient;
  readonly provider: ReturnType<typeof createUpstoxMarketDataProviderCore>;
  readonly localDate: Date | null;
  readonly upstoxDate: Date;
}): Promise<FindingMomentumResult["sync"]> {
  try {
    return await ensureFreshNseDailyPrices(input);
  } catch (error) {
    return {
      checked: true,
      ran: false,
      startDate: null,
      endDate: dateKey(input.upstoxDate),
      candlesUpserted: 0,
      skipped: 0,
      failed: 0,
      error: error instanceof Error ? error.message : "Could not update NSE daily prices from Upstox.",
    };
  }
}

async function safeLatestCompletedUpstoxNseTradingDate(
  client: PrismaClient,
  provider: ReturnType<typeof createUpstoxMarketDataProviderCore>,
  now = new Date(),
) {
  try {
    return {
      date: await latestCompletedUpstoxNseTradingDate(client, provider, now),
      error: null,
    };
  } catch (error) {
    return {
      date: null,
      error: error instanceof Error ? error.message : "Could not check latest Upstox completed trading day.",
    };
  }
}

async function latestCompletedUpstoxNseTradingDate(
  client: PrismaClient,
  provider: ReturnType<typeof createUpstoxMarketDataProviderCore>,
  now = new Date(),
) {
  const instrumentKey = await representativeNseInstrumentKey(client);
  if (!instrumentKey) {
    throw new Error("No active NSE equity instrument exists locally for Upstox freshness checks.");
  }

  const endDate = latestSafeNseEodProbeDate(now);
  const startDate = addUtcDays(endDate, -10);
  const candles = await provider.fetchHistoricalDailyCandles({ instrumentKey, startDate, endDate });
  const latest = candles
    .filter((candle) => candle.tradingDate <= endDate)
    .sort((left, right) => right.tradingDate.getTime() - left.tradingDate.getTime())[0];

  if (!latest) {
    throw new Error("Upstox did not return a completed NSE daily candle for the recent freshness window.");
  }

  return latest.tradingDate;
}

async function representativeNseInstrumentKey(client: PrismaClient) {
  const reliance = await client.instrument.findFirst({
    where: {
      active: true,
      exchange: "NSE",
      marketDataSource: realSource,
      instrumentKey: { startsWith: nseInstrumentKeyPrefix },
      symbol: "RELIANCE",
    },
    select: { instrumentKey: true },
  });
  if (reliance) return reliance.instrumentKey;

  const first = await client.instrument.findFirst({
    where: {
      active: true,
      exchange: "NSE",
      marketDataSource: realSource,
      instrumentKey: { startsWith: nseInstrumentKeyPrefix },
    },
    orderBy: { symbol: "asc" },
    select: { instrumentKey: true },
  });
  return first?.instrumentKey ?? null;
}

async function latestLocalNsePriceDate(client: PrismaClient) {
  const latest = await client.dailyPrice.findFirst({
    where: {
      marketDataSource: realSource,
      instrument: {
        active: true,
        exchange: "NSE",
        marketDataSource: realSource,
        instrumentKey: { startsWith: nseInstrumentKeyPrefix },
      },
    },
    orderBy: { tradingDate: "desc" },
    select: { tradingDate: true },
  });

  return latest?.tradingDate ?? null;
}

async function latestLocalTradingDateOnOrBefore(client: PrismaClient, selectedDate: Date) {
  const latest = await client.dailyPrice.findFirst({
    where: {
      marketDataSource: realSource,
      tradingDate: { lte: selectedDate },
      instrument: {
        active: true,
        exchange: "NSE",
        marketDataSource: realSource,
        instrumentKey: { startsWith: nseInstrumentKeyPrefix },
      },
    },
    orderBy: { tradingDate: "desc" },
    select: { tradingDate: true },
  });

  return latest?.tradingDate ?? null;
}

async function loadNseCandidates(client: PrismaClient): Promise<HistoricalRunnerCandidate[]> {
  const companies = await client.company.findMany({
    where: {
      marketDataSource: realSource,
      instruments: {
        some: {
          active: true,
          exchange: "NSE",
          marketDataSource: realSource,
          instrumentKey: { startsWith: nseInstrumentKeyPrefix },
        },
      },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isin: true,
      instruments: {
        where: {
          active: true,
          exchange: "NSE",
          marketDataSource: realSource,
          instrumentKey: { startsWith: nseInstrumentKeyPrefix },
        },
        select: { id: true, symbol: true },
        take: 1,
      },
    },
  });

  return companies.flatMap((company) => {
    const instrument = company.instruments[0];
    return instrument
      ? [{
          companyId: company.id,
          companyName: company.name,
          isin: company.isin,
          instrumentId: instrument.id,
          symbol: instrument.symbol,
          exchange: "NSE",
          marketDataSource: realSource,
        } satisfies HistoricalRunnerCandidate]
      : [];
  });
}

async function loadNsePrices(
  client: PrismaClient,
  input: {
    readonly instrumentIds: readonly string[];
    readonly startDate: Date;
    readonly endDate: Date;
  },
): Promise<HistoricalRunnerPrice[]> {
  const batches = chunk(input.instrumentIds, priceLoadBatchSize);
  const prices: HistoricalRunnerPrice[] = [];

  for (const batch of batches) {
    const rows = await client.$queryRaw<{
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
      WHERE "instrumentId" IN (${Prisma.join(batch)})
        AND "tradingDate" >= ${input.startDate}
        AND "tradingDate" <= ${input.endDate}
        AND "marketDataSource"::text = ${realSource}
      ORDER BY "instrumentId" ASC, "tradingDate" ASC
    `;
    prices.push(...rows);
  }

  return prices;
}

function toFindingMomentumRow(candidate: NseMomentumRankedCandidate, prices: readonly HistoricalRunnerPrice[], rankingDate: Date): FindingMomentumRow {
  const rankingDateKey = dateKey(rankingDate);
  const close = prices
    .filter((price) => price.instrumentId === candidate.instrumentId && dateKey(price.tradingDate) <= rankingDateKey)
    .sort((left, right) => right.tradingDate.getTime() - left.tradingDate.getTime())[0]?.close ?? 0;

  return {
    rank: candidate.rank,
    company: candidate.companyName,
    symbol: candidate.symbol,
    close,
    return1M: candidate.return1M,
    return3M: candidate.return3M,
    annualizedVolatilityPercent: candidate.annualizedVolatility * 100,
    riskAdjusted1M: candidate.adjusted1M,
    riskAdjusted3M: candidate.adjusted3M,
    z1M: candidate.z1M,
    z3M: candidate.z3M,
    momentumScore: candidate.momentumScore,
  };
}

export function parseFindingMomentumDate(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Date must be in YYYY-MM-DD format.");
  }
  return value;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function latestSafeNseEodProbeDate(now: Date) {
  const istTime = now.getTime() + (5.5 * 60 * 60 * 1000);
  const ist = new Date(istTime);
  const istYear = ist.getUTCFullYear();
  const istMonth = ist.getUTCMonth();
  const istDate = ist.getUTCDate();
  const istHour = ist.getUTCHours();
  const istMinute = ist.getUTCMinutes();
  const afterDailyCandleWindow = istHour > 18 || (istHour === 18 && istMinute >= 0);
  const probeDate = new Date(Date.UTC(istYear, istMonth, istDate));
  if (!afterDailyCandleWindow) probeDate.setUTCDate(probeDate.getUTCDate() - 1);
  return probeDate;
}

function nullableDateKey(date: Date | null) {
  return date ? dateKey(date) : null;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function chunk<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
