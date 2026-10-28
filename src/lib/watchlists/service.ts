import type { PrismaClient, WatchlistItemState } from "@prisma/client";

import { analyzeSwingSetup, type SwingPrice } from "@/lib/swing-trading/service";
import { distanceFromSupport, watchlistProximityStatus, type WatchlistProximityStatus } from "@/lib/watchlists/proximity";

const watchlistSwingRules = {
  minimumAverageTradedValue: 5 * 10_000_000,
  maximumDistancePercent: 10,
  minimumTouches: 2,
} as const;

export type WatchlistMonitorRow = {
  readonly itemId: string;
  readonly company: string;
  readonly symbol: string;
  readonly sector: string | null;
  readonly exchange: "NSE" | "BSE";
  readonly instrumentKey: string;
  readonly source: string | null;
  readonly state: WatchlistItemState;
  readonly eodPrice: number;
  readonly priceDate: string;
  readonly supportLow: number | null;
  readonly supportHigh: number | null;
  readonly manualSupportLow: number | null;
  readonly manualSupportHigh: number | null;
  readonly supportSource: "MANUAL" | "AUTOMATIC" | "SAVED" | null;
  readonly alertDistancePercent: number;
  readonly proximityStatus: WatchlistProximityStatus;
  readonly distanceFromSupportPercent: number | null;
  readonly yearLow: number | null;
  readonly distanceFromYearLowPercent: number | null;
  readonly automaticSignal: string | null;
  readonly entryTrigger: number | null;
  readonly stopPrice: number | null;
  readonly targetPrice: number | null;
  readonly rewardRisk: number | null;
  readonly notes: string | null;
  readonly lastReviewedAt: string | null;
};

export async function listWatchlistOptions(client: PrismaClient) {
  return client.watchlist.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function listWatchlists(client: PrismaClient) {
  return client.watchlist.findMany({
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { items: true } },
      items: {
        where: { state: "WATCHING" },
        select: { id: true },
      },
    },
  });
}

export async function getWatchlist(client: PrismaClient, watchlistId: string) {
  const watchlist = await client.watchlist.findUnique({
    where: { id: watchlistId },
    include: {
      items: {
        orderBy: [{ state: "asc" }, { updatedAt: "desc" }],
        include: {
          company: { select: { name: true, sector: true } },
          instrument: {
            select: {
              exchange: true,
              symbol: true,
              instrumentKey: true,
              dailyPrices: {
                orderBy: { tradingDate: "desc" },
                take: 550,
                select: { tradingDate: true, open: true, high: true, low: true, close: true, volume: true },
              },
            },
          },
        },
      },
    },
  });
  if (!watchlist) return null;

  const rows = watchlist.items.flatMap((item): WatchlistMonitorRow[] => {
    const prices: SwingPrice[] = item.instrument.dailyPrices.map((price) => ({
      tradingDate: price.tradingDate,
      open: Number(price.open ?? price.close),
      high: Number(price.high ?? price.close),
      low: Number(price.low ?? price.close),
      close: Number(price.close),
      volume: Number(price.volume),
    })).reverse();
    const latest = prices.at(-1);
    if (!latest) return [];

    const automatic = item.instrument.exchange === "NSE"
      ? analyzeSwingSetup(prices, watchlistSwingRules).setup
      : null;
    const manualLow = decimalNumber(item.manualSupportLow);
    const manualHigh = decimalNumber(item.manualSupportHigh);
    const savedLow = decimalNumber(item.detectedSupportLow);
    const savedHigh = decimalNumber(item.detectedSupportHigh);
    const support = validZone(manualLow, manualHigh)
      ? { low: manualLow!, high: manualHigh!, source: "MANUAL" as const }
      : automatic
        ? { low: automatic.supportLow, high: automatic.supportHigh, source: "AUTOMATIC" as const }
        : validZone(savedLow, savedHigh)
          ? { low: savedLow!, high: savedHigh!, source: "SAVED" as const }
          : null;
    const yearPrices = prices.slice(-252);
    const yearLow = yearPrices.length > 0 ? Math.min(...yearPrices.map((price) => price.low)) : null;
    const alertDistancePercent = Number(item.alertDistancePercent);

    return [{
      itemId: item.id,
      company: item.company.name,
      sector: item.company.sector,
      symbol: item.instrument.symbol,
      exchange: item.instrument.exchange,
      instrumentKey: item.instrument.instrumentKey,
      source: item.source,
      state: item.state,
      eodPrice: latest.close,
      priceDate: dateKey(latest.tradingDate),
      supportLow: support?.low ?? null,
      supportHigh: support?.high ?? null,
      manualSupportLow: manualLow,
      manualSupportHigh: manualHigh,
      supportSource: support?.source ?? null,
      alertDistancePercent,
      proximityStatus: watchlistProximityStatus(latest.close, support?.low ?? null, support?.high ?? null, alertDistancePercent),
      distanceFromSupportPercent: distanceFromSupport(latest.close, support?.high ?? null),
      yearLow,
      distanceFromYearLowPercent: yearLow ? ((latest.close - yearLow) / yearLow) * 100 : null,
      automaticSignal: automatic?.status ?? null,
      entryTrigger: automatic?.entryTrigger ?? null,
      stopPrice: automatic?.stopPrice ?? null,
      targetPrice: automatic?.targetPrice ?? null,
      rewardRisk: automatic?.rewardRisk ?? null,
      notes: item.notes,
      lastReviewedAt: item.lastReviewedAt?.toISOString() ?? null,
    }];
  });

  rows.sort((left, right) =>
    statePriority(left.state) - statePriority(right.state) ||
    proximityPriority(left.proximityStatus) - proximityPriority(right.proximityStatus) ||
    (left.distanceFromSupportPercent ?? Infinity) - (right.distanceFromSupportPercent ?? Infinity) ||
    left.symbol.localeCompare(right.symbol),
  );

  return {
    id: watchlist.id,
    name: watchlist.name,
    description: watchlist.description,
    createdAt: watchlist.createdAt,
    updatedAt: watchlist.updatedAt,
    rows,
  };
}

function validZone(low: number | null, high: number | null) {
  return low !== null && high !== null && low > 0 && high >= low;
}

function decimalNumber(value: { toNumber(): number } | null) {
  return value ? value.toNumber() : null;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function statePriority(state: WatchlistItemState) {
  return state === "WATCHING" ? 0 : state === "BOUGHT" ? 1 : 2;
}

function proximityPriority(status: WatchlistProximityStatus) {
  return status === "IN_SUPPORT" ? 0 : status === "APPROACHING" ? 1 : status === "BROKEN" ? 2 : 3;
}
