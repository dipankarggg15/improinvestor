import type { PrismaClient } from "@prisma/client";

import type { MarketDataProvider } from "@/lib/market-data/types";

const realSource = "UPSTOX_REAL";
const batchSize = 400;

type StoredInstrument = {
  readonly id: string;
  readonly instrumentKey: string;
  readonly exchange: "NSE" | "BSE";
  readonly symbol: string;
};

export type DailySnapshotSyncResult = {
  readonly totalInstruments: number;
  readonly processed: number;
  readonly successful: number;
  readonly failed: number;
  readonly candlesUpserted: number;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly endDate: Date;
  readonly universeCounts: { readonly nse: number; readonly bse: number };
};

export async function runUpstoxDailySnapshotSync(input: {
  readonly client: PrismaClient;
  readonly provider: MarketDataProvider;
  readonly endDate: Date;
}): Promise<DailySnapshotSyncResult> {
  if (input.provider.name !== "upstox" || !input.provider.fetchPreviousDailyCandles) {
    throw new Error("The Upstox provider does not support batched previous-session OHLC data.");
  }

  const startedAt = new Date();
  const instruments = await input.client.instrument.findMany({
    where: {
      active: true,
      marketDataSource: realSource,
      exchange: { in: ["NSE", "BSE"] },
      instrumentKey: { not: { startsWith: "__SUPERSEDED__" } },
    },
    orderBy: [{ exchange: "asc" }, { symbol: "asc" }],
    select: { id: true, instrumentKey: true, exchange: true, symbol: true },
  }) as StoredInstrument[];
  if (instruments.length === 0) {
    throw new Error("No active Upstox instruments are available for the daily update.");
  }

  await input.client.dataSync.updateMany({
    where: { provider: "upstox", dataType: "real_market_eod", status: "RUNNING" },
    data: {
      status: "FAILED",
      completedAt: startedAt,
      errorMessage: "Superseded by the batched daily market-data sync.",
    },
  });
  const universeCounts = {
    nse: instruments.filter((instrument) => instrument.exchange === "NSE").length,
    bse: instruments.filter((instrument) => instrument.exchange === "BSE").length,
  };
  const job = await input.client.dataSync.create({
    data: {
      provider: "upstox",
      dataType: "real_market_eod",
      status: "RUNNING",
      startedAt,
      metadata: {
        marketDataSource: realSource,
        mode: "daily_snapshot_batch",
        totalCompanies: instruments.length,
        totalInstruments: instruments.length,
        completedEodThrough: dateKey(input.endDate),
        universeCounts,
        startedAt: startedAt.toISOString(),
      },
    },
    select: { id: true },
  });

  let processed = 0;
  let successful = 0;
  let candlesUpserted = 0;
  try {
    const completedSessionDate = previousWeekday(input.endDate);
    for (const batch of chunks(instruments, batchSize)) {
      const candles = await withRetry(() => input.provider.fetchPreviousDailyCandles!({
        instrumentKeys: batch.map((instrument) => instrument.instrumentKey),
        targetDate: completedSessionDate,
      }));
      const instrumentByKey = new Map(batch.map((instrument) => [instrument.instrumentKey, instrument]));
      const rows = candles.flatMap((candle) => {
        const instrument = instrumentByKey.get(candle.instrumentKey);
        if (!instrument || candle.tradingDate > completedSessionDate) return [];
        return [{
          instrumentId: instrument.id,
          tradingDate: candle.tradingDate,
          open: candle.closeOnly ? null : candle.open,
          high: candle.closeOnly ? null : candle.high,
          low: candle.closeOnly ? null : candle.low,
          close: candle.close,
          volume: candle.volume,
          marketDataSource: realSource as "UPSTOX_REAL",
        }];
      });
      const inserted = rows.length > 0
        ? await input.client.dailyPrice.createMany({ data: rows, skipDuplicates: true })
        : { count: 0 };
      processed += batch.length;
      successful += rows.length;
      candlesUpserted += inserted.count;
      await input.client.dataSync.update({
        where: { id: job.id },
        data: {
          recordsProcessed: processed,
          recordsSucceeded: successful,
          recordsFailed: processed - successful,
          metadata: {
            marketDataSource: realSource,
            mode: "daily_snapshot_batch",
            totalCompanies: instruments.length,
            totalInstruments: instruments.length,
            completedEodThrough: dateKey(input.endDate),
            universeCounts,
            startedAt: startedAt.toISOString(),
            candlesUpserted,
          },
        },
      });
    }

    const completedAt = new Date();
    const failed = processed - successful;
    if (successful < instruments.length * 0.9) {
      throw new Error(`Only ${successful} of ${instruments.length} instruments returned completed-session data.`);
    }
    await input.client.dataSync.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt,
        recordsProcessed: processed,
        recordsSucceeded: successful,
        recordsFailed: failed,
        errorMessage: failed > 0 ? `${failed} instrument(s) did not return a previous-session candle.` : null,
        metadata: {
          marketDataSource: realSource,
          mode: "daily_snapshot_batch",
          startDate: dateKey(input.endDate),
          endDate: dateKey(input.endDate),
          completedEodThrough: dateKey(input.endDate),
          totalCompanies: instruments.length,
          totalInstruments: instruments.length,
          candlesUpserted,
          universeCounts,
        },
      },
    });
    return {
      totalInstruments: instruments.length,
      processed,
      successful,
      failed,
      candlesUpserted,
      startedAt,
      completedAt,
      endDate: input.endDate,
      universeCounts,
    };
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : "The batched daily market-data sync failed.";
    await input.client.dataSync.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt,
        recordsProcessed: processed,
        recordsSucceeded: successful,
        recordsFailed: Math.max(1, processed - successful),
        errorMessage: message,
      },
    });
    throw error;
  }
}

function previousWeekday(targetDate: Date) {
  const date = new Date(targetDate);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

function chunks<T>(items: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function withRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const retryAfterMs = error instanceof Error && "retryAfterMs" in error && typeof error.retryAfterMs === "number"
        ? error.retryAfterMs : 0;
      await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfterMs, 500 * attempt)));
    }
  }
  throw lastError;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
