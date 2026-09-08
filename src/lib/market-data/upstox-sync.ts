import type { PrismaClient } from "@prisma/client";

import type { MarketDataProvider, ProviderDailyCandle, ProviderInstrument } from "@/lib/market-data/types";

const realSource = "UPSTOX_REAL";

export type UpstoxSyncMode = "backfill" | "incremental";

export type UpstoxSyncOptions = {
  readonly client: PrismaClient;
  readonly provider: MarketDataProvider;
  readonly mode: UpstoxSyncMode;
  readonly years?: number;
  readonly concurrency?: number;
  readonly limit?: number;
  readonly symbols?: readonly string[];
  readonly now?: Date;
};

export type CanonicalCompanyInstrument = {
  readonly isin: string;
  readonly name: string;
  readonly instruments: readonly ProviderInstrument[];
  readonly canonicalInstrument: ProviderInstrument;
};

export type UpstoxSyncResult = {
  readonly totalInstruments: number;
  readonly totalCompanies: number;
  readonly processed: number;
  readonly successful: number;
  readonly failed: number;
  readonly skipped: number;
  readonly candlesUpserted: number;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly failures: readonly { readonly symbol: string; readonly instrumentKey: string; readonly error: string }[];
  readonly universeCounts: {
    readonly nse: number;
    readonly bse: number;
    readonly canonicalCompanies: number;
    readonly dualListedCompanies: number;
    readonly bseOnlyCompanies: number;
  };
};

type StoredInstrument = {
  readonly id: string;
  readonly instrumentKey: string;
};

export function canonicalizeUpstoxEquities(instruments: readonly ProviderInstrument[]) {
  const byIsin = new Map<string, ProviderInstrument[]>();

  for (const instrument of instruments) {
    if (!instrument.isin || !instrument.active) continue;
    if (instrument.segment !== "NSE_EQ" && instrument.segment !== "BSE_EQ") continue;
    byIsin.set(instrument.isin, [...(byIsin.get(instrument.isin) ?? []), instrument]);
  }

  return [...byIsin.entries()]
    .map(([isin, companyInstruments]): CanonicalCompanyInstrument => ({
      isin,
      name: bestName(companyInstruments),
      instruments: companyInstruments,
      canonicalInstrument: chooseCanonicalInstrument(companyInstruments),
    }))
    .sort((left, right) => left.canonicalInstrument.symbol.localeCompare(right.canonicalInstrument.symbol));
}

export function chooseCanonicalInstrument(instruments: readonly ProviderInstrument[]) {
  const nse = instruments.find((instrument) => instrument.exchange === "NSE");
  if (nse) return nse;
  const bse = instruments.find((instrument) => instrument.exchange === "BSE");
  if (bse) return bse;
  const first = instruments[0];
  if (!first) throw new Error("Cannot choose a canonical instrument from an empty listing set.");
  return first;
}

export function latestCompletedEodDate(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

export function fiveYearStartDate(endDate: Date, years = 5) {
  const startDate = new Date(endDate);
  startDate.setUTCFullYear(startDate.getUTCFullYear() - years);
  return startDate;
}

export async function runUpstoxRealMarketSync(options: UpstoxSyncOptions): Promise<UpstoxSyncResult> {
  if (options.provider.name !== "upstox") {
    throw new Error("Upstox real-market sync requires the Upstox provider.");
  }

  const startedAt = new Date();
  const endDate = latestCompletedEodDate(options.now);
  const backfillStartDate = fiveYearStartDate(endDate, options.years ?? 5);
  const allInstruments = await options.provider.fetchInstruments();
  const allowedSymbols = new Set(options.symbols?.map((symbol) => symbol.toUpperCase()));
  const companies = canonicalizeUpstoxEquities(allInstruments)
    .filter((company) => allowedSymbols.size === 0 || allowedSymbols.has(company.canonicalInstrument.symbol.toUpperCase()))
    .slice(0, options.limit);
  const syncJob = await createSyncJob(options.client, {
    mode: options.mode,
    totalCompanies: companies.length,
    endDate,
    startedAt,
  });
  let processed = 0;
  let successful = 0;
  let skipped = 0;
  let candlesUpserted = 0;
  const failures: Array<{ readonly symbol: string; readonly instrumentKey: string; readonly error: string }> = [];

  await mapConcurrent(companies, Math.max(1, options.concurrency ?? 2), async (company) => {
    const instrument = company.canonicalInstrument;
    try {
      const stored = await upsertCompanyAndInstruments(options.client, company);
      const storedCanonical = stored.find((row) => row.instrumentKey === instrument.instrumentKey);
      if (!storedCanonical) {
        throw new Error("Canonical instrument was not stored.");
      }

      const startDate = options.mode === "incremental"
        ? await nextMissingStartDate(options.client, storedCanonical.id, backfillStartDate)
        : backfillStartDate;

      if (startDate > endDate) {
        skipped += 1;
        return;
      }

      const candles = await withRetry(() => options.provider.fetchHistoricalDailyCandles({
        instrumentKey: instrument.instrumentKey,
        startDate,
        endDate,
      }));
      validateCandles(candles, endDate);
      candlesUpserted += await upsertDailyPrices(options.client, storedCanonical.id, candles);
      successful += 1;
    } catch (error) {
      failures.push({
        symbol: instrument.symbol,
        instrumentKey: instrument.instrumentKey,
        error: error instanceof Error ? error.message : "Unknown Upstox sync failure.",
      });
    } finally {
      processed += 1;
      await updateSyncProgress(options.client, syncJob.id, { processed, successful, skipped, failures, candlesUpserted });
    }
  });

  const completedAt = new Date();
  const result: UpstoxSyncResult = {
    totalInstruments: allInstruments.length,
    totalCompanies: companies.length,
    processed,
    successful,
    failed: failures.length,
    skipped,
    candlesUpserted,
    startedAt,
    completedAt,
    startDate: backfillStartDate,
    endDate,
    failures,
    universeCounts: universeCounts(allInstruments),
  };

  await completeSyncJob(options.client, syncJob.id, result, options.mode);
  return result;
}

function bestName(instruments: readonly ProviderInstrument[]) {
  return instruments.find((instrument) => instrument.exchange === "NSE")?.name ?? instruments[0]?.name ?? "Unknown Company";
}

function universeCounts(instruments: readonly ProviderInstrument[]) {
  const canonical = canonicalizeUpstoxEquities(instruments);
  return {
    nse: instruments.filter((instrument) => instrument.exchange === "NSE").length,
    bse: instruments.filter((instrument) => instrument.exchange === "BSE").length,
    canonicalCompanies: canonical.length,
    dualListedCompanies: canonical.filter((company) => (
      company.instruments.some((instrument) => instrument.exchange === "NSE") &&
      company.instruments.some((instrument) => instrument.exchange === "BSE")
    )).length,
    bseOnlyCompanies: canonical.filter((company) => company.instruments.every((instrument) => instrument.exchange === "BSE")).length,
  };
}

async function upsertCompanyAndInstruments(client: PrismaClient, company: CanonicalCompanyInstrument) {
  const db = client as unknown as RealMarketPrismaClient;
  const storedCompany = await db.company.upsert({
    where: { isin: company.isin },
    update: { name: company.name, marketDataSource: realSource },
    create: { isin: company.isin, name: company.name, marketDataSource: realSource },
    select: { id: true },
  });
  const stored: StoredInstrument[] = [];

  for (const instrument of company.instruments) {
    const row = await db.instrument.upsert({
      where: { exchange_instrumentKey: { exchange: instrument.exchange, instrumentKey: instrument.instrumentKey } },
      update: {
        companyId: storedCompany.id,
        symbol: instrument.symbol,
        active: instrument.active,
        marketDataSource: realSource,
      },
      create: {
        companyId: storedCompany.id,
        exchange: instrument.exchange,
        symbol: instrument.symbol,
        instrumentKey: instrument.instrumentKey,
        active: instrument.active,
        marketDataSource: realSource,
      },
      select: { id: true, instrumentKey: true },
    });
    stored.push(row);
  }

  return stored;
}

async function nextMissingStartDate(client: PrismaClient, instrumentId: string, fallback: Date) {
  const db = client as unknown as RealMarketPrismaClient;
  const latest = await db.dailyPrice.findFirst({
    where: { instrumentId, marketDataSource: realSource },
    orderBy: { tradingDate: "desc" },
    select: { tradingDate: true },
  });

  if (!latest) return fallback;
  const next = new Date(latest.tradingDate);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function validateCandles(candles: readonly ProviderDailyCandle[], endDate: Date) {
  let previousTime = 0;
  for (const candle of candles) {
    const time = candle.tradingDate.getTime();
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    if (time > endDate.getTime()) throw new Error("Upstox returned a future or partial EOD candle.");
    if (previousTime && time < previousTime) throw new Error("Upstox returned candles out of order.");
    if ([open, high, low, close].some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error("Upstox returned invalid OHLC values.");
    }
    if (high < low || high < open || high < close || low > open || low > close) {
      throw new Error("Upstox returned inconsistent OHLC values.");
    }
    if (candle.volume < 0) throw new Error("Upstox returned negative volume.");
    previousTime = time;
  }
}

async function upsertDailyPrices(client: PrismaClient, instrumentId: string, candles: readonly ProviderDailyCandle[]) {
  const db = client as unknown as RealMarketPrismaClient;
  let count = 0;

  for (const candle of candles) {
    await db.dailyPrice.upsert({
      where: { instrumentId_tradingDate: { instrumentId, tradingDate: candle.tradingDate } },
      update: {
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        marketDataSource: realSource,
      },
      create: {
        instrumentId,
        tradingDate: candle.tradingDate,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        marketDataSource: realSource,
      },
    });
    count += 1;
  }

  return count;
}

async function withRetry<T>(operation: () => Promise<T>, attempts = 4) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await delay(250 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapConcurrent<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      if (item) await worker(item);
    }
  });
  await Promise.all(workers);
}

async function createSyncJob(
  client: PrismaClient,
  metadata: { readonly mode: UpstoxSyncMode; readonly totalCompanies: number; readonly endDate: Date; readonly startedAt: Date },
) {
  const db = client as unknown as RealMarketPrismaClient;
  return db.dataSync.create({
    data: {
      provider: "upstox",
      dataType: "real_market_eod",
      status: "RUNNING",
      metadata: {
        marketDataSource: realSource,
        mode: metadata.mode,
        totalCompanies: metadata.totalCompanies,
        completedEodThrough: metadata.endDate.toISOString().slice(0, 10),
        startedAt: metadata.startedAt.toISOString(),
      },
    },
    select: { id: true },
  });
}

async function updateSyncProgress(
  client: PrismaClient,
  syncJobId: string,
  progress: {
    readonly processed: number;
    readonly successful: number;
    readonly skipped: number;
    readonly failures: UpstoxSyncResult["failures"];
    readonly candlesUpserted: number;
  },
) {
  const db = client as unknown as RealMarketPrismaClient;
  await db.dataSync.update({
    where: { id: syncJobId },
    data: {
      recordsProcessed: progress.processed,
      recordsSucceeded: progress.successful,
      recordsFailed: progress.failures.length,
      recordsSkipped: progress.skipped,
      metadata: {
        marketDataSource: realSource,
        candlesUpserted: progress.candlesUpserted,
        failures: progress.failures.slice(-25),
      },
    },
  });
}

async function completeSyncJob(client: PrismaClient, syncJobId: string, result: UpstoxSyncResult, mode: UpstoxSyncMode) {
  const db = client as unknown as RealMarketPrismaClient;
  await db.dataSync.update({
    where: { id: syncJobId },
    data: {
      completedAt: result.completedAt,
      status: result.failed > 0 ? "FAILED" : "COMPLETED",
      recordsProcessed: result.processed,
      recordsSucceeded: result.successful,
      recordsFailed: result.failed,
      recordsSkipped: result.skipped,
      errorMessage: result.failed > 0 ? `${result.failed} Upstox instrument(s) failed. See metadata.` : null,
      metadata: {
        marketDataSource: realSource,
        mode,
        startDate: result.startDate.toISOString().slice(0, 10),
        endDate: result.endDate.toISOString().slice(0, 10),
        candlesUpserted: result.candlesUpserted,
        universeCounts: result.universeCounts,
        failures: result.failures,
      },
    },
  });
}

type RealMarketPrismaClient = {
  readonly company: {
    upsert(input: unknown): Promise<{ readonly id: string }>;
  };
  readonly instrument: {
    upsert(input: unknown): Promise<StoredInstrument>;
  };
  readonly dailyPrice: {
    findFirst(input: unknown): Promise<{ readonly tradingDate: Date } | null>;
    upsert(input: unknown): Promise<unknown>;
  };
  readonly dataSync: {
    create(input: unknown): Promise<{ readonly id: string }>;
    update(input: unknown): Promise<unknown>;
  };
};
