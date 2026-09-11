import "dotenv/config";

import { Prisma, PrismaClient } from "@prisma/client";

import { getFindingMomentum } from "../src/lib/finding-momentum/service";
import {
  rankNseMomentumForDate,
  simulateNseMomentumHistorical,
  type HistoricalRunnerCandidate,
  type HistoricalRunnerPrice,
} from "../src/lib/strategies/historical-runner";

const prisma = new PrismaClient();
const rankingDateKey = "2026-09-09";
const realSource = "UPSTOX_REAL";
const nseInstrumentKeyPrefix = "NSE_EQ|INE";
const traceSymbols = ["BODALCHEM", "VIJIFIN", "BIKEWO"];
const absentQueries = ["Maxgrow India", "Trustwave", "Harig Crankshaft", "AUDROC"];

type IndependentMetric = HistoricalRunnerCandidate & {
  readonly rank: number;
  readonly close: number;
  readonly return1M: number;
  readonly return3M: number;
  readonly annualizedVolatility: number;
  readonly adjusted1M: number;
  readonly adjusted3M: number;
  readonly z1M: number;
  readonly z3M: number;
  readonly momentumScore: number;
  readonly volObservationCount: number;
  readonly return1MSource: SourceDates;
  readonly return3MSource: SourceDates;
};

type SourceDates = {
  readonly requestedStartDate: string;
  readonly actualStartDate: string;
  readonly actualEndDate: string;
  readonly startClose: number;
  readonly endClose: number;
};

async function main() {
  const rankingDate = parseDate(rankingDateKey);
  const candidates = await loadNseCandidates();
  const prices = await loadNsePrices({
    instrumentIds: candidates.map((candidate) => candidate.instrumentId),
    startDate: addUtcMonths(rankingDate, -13),
    endDate: rankingDate,
  });

  const existing = rankNseMomentumForDate({ rankingDate, candidates, prices });
  const independent = independentRank(candidates, prices, rankingDate);
  const finding = await getFindingMomentum({
    client: prisma,
    selectedDate: rankingDateKey,
    now: new Date("2026-09-11T09:45:00.000Z"),
  });
  const backtest = simulateNseMomentumHistorical({
    requestedStartDate: rankingDate,
    requestedEndDate: parseDate("2026-09-10"),
    candidates,
    prices: await loadNsePrices({
      instrumentIds: candidates.map((candidate) => candidate.instrumentId),
      startDate: addUtcMonths(rankingDate, -13),
      endDate: parseDate("2026-09-10"),
    }),
  });

  const existingByCompany = new Map(existing.map((row) => [row.companyId, row]));
  const independentByCompany = new Map(independent.map((row) => [row.companyId, row]));
  const findingSymbols = finding.rows.map((row) => row.symbol);
  const existingTop20 = existing.slice(0, 20);
  const independentTop20 = independent.slice(0, 20);
  const top20Comparison = existingTop20.map((row, index) => {
    const independentRow = independentTop20[index];
    const findingRow = finding.rows[index];
    return {
      rank: index + 1,
      existingBacktest: compactRankRow(row),
      independent: independentRow ? compactRankRow(independentRow) : null,
      findingMomentum: findingRow
        ? {
            symbol: findingRow.symbol,
            company: findingRow.company,
            score: findingRow.momentumScore,
          }
        : null,
    };
  });

  const rankDifferences = independent.flatMap((row) => {
    const existingRow = existingByCompany.get(row.companyId);
    return existingRow && existingRow.rank !== row.rank
      ? [{
          symbol: row.symbol,
          company: row.companyName,
          existingRank: existingRow.rank,
          independentRank: row.rank,
          rankDelta: row.rank - existingRow.rank,
        }]
      : [];
  });

  const maxDiffs = maxNumericalDifferences(existing, independentByCompany);
  const universe = {
    candidateCount: candidates.length,
    existingEligibleCount: existing.length,
    independentEligibleCount: independent.length,
    findingEligibleCount: finding.eligibleUniverseCount,
    existingVsIndependentSameUniverse: sameSet(
      existing.map((row) => row.companyId),
      independent.map((row) => row.companyId),
    ),
    existingTop20VsFindingTop20SameSymbols: JSON.stringify(existingTop20.map((row) => row.symbol)) === JSON.stringify(findingSymbols),
  };

  const traces = Object.fromEntries(traceSymbols.map((symbol) => {
    const row = independent.find((item) => item.symbol === symbol);
    return [symbol, row ? traceRow(row) : { error: "Not eligible or not found." }];
  }));

  const absence = Object.fromEntries(await Promise.all(absentQueries.map(async (query) => {
    const matches = await findCandidateMatches(query);
    return [query, matches.map((match) => explainAbsence(match, independentByCompany, prices, rankingDate))];
  })));

  const report = {
    rankingDate: rankingDateKey,
    findingMomentum: {
      selectedDate: finding.selectedDate,
      rankingDateUsed: finding.rankingDateUsed,
      dataUpdatedThrough: finding.dataUpdatedThrough,
      freshnessError: finding.sync.error,
    },
    universe,
    backtestInitialTop20Symbols: backtest.positions
      .sort((left, right) => (left.entryRank ?? 9999) - (right.entryRank ?? 9999))
      .map((position) => position.symbol),
    top20Comparison,
    rankDifferencesCount: rankDifferences.length,
    rankDifferences: rankDifferences.slice(0, 50),
    maxNumericalDifferences: maxDiffs,
    unitInvestigation: {
      bodalchemDisplayExample: traces.BODALCHEM,
      cause:
        "Existing validated ranker stores returns as percent values (e.g. 153.92) and volatility as decimal annualized volatility (e.g. 0.5260). It divides percent-return by decimal-volatility, producing 292.65. Dividing percent-return by percent-volatility would display 2.9265. The z-scores and final ranks are unchanged by this constant 100x scale within each adjusted leg.",
      rankingImpact:
        "No rank impact versus the existing validated implementation because every stock's adjusted 1M and adjusted 3M values are scaled by the same constant before each cross-sectional z-score.",
    },
    tracedStocks: traces,
    absentStocks: absence,
  };

  console.log(JSON.stringify(report, null, 2));
}

async function loadNseCandidates(): Promise<HistoricalRunnerCandidate[]> {
  const companies = await prisma.company.findMany({
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

async function loadNsePrices(input: {
  readonly instrumentIds: readonly string[];
  readonly startDate: Date;
  readonly endDate: Date;
}): Promise<HistoricalRunnerPrice[]> {
  const prices: HistoricalRunnerPrice[] = [];
  for (const batch of chunk(input.instrumentIds, 500)) {
    const rows = await prisma.$queryRaw<{
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

function independentRank(
  candidates: readonly HistoricalRunnerCandidate[],
  prices: readonly HistoricalRunnerPrice[],
  rankingDate: Date,
): IndependentMetric[] {
  const pricesByInstrument = groupPrices(prices);
  const metrics = candidates.flatMap((candidate) => {
    const rows = pricesByInstrument.get(candidate.instrumentId) ?? [];
    const oneMonth = calculateReturn(rows, addUtcMonths(rankingDate, -1), rankingDate);
    const threeMonth = calculateReturn(rows, addUtcMonths(rankingDate, -3), rankingDate);
    const volatility = calculateAnnualizedVolatility(rows, addUtcMonths(rankingDate, -12), rankingDate, 200);
    const close = priceOnOrBefore(rows, rankingDate)?.close ?? null;
    if (!oneMonth || !threeMonth || !volatility || close === null) return [];
    return [{
      ...candidate,
      rank: 0,
      close,
      return1M: oneMonth.returnPercent,
      return3M: threeMonth.returnPercent,
      annualizedVolatility: volatility.annualizedVolatility,
      adjusted1M: oneMonth.returnPercent / volatility.annualizedVolatility,
      adjusted3M: threeMonth.returnPercent / volatility.annualizedVolatility,
      z1M: 0,
      z3M: 0,
      momentumScore: 0,
      volObservationCount: volatility.observationCount,
      return1MSource: oneMonth,
      return3MSource: threeMonth,
    }];
  });

  const oneMonthStats = meanAndStdDev(metrics.map((row) => row.adjusted1M));
  const threeMonthStats = meanAndStdDev(metrics.map((row) => row.adjusted3M));
  if (!oneMonthStats || !threeMonthStats) return [];

  return metrics
    .map((row) => {
      const z1M = (row.adjusted1M - oneMonthStats.mean) / oneMonthStats.stdDev;
      const z3M = (row.adjusted3M - threeMonthStats.mean) / threeMonthStats.stdDev;
      return { ...row, z1M, z3M, momentumScore: (z1M + z3M) / 2 };
    })
    .sort((left, right) => {
      const score = right.momentumScore - left.momentumScore;
      if (score !== 0) return score;
      return left.symbol.localeCompare(right.symbol);
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function calculateReturn(prices: readonly HistoricalRunnerPrice[], targetStartDate: Date, endDate: Date): (SourceDates & { readonly returnPercent: number }) | null {
  const hasHistoryAtTarget = prices.some((price) => price.tradingDate <= targetStartDate);
  if (!hasHistoryAtTarget) return null;
  const start = prices.find((price) => price.tradingDate >= targetStartDate && price.tradingDate <= endDate);
  const end = priceOnOrBefore(prices, endDate);
  if (!start || !end || start.tradingDate > end.tradingDate || start.close <= 0) return null;
  return {
    requestedStartDate: dateKey(targetStartDate),
    actualStartDate: dateKey(start.tradingDate),
    actualEndDate: dateKey(end.tradingDate),
    startClose: start.close,
    endClose: end.close,
    returnPercent: ((end.close / start.close) - 1) * 100,
  };
}

function calculateAnnualizedVolatility(
  prices: readonly HistoricalRunnerPrice[],
  startDate: Date,
  endDate: Date,
  minReturnCount: number,
) {
  const period = prices.filter((price) => price.tradingDate >= startDate && price.tradingDate <= endDate && price.close > 0);
  if (period.length < minReturnCount + 1) return null;
  const returns: number[] = [];
  for (let index = 1; index < period.length; index += 1) {
    const previous = period[index - 1];
    const current = period[index];
    if (!previous || !current || previous.close <= 0) continue;
    returns.push((current.close / previous.close) - 1);
  }
  if (returns.length < minReturnCount) return null;
  const stats = meanAndStdDev(returns);
  if (!stats || stats.stdDev <= 0 || !Number.isFinite(stats.stdDev)) return null;
  return {
    observationCount: period.length,
    dailyReturnCount: returns.length,
    annualizedVolatility: stats.stdDev * Math.sqrt(252),
  };
}

async function findCandidateMatches(query: string) {
  return prisma.instrument.findMany({
    where: {
      active: true,
      exchange: "NSE",
      marketDataSource: realSource,
      instrumentKey: { startsWith: nseInstrumentKeyPrefix },
      OR: [
        { symbol: { contains: query, mode: "insensitive" } },
        { company: { name: { contains: query, mode: "insensitive" } } },
      ],
    },
    include: { company: true },
    orderBy: { symbol: "asc" },
    take: 10,
  });
}

function explainAbsence(
  match: Awaited<ReturnType<typeof findCandidateMatches>>[number],
  independentByCompany: ReadonlyMap<string, IndependentMetric>,
  prices: readonly HistoricalRunnerPrice[],
  rankingDate: Date,
) {
  const ranked = independentByCompany.get(match.companyId);
  if (ranked) {
    return {
      symbol: match.symbol,
      company: match.company.name,
      reason: ranked.rank <= 20 ? "present in Top 20" : "volatility-adjusted rank too low",
      rank: ranked.rank,
      momentumScore: ranked.momentumScore,
      return1M: ranked.return1M,
      return3M: ranked.return3M,
      annualizedVolatility: ranked.annualizedVolatility,
    };
  }

  const rows = prices.filter((price) => price.instrumentId === match.id);
  const oneMonth = calculateReturn(rows, addUtcMonths(rankingDate, -1), rankingDate);
  const threeMonth = calculateReturn(rows, addUtcMonths(rankingDate, -3), rankingDate);
  const volatility = calculateAnnualizedVolatility(rows, addUtcMonths(rankingDate, -12), rankingDate, 200);
  return {
    symbol: match.symbol,
    company: match.company.name,
    reason: !oneMonth
      ? "insufficient 1M return history"
      : !threeMonth
        ? "insufficient 3M return history"
        : !volatility
          ? "insufficient/invalid trailing 1Y volatility history"
          : "not ranked for an unknown reason",
    priceRowsInLoadedWindow: rows.length,
    oneMonth,
    threeMonth,
    volatility,
  };
}

function traceRow(row: IndependentMetric) {
  return {
    rank: row.rank,
    company: row.companyName,
    symbol: row.symbol,
    rankingDateClose: row.close,
    oneMonthClose: {
      requestedDate: row.return1MSource.requestedStartDate,
      actualDate: row.return1MSource.actualStartDate,
      close: row.return1MSource.startClose,
      rankingDateClose: row.return1MSource.endClose,
    },
    threeMonthClose: {
      requestedDate: row.return3MSource.requestedStartDate,
      actualDate: row.return3MSource.actualStartDate,
      close: row.return3MSource.startClose,
      rankingDateClose: row.return3MSource.endClose,
    },
    return1M: row.return1M,
    return3M: row.return3M,
    trailingVolatilityDailyObservationCount: row.volObservationCount,
    annualizedVolatilityDecimal: row.annualizedVolatility,
    annualizedVolatilityPercent: row.annualizedVolatility * 100,
    riskAdjusted1MExistingUnits: row.adjusted1M,
    riskAdjusted3MExistingUnits: row.adjusted3M,
    riskAdjusted1MPercentOverPercentDisplay: row.adjusted1M / 100,
    riskAdjusted3MPercentOverPercentDisplay: row.adjusted3M / 100,
    z1M: row.z1M,
    z3M: row.z3M,
    finalScore: row.momentumScore,
  };
}

function maxNumericalDifferences(
  existing: ReturnType<typeof rankNseMomentumForDate>,
  independentByCompany: ReadonlyMap<string, IndependentMetric>,
) {
  const diffs = {
    return1M: 0,
    return3M: 0,
    annualizedVolatility: 0,
    adjusted1M: 0,
    adjusted3M: 0,
    z1M: 0,
    z3M: 0,
    momentumScore: 0,
  };

  for (const row of existing) {
    const other = independentByCompany.get(row.companyId);
    if (!other) continue;
    diffs.return1M = Math.max(diffs.return1M, Math.abs(row.return1M - other.return1M));
    diffs.return3M = Math.max(diffs.return3M, Math.abs(row.return3M - other.return3M));
    diffs.annualizedVolatility = Math.max(diffs.annualizedVolatility, Math.abs(row.annualizedVolatility - other.annualizedVolatility));
    diffs.adjusted1M = Math.max(diffs.adjusted1M, Math.abs(row.adjusted1M - other.adjusted1M));
    diffs.adjusted3M = Math.max(diffs.adjusted3M, Math.abs(row.adjusted3M - other.adjusted3M));
    diffs.z1M = Math.max(diffs.z1M, Math.abs(row.z1M - other.z1M));
    diffs.z3M = Math.max(diffs.z3M, Math.abs(row.z3M - other.z3M));
    diffs.momentumScore = Math.max(diffs.momentumScore, Math.abs(row.momentumScore - other.momentumScore));
  }

  return diffs;
}

function compactRankRow(row: { readonly symbol: string; readonly companyName: string; readonly rank: number; readonly momentumScore: number }) {
  return {
    symbol: row.symbol,
    company: row.companyName,
    rank: row.rank,
    score: row.momentumScore,
  };
}

function groupPrices(prices: readonly HistoricalRunnerPrice[]) {
  const grouped = new Map<string, HistoricalRunnerPrice[]>();
  for (const price of prices) {
    grouped.set(price.instrumentId, [...(grouped.get(price.instrumentId) ?? []), price]);
  }
  for (const rows of grouped.values()) rows.sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime());
  return grouped;
}

function priceOnOrBefore(prices: readonly HistoricalRunnerPrice[], date: Date) {
  for (let index = prices.length - 1; index >= 0; index -= 1) {
    const price = prices[index];
    if (price && price.tradingDate <= date) return price;
  }
  return null;
}

function meanAndStdDev(values: readonly number[]) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance = finite.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / finite.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

function sameSet(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function addUtcMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function chunk<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  });
