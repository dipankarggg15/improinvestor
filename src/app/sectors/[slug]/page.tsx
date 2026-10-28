import Link from "next/link";
import { notFound } from "next/navigation";

import { SectorPerformanceChart } from "@/components/sectors/sector-performance-chart";
import { StockChartLink } from "@/components/stocks/stock-chart-link";
import { prisma } from "@/lib/db/prisma";
import { getSectorDashboard, parseSectorDate, parseSectorUniverse } from "@/lib/sectors/service";
import { legacySectorSlug } from "@/lib/sectors/slug";
import { formatCurrency, formatPercent } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function SectorDetailPage({ params, searchParams }: {
  readonly params: Promise<{ readonly slug: string }>;
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [route, query] = await Promise.all([params, searchParams]);
  const universe = parseSectorUniverse(query.universe);
  const result = await getSectorDashboard({ client: prisma, requestedDate: parseSectorDate(query.date), universe });
  const sector = result.sectors.find((candidate) => candidate.slug === route.slug)
    ?? result.sectors.find((candidate) => legacySectorSlug(candidate.name) === route.slug);
  if (!sector) notFound();

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div><Link className="text-sm font-medium text-[var(--accent)] hover:underline" href={`/sectors?date=${result.priceDateUsed ?? result.requestedDate}&universe=${universe}`}>← All sectors</Link><p className="mt-4 text-sm font-medium text-[var(--accent)]">{universe === "market" ? "WHOLE MARKET" : "NIFTY 500"} · {sector.state} · SCORE {sector.score}/100</p><h1 className="mt-2 text-3xl font-semibold">{sector.name}</h1><p className="mt-2 text-sm text-[var(--muted)]">{sector.constituentCount} {universe === "market" ? "Upstox-classified NSE companies" : "official Nifty 500 constituents"} · Prices through {result.priceDateUsed}</p></div>

        <form className="flex flex-wrap items-end gap-3 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4"><input name="universe" type="hidden" value={universe} /><label className="grid gap-2 text-sm font-medium">As Of Date<input className="h-11 rounded-md border border-[var(--border)] px-3" defaultValue={result.requestedDate} name="date" type="date" /></label><button className="h-11 rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white" type="submit">Change date</button></form>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><Stat label="1 Week" value={signedPercent(sector.return1W)} /><Stat label="1 Month" value={signedPercent(sector.return1M)} /><Stat label="3 Months" value={signedPercent(sector.return3M)} /><Stat label="6 Months" value={signedPercent(sector.return6M)} /><Stat label="12 Months" value={signedPercent(sector.return12M)} /><Stat label="vs Nifty 1M" value={signedPercent(sector.relative1M)} /></div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5"><h2 className="text-lg font-semibold">Performance reference</h2><p className="mt-1 mb-4 text-sm text-[var(--muted)]">Both lines are rebased to 100. The sector line is an equal-weight basket. NIFTY 50 is displayed only for reference and does not affect the sector’s score or status.</p><SectorPerformanceChart benchmark={result.benchmarkSeries} sector={sector.series} sectorName={sector.name} /></div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat label="Above 20 DMA" value={formatPercent(sector.breadth20)} /><Stat label="Above 50 DMA" value={formatPercent(sector.breadth50)} /><Stat label="Above 200 DMA" value={formatPercent(sector.breadth200)} /><Stat label="Advancing Today" value={formatPercent(sector.advancersPercent)} /><Stat label="Positive 1M" value={formatPercent(sector.positive1MPercent)} /></div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5"><h2 className="text-lg font-semibold">All {sector.name} stocks ({sector.stocks.length})</h2><p className="mt-1 mb-4 text-sm text-[var(--muted)]">Complete classified constituent list, ranked by one-month return. Open any stock to inspect its chart at the selected date.</p><StockTable date={result.priceDateUsed} stocks={sector.stocks} /></div>
      </div>
    </section>
  );
}

function StockTable({ date, stocks }: { readonly date: string | null; readonly stocks: readonly { readonly company: string; readonly symbol: string; readonly currentPrice: number; readonly return1D: number | null; readonly return1W: number | null; readonly return1M: number | null; readonly return3M: number | null; readonly above50Dma: boolean; readonly above200Dma: boolean }[] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="text-xs uppercase text-[var(--muted)]"><tr><th className="py-2 pr-3">Rank</th><th className="py-2 pr-3">Stock</th><th className="py-2 pr-3">Price</th><th className="py-2 pr-3">1D</th><th className="py-2 pr-3">1W</th><th className="py-2 pr-3">1M</th><th className="py-2 pr-3">3M</th><th className="py-2 pr-3">Trend</th></tr></thead><tbody>{stocks.map((stock, index) => <tr className="border-t border-[var(--border)]" key={stock.symbol}><td className="py-3 pr-3 font-semibold">{index + 1}</td><td className="py-3 pr-3"><StockChartLink className="font-medium text-[var(--accent)] hover:underline" date={date ?? undefined} exchange="NSE" symbol={stock.symbol}>{stock.company}</StockChartLink><span className="block text-xs text-[var(--muted)]">{stock.symbol}</span></td><td className="py-3 pr-3">{formatCurrency(stock.currentPrice)}</td><td className="py-3 pr-3">{signedPercent(stock.return1D)}</td><td className="py-3 pr-3">{signedPercent(stock.return1W)}</td><td className="py-3 pr-3 font-semibold">{signedPercent(stock.return1M)}</td><td className="py-3 pr-3">{signedPercent(stock.return3M)}</td><td className="py-3 pr-3 text-xs"><span className={stock.above50Dma ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{stock.above50Dma ? "Above 50 DMA" : "Below 50 DMA"}</span><span className="block text-[var(--muted)]">{stock.above200Dma ? "Above 200 DMA" : "Below 200 DMA"}</span></td></tr>)}</tbody></table></div>;
}

function signedPercent(value: number | null) { return `${value !== null && value > 0 ? "+" : ""}${formatPercent(value)}`; }
function Stat({ label, value }: { readonly label: string; readonly value: string }) { return <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4"><p className="text-xs uppercase text-[var(--muted)]">{label}</p><p className="mt-2 font-semibold">{value}</p></div>; }
