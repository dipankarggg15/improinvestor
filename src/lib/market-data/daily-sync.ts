import { Prisma, type PrismaClient } from "@prisma/client";

import { runUpstoxDailySnapshotSync } from "@/lib/market-data/daily-snapshot-sync";
import { createUpstoxMarketDataProviderCore } from "@/lib/market-data/providers/upstox-core";

const dailySyncDataType = "app_daily_market_sync";
const indiaOffsetMs = 5.5 * 60 * 60 * 1000;
const staleRunMs = 45 * 60 * 1000;

export type DailyMarketSyncStatus = {
  readonly syncedToday: boolean;
  readonly pending: boolean;
  readonly calendarDate: string;
  readonly targetDate: string;
  readonly completedAt: string | null;
  readonly candlesUpserted: number;
  readonly failed: number;
  readonly processed: number;
  readonly total: number;
  readonly error: string | null;
};

let inFlight: { readonly calendarDate: string; readonly promise: Promise<DailyMarketSyncStatus> } | null = null;

export async function ensureDailyMarketDataSync(
  client: PrismaClient,
  now = new Date(),
): Promise<DailyMarketSyncStatus> {
  const calendarDate = indiaCalendarDateKey(now);
  if (inFlight?.calendarDate === calendarDate) return inFlight.promise;

  const promise = runDailyMarketDataSync(client, now);
  const current = { calendarDate, promise };
  inFlight = current;
  void promise.finally(() => {
    if (inFlight === current) inFlight = null;
  });
  return promise;
}

export async function getDailyMarketSyncStatus(
  client: PrismaClient,
  now = new Date(),
): Promise<DailyMarketSyncStatus> {
  const calendarDate = indiaCalendarDateKey(now);
  const targetDate = dateKey(latestSafeMarketEodDate(now));
  const marker = await latestDailyMarker(client, calendarDate);
  if (!marker) return emptyStatus(calendarDate, targetDate);

  const metadata = jsonObject(marker.metadata);
  const markerFailed = numericJsonValue(metadata?.failed) ?? 0;
  const markerTotal = numericJsonValue(metadata?.total) ?? 0;
  const completed = marker.status === "COMPLETED" && metadata?.syncedToday === true &&
    (markerTotal === 0 || markerFailed < markerTotal * 0.1);
  const pending = marker.status === "RUNNING" && now.getTime() - marker.startedAt.getTime() < staleRunMs;
  const activeImport = pending ? await client.dataSync.findFirst({
    where: { provider: "upstox", dataType: "real_market_eod", status: "RUNNING" },
    orderBy: { startedAt: "desc" },
    select: { recordsProcessed: true, metadata: true },
  }) : null;
  const activeMetadata = jsonObject(activeImport?.metadata);
  return {
    syncedToday: completed,
    pending,
    calendarDate,
    targetDate: stringJsonValue(metadata?.targetDate) ?? targetDate,
    completedAt: marker.completedAt?.toISOString() ?? null,
    candlesUpserted: numericJsonValue(metadata?.candlesUpserted) ?? 0,
    failed: numericJsonValue(metadata?.failed) ?? 0,
    processed: activeImport?.recordsProcessed ?? numericJsonValue(metadata?.processed) ?? 0,
    total: numericJsonValue(activeMetadata?.totalInstruments) ?? numericJsonValue(metadata?.total) ?? 0,
    error: marker.errorMessage,
  };
}

async function runDailyMarketDataSync(client: PrismaClient, now: Date): Promise<DailyMarketSyncStatus> {
  const existing = await getDailyMarketSyncStatus(client, now);
  if (existing.syncedToday) return existing;

  const startedAt = new Date();
  const target = latestSafeMarketEodDate(now);
  if (existing.pending) {
    await client.dataSync.updateMany({
      where: { provider: "upstox", dataType: dailySyncDataType, status: "RUNNING" },
      data: {
        status: "FAILED",
        completedAt: startedAt,
        errorMessage: "Superseded after the app restarted during the daily market-data sync.",
      },
    });
  }
  const marker = await client.dataSync.create({
    data: {
      provider: "upstox",
      dataType: dailySyncDataType,
      status: "RUNNING",
      startedAt,
      metadata: {
        calendarDate: existing.calendarDate,
        targetDate: dateKey(target),
        syncedToday: false,
        scope: "APP_UNIVERSE_BATCHED",
      },
    },
    select: { id: true },
  });

  try {
    const result = await runUpstoxDailySnapshotSync({
      client,
      provider: createUpstoxMarketDataProviderCore({ token: process.env.UPSTOX_ANALYTICS_TOKEN }),
      endDate: target,
    });
    const completedAt = new Date();
    const warning = result.failed > 0
      ? `${result.failed} instrument(s) could not be updated; all other market data completed.`
      : null;
    await client.dataSync.update({
      where: { id: marker.id },
      data: {
        status: "COMPLETED",
        completedAt,
        recordsProcessed: result.processed,
        recordsSucceeded: result.successful,
        recordsFailed: result.failed,
        errorMessage: warning,
        metadata: {
          calendarDate: existing.calendarDate,
          targetDate: dateKey(target),
          syncedToday: true,
          scope: "APP_UNIVERSE_BATCHED",
          candlesUpserted: result.candlesUpserted,
          failed: result.failed,
          processed: result.processed,
          total: result.totalInstruments,
        },
      },
    });
    return {
      syncedToday: true,
      pending: false,
      calendarDate: existing.calendarDate,
      targetDate: dateKey(target),
      completedAt: completedAt.toISOString(),
      candlesUpserted: result.candlesUpserted,
      failed: result.failed,
      processed: result.processed,
      total: result.totalInstruments,
      error: warning,
    };
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : "The daily market-data sync failed.";
    await client.dataSync.update({
      where: { id: marker.id },
      data: {
        status: "FAILED",
        completedAt,
        errorMessage: message,
        metadata: {
          calendarDate: existing.calendarDate,
          targetDate: dateKey(target),
          syncedToday: false,
          scope: "APP_UNIVERSE_BATCHED",
        },
      },
    });
    return { ...emptyStatus(existing.calendarDate, dateKey(target)), completedAt: completedAt.toISOString(), error: message };
  }
}

async function latestDailyMarker(client: PrismaClient, calendarDate: string) {
  const markers = await client.dataSync.findMany({
    where: { provider: "upstox", dataType: dailySyncDataType },
    orderBy: { startedAt: "desc" },
    take: 14,
    select: { status: true, startedAt: true, completedAt: true, errorMessage: true, metadata: true },
  });
  return markers.find((marker) => stringJsonValue(jsonObject(marker.metadata)?.calendarDate) === calendarDate) ?? null;
}

function emptyStatus(calendarDate: string, targetDate: string): DailyMarketSyncStatus {
  return {
    syncedToday: false,
    pending: false,
    calendarDate,
    targetDate,
    completedAt: null,
    candlesUpserted: 0,
    failed: 0,
    processed: 0,
    total: 0,
    error: null,
  };
}

function jsonObject(value: Prisma.JsonValue | undefined): Prisma.JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : null;
}

function stringJsonValue(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" ? value : null;
}

function numericJsonValue(value: Prisma.JsonValue | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function indiaCalendarDateKey(now = new Date()) {
  return new Date(now.getTime() + indiaOffsetMs).toISOString().slice(0, 10);
}

export function latestSafeMarketEodDate(now = new Date()) {
  const ist = new Date(now.getTime() + indiaOffsetMs);
  const date = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  if (ist.getUTCHours() < 18) date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
