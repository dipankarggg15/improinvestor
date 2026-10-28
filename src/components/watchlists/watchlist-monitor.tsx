"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SectorStatus } from "@/components/sectors/sector-status";
import { StockChartLink } from "@/components/stocks/stock-chart-link";
import { useLiveQuotes } from "@/lib/market-data/use-live-quotes";
import type { WatchlistMonitorRow } from "@/lib/watchlists/service";
import { distanceFromSupport, watchlistProximityStatus, type WatchlistProximityStatus } from "@/lib/watchlists/proximity";

type LiveQuote = {
  readonly instrumentKey: string;
  readonly lastPrice: number;
  readonly previousClose: number | null;
  readonly lastTradedAt: string | null;
};

export function WatchlistMonitor({ rows, watchlistId }: { readonly rows: WatchlistMonitorRow[]; readonly watchlistId: string }) {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [liveStatus, setLiveStatus] = useState<"loading" | "live" | "error">(rows.length === 0 ? "live" : "loading");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const previousStatuses = useRef(new Map(rows.map((row) => [row.itemId, row.proximityStatus])));
  const refreshInFlight = useRef(false);
  const instrumentKeys = useMemo(() => rows.map((row) => row.instrumentKey), [rows]);
  const liveFeed = useLiveQuotes(instrumentKeys);
  const effectiveQuotes = useMemo(() => ({ ...quotes, ...liveFeed.quotes }), [liveFeed.quotes, quotes]);
  const displayedFetchedAt = liveFeed.status === "live" ? liveFeed.updatedAt : fetchedAt;

  const refresh = useCallback(async () => {
    if (rows.length === 0 || refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const response = await fetch(`/api/watchlists/${encodeURIComponent(watchlistId)}/quotes`, { cache: "no-store" });
      const payload = await response.json() as { fetchedAt?: string; quotes?: LiveQuote[]; error?: string };
      if (!response.ok || !payload.quotes) throw new Error(payload.error ?? "Live quotes are unavailable.");
      setQuotes(Object.fromEntries(payload.quotes.map((quote) => [quote.instrumentKey, quote])));
      setFetchedAt(payload.fetchedAt ?? new Date().toISOString());
      setLiveStatus("live");
    } catch {
      setLiveStatus("error");
    } finally {
      refreshInFlight.current = false;
    }
  }, [rows.length, watchlistId]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const initialRefresh = window.setTimeout(refreshWhenVisible, 0);
    const interval = window.setInterval(() => {
      if (liveFeed.status !== "live") refreshWhenVisible();
    }, 60_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [liveFeed.status, refresh]);

  const liveRows = useMemo(() => rows.map((row) => {
    const quote = effectiveQuotes[row.instrumentKey];
    const price = quote?.lastPrice ?? row.eodPrice;
    const proximityStatus = watchlistProximityStatus(price, row.supportLow, row.supportHigh, row.alertDistancePercent);
    return {
      ...row,
      price,
      quote,
      proximityStatus,
      distanceFromSupportPercent: distanceFromSupport(price, row.supportHigh),
      distanceFromYearLowPercent: row.yearLow ? ((price - row.yearLow) / row.yearLow) * 100 : null,
    };
  }).sort((left, right) =>
    statePriority(left.state) - statePriority(right.state) ||
    proximityPriority(left.proximityStatus) - proximityPriority(right.proximityStatus) ||
    (left.distanceFromSupportPercent ?? Infinity) - (right.distanceFromSupportPercent ?? Infinity),
  ), [effectiveQuotes, rows]);

  useEffect(() => {
    if (!alertsEnabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const row of liveRows) {
      const previous = previousStatuses.current.get(row.itemId);
      if (previous && previous !== row.proximityStatus && row.proximityStatus !== "MONITORING") {
        new Notification(`${row.symbol}: ${statusLabel(row.proximityStatus)}`, {
          body: `${formatCurrency(row.price)} · support ${formatZone(row.supportLow, row.supportHigh)}`,
        });
      }
      previousStatuses.current.set(row.itemId, row.proximityStatus);
    }
  }, [alertsEnabled, liveRows]);

  async function enableAlerts() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setAlertsEnabled(permission === "granted");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Live priority</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {liveFeed.status === "live"
              ? `Upstox live stream · screen updated ${displayedFetchedAt ? formatTime(displayedFetchedAt) : "now"}`
              : liveStatus === "live"
                ? `REST fallback · refreshed ${displayedFetchedAt ? formatTime(displayedFetchedAt) : "now"}`
                : liveStatus === "loading" ? "Connecting to live prices…" : "Live quotes unavailable · showing latest EOD close"}
            {rows.length > 0 && liveFeed.status !== "live" ? " · fallback refreshes every 60 seconds" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-semibold" onClick={() => void refresh()} type="button">Refresh now</button>
          <button className="h-10 rounded-md border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent)]" onClick={() => void enableAlerts()} type="button">{alertsEnabled ? "Alerts enabled" : "Enable browser alerts"}</button>
        </div>
      </div>
      <div className="max-w-full overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
        <table className="w-full min-w-[1550px] text-left text-sm">
          <thead className="text-xs uppercase text-[var(--muted)]"><tr>{["Priority", "Stock", "Sector", "Lifecycle", "Live / EOD", "Change", "Support", "Distance", "52W Low", "Auto Signal", "Trigger", "Stop", "Target", "R:R", "Reviewed", "Notes"].map((head) => <th className="pb-3 pr-3" key={head}>{head}</th>)}</tr></thead>
          <tbody>{liveRows.map((row, index) => {
            const change = row.quote?.previousClose ? ((row.price - row.quote.previousClose) / row.quote.previousClose) * 100 : null;
            return (
              <tr className="border-t border-[var(--border)] align-top" key={row.itemId}>
                <td className="py-3 pr-3"><span className="font-semibold">{index + 1}</span><StatusBadge status={row.proximityStatus} /></td>
                <td className="py-3 pr-3"><StockChartLink className="block min-w-48 font-medium text-[var(--accent)] hover:underline" exchange={row.exchange} symbol={row.symbol}>{row.company}</StockChartLink><span className="text-xs text-[var(--muted)]">{row.exchange}:{row.symbol} · {row.source ?? "MANUAL"}</span></td>
                <td className="py-3 pr-3"><SectorStatus className="text-[var(--muted)]" date={row.priceDate} sector={row.sector} /></td>
                <td className="py-3 pr-3">{row.state.replace("_", " ")}</td>
                <td className="py-3 pr-3 font-semibold">{formatCurrency(row.price)}<span className="block text-xs font-normal text-[var(--muted)]">{row.quote ? "Live" : row.priceDate}</span></td>
                <td className={`py-3 pr-3 ${change !== null && change < 0 ? "text-red-700" : "text-emerald-700"}`}>{formatPercent(change)}</td>
                <td className="py-3 pr-3">{formatZone(row.supportLow, row.supportHigh)}<span className="block text-xs text-[var(--muted)]">{row.supportSource ?? "No level"}</span></td>
                <td className="py-3 pr-3 font-semibold">{formatPercent(row.distanceFromSupportPercent)}</td>
                <td className="py-3 pr-3">{row.yearLow ? formatCurrency(row.yearLow) : "-"}<span className="block text-xs text-[var(--muted)]">{formatPercent(row.distanceFromYearLowPercent)} away</span></td>
                <td className="py-3 pr-3">{row.automaticSignal?.replace("_", " ") ?? "-"}</td>
                <td className="py-3 pr-3">{formatOptionalCurrency(row.entryTrigger)}</td>
                <td className="py-3 pr-3 text-red-700">{formatOptionalCurrency(row.stopPrice)}</td>
                <td className="py-3 pr-3">{formatOptionalCurrency(row.targetPrice)}</td>
                <td className="py-3 pr-3">{row.rewardRisk === null ? "-" : `${row.rewardRisk.toFixed(2)}×`}</td>
                <td className="py-3 pr-3 text-xs">{row.lastReviewedAt ? formatDate(row.lastReviewedAt) : "Never"}</td>
                <td className="max-w-64 py-3 pr-3 text-xs text-[var(--muted)]">{row.notes ?? "-"}</td>
              </tr>
            );
          })}</tbody>
        </table>
        {rows.length === 0 ? <p className="py-6 text-sm text-[var(--muted)]">This watchlist is empty.</p> : null}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { readonly status: WatchlistProximityStatus }) {
  const style = status === "IN_SUPPORT" ? "bg-emerald-100 text-emerald-900" : status === "APPROACHING" ? "bg-amber-100 text-amber-900" : status === "BROKEN" ? "bg-red-100 text-red-900" : "bg-slate-100 text-slate-700";
  return <span className={`mt-1 block w-fit rounded px-2 py-1 text-[10px] font-semibold ${style}`}>{statusLabel(status)}</span>;
}

function statusLabel(status: WatchlistProximityStatus) {
  return status === "IN_SUPPORT" ? "IN SUPPORT" : status;
}

function statePriority(state: WatchlistMonitorRow["state"]) { return state === "WATCHING" ? 0 : state === "BOUGHT" ? 1 : 2; }
function proximityPriority(status: WatchlistProximityStatus) { return status === "IN_SUPPORT" ? 0 : status === "APPROACHING" ? 1 : status === "BROKEN" ? 2 : 3; }
function formatCurrency(value: number) { return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`; }
function formatOptionalCurrency(value: number | null) { return value === null ? "-" : formatCurrency(value); }
function formatPercent(value: number | null) { return value === null ? "-" : `${value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`; }
function formatZone(low: number | null, high: number | null) { return low === null || high === null ? "-" : `${formatCurrency(low)}–${formatCurrency(high)}`; }
function formatTime(value: string) { return new Intl.DateTimeFormat("en-IN", { timeStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(value)); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(value)); }
