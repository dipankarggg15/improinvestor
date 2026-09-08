import Link from "next/link";
import { notFound } from "next/navigation";

import { HistoricalExperimentRepository, type ReturnExperimentStats } from "@/lib/research/historical-experiment";
import { formatPercent } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function ReturnHistoryDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const repository = new HistoricalExperimentRepository();
  const experiment = await repository.getSavedExperiment(id);

  if (!experiment) notFound();

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-7xl">
        <div className="mb-6 flex flex-col gap-2">
          <Link className="text-sm font-medium text-[var(--accent)] hover:underline" href="/return-history">
            Return History
          </Link>
          <h1 className="text-3xl font-semibold text-[var(--foreground)]">{experiment.name}</h1>
          <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Saved {experiment.savedAt ? new Date(experiment.savedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-"}
          </p>
        </div>

        <StatsStrip stats={experiment.stats} />

        <div className="mt-5 max-w-full overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--panel)] shadow-sm">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-[var(--panel-soft)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Company</th>
                <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Symbol</th>
                <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Start Date</th>
                <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">End Date</th>
                <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Holding Days</th>
                <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Start Price</th>
                <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">End Price</th>
                <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Return %</th>
                <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Resolved Dates</th>
              </tr>
            </thead>
            <tbody>
              {experiment.positions.map((position) => (
                <tr className="border-b border-[var(--border)] last:border-b-0" key={position.id}>
                  <td className="px-3 py-3">
                    <span className="block font-medium text-[var(--foreground)]">{position.companyName}</span>
                    <span className="text-xs text-[var(--muted)]">{position.isin}</span>
                  </td>
                  <td className="px-3 py-3">{position.exchange}:{position.symbol}</td>
                  <td className="px-3 py-3">{position.requestedStartDate}</td>
                  <td className="px-3 py-3">{position.requestedEndDate}</td>
                  <td className="px-3 py-3">{position.holdingDays === null ? "-" : `${position.holdingDays}d`}</td>
                  <td className="px-3 py-3 font-medium">{formatRupees(position.startPrice)}</td>
                  <td className="px-3 py-3 font-medium">{formatRupees(position.endPrice)}</td>
                  <td className="px-3 py-3 font-semibold">{formatNullablePercent(position.returnPercent)}</td>
                  <td className="px-3 py-3 text-xs text-[var(--muted)]">
                    {position.excludedReason ?? `${position.actualStartDate} -> ${position.actualEndDate}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function StatsStrip({ stats }: { readonly stats: ReturnExperimentStats }) {
  const items = [
    ["Total Positions", String(stats.totalPositions)],
    ["Average Position Return", formatNullablePercent(stats.averagePositionReturnPercent)],
    ["Median", formatNullablePercent(stats.medianPositionReturnPercent)],
    ["Winners", String(stats.winningPositions)],
    ["Losers", String(stats.losingPositions)],
    ["Win Rate", formatNullablePercent(stats.winRatePercent)],
    ["Best", formatNullablePercent(stats.bestPositionReturnPercent)],
    ["Worst", formatNullablePercent(stats.worstPositionReturnPercent)],
    ["Avg Hold", stats.averageHoldingDays === null ? "-" : `${stats.averageHoldingDays.toFixed(1)}d`],
  ];

  return (
    <div className="grid gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
      {items.map(([label, value]) => (
        <div className="rounded-md bg-[var(--panel-soft)] px-3 py-2" key={label}>
          <p className="text-xs text-[var(--muted)]">{label}</p>
          <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{value}</p>
        </div>
      ))}
    </div>
  );
}

function formatRupees(value: number | null) {
  return value === null
    ? "-"
    : `₹${value.toLocaleString("en-IN", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      })}`;
}

function formatNullablePercent(value: number | null) {
  return value === null ? "-" : formatPercent(value);
}
