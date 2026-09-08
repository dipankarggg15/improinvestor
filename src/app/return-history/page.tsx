import Link from "next/link";

import { HistoricalExperimentRepository } from "@/lib/research/historical-experiment";
import { formatPercent } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function ReturnHistoryPage() {
  const repository = new HistoricalExperimentRepository();
  const experiments = await repository.getSavedExperiments();

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-7xl">
        <div className="mb-6 flex flex-col gap-2">
          <p className="text-sm font-medium text-[var(--accent)]">REAL MARKET DATA</p>
          <h1 className="text-3xl font-semibold text-[var(--foreground)]">Return History</h1>
          <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Saved manual historical return experiments.
          </p>
        </div>

        {experiments.length === 0 ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-4 py-10 text-center text-sm text-[var(--muted)]">
            No saved returns yet.
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--panel)] shadow-sm">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead className="bg-[var(--panel-soft)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Experiment</th>
                  <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Positions</th>
                  <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Avg Return</th>
                  <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Median</th>
                  <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Win Rate</th>
                  <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Avg Hold</th>
                  <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Saved</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((experiment) => (
                  <tr className="border-b border-[var(--border)] last:border-b-0" key={experiment.id}>
                    <td className="px-3 py-3 font-medium">
                      <Link className="text-[var(--accent)] hover:underline" href={`/return-history/${experiment.id}`}>
                        {experiment.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{experiment.stats.totalPositions}</td>
                    <td className="px-3 py-3 font-semibold">{formatNullablePercent(experiment.stats.averagePositionReturnPercent)}</td>
                    <td className="px-3 py-3">{formatNullablePercent(experiment.stats.medianPositionReturnPercent)}</td>
                    <td className="px-3 py-3">{formatNullablePercent(experiment.stats.winRatePercent)}</td>
                    <td className="px-3 py-3">{experiment.stats.averageHoldingDays === null ? "-" : `${experiment.stats.averageHoldingDays.toFixed(1)}d`}</td>
                    <td className="px-3 py-3 text-[var(--muted)]">{formatDateTime(experiment.savedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function formatNullablePercent(value: number | null) {
  return value === null ? "-" : formatPercent(value);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
