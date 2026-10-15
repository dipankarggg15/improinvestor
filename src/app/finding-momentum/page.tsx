import { prisma } from "@/lib/db/prisma";
import {
  findingMomentumOptions,
  getFindingMomentum,
  parseFindingMomentumDate,
  parseFindingMomentumOption,
} from "@/lib/finding-momentum/service";
import { formatCurrency, formatPercent } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type FindingMomentumPageProps = {
  readonly searchParams: Promise<{ readonly date?: string; readonly option?: string }>;
};

export default async function FindingMomentumPage({ searchParams }: FindingMomentumPageProps) {
  const query = await searchParams;
  const selectedDate = parseFindingMomentumDate(query.date);
  const option = parseFindingMomentumOption(query.option);
  const result = await getFindingMomentum({ client: prisma, selectedDate, option });
  const [firstMonths, secondMonths] = result.selectedOption.months;
  const isVolatilityAdjusted = result.selectedOption.rankingMode === "volatilityAdjusted";

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
          <Stat label="Requested Date" value={result.selectedDate} />
          <Stat label="Local Market Data Through" value={result.dataUpdatedThrough ?? "-"} />
          <Stat label="Ranking Date Used" value={result.rankingDateUsed ?? "-"} />
          <Stat label="Eligible NSE Stocks (ETFs Excluded)" value={result.eligibleUniverseCount.toLocaleString("en-IN")} />
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Top 60 NSE Momentum</h2>
            <p className="text-sm text-[var(--muted)]">{result.selectedOption.label} · {result.rankingDateUsed ?? "-"}</p>
          </div>
          <div className="mt-4 max-w-full overflow-x-auto">
            <table className={`w-full text-left text-sm ${isVolatilityAdjusted ? "min-w-[1280px]" : "min-w-[800px]"}`}>
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {[
                    "Rank",
                    "Company",
                    "Symbol",
                    "Close",
                    `${firstMonths}M Return %`,
                    `${secondMonths}M Return %`,
                    ...(isVolatilityAdjusted ? [
                      "1Y Annualized Volatility %",
                      `${firstMonths}M / Volatility`,
                      `${secondMonths}M / Volatility`,
                      `${firstMonths}M Z-Score`,
                      `${secondMonths}M Z-Score`,
                    ] : []),
                    isVolatilityAdjusted ? "Momentum Z-Score" : "Raw Average Return %",
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
                    <td className="py-3 pr-3">{formatPercent(row.firstReturn)}</td>
                    <td className="py-3 pr-3">{formatPercent(row.secondReturn)}</td>
                    {isVolatilityAdjusted ? (
                      <>
                        <td className="py-3 pr-3">{formatOptionalPercent(row.annualizedVolatilityPercent)}</td>
                        <td className="py-3 pr-3">{formatOptionalNumber(row.firstRiskAdjusted)}</td>
                        <td className="py-3 pr-3">{formatOptionalNumber(row.secondRiskAdjusted)}</td>
                        <td className="py-3 pr-3">{formatOptionalNumber(row.firstZScore)}</td>
                        <td className="py-3 pr-3">{formatOptionalNumber(row.secondZScore)}</td>
                      </>
                    ) : null}
                    <td className="py-3 pr-3 font-semibold">
                      {isVolatilityAdjusted ? formatNumber(row.momentumScore) : formatPercent(row.momentumScore)}
                    </td>
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

function formatOptionalNumber(value: number | null) {
  return value === null ? "-" : formatNumber(value);
}

function formatOptionalPercent(value: number | null) {
  return value === null ? "-" : formatPercent(value);
}
