import { Prisma, type PrismaClient } from "@prisma/client";

import { getProcessResultCache } from "@/lib/cache/process-result-cache";
import { createUpstoxMarketDataProviderCore } from "@/lib/market-data/providers/upstox-core";
import type { MarketDataProvider } from "@/lib/market-data/types";
import { NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX } from "@/lib/strategies/nse-universe";
import type { SwingPrice } from "@/lib/swing-trading/service";
import { sectorSlug } from "@/lib/sectors/slug";

export { sectorSlug } from "@/lib/sectors/slug";

const realSource = "UPSTOX_REAL";
const batchSize = 300;
const historySessions = 270;
const sectorCache = getProcessResultCache<SectorCalculation>("sector-dashboard-v7", 8);
const sectorStatusCache = getProcessResultCache<WholeMarketSectorStatusSnapshot>("whole-market-sector-status-v3", 2);

export type SectorState = "LEADING" | "IMPROVING" | "WEAKENING" | "LAGGING";
export type SectorUniverse = "market" | "nifty500";

export type SectorStock = {
  readonly company: string;
  readonly symbol: string;
  readonly currentPrice: number;
  readonly return1D: number | null;
  readonly return1W: number | null;
  readonly return1M: number | null;
  readonly return3M: number | null;
  readonly above20Dma: boolean;
  readonly above50Dma: boolean;
  readonly above200Dma: boolean;
};

export type SectorSeriesPoint = {
  readonly date: string;
  readonly value: number;
};

export type SectorSummary = {
  readonly name: string;
  readonly slug: string;
  readonly state: SectorState;
  readonly score: number;
  readonly constituentCount: number;
  readonly return1D: number | null;
  readonly return1W: number | null;
  readonly return1M: number | null;
  readonly return3M: number | null;
  readonly return6M: number | null;
  readonly return12M: number | null;
  readonly relative1M: number | null;
  readonly breadth20: number;
  readonly breadth50: number;
  readonly breadth200: number;
  readonly advancersPercent: number;
  readonly positive1MPercent: number;
  readonly stocks: SectorStock[];
  readonly series: SectorSeriesPoint[];
};

export type SectorDashboardResult = {
  readonly universe: SectorUniverse;
  readonly requestedDate: string;
  readonly priceDateUsed: string | null;
  readonly latestMarketDate: string | null;
  readonly benchmarkName: "NIFTY 50";
  readonly benchmarkReturn1M: number | null;
  readonly benchmarkSeries: SectorSeriesPoint[];
  readonly classifiedCompanies: number;
  readonly sectors: SectorSummary[];
  readonly calculation: { readonly calculatedAt: string; readonly reused: boolean };
};

export type WholeMarketSectorStatusSnapshot = {
  readonly priceDateUsed: string | null;
  readonly states: Readonly<Record<string, SectorState>>;
};

type SectorCandidate = {
  readonly company: string;
  readonly sector: string;
  readonly symbol: string;
  readonly instrumentId: string;
  readonly prices: readonly SwingPrice[];
};

type SectorCalculation = Omit<SectorDashboardResult,
  "universe" | "requestedDate" | "priceDateUsed" | "latestMarketDate" | "calculation"
>;

export async function getSectorDashboard(input: {
  readonly client: PrismaClient;
  readonly requestedDate?: string;
  readonly universe?: SectorUniverse;
  readonly provider?: MarketDataProvider;
}): Promise<SectorDashboardResult> {
  const universe = input.universe ?? "market";
  const latestMarketDate = await latestClassifiedMarketDate(input.client, universe);
  const requestedDate = parseSectorDate(input.requestedDate) ?? dateKey(latestMarketDate ?? new Date());
  const priceDate = await latestClassifiedMarketDate(input.client, universe, new Date(`${requestedDate}T00:00:00.000Z`));
  if (!priceDate) return emptyResult(requestedDate, latestMarketDate, universe);

  const revision = await dataRevision(input.client, universe);
  const cached = await sectorCache.getOrCreate(`${universe}|${dateKey(priceDate)}|${revision}`, async () => {
    const candidates = await loadSectorCandidates(input.client, priceDate, universe);
    const provider = input.provider ?? createUpstoxMarketDataProviderCore({ token: process.env.UPSTOX_ANALYTICS_TOKEN });
    const benchmark = await loadBenchmark(provider, priceDate).catch(() => []);
    return analyzeSectorCandidates(candidates, benchmark);
  });

  return {
    universe,
    requestedDate,
    priceDateUsed: dateKey(priceDate),
    latestMarketDate: latestMarketDate ? dateKey(latestMarketDate) : null,
    ...cached.value,
    calculation: { calculatedAt: cached.calculatedAt, reused: cached.reused },
  };
}

export async function getWholeMarketSectorStatusSnapshot(client: PrismaClient): Promise<WholeMarketSectorStatusSnapshot> {
  const priceDate = await latestClassifiedMarketDate(client, "market");
  if (!priceDate) return { priceDateUsed: null, states: {} };
  const revision = await dataRevision(client, "market");
  const cached = await sectorStatusCache.getOrCreate(`${dateKey(priceDate)}|${revision}`, async () => {
    const candidates = await loadSectorCandidates(client, priceDate, "market", 130, 70);
    const analysis = analyzeSectorCandidates(candidates, []);
    return {
      priceDateUsed: dateKey(priceDate),
      states: Object.fromEntries(analysis.sectors.map((sector) => [sector.name, sector.state])),
    };
  });
  return cached.value;
}

export function analyzeSectorCandidates(
  candidates: readonly SectorCandidate[],
  benchmarkPrices: readonly SwingPrice[],
): SectorCalculation {
  const benchmarkReturns = periodReturns(benchmarkPrices);
  const benchmarkSeries = normalizedSeries(benchmarkPrices);
  const groups = new Map<string, SectorCandidate[]>();
  for (const candidate of candidates) {
    const members = groups.get(candidate.sector);
    if (members) members.push(candidate);
    else groups.set(candidate.sector, [candidate]);
  }

  const sectors = [...groups.entries()].map(([name, members]): SectorSummary => {
    const stocks = members.flatMap(toSectorStock);
    const returns = {
      oneDay: medianNullable(stocks.map((stock) => stock.return1D)),
      oneWeek: medianNullable(stocks.map((stock) => stock.return1W)),
      oneMonth: medianNullable(stocks.map((stock) => stock.return1M)),
      threeMonths: medianNullable(stocks.map((stock) => stock.return3M)),
      sixMonths: medianNullable(members.map((member) => returnOverSessions(member.prices, 126))),
      twelveMonths: medianNullable(members.map((member) => returnOverSessions(member.prices, 252))),
    };
    const breadth20 = percent(stocks.filter((stock) => stock.above20Dma).length, stocks.length);
    const breadth50 = percent(stocks.filter((stock) => stock.above50Dma).length, stocks.length);
    const breadth200 = percent(stocks.filter((stock) => stock.above200Dma).length, stocks.length);
    const advancersPercent = percent(stocks.filter((stock) => (stock.return1D ?? 0) > 0).length, stocks.length);
    const positive1MPercent = percent(stocks.filter((stock) => (stock.return1M ?? 0) > 0).length, stocks.length);
    const relative1M = relativeReturn(returns.oneMonth, benchmarkReturns.oneMonth);
    const score = sectorScore({ breadth20, breadth50, advancersPercent, positive1MPercent, returns });
    const state = sectorState({ breadth20, breadth50, positive1MPercent, returns });

    return {
      name,
      slug: sectorSlug(name),
      state,
      score,
      constituentCount: stocks.length,
      return1D: returns.oneDay,
      return1W: returns.oneWeek,
      return1M: returns.oneMonth,
      return3M: returns.threeMonths,
      return6M: returns.sixMonths,
      return12M: returns.twelveMonths,
      relative1M,
      breadth20,
      breadth50,
      breadth200,
      advancersPercent,
      positive1MPercent,
      stocks: stocks.sort((left, right) => (right.return1M ?? -Infinity) - (left.return1M ?? -Infinity)),
      series: sectorBasketSeries(members),
    };
  }).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

  return {
    benchmarkName: "NIFTY 50",
    benchmarkReturn1M: benchmarkReturns.oneMonth,
    benchmarkSeries,
    classifiedCompanies: candidates.length,
    sectors,
  };
}

export function parseSectorDate(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) return undefined;
  return value;
}

export function parseSectorUniverse(value: unknown): SectorUniverse {
  return value === "nifty500" ? "nifty500" : "market";
}

function toSectorStock(candidate: SectorCandidate): SectorStock[] {
  const prices = chronologicallyOrdered(candidate.prices);
  const latest = prices.at(-1);
  if (!latest || prices.length < 21) return [];
  return [{
    company: candidate.company,
    symbol: candidate.symbol,
    currentPrice: latest.close,
    return1D: returnOverSessions(prices, 1),
    return1W: returnOverSessions(prices, 5),
    return1M: returnOverSessions(prices, 21),
    return3M: returnOverSessions(prices, 63),
    above20Dma: latest.close > average(prices.slice(-20).map((price) => price.close)),
    above50Dma: prices.length >= 50 && latest.close > average(prices.slice(-50).map((price) => price.close)),
    above200Dma: prices.length >= 200 && latest.close > average(prices.slice(-200).map((price) => price.close)),
  }];
}

function sectorScore(input: {
  readonly breadth20: number;
  readonly breadth50: number;
  readonly advancersPercent: number;
  readonly positive1MPercent: number;
  readonly returns: { readonly oneWeek: number | null; readonly oneMonth: number | null; readonly threeMonths: number | null };
}) {
  const performance = scaled(input.returns.oneWeek, -3, 3, 10)
    + scaled(input.returns.oneMonth, -6, 6, 12)
    + scaled(input.returns.threeMonths, -12, 12, 13);
  const breadth = ((input.breadth20 + input.breadth50) / 200) * 30;
  const persistence = [input.returns.oneWeek, input.returns.oneMonth, input.returns.threeMonths]
    .filter((value) => value !== null && value > 0).length / 3 * 20;
  const participation = ((input.advancersPercent + input.positive1MPercent) / 200) * 15;
  return Math.round(Math.max(0, Math.min(100, performance + breadth + persistence + participation)));
}

function sectorState(input: {
  readonly breadth20: number;
  readonly breadth50: number;
  readonly positive1MPercent: number;
  readonly returns: { readonly oneWeek: number | null; readonly oneMonth: number | null };
}): SectorState {
  const oneWeek = input.returns.oneWeek ?? -Infinity;
  const oneMonth = input.returns.oneMonth ?? -Infinity;
  if (oneMonth >= 0 && oneWeek > 0 && input.breadth50 >= 50 && input.positive1MPercent >= 50) return "LEADING";
  if ((oneMonth < 0 && oneWeek > 0) || (input.breadth20 >= input.breadth50 + 8 && oneWeek > 0)) return "IMPROVING";
  if (oneMonth >= 0 || input.breadth50 >= 50) return "WEAKENING";
  return "LAGGING";
}

function periodReturns(prices: readonly SwingPrice[]) {
  return {
    oneDay: returnOverSessions(prices, 1),
    oneWeek: returnOverSessions(prices, 5),
    oneMonth: returnOverSessions(prices, 21),
    threeMonths: returnOverSessions(prices, 63),
  };
}

function sectorBasketSeries(members: readonly SectorCandidate[]) {
  const returnsByDate = new Map<string, number[]>();
  for (const member of members) {
    const prices = chronologicallyOrdered(member.prices);
    for (let index = 1; index < prices.length; index += 1) {
      const previous = prices[index - 1]!;
      const current = prices[index]!;
      if (previous.close <= 0) continue;
      const key = dateKey(current.tradingDate);
      const returns = returnsByDate.get(key);
      if (returns) returns.push(current.close / previous.close - 1);
      else returnsByDate.set(key, [current.close / previous.close - 1]);
    }
  }
  let value = 100;
  return [...returnsByDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, returns]) => {
    value *= 1 + median(returns);
    return { date, value };
  });
}

function normalizedSeries(prices: readonly SwingPrice[]) {
  const ordered = chronologicallyOrdered(prices).slice(-historySessions);
  const base = ordered[0]?.close;
  if (!base || base <= 0) return [];
  return ordered.map((price) => ({ date: dateKey(price.tradingDate), value: price.close / base * 100 }));
}

async function loadBenchmark(provider: MarketDataProvider, priceDate: Date): Promise<SwingPrice[]> {
  const startDate = new Date(priceDate);
  startDate.setUTCDate(startDate.getUTCDate() - 550);
  return (await provider.fetchHistoricalDailyCandles({
    instrumentKey: "NSE_INDEX|Nifty 50",
    startDate,
    endDate: priceDate,
  })).map((price) => ({
    tradingDate: price.tradingDate,
    open: Number(price.open),
    high: Number(price.high),
    low: Number(price.low),
    close: Number(price.close),
    volume: Number(price.volume),
  })).slice(-historySessions);
}

async function loadSectorCandidates(
  client: PrismaClient,
  priceDate: Date,
  universe: SectorUniverse,
  historyDays = 450,
  maximumSessions = historySessions,
): Promise<SectorCandidate[]> {
  const classificationWhere = universe === "nifty500"
    ? { nifty500Sector: { not: null } }
    : { sector: { not: null } };
  const companies = await client.company.findMany({
    where: {
      ...classificationWhere,
      marketDataSource: realSource,
      instruments: { some: {
        active: true,
        exchange: "NSE",
        marketDataSource: realSource,
        instrumentKey: { startsWith: NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX },
      } },
    },
    select: {
      name: true,
      sector: true,
      ...(universe === "nifty500" ? { nifty500Sector: true } : {}),
      instruments: {
        where: {
          active: true,
          exchange: "NSE",
          marketDataSource: realSource,
          instrumentKey: { startsWith: NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX },
        },
        select: { id: true, symbol: true },
        take: 1,
      },
    },
  });
  const instruments = companies.flatMap((company) => {
    const classification = universe === "nifty500" && "nifty500Sector" in company ? company.nifty500Sector : company.sector;
    return classification && company.instruments[0]
      ? [{ company: company.name, sector: classification, ...company.instruments[0] }]
      : [];
  });
  const startDate = new Date(priceDate);
  startDate.setUTCDate(startDate.getUTCDate() - historyDays);
  const grouped = new Map<string, SwingPrice[]>();
  for (let index = 0; index < instruments.length; index += batchSize) {
    const ids = instruments.slice(index, index + batchSize).map((instrument) => instrument.id);
    const prices = await client.$queryRaw<Array<SwingPrice & { instrumentId: string }>>`
      SELECT "instrumentId", "tradingDate", open, high, low, close, volume
      FROM (
        SELECT
          "instrumentId",
          "tradingDate",
          COALESCE(open, close)::float8 AS open,
          COALESCE(high, close)::float8 AS high,
          COALESCE(low, close)::float8 AS low,
          close::float8 AS close,
          volume::float8 AS volume,
          row_number() OVER (PARTITION BY "instrumentId" ORDER BY "tradingDate" DESC) AS position
        FROM "DailyPrice"
        WHERE "instrumentId" IN (${Prisma.join(ids)})
          AND "tradingDate" >= ${startDate}
          AND "tradingDate" <= ${priceDate}
          AND "marketDataSource"::text = ${realSource}
      ) ranked
      WHERE position <= ${maximumSessions}
      ORDER BY "instrumentId" ASC, "tradingDate" ASC
    `;
    for (const price of prices) {
      const instrumentPrices = grouped.get(price.instrumentId);
      if (instrumentPrices) instrumentPrices.push(price);
      else grouped.set(price.instrumentId, [price]);
    }
  }
  return instruments.flatMap((instrument) => {
    const prices = grouped.get(instrument.id) ?? [];
    return prices.length >= 21 ? [{
      company: instrument.company,
      sector: instrument.sector,
      symbol: instrument.symbol,
      instrumentId: instrument.id,
      prices,
    }] : [];
  });
}

async function latestClassifiedMarketDate(client: PrismaClient, universe: SectorUniverse, onOrBefore?: Date) {
  const companyWhere = universe === "nifty500"
    ? { nifty500Sector: { not: null } }
    : { sector: { not: null } };
  const latest = await client.dailyPrice.findFirst({
    where: {
      marketDataSource: realSource,
      tradingDate: onOrBefore ? { lte: onOrBefore } : undefined,
      instrument: { active: true, exchange: "NSE", company: companyWhere },
    },
    orderBy: { tradingDate: "desc" },
    select: { tradingDate: true },
  });
  return latest?.tradingDate ?? null;
}

async function dataRevision(client: PrismaClient, universe: SectorUniverse) {
  const classificationWhere = universe === "nifty500"
    ? { nifty500Sector: { not: null } }
    : { sector: { not: null } };
  const [sync, company] = await Promise.all([
    client.dataSync.findFirst({
      where: { provider: "upstox", dataType: "real_market_eod", status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    client.company.findFirst({ where: classificationWhere, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  return `${sync?.completedAt?.toISOString() ?? "none"}|${company?.updatedAt.toISOString() ?? "none"}`;
}

function emptyResult(requestedDate: string, latestMarketDate: Date | null, universe: SectorUniverse): SectorDashboardResult {
  return {
    universe,
    requestedDate,
    priceDateUsed: null,
    latestMarketDate: latestMarketDate ? dateKey(latestMarketDate) : null,
    benchmarkName: "NIFTY 50",
    benchmarkReturn1M: null,
    benchmarkSeries: [],
    classifiedCompanies: 0,
    sectors: [],
    calculation: { calculatedAt: new Date().toISOString(), reused: false },
  };
}

function returnOverSessions(prices: readonly SwingPrice[], sessions: number) {
  const latest = prices.at(-1);
  const previous = prices.at(-(sessions + 1));
  if (!latest || !previous || previous.close <= 0) return null;
  return (latest.close / previous.close - 1) * 100;
}

function relativeReturn(value: number | null, benchmark: number | null) {
  return value === null || benchmark === null ? null : value - benchmark;
}

function scaled(value: number | null, minimum: number, maximum: number, points: number) {
  if (value === null) return points / 2;
  return Math.max(0, Math.min(points, ((value - minimum) / (maximum - minimum)) * points));
}

function percent(count: number, total: number) {
  return total === 0 ? 0 : count / total * 100;
}

function average(values: readonly number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function medianNullable(values: readonly (number | null)[]) {
  const present = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return present.length === 0 ? null : median(present);
}

function median(values: readonly number[]) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : ordered[middle] ?? 0;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function chronologicallyOrdered(prices: readonly SwingPrice[]): readonly SwingPrice[] {
  for (let index = 1; index < prices.length; index += 1) {
    if (prices[index - 1]!.tradingDate > prices[index]!.tradingDate) {
      return [...prices].sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime());
    }
  }
  return prices;
}
