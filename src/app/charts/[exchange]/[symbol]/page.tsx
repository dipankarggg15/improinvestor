import Link from "next/link";
import { notFound } from "next/navigation";

import { StockPriceChart } from "@/components/charts/stock-price-chart";
import { StockFundamentalsPanel } from "@/components/fundamentals/stock-fundamentals-panel";
import { LivePriceStat } from "@/components/market-data/live-price-stat";
import { SectorStatus } from "@/components/sectors/sector-status";
import { AddToWatchlist } from "@/components/watchlists/add-to-watchlist";
import { prisma } from "@/lib/db/prisma";
import { getStockFundamentals } from "@/lib/fundamentals/service";
import { getStockChart } from "@/lib/stock-chart/service";
import { formatCrores, formatCurrency, formatDisplayDate } from "@/lib/ui/format";
import { listWatchlistOptions } from "@/lib/watchlists/service";

export const dynamic = "force-dynamic";

export default async function StockChartPage({ params, searchParams }: {
  readonly params: Promise<{ readonly exchange: string; readonly symbol: string }>;
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [route, query] = await Promise.all([params, searchParams]);
  const startDate = validDateParam(query.startDate);
  const endDate = validDateParam(query.endDate) ?? validDateParam(query.date);
  const [result, watchlists] = await Promise.all([
    getStockChart(prisma, { ...route, endDate }),
    listWatchlistOptions(prisma),
  ]);
  if (!result) notFound();
  const fundamentals = await getStockFundamentals(prisma, {
    exchange: result.exchange,
    symbol: result.symbol,
    asOfDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : undefined,
    token: process.env.UPSTOX_ANALYTICS_TOKEN,
  });

  const latest = result.candles.at(-1)!;
  const previous = result.candles.at(-2);
  const change = previous ? latest.close - previous.close : 0;
  const changePercent = previous ? (change / previous.close) * 100 : 0;
  const setup = result.swingSetup;

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link className="text-sm font-medium text-[var(--accent)] hover:underline" href="/charts">← All stock charts</Link>
            <h1 className="mt-2 text-3xl font-semibold">{result.company}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-[var(--muted)]"><span>{result.exchange}:{result.symbol} ·</span><SectorStatus date={result.priceDate} sector={result.sector} /><span>· Prices through {formatDisplayDate(result.priceDate)}</span></p>
          </div>
          {setup ? (
            <span className={`rounded-md border px-3 py-2 text-sm font-semibold ${setup.decision === "TRADE_READY" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : setup.decision === "WATCH" ? "border-sky-300 bg-sky-50 text-sky-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
              Swing: {setup.decision.replaceAll("_", " ")}
            </span>
          ) : null}
          <AddToWatchlist detectedAt={result.priceDate} exchange={result.exchange} source="CHART" supportHigh={setup?.supportHigh} supportLow={setup?.supportLow} symbol={result.symbol} watchlists={watchlists} />
        </div>

        <form action="/charts" className="flex gap-3 rounded-md border border-[var(--border)] bg-[var(--panel)] p-3" method="get">
          <input
            aria-label="Search another stock"
            className="h-11 min-w-0 flex-1 rounded-md border border-[var(--border)] px-3"
            name="q"
            placeholder="Search another company or symbol"
            type="search"
          />
          <button className="h-11 rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white" type="submit">Search</button>
        </form>

        <div className="stock-summary-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {endDate
            ? <Stat label="Period Close" value={formatCurrency(latest.close)} detail={`${change >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`} tone={change >= 0 ? "positive" : "negative"} />
            : <LivePriceStat fallbackChangePercent={changePercent} fallbackPrice={latest.close} instrumentKey={result.instrumentKey} />}
          <Stat
            label="Day Range"
            value={latest.ohlcComplete === false ? "-" : `${formatCurrency(latest.low)}–${formatCurrency(latest.high)}`}
            detail={latest.ohlcComplete === false ? "Full OHLC pending" : undefined}
          />
          <Stat
            label="Volume"
            value={latest.volumeComplete === false ? "-" : latest.volume.toLocaleString("en-IN")}
            detail={latest.volumeComplete === false ? "Full session data pending" : undefined}
          />
          <Stat label="50 DMA" value={latest.sma50 === null ? "-" : formatCurrency(latest.sma50)} />
          <Stat label="200 DMA" value={latest.sma200 === null ? "-" : formatCurrency(latest.sma200)} />
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-3 sm:p-5">
          <StockPriceChart candles={result.candles} initialStartDate={startDate} initialEndDate={endDate} instrumentKey={result.instrumentKey} liveEnabled={!endDate} symbol={result.symbol} overlay={setup ? {
            supportLow: setup.supportLow,
            supportHigh: setup.supportHigh,
            entryTrigger: setup.entryTrigger,
            stopPrice: setup.stopPrice,
            targetPrice: setup.targetPrice,
          } : null} />
        </div>

        {setup ? (
          <div className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:grid-cols-2 lg:grid-cols-6">
            <Stat label="Support Zone" value={`${formatCurrency(setup.supportLow)}–${formatCurrency(setup.supportHigh)}`} />
            <Stat label="Touches" value={`${setup.touchCount}`} detail={`${setup.successfulBounceCount} bounced`} />
            <Stat label="Trigger" value={formatCurrency(setup.entryTrigger)} />
            <Stat label="Stop" value={formatCurrency(setup.stopPrice)} tone="negative" />
            <Stat label="Target" value={setup.targetPrice ? formatCurrency(setup.targetPrice) : "-"} tone="positive" />
            <Stat label="Reward / Risk" value={setup.rewardRisk === null ? "-" : `${setup.rewardRisk.toFixed(2)}×`} detail={`ATV ${formatCrores(setup.averageTradedValue)}`} />
          </div>
        ) : (
          <p className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] p-4 text-sm text-[var(--muted)]">
            This stock does not satisfy the default swing-support rules at the selected chart endpoint. Its price, volume and moving averages remain available for manual research.
          </p>
        )}

        <StockFundamentalsPanel fundamentals={fundamentals} historicalDate={endDate} />
      </div>
    </section>
  );
}

function validDateParam(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ? undefined : value;
}

function Stat({ label, value, detail, tone }: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly tone?: "positive" | "negative";
}) {
  const toneClass = tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-red-700" : "text-[var(--foreground)]";
  return <div className="mobile-compact-card rounded-lg border border-[var(--border)] bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p><p className={`metric-value mt-2 font-semibold ${toneClass}`}>{value}</p>{detail ? <p className={`mt-1 text-xs ${toneClass}`}>{detail}</p> : null}</div>;
}
