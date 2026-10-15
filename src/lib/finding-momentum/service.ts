import { Prisma, type PrismaClient } from "@prisma/client";

import {
  nseMomentumHistoricalRules,
  rankNseMomentumForDate,
  type HistoricalRunnerCandidate,
  type HistoricalRunnerPrice,
  type NseMomentumHistoricalRules,
  type NseMomentumRankedCandidate,
} from "@/lib/strategies/historical-runner";
import {
  isEligibleNseOrdinaryEquityInstrument,
  NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX,
} from "@/lib/strategies/nse-universe";

const realSource = "UPSTOX_REAL";
const priceLoadBatchSize = 500;

export const findingMomentumOptions = [
  { value: "volatility-1m-3m", label: "1M / 3M - Volatility + Z-Score", months: [1, 3], rankingMode: "volatilityAdjusted" },
  { value: "volatility-3m-6m", label: "3M / 6M - Volatility + Z-Score", months: [3, 6], rankingMode: "volatilityAdjusted" },
  { value: "volatility-6m-12m", label: "6M / 12M - Volatility + Z-Score", months: [6, 12], rankingMode: "volatilityAdjusted" },
  { value: "raw-1m-3m", label: "1M / 3M - Raw Returns", months: [1, 3], rankingMode: "rawAverage" },
  { value: "raw-3m-6m", label: "3M / 6M - Raw Returns", months: [3, 6], rankingMode: "rawAverage" },
  { value: "raw-6m-12m", label: "6M / 12M - Raw Returns", months: [6, 12], rankingMode: "rawAverage" },
] as const;

export type FindingMomentumOption = (typeof findingMomentumOptions)[number];
export type FindingMomentumOptionValue = FindingMomentumOption["value"];

export function findingMomentumRankingRules(
  option: FindingMomentumOption,
): Pick<NseMomentumHistoricalRules, "momentumMonths" | "rankingMode" | "minVolatilityReturnCount"> {
  return {
    momentumMonths: option.months,
    rankingMode: option.rankingMode,
    minVolatilityReturnCount: nseMomentumHistoricalRules.minVolatilityReturnCount,
  };
}

export type FindingMomentumResult = {
  readonly selectedDate: string;
  readonly selectedOption: FindingMomentumOption;
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
  readonly firstReturn: number;
  readonly secondReturn: number;
  readonly annualizedVolatilityPercent: number | null;
  readonly firstRiskAdjusted: number | null;
  readonly secondRiskAdjusted: number | null;
  readonly firstZScore: number | null;
  readonly secondZScore: number | null;
  readonly momentumScore: number;
};

export async function getFindingMomentum(input: {
  readonly client: PrismaClient;
  readonly selectedDate?: string;
  readonly option?: FindingMomentumOptionValue;
  readonly now?: Date;
}): Promise<FindingMomentumResult> {
  const selectedOption = getFindingMomentumOption(input.option);
  const dataUpdatedThrough = await latestLocalNsePriceDate(input.client);
  const selectedDate = input.selectedDate ?? dateKey(dataUpdatedThrough ?? input.now ?? new Date());
  const rankingDateUsed = await latestLocalTradingDateOnOrBefore(input.client, parseDate(selectedDate));
  const sync = localOnlySyncStatus();

  if (!rankingDateUsed) {
    return {
      selectedDate,
      selectedOption,
      latestLocalCompletedTradingDate: nullableDateKey(dataUpdatedThrough),
      latestUpstoxCompletedTradingDate: null,
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
    rules: findingMomentumRankingRules(selectedOption),
  });
  const pricesByInstrument = groupPrices(prices);

  return {
    selectedDate,
    selectedOption,
    latestLocalCompletedTradingDate: nullableDateKey(dataUpdatedThrough),
    latestUpstoxCompletedTradingDate: null,
    dataUpdatedThrough: nullableDateKey(dataUpdatedThrough),
    rankingDateUsed: dateKey(rankingDateUsed),
    sync,
    eligibleUniverseCount: ranked.length,
    rows: ranked.slice(0, 60).map((candidate) =>
      toFindingMomentumRow(candidate, pricesByInstrument.get(candidate.instrumentId) ?? [], rankingDateUsed, selectedOption)),
  };
}

function localOnlySyncStatus(): FindingMomentumResult["sync"] {
  return {
    checked: false,
    ran: false,
    startDate: null,
    endDate: null,
    candlesUpserted: 0,
    skipped: 0,
    failed: 0,
    error: null,
  };
}

async function latestLocalNsePriceDate(client: PrismaClient) {
  const latest = await client.dailyPrice.findFirst({
    where: {
      marketDataSource: realSource,
      instrument: {
        active: true,
        exchange: "NSE",
        marketDataSource: realSource,
        instrumentKey: { startsWith: NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX },
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
        instrumentKey: { startsWith: NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX },
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
          instrumentKey: { startsWith: NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX },
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
          instrumentKey: { startsWith: NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX },
        },
        select: { id: true, symbol: true, instrumentKey: true },
        take: 1,
      },
    },
  });

  return companies.flatMap((company) => {
    const instrument = company.instruments[0];
    return instrument && isEligibleNseOrdinaryEquityInstrument({
      instrumentKey: instrument.instrumentKey,
      companyName: company.name,
      symbol: instrument.symbol,
    })
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

function toFindingMomentumRow(
  candidate: NseMomentumRankedCandidate,
  prices: readonly HistoricalRunnerPrice[],
  rankingDate: Date,
  option: FindingMomentumOption,
): FindingMomentumRow {
  const [firstMonths, secondMonths] = option.months;
  const firstReturn = requiredMetric(candidate, `return${firstMonths}M`);
  const secondReturn = requiredMetric(candidate, `return${secondMonths}M`);
  const isVolatilityAdjusted = option.rankingMode === "volatilityAdjusted";
  const rankingDateKey = dateKey(rankingDate);
  const close = prices
    .filter((price) => dateKey(price.tradingDate) <= rankingDateKey)
    .sort((left, right) => right.tradingDate.getTime() - left.tradingDate.getTime())[0]?.close ?? 0;
  return {
    rank: candidate.rank,
    company: candidate.companyName,
    symbol: candidate.symbol,
    close,
    firstReturn,
    secondReturn,
    annualizedVolatilityPercent: isVolatilityAdjusted ? candidate.annualizedVolatility * 100 : null,
    firstRiskAdjusted: isVolatilityAdjusted ? requiredMetric(candidate, `adjusted${firstMonths}M`) / 100 : null,
    secondRiskAdjusted: isVolatilityAdjusted ? requiredMetric(candidate, `adjusted${secondMonths}M`) / 100 : null,
    firstZScore: isVolatilityAdjusted ? requiredMetric(candidate, `z${firstMonths}M`) : null,
    secondZScore: isVolatilityAdjusted ? requiredMetric(candidate, `z${secondMonths}M`) : null,
    momentumScore: candidate.momentumScore,
  };
}

function requiredMetric(candidate: NseMomentumRankedCandidate, key: string) {
  const value = candidate.rankingMetrics?.[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Finding Momentum requires numeric ${key} ranking metrics.`);
  }
  return value;
}

function groupPrices(prices: readonly HistoricalRunnerPrice[]) {
  const grouped = new Map<string, HistoricalRunnerPrice[]>();
  for (const price of prices) {
    const rows = grouped.get(price.instrumentId) ?? [];
    rows.push(price);
    grouped.set(price.instrumentId, rows);
  }
  return grouped;
}

export function parseFindingMomentumDate(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Date must be in YYYY-MM-DD format.");
  }
  return value;
}

export function parseFindingMomentumOption(value: unknown): FindingMomentumOptionValue | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return findingMomentumOptions.some((option) => option.value === value)
    ? value as FindingMomentumOptionValue
    : undefined;
}

function getFindingMomentumOption(value: FindingMomentumOptionValue | undefined): FindingMomentumOption {
  return findingMomentumOptions.find((option) => option.value === value) ?? findingMomentumOptions[2];
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function nullableDateKey(date: Date | null) {
  return date ? dateKey(date) : null;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
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
