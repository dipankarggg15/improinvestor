import { Prisma, type PrismaClient } from "@prisma/client";

import { getProcessResultCache } from "@/lib/cache/process-result-cache";
import { latestSafeMarketEodDate } from "@/lib/market-data/daily-sync";
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

type FindingMomentumCalculation = Pick<FindingMomentumResult, "eligibleUniverseCount" | "rows">;
const findingMomentumResultCache = getProcessResultCache<FindingMomentumCalculation>("finding-momentum-v3", 48);

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
  readonly selectedDateState: "ready" | "updating" | "no-session";
  readonly eligibleUniverseCount: number;
  readonly rows: FindingMomentumRow[];
  readonly calculation: {
    readonly calculatedAt: string;
    readonly reused: boolean;
  };
};

export type FindingMomentumRow = {
  readonly rank: number;
  readonly company: string;
  readonly symbol: string;
  readonly sector: string | null;
  readonly close: number;
  readonly return1M: number | null;
  readonly return3M: number | null;
  readonly return6M: number | null;
  readonly return12M: number | null;
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
  const now = input.now ?? new Date();
  const completedThroughBeforeSync = await latestCompletedNseDataThrough(input.client);
  const localBeforeSync = completedThroughBeforeSync
    ? await latestLocalTradingDateOnOrBefore(input.client, completedThroughBeforeSync)
    : await latestLocalNsePriceDate(input.client);
  const selectedDate = input.selectedDate ?? dateKey(localBeforeSync ?? latestSafeMarketEodDate(now));
  const completedThroughAfterSync = await latestCompletedNseDataThrough(input.client);
  const completedLocalDate = completedThroughAfterSync
    ? await latestLocalTradingDateOnOrBefore(input.client, completedThroughAfterSync)
    : localBeforeSync;
  const rankingDateLimit = earlierDate(parseDate(selectedDate), completedThroughAfterSync ?? parseDate(selectedDate));
  const [rankingDateUsed, dataRevision, sectorDataRevision] = await Promise.all([
    latestLocalTradingDateOnOrBefore(input.client, rankingDateLimit),
    latestUpstoxDataRevision(input.client),
    latestSectorDataRevision(input.client),
  ]);
  const selectedDateState = classifySelectedDate({
    selectedDate: parseDate(selectedDate),
    rankingDateUsed,
    completedThrough: completedThroughAfterSync,
    latestSafeDate: latestSafeMarketEodDate(now),
  });

  if (!rankingDateUsed) {
    return {
      selectedDate,
      selectedOption,
      latestLocalCompletedTradingDate: nullableDateKey(localBeforeSync),
      latestUpstoxCompletedTradingDate: nullableDateKey(completedThroughAfterSync),
      dataUpdatedThrough: nullableDateKey(completedLocalDate),
      rankingDateUsed: null,
      selectedDateState,
      eligibleUniverseCount: 0,
      rows: [],
      calculation: { calculatedAt: new Date().toISOString(), reused: false },
    };
  }

  const calculation = await findingMomentumResultCache.getOrCreate(
    [dateKey(rankingDateUsed), nullableDateKey(completedLocalDate), dataRevision, sectorDataRevision, selectedOption.value].join("|"),
    async () => {
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
        eligibleUniverseCount: ranked.length,
        rows: ranked.slice(0, 60).map((candidate) =>
          toFindingMomentumRow(candidate, pricesByInstrument.get(candidate.instrumentId) ?? [], rankingDateUsed, selectedOption)),
      };
    },
  );

  return {
    selectedDate,
    selectedOption,
    latestLocalCompletedTradingDate: nullableDateKey(localBeforeSync),
    latestUpstoxCompletedTradingDate: nullableDateKey(completedThroughAfterSync),
    dataUpdatedThrough: nullableDateKey(completedLocalDate),
    rankingDateUsed: dateKey(rankingDateUsed),
    selectedDateState,
    ...calculation.value,
    calculation: {
      calculatedAt: calculation.calculatedAt,
      reused: calculation.reused,
    },
  };
}

async function latestUpstoxDataRevision(client: PrismaClient) {
  const sync = await client.dataSync.findFirst({
    where: { provider: "upstox", dataType: "real_market_eod", status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: { id: true, completedAt: true },
  });
  return sync?.completedAt?.toISOString() ?? sync?.id ?? "no-completed-sync";
}

async function latestCompletedNseDataThrough(client: PrismaClient) {
  const syncs = await client.dataSync.findMany({
    where: {
      provider: "upstox",
      dataType: "real_market_eod",
      status: { in: ["COMPLETED", "FAILED"] },
    },
    orderBy: { completedAt: "desc" },
    take: 30,
    select: {
      recordsProcessed: true,
      errorMessage: true,
      metadata: true,
    },
  });

  let latest: Date | null = null;
  for (const sync of syncs) {
    if (sync.errorMessage?.startsWith("Superseded by")) continue;
    const metadata = jsonObject(sync.metadata);
    const universeCounts = jsonObject(metadata?.universeCounts);
    const expectedNseInstruments = numericJsonValue(universeCounts?.nse) ?? numericJsonValue(metadata?.totalInstruments);
    const endDate = stringJsonValue(metadata?.endDate) ?? stringJsonValue(metadata?.completedEodThrough);
    if (!endDate || !expectedNseInstruments || sync.recordsProcessed < expectedNseInstruments * 0.9) continue;
    const candidate = parseDate(endDate);
    if (!latest || candidate > latest) latest = candidate;
  }

  return latest;
}

function jsonObject(value: Prisma.JsonValue | undefined): Prisma.JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : null;
}

function numericJsonValue(value: Prisma.JsonValue | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringJsonValue(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" ? value : null;
}

export function classifySelectedDate(input: {
  readonly selectedDate: Date;
  readonly rankingDateUsed: Date | null;
  readonly completedThrough: Date | null;
  readonly latestSafeDate: Date;
}): FindingMomentumResult["selectedDateState"] {
  if (input.rankingDateUsed && dateKey(input.rankingDateUsed) === dateKey(input.selectedDate)) return "ready";
  if (input.selectedDate <= input.latestSafeDate && (!input.completedThrough || input.completedThrough < input.selectedDate)) {
    return "updating";
  }
  return "no-session";
}

async function latestSectorDataRevision(client: PrismaClient) {
  const sync = await client.dataSync.findFirst({
    where: { provider: "upstox", dataType: "company_profile_sector" },
    orderBy: { startedAt: "desc" },
    select: { id: true, status: true, recordsProcessed: true, recordsSucceeded: true },
  });
  return sync
    ? `${sync.id}:${sync.status}:${sync.recordsProcessed}:${sync.recordsSucceeded}`
    : "no-sector-sync";
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

type MomentumCandidate = HistoricalRunnerCandidate & { readonly sector: string | null };

async function loadNseCandidates(client: PrismaClient): Promise<MomentumCandidate[]> {
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
      sector: true,
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
          sector: company.sector,
        } satisfies MomentumCandidate]
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
  candidate: NseMomentumRankedCandidate & { readonly sector?: string | null },
  prices: readonly HistoricalRunnerPrice[],
  rankingDate: Date,
  option: FindingMomentumOption,
): FindingMomentumRow {
  const [firstMonths, secondMonths] = option.months;
  const isVolatilityAdjusted = option.rankingMode === "volatilityAdjusted";
  const rankingDateKey = dateKey(rankingDate);
  const close = prices
    .filter((price) => dateKey(price.tradingDate) <= rankingDateKey)
    .sort((left, right) => right.tradingDate.getTime() - left.tradingDate.getTime())[0]?.close ?? 0;
  return {
    rank: candidate.rank,
    company: candidate.companyName,
    symbol: candidate.symbol,
    sector: candidate.sector ?? null,
    close,
    return1M: calculateDisplayedReturn(prices, rankingDate, 1),
    return3M: calculateDisplayedReturn(prices, rankingDate, 3),
    return6M: calculateDisplayedReturn(prices, rankingDate, 6),
    return12M: calculateDisplayedReturn(prices, rankingDate, 12),
    annualizedVolatilityPercent: isVolatilityAdjusted ? candidate.annualizedVolatility * 100 : null,
    firstRiskAdjusted: isVolatilityAdjusted ? requiredMetric(candidate, `adjusted${firstMonths}M`) / 100 : null,
    secondRiskAdjusted: isVolatilityAdjusted ? requiredMetric(candidate, `adjusted${secondMonths}M`) / 100 : null,
    firstZScore: isVolatilityAdjusted ? requiredMetric(candidate, `z${firstMonths}M`) : null,
    secondZScore: isVolatilityAdjusted ? requiredMetric(candidate, `z${secondMonths}M`) : null,
    momentumScore: candidate.momentumScore,
  };
}

function calculateDisplayedReturn(
  prices: readonly HistoricalRunnerPrice[],
  rankingDate: Date,
  months: number,
) {
  const targetStartDate = addUtcMonths(rankingDate, -months);
  if (!prices.some((price) => price.tradingDate <= targetStartDate)) return null;
  const start = prices.find((price) => price.tradingDate >= targetStartDate && price.tradingDate <= rankingDate);
  const end = [...prices].reverse().find((price) => price.tradingDate <= rankingDate);
  if (!start || !end || start.tradingDate > end.tradingDate || start.close <= 0) return null;
  return ((end.close - start.close) / start.close) * 100;
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

export const latestSafeNseEodDate = latestSafeMarketEodDate;

function earlierDate(left: Date, right: Date) {
  return left <= right ? left : right;
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
