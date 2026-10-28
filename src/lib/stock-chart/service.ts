import { Prisma, type Exchange, type PrismaClient } from "@prisma/client";

import { getProcessResultCache } from "@/lib/cache/process-result-cache";
import { analyzeSwingSetup, type SwingSetup, type SwingPrice } from "@/lib/swing-trading/service";
import { rankStockSearchCandidates } from "@/lib/stocks/fuzzy-search";
import type { MarketDataProvider, ProviderIndexInstrument } from "@/lib/market-data/types";

const chartSessionLimit = 10_000;
const indexChartCache = getProcessResultCache<StockChartResult | null>("market-index-chart-v1", 32);
const indexCatalogCache = getProcessResultCache<ProviderIndexInstrument[]>("market-index-catalog-v1", 3);
const defaultSwingRules = {
  minimumAverageTradedValue: 5 * 10_000_000,
  maximumDistancePercent: 3,
  minimumTouches: 2,
} as const;

export type StockChartCandle = {
  readonly time: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly sma50: number | null;
  readonly sma200: number | null;
  readonly ohlcComplete?: boolean;
  readonly volumeComplete?: boolean;
};

export type StockChartResult = {
  readonly company: string;
  readonly symbol: string;
  readonly exchange: Exchange;
  readonly instrumentKey: string;
  readonly sector: string | null;
  readonly priceDate: string;
  readonly candles: StockChartCandle[];
  readonly swingSetup: Omit<SwingSetup, "company" | "symbol" | "sector"> | null;
};

export type StockChartSearchResult = {
  readonly companyName: string;
  readonly symbol: string;
  readonly exchange: Exchange;
  readonly sector: string | null;
  readonly priceDate: string | null;
  readonly lastClose: number | null;
};

export async function getDefaultNiftyChart(
  provider: MarketDataProvider,
  now = new Date(),
): Promise<StockChartResult | null> {
  return getIndexChart(provider, defaultNiftyIndex, now);
}

const defaultNiftyIndex: ProviderIndexInstrument = {
  exchange: "NSE",
  name: "Nifty 50",
  tradingSymbol: "NIFTY",
  instrumentKey: "NSE_INDEX|Nifty 50",
  segment: "NSE_INDEX",
  country: "India",
  latency: null,
};

export async function getIndexChart(
  provider: MarketDataProvider,
  index: ProviderIndexInstrument,
  now = new Date(),
): Promise<StockChartResult | null> {
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startDate = new Date(endDate);
  startDate.setUTCFullYear(startDate.getUTCFullYear() - 10);
  const providerCandles = await provider.fetchHistoricalDailyCandles({
    instrumentKey: index.instrumentKey,
    startDate,
    endDate,
  });
  if (providerCandles.length === 0) return null;

  const prices: SwingPrice[] = providerCandles.map((price) => ({
    tradingDate: price.tradingDate,
    open: Number(price.open),
    high: Number(price.high),
    low: Number(price.low),
    close: Number(price.close),
    volume: Number(price.volume),
    ohlcComplete: !price.closeOnly,
    volumeComplete: !price.closeOnly,
  }));
  const candles = addMovingAverages(prices);

  return {
    company: index.name,
    symbol: index.tradingSymbol,
    exchange: "NSE",
    instrumentKey: index.instrumentKey,
    sector: index.exchange === "GLOBAL" ? `${index.country ?? "Global"} index` : "NSE index",
    priceDate: candles.at(-1)!.time,
    candles,
    swingSetup: null,
  };
}

export async function getCachedDefaultNiftyChart(
  provider: MarketDataProvider,
  now = new Date(),
): Promise<StockChartResult | null> {
  return getCachedIndexChart(provider, defaultNiftyIndex, now);
}

export async function getCachedIndexChart(
  provider: MarketDataProvider,
  index: ProviderIndexInstrument,
  now = new Date(),
): Promise<StockChartResult | null> {
  const date = now.toISOString().slice(0, 10);
  return (await indexChartCache.getOrCreate(`${date}:${index.instrumentKey}`, () => getIndexChart(provider, index, now))).value;
}

export async function getCachedMarketIndexCatalog(provider: MarketDataProvider, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  return (await indexCatalogCache.getOrCreate(date, async () => provider.fetchIndexInstruments?.() ?? [])).value;
}

export async function getStockChart(
  client: PrismaClient,
  input: { readonly exchange: string; readonly symbol: string; readonly date?: string; readonly endDate?: string },
): Promise<StockChartResult | null> {
  const exchange = parseExchange(input.exchange);
  if (!exchange) return null;
  const endDate = parseOptionalDate(input.endDate ?? input.date);

  const instrument = await client.instrument.findUnique({
    where: { exchange_symbol: { exchange, symbol: input.symbol.toUpperCase() } },
    select: {
      id: true,
      exchange: true,
      symbol: true,
      instrumentKey: true,
      marketDataSource: true,
      company: { select: { name: true, sector: true } },
      dailyPrices: {
        where: endDate ? { tradingDate: { lte: endDate } } : undefined,
        orderBy: { tradingDate: "desc" },
        take: chartSessionLimit,
        select: {
          tradingDate: true,
          open: true,
          high: true,
          low: true,
          close: true,
          volume: true,
        },
      },
    },
  });
  if (!instrument || instrument.dailyPrices.length === 0) return null;

  const prices = instrument.dailyPrices
    .map((price) => ({
      tradingDate: price.tradingDate,
      open: Number(price.open ?? price.close),
      high: Number(price.high ?? price.close),
      low: Number(price.low ?? price.close),
      close: Number(price.close),
      volume: Number(price.volume),
      ohlcComplete: price.open !== null && price.high !== null && price.low !== null,
      volumeComplete: price.open !== null && price.high !== null && price.low !== null,
    }))
    .reverse();
  const candles = addMovingAverages(prices);
  const completePrices = prices.filter((price) => price.ohlcComplete && price.volumeComplete);
  const swingSetup = instrument.exchange === "NSE" && instrument.marketDataSource === "UPSTOX_REAL"
    ? analyzeSwingSetup(completePrices, defaultSwingRules).setup
    : null;

  return {
    company: instrument.company.name,
    symbol: instrument.symbol,
    exchange: instrument.exchange,
    instrumentKey: instrument.instrumentKey,
    sector: instrument.company.sector,
    priceDate: candles.at(-1)!.time,
    candles,
    swingSetup,
  };
}

export async function searchStockCharts(
  client: PrismaClient,
  query: string,
): Promise<{ readonly totalInstruments: number; readonly results: StockChartSearchResult[] }> {
  const trimmed = query.trim();
  const where = { active: true, marketDataSource: "UPSTOX_REAL" as const };
  const instrumentSelect = {
    id: true,
    companyId: true,
    exchange: true,
    symbol: true,
    company: { select: { name: true, sector: true } },
  } as const;
  const totalInstruments = await client.instrument.count({ where });
  if (!trimmed) return { totalInstruments, results: [] };
  const instruments = await client.instrument.findMany({
    where: {
      ...where,
      OR: [
        { symbol: { contains: trimmed, mode: "insensitive" as const } },
        { company: { name: { contains: trimmed, mode: "insensitive" as const } } },
      ],
    },
    orderBy: [{ exchange: "asc" }, { symbol: "asc" }],
    take: 100,
    select: instrumentSelect,
  });
  let candidates = instruments.map(toSearchCandidate);

  // Preserve typo-tolerant search without making every normal search load the
  // full market universe into memory.
  if (trimmed.length >= 2 && candidates.length === 0) {
    const fuzzyUniverse = await client.instrument.findMany({
      where,
      orderBy: [{ exchange: "asc" }, { symbol: "asc" }],
      select: instrumentSelect,
    });
    candidates = rankStockSearchCandidates(trimmed, fuzzyUniverse.map(toSearchCandidate), 50);
  }
  const selected = candidates;
  const selectedIds = selected.map((instrument) => instrument.instrumentId);
  const latestPrices = selectedIds.length === 0
    ? []
    : await client.$queryRaw<Array<{ instrumentId: string; tradingDate: Date; close: number }>>`
      SELECT DISTINCT ON ("instrumentId")
        "instrumentId",
        "tradingDate",
        close::float8 AS close
      FROM "DailyPrice"
      WHERE "instrumentId" IN (${Prisma.join(selectedIds)})
      ORDER BY "instrumentId", "tradingDate" DESC
    `;
  const priceByInstrument = new Map(latestPrices.map((price) => [price.instrumentId, price]));
  const results = selected.map((instrument) => {
    const price = priceByInstrument.get(instrument.instrumentId);
    return {
      ...instrument,
      priceDate: price?.tradingDate.toISOString().slice(0, 10) ?? null,
      lastClose: price?.close ?? null,
    };
  });

  return { totalInstruments, results };
}

function toSearchCandidate(instrument: {
  readonly id: string;
  readonly companyId: string;
  readonly exchange: Exchange;
  readonly symbol: string;
  readonly company: { readonly name: string; readonly sector: string | null };
}) {
  return {
    companyId: instrument.companyId,
    instrumentId: instrument.id,
    companyName: instrument.company.name,
    symbol: instrument.symbol,
    exchange: instrument.exchange,
    sector: instrument.company.sector,
  };
}

export function addMovingAverages(prices: readonly (SwingPrice & {
  readonly ohlcComplete?: boolean;
  readonly volumeComplete?: boolean;
})[]): StockChartCandle[] {
  let rolling50 = 0;
  let rolling200 = 0;

  return prices.map((price, index) => {
    rolling50 += price.close;
    rolling200 += price.close;
    if (index >= 50) rolling50 -= prices[index - 50].close;
    if (index >= 200) rolling200 -= prices[index - 200].close;

    return {
      time: price.tradingDate.toISOString().slice(0, 10),
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: price.volume,
      sma50: index >= 49 ? rolling50 / 50 : null,
      sma200: index >= 199 ? rolling200 / 200 : null,
      ohlcComplete: price.ohlcComplete ?? true,
      volumeComplete: price.volumeComplete ?? true,
    };
  });
}

function parseExchange(value: string): Exchange | null {
  const normalized = value.toUpperCase();
  return normalized === "NSE" || normalized === "BSE" ? normalized : null;
}

function parseOptionalDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
