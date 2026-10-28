import { StockChartLink } from "@/components/stocks/stock-chart-link";
import { SectorStatus } from "@/components/sectors/sector-status";
import { AddToWatchlist } from "@/components/watchlists/add-to-watchlist";
import { FundamentalBadges } from "@/components/fundamentals/fundamental-badges";
import { prisma } from "@/lib/db/prisma";
import {
  findingMomentumOptions,
  getFindingMomentum,
  parseFindingMomentumDate,
  parseFindingMomentumOption,
} from "@/lib/finding-momentum/service";
import { formatCurrency, formatDisplayDate, formatPercent } from "@/lib/ui/format";
import { getFundamentalBadgesBySymbols } from "@/lib/fundamentals/service";
import { getDailyMarketSyncStatus } from "@/lib/market-data/daily-sync";
import { listWatchlistOptions } from "@/lib/watchlists/service";

export const dynamic = "force-dynamic";

type FindingMomentumPageProps = {
  readonly searchParams: Promise<{ readonly date?: string; readonly option?: string }>;
};

export default async function FindingMomentumPage({ searchParams }: FindingMomentumPageProps) {
  const query = await searchParams;
  const selectedDate = parseFindingMomentumDate(query.date);
  const option = parseFindingMomentumOption(query.option);
  const [result, watchlists, dailySync] = await Promise.all([
    getFindingMomentum({ client: prisma, selectedDate, option }),
    listWatchlistOptions(prisma),
    getDailyMarketSyncStatus(prisma),
  ]);
  const isVolatilityAdjusted = result.selectedOption.rankingMode === "volatilityAdjusted";
  const fundamentalBadges = result.rankingDateUsed
    ? await getFundamentalBadgesBySymbols(prisma, result.rows.map((row) => row.symbol), new Date(`${result.rankingDateUsed}T00:00:00.000Z`))
    : new Map();

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--accent)]">REAL MARKET DATA</p>
            <h1 className="mt-2 text-3xl font-semibold">Finding Momentum</h1>
          </div>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <label className="grid gap-2 text-sm font-medium">
              Momentum option
              <select
                className="h-11 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3"
                defaultValue={result.selectedOption.value}
                name="option"
              >
                {findingMomentumOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Date
              <input
                className="h-11 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3"
                defaultValue={result.selectedDate}
                name="date"
                type="date"
              />
            </label>
            <button className="h-11 rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white" type="submit">
              Run
            </button>
          </form>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Requested Date" value={formatDisplayDate(result.selectedDate)} />
          <Stat label="Local Market Data Through" value={result.dataUpdatedThrough ? formatDisplayDate(result.dataUpdatedThrough) : "-"} />
          <Stat label="Ranking Date Used" value={result.rankingDateUsed ? formatDisplayDate(result.rankingDateUsed) : "-"} />
          <Stat label="Eligible NSE Stocks (ETFs Excluded)" value={result.eligibleUniverseCount.toLocaleString("en-IN")} />
        </div>

        {result.selectedDateState === "updating" ? (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            NSE data for {result.selectedDate} is still being imported{dailySync.total > 0 ? ` (${dailySync.processed.toLocaleString("en-IN")} of ${dailySync.total.toLocaleString("en-IN")} stocks checked)` : ""}. The ranking remains on the last fully imported session, {result.rankingDateUsed ?? "not yet available"}, and this page refreshes when the daily update finishes.
          </div>
        ) : null}

        {result.selectedDateState === "no-session" && result.rankingDateUsed && result.rankingDateUsed !== result.selectedDate ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            No NSE trading session is available for {result.selectedDate}. Ranking uses the previous completed session, {result.rankingDateUsed}.
          </div>
        ) : null}

        <CalculationStatus calculatedAt={result.calculation.calculatedAt} reused={result.calculation.reused} />

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Top 60 NSE Momentum</h2>
            <p className="text-sm text-[var(--muted)]">{result.selectedOption.label} · {result.rankingDateUsed ? formatDisplayDate(result.rankingDateUsed) : "-"}</p>
          </div>
          <div className="mt-4 grid gap-3 sm:hidden">
            {result.rows.map((row) => <article className="rounded-lg border border-[var(--border)] bg-[var(--panel-raised)] p-4" key={`mobile-${row.rank}-${row.symbol}`}>
              <div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--panel-soft)] text-xs font-semibold">{row.rank}</span><div className="min-w-0 flex-1"><StockChartLink className="block font-semibold text-[var(--accent)]" date={result.rankingDateUsed ?? undefined} exchange="NSE" symbol={row.symbol}>{row.company}</StockChartLink><p className="mt-1 text-xs text-[var(--muted)]">NSE:{row.symbol} · <SectorStatus date={result.rankingDateUsed} sector={row.sector} /></p></div><strong className="metric-value text-sm">{formatCurrency(row.close)}</strong></div>
              <dl className="mt-4 grid grid-cols-4 gap-2 rounded-md bg-white p-3 text-center"><MobileMetric label="1M" value={formatOptionalPercent(row.return1M)} /><MobileMetric label="3M" value={formatOptionalPercent(row.return3M)} /><MobileMetric label="6M" value={formatOptionalPercent(row.return6M)} /><MobileMetric label="12M" value={formatOptionalPercent(row.return12M)} /></dl>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><FundamentalBadges summary={fundamentalBadges.get(row.symbol)} /><AddToWatchlist compact exchange="NSE" source="FINDING_MOMENTUM" symbol={row.symbol} watchlists={watchlists} /></div>
            </article>)}
          </div>
          <div className="mt-4 hidden max-w-full overflow-x-auto sm:block">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {[
                    "Rank",
                    "Company",
                    "Sector",
                    "Symbol",
                    "Close",
                    "1M Return %",
                    "3M Return %",
                    "6M Return %",
                    "12M Return %",
                    ...(!isVolatilityAdjusted ? ["Raw Average Return %"] : []),
                    "Fundamentals",
                    "Watchlist",
                  ].map((head) => (
                    <th className="py-2 pr-3" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr className="border-t border-[var(--border)] align-top" key={`${row.rank}-${row.symbol}`}>
                    <td className="py-3 pr-3 font-semibold">{row.rank}</td>
                    <td className="py-3 pr-3">
                      <StockChartLink
                        className="block min-w-52 font-medium text-[var(--accent)] hover:underline"
                        date={result.rankingDateUsed ?? undefined}
                        exchange="NSE"
                        symbol={row.symbol}
                      >
                        {row.company}
                      </StockChartLink>
                    </td>
                    <td className="py-3 pr-3"><SectorStatus className="text-[var(--muted)]" date={result.rankingDateUsed} sector={row.sector} /></td>
                    <td className="py-3 pr-3">
                      <StockChartLink className="hover:underline" date={result.rankingDateUsed ?? undefined} exchange="NSE" symbol={row.symbol}>
                        {row.symbol}
                      </StockChartLink>
                    </td>
                    <td className="py-3 pr-3">{formatCurrency(row.close)}</td>
                    <ReturnCell value={row.return1M} />
                    <ReturnCell value={row.return3M} />
                    <ReturnCell value={row.return6M} />
                    <ReturnCell value={row.return12M} />
                    {!isVolatilityAdjusted ? <td className="py-3 pr-3 font-semibold">{formatPercent(row.momentumScore)}</td> : null}
                    <td className="py-3 pr-3"><FundamentalBadges summary={fundamentalBadges.get(row.symbol)} /></td>
                    <td className="py-3 pr-3"><AddToWatchlist compact exchange="NSE" source="FINDING_MOMENTUM" symbol={row.symbol} watchlists={watchlists} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.rows.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No eligible NSE stocks for this date.</p> : null}
        </div>
      </div>
    </section>
  );
}

function MobileMetric({ label, value }: { readonly label: string; readonly value: string }) {
  const negative = value.startsWith("-");
  return <div><dt className="text-[10px] font-semibold uppercase text-[var(--muted)]">{label}</dt><dd className={`metric-value mt-1 text-xs font-semibold ${negative ? "text-red-700" : value === "-" ? "text-[var(--muted)]" : "text-emerald-700"}`}><span aria-hidden="true">{negative ? "↓ " : value === "-" ? "" : "↑ "}</span>{value}</dd></div>;
}

function ReturnCell({ value }: { readonly value: number | null }) {
  const tone = value === null ? "text-[var(--muted)]" : value < 0 ? "text-red-700" : value > 0 ? "text-emerald-700" : "";
  return <td className={`metric-value py-3 pr-3 font-medium ${tone}`}><span className="sr-only">{value === null ? "Unavailable" : value < 0 ? "Negative" : value > 0 ? "Positive" : "Unchanged"}: </span><span aria-hidden="true">{value === null || value === 0 ? "" : value < 0 ? "↓ " : "↑ "}</span>{formatOptionalPercent(value)}</td>;
}

function CalculationStatus({ calculatedAt, reused }: { readonly calculatedAt: string; readonly reused: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${reused ? "border-slate-200 bg-slate-50 text-slate-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
        <span aria-hidden="true" className={`size-1.5 rounded-full ${reused ? "bg-slate-500" : "bg-emerald-600"}`} />{reused ? "Cached result" : "Fresh result"}
      </span>
      <span>Calculated {formatCalculationTime(calculatedAt)}</span>
    </div>
  );
}

function formatCalculationTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function formatOptionalPercent(value: number | null) {
  return value === null ? "-" : formatPercent(value);
}
