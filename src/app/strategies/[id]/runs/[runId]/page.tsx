import { notFound } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { formatCrores, formatDate, formatPercent } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type StrategyRunPageProps = {
  params: Promise<{ id: string; runId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function StrategyRunPage({ params, searchParams }: StrategyRunPageProps) {
  const { id, runId } = await params;
  const query = await searchParams;
  const run = await prisma.strategyRun.findFirst({
    where: { id: runId, strategyId: id },
    include: {
      strategy: true,
      strategyVersion: true,
      candidates: {
        include: { company: true, instrument: true },
      },
    },
  });

  if (!run) notFound();

  const sorted = sortSnapshots(run.candidates, query.sort);

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">{run.strategy.name} Run</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            V{run.strategyVersion.versionNumber} on {formatDate(run.runDate)}. Stored decision snapshot,
            not recalculated from current data.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Evaluated" value={String(run.evaluatedCount)} />
          <Stat label="Eligible" value={String(run.eligibleCount)} />
          <Stat label="Selected" value={String(run.selectedCount)} />
          <Stat label="Status" value={run.status} />
        </div>

        <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--panel)]">
          <table className="w-full min-w-[1320px] text-left text-sm">
            <thead className="bg-[var(--panel-soft)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <SortableHead href={`/strategies/${id}/runs/${runId}`} label="Rank" sort="rank" />
                <SortableHead href={`/strategies/${id}/runs/${runId}`} label="Selected" sort="selected" />
                <SortableHead href={`/strategies/${id}/runs/${runId}`} label="Company" sort="company" />
                <th className="px-3 py-3">Symbol</th>
                <th className="px-3 py-3">Exchange</th>
                <SortableHead href={`/strategies/${id}/runs/${runId}`} label="Market Cap" sort="marketCap" />
                <SortableHead href={`/strategies/${id}/runs/${runId}`} label="Debt/Equity" sort="debtToEquity" />
                <SortableHead href={`/strategies/${id}/runs/${runId}`} label="Avg Traded Value" sort="averageTradedValue" />
                <SortableHead href={`/strategies/${id}/runs/${runId}`} label="1W" sort="return1W" />
                <SortableHead href={`/strategies/${id}/runs/${runId}`} label="1M" sort="return1M" />
                <SortableHead href={`/strategies/${id}/runs/${runId}`} label="3M" sort="return3M" />
                <SortableHead href={`/strategies/${id}/runs/${runId}`} label="6M" sort="return6M" />
                <SortableHead href={`/strategies/${id}/runs/${runId}`} label="1Y" sort="return1Y" />
                <SortableHead href={`/strategies/${id}/runs/${runId}`} label="Ranking Metric" sort="ranking" />
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((snapshot) => (
                <tr
                  className={`border-t border-[var(--border)] ${snapshot.selected ? "bg-green-50" : snapshot.qualified ? "bg-white" : "bg-neutral-50 text-[var(--muted)]"}`}
                  key={snapshot.id}
                >
                  <td className="px-3 py-3 font-medium">{snapshot.rank ?? "-"}</td>
                  <td className="px-3 py-3">{snapshot.selected ? "Selected" : snapshot.qualified ? "Qualified" : "Failed"}</td>
                  <td className="px-3 py-3">{snapshot.company.name}</td>
                  <td className="px-3 py-3 font-medium">{snapshot.instrument.symbol}</td>
                  <td className="px-3 py-3">{snapshot.instrument.exchange}</td>
                  <td className="px-3 py-3">{snapshot.marketCap ? formatCrores(snapshot.marketCap.toNumber()) : "-"}</td>
                  <td className="px-3 py-3">{snapshot.debtToEquity?.toNumber().toFixed(2) ?? "-"}</td>
                  <td className="px-3 py-3">{snapshot.averageTradedValue ? `${formatCrores(snapshot.averageTradedValue.toNumber())}/day` : "-"}</td>
                  <td className="px-3 py-3">{formatPercent(snapshot.return1W?.toNumber())}</td>
                  <td className="px-3 py-3">{formatPercent(snapshot.return1M?.toNumber())}</td>
                  <td className="px-3 py-3">{formatPercent(snapshot.return3M?.toNumber())}</td>
                  <td className="px-3 py-3">{formatPercent(snapshot.return6M?.toNumber())}</td>
                  <td className="px-3 py-3">{formatPercent(snapshot.return1Y?.toNumber())}</td>
                  <td className="px-3 py-3">{snapshot.rankingMetric}: {formatPercent(snapshot.rankingMetricValue?.toNumber())}</td>
                  <td className="px-3 py-3">
                    {snapshot.selected ? (
                      <Link
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--accent)]"
                        href={`/portfolio/trades/new?candidateSnapshotId=${snapshot.id}`}
                      >
                        Record Buy
                      </Link>
                    ) : (
                      "-"
                    )}
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

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function SortableHead({
  href,
  label,
  sort,
}: {
  readonly href: string;
  readonly label: string;
  readonly sort: string;
}) {
  return (
    <th className="px-3 py-3">
      <Link className="hover:text-[var(--accent)]" href={`${href}?sort=${sort}`}>
        {label}
      </Link>
    </th>
  );
}

type SnapshotRow = Prisma.StrategyCandidateSnapshotGetPayload<{
  include: { company: true; instrument: true };
}>;

function sortSnapshots(rows: SnapshotRow[], sort: string | undefined) {
  return [...rows].sort((left, right) => {
    if (sort === "company") return left.company.name.localeCompare(right.company.name);
    if (sort === "selected") return Number(right.selected) - Number(left.selected);
    if (sort === "marketCap") return numeric(right.marketCap) - numeric(left.marketCap);
    if (sort === "debtToEquity") return numeric(left.debtToEquity) - numeric(right.debtToEquity);
    if (sort === "averageTradedValue") return numeric(right.averageTradedValue) - numeric(left.averageTradedValue);
    if (sort === "return1W") return numeric(right.return1W) - numeric(left.return1W);
    if (sort === "return1M") return numeric(right.return1M) - numeric(left.return1M);
    if (sort === "return3M") return numeric(right.return3M) - numeric(left.return3M);
    if (sort === "return6M") return numeric(right.return6M) - numeric(left.return6M);
    if (sort === "return1Y") return numeric(right.return1Y) - numeric(left.return1Y);
    if (sort === "ranking") return numeric(right.rankingMetricValue) - numeric(left.rankingMetricValue);
    return (left.rank ?? 999_999) - (right.rank ?? 999_999);
  });
}

function numeric(value: { toNumber(): number } | null) {
  return value?.toNumber() ?? Number.NEGATIVE_INFINITY;
}
