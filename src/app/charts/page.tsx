import Link from "next/link";

import { MarketIndexBrowser } from "@/components/charts/market-index-browser";
import { IndexConstituents } from "@/components/charts/index-constituents";
import { StockPriceChart } from "@/components/charts/stock-price-chart";
import { SectorStatus } from "@/components/sectors/sector-status";
import { stockChartHref } from "@/components/stocks/stock-chart-link";
import { prisma } from "@/lib/db/prisma";
import { createUpstoxMarketDataProvider } from "@/lib/market-data/providers/upstox";
import { getCachedIndexChart, getCachedMarketIndexCatalog, searchStockCharts } from "@/lib/stock-chart/service";
import type { ProviderIndexInstrument } from "@/lib/market-data/types";
import { getCachedIndexConstituents } from "@/lib/market-data/index-constituents";
import { loadIndexConstituentMarketData } from "@/lib/market-data/index-constituent-market";
import { formatCurrency } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function StockChartsPage({ searchParams }: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const startDate = validDateParam(params.startDate);
  const endDate = validDateParam(params.endDate);
  const provider = createUpstoxMarketDataProvider();
  const [result, indexCatalogState] = await Promise.all([
    searchStockCharts(prisma, query),
    getCachedMarketIndexCatalog(provider)
      .then((indices) => ({ indices, error: null }))
      .catch(() => ({ indices: [] as ProviderIndexInstrument[], error: "The market-index catalog is temporarily unavailable." })),
  ]);
  const indices = ensureDefaultNifty(indexCatalogState.indices);
  const selectedIndex = indices.find((index) => index.instrumentKey === params.index)
    ?? indices.find((index) => index.instrumentKey === defaultNifty.instrumentKey)
    ?? indices[0]!;
  const [indexState, constituents] = await Promise.all([
    getCachedIndexChart(provider, selectedIndex)
      .then((chart) => ({ chart, error: null }))
      .catch(() => ({ chart: null, error: `${selectedIndex.name} chart data is temporarily unavailable.` })),
    getCachedIndexConstituents(selectedIndex),
  ]);
  const marketIndex = indexState.chart;
  const constituentsWithMarketData = constituents.status === "available"
    ? { ...constituents, stocks: await loadIndexConstituentMarketData(prisma, constituents.stocks) }
    : constituents;

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">STORED MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">Stock Charts</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Open an on-demand candlestick chart for any instrument with stored prices. {result.totalInstruments.toLocaleString("en-IN")} instruments are available.
          </p>
        </div>

        {marketIndex ? (
          <div className="space-y-4 rounded-md border border-[var(--border)] bg-[var(--panel)] p-3 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-[var(--muted)]">{selectedIndex.exchange === "GLOBAL" ? "Global market chart" : "Indian market chart"}</p>
                <h2 className="mt-1 text-xl font-semibold">{selectedIndex.name}</h2>
              </div>
              <p className="text-sm text-[var(--muted)]">
                {selectedIndex.exchange === "GLOBAL" ? selectedIndex.country ?? "Global" : "NSE"} index · Prices through {marketIndex.priceDate}
                {selectedIndex.latency ? ` · ${selectedIndex.latency} provider delay` : ""}
              </p>
            </div>
            <StockPriceChart candles={marketIndex.candles} initialStartDate={startDate} initialEndDate={endDate} instrumentKey={marketIndex.instrumentKey} liveEnabled={!endDate} overlay={null} symbol={marketIndex.symbol} valuePrefix="" />
          </div>
        ) : (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            {indexState.error ?? `No ${selectedIndex.name} history is currently available.`} Choose another index or use stock search below.
          </p>
        )}

        <IndexConstituents indexName={selectedIndex.name} result={constituentsWithMarketData} />
        <MarketIndexBrowser activeInstrumentKey={selectedIndex.instrumentKey} indices={indices} />
        {indexCatalogState.error ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">{indexCatalogState.error} Nifty 50 remains available.</p> : null}

        <form className="flex gap-3 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
          <input
            aria-label="Search stocks"
            autoFocus
            className="h-11 min-w-0 flex-1 rounded-md border border-[var(--border)] px-3"
            defaultValue={query}
            name="q"
            placeholder="Search symbol or company name, for example RELIANCE"
            type="search"
          />
          <button className="h-11 rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white" type="submit">Search</button>
        </form>

        {query ? (
          <div className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--panel)]">
            <div className="border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">{result.results.length} matches for “{query}”</div>
            {result.results.length > 0 ? (
              <div className="divide-y divide-[var(--border)]">
                {result.results.map((stock) => (
                  <Link className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--panel-soft)]" href={stockChartHref(stock)} key={`${stock.exchange}:${stock.symbol}`}>
                    <span>
                      <span className="block text-sm font-semibold text-[var(--accent)]">{stock.companyName}</span>
                      <span className="text-xs text-[var(--muted)]">{stock.symbol} · {stock.exchange}</span>
                    </span>
                    <span className="flex items-center gap-4 text-right text-xs text-[var(--muted)]">
                      <SectorStatus date={stock.priceDate} sector={stock.sector} />
                      <span>{stock.lastClose === null ? "-" : formatCurrency(stock.lastClose)}</span>
                      <span className="font-semibold text-[var(--accent)]">Open chart</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : <p className="p-5 text-sm text-[var(--muted)]">No matching instruments with stored prices.</p>}
          </div>
        ) : null}
      </div>
    </section>
  );
}

const defaultNifty: ProviderIndexInstrument = {
  exchange: "NSE",
  name: "Nifty 50",
  tradingSymbol: "NIFTY",
  instrumentKey: "NSE_INDEX|Nifty 50",
  segment: "NSE_INDEX",
  country: "India",
  latency: null,
};

function ensureDefaultNifty(indices: readonly ProviderIndexInstrument[]) {
  return indices.some((index) => index.instrumentKey === defaultNifty.instrumentKey) ? [...indices] : [defaultNifty, ...indices];
}

function validDateParam(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ? undefined : value;
}
