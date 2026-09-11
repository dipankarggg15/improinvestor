import { prisma } from "@/lib/db/prisma";
import { getFindingMomentum, parseFindingMomentumDate } from "@/lib/finding-momentum/service";
import { formatCurrency, formatPercent } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type FindingMomentumPageProps = {
  readonly searchParams: Promise<{ readonly date?: string }>;
};

export default async function FindingMomentumPage({ searchParams }: FindingMomentumPageProps) {
  const query = await searchParams;
  const selectedDate = parseFindingMomentumDate(query.date);
  const result = await getFindingMomentum({ client: prisma, selectedDate });

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
          <Stat label="Data Updated Through" value={result.dataUpdatedThrough ?? "-"} />
          <Stat label="Latest Upstox EOD" value={result.latestUpstoxCompletedTradingDate ?? "-"} />
          <Stat label="Ranking Date Used" value={result.rankingDateUsed ?? "-"} />
          <Stat label="Eligible NSE Universe" value={result.eligibleUniverseCount.toLocaleString("en-IN")} />
        </div>

        {result.sync.error ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Upstox freshness/update check could not complete: {result.sync.error}. Showing rankings from the local database through {result.dataUpdatedThrough ?? "the latest available local date"}.
          </div>
        ) : null}

        {result.sync.ran ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            Updated NSE daily prices from {result.sync.startDate} to {result.sync.endDate}: {result.sync.candlesUpserted.toLocaleString("en-IN")} candles added, {result.sync.skipped.toLocaleString("en-IN")} instruments already current, {result.sync.failed.toLocaleString("en-IN")} failures.
          </div>
        ) : null}

        {result.rankingDateUsed && result.rankingDateUsed !== result.selectedDate ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Selected date {result.selectedDate} was not a local NSE trading day. Ranking uses {result.rankingDateUsed}.
          </div>
        ) : null}

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Top 60 NSE Momentum</h2>
            <p className="text-sm text-[var(--muted)]">{result.rankingDateUsed ?? "-"} ranking</p>
          </div>
          <div className="mt-4 max-w-full overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {[
                    "Rank",
                    "Company",
                    "Symbol",
                    "Close",
                    "1M Return %",
                    "3M Return %",
                    "1Y Annualized Volatility %",
                    "1M / Volatility",
                    "3M / Volatility",
                    "1M Z-Score",
                    "3M Z-Score",
                    "Momentum Score",
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
                      <span className="block min-w-52 font-medium">{row.company}</span>
                    </td>
                    <td className="py-3 pr-3">{row.symbol}</td>
                    <td className="py-3 pr-3">{formatCurrency(row.close)}</td>
                    <td className="py-3 pr-3">{formatPercent(row.return1M)}</td>
                    <td className="py-3 pr-3">{formatPercent(row.return3M)}</td>
                    <td className="py-3 pr-3">{formatPercent(row.annualizedVolatilityPercent)}</td>
                    <td className="py-3 pr-3">{formatNumber(row.riskAdjusted1M / 100)}</td>
                    <td className="py-3 pr-3">{formatNumber(row.riskAdjusted3M / 100)}</td>
                    <td className="py-3 pr-3">{formatNumber(row.z1M)}</td>
                    <td className="py-3 pr-3">{formatNumber(row.z3M)}</td>
                    <td className="py-3 pr-3 font-semibold">{formatNumber(row.momentumScore)}</td>
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

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 4,
  });
}
