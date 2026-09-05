import Link from "next/link";
import { notFound } from "next/navigation";

import { cloneStrategyVersionAction, runStrategyAction } from "@/app/strategies/actions";
import { prisma } from "@/lib/db/prisma";
import { parseStrategyConfig } from "@/lib/strategies/config";
import { formatDate } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type StrategyDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function StrategyDetailPage({ params }: StrategyDetailPageProps) {
  const { id } = await params;
  const strategy = await prisma.strategy.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { versionNumber: "desc" } },
      runs: { orderBy: { runDate: "desc" }, take: 20, include: { strategyVersion: true } },
    },
  });

  if (!strategy) notFound();

  const currentVersion = strategy.versions[0];
  const config = currentVersion ? parseStrategyConfig(currentVersion.config) : null;

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">{strategy.name}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{strategy.description}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
            <h2 className="text-lg font-semibold">Current Rules</h2>
            <pre className="mt-4 overflow-x-auto rounded-md bg-[var(--panel-soft)] p-4 text-xs leading-6">
              {config ? JSON.stringify(config, null, 2) : "No current version."}
            </pre>
          </div>

          <div className="space-y-4">
            <form action={runStrategyAction} className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
              <input name="strategyId" type="hidden" value={strategy.id} />
              <label className="grid gap-2 text-sm font-medium">
                Historical Run Date
                <input
                  className="h-11 rounded-md border border-[var(--border)] px-3"
                  defaultValue="2025-12-31"
                  name="runDate"
                  type="date"
                />
              </label>
              <button className="mt-4 h-11 w-full rounded-md bg-[var(--accent)] text-sm font-semibold text-white" type="submit">
                Run Current Version
              </button>
            </form>
            <form action={cloneStrategyVersionAction} className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
              <input name="strategyId" type="hidden" value={strategy.id} />
              <button className="h-10 w-full rounded-md border border-[var(--border)] text-sm font-semibold" type="submit">
                Create Next Version Copy
              </button>
            </form>
          </div>
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <h2 className="text-lg font-semibold">Versions</h2>
          <div className="mt-4 grid gap-2 text-sm">
            {strategy.versions.map((version) => (
              <div className="flex justify-between rounded-md bg-[var(--panel-soft)] px-3 py-2" key={version.id}>
                <span>V{version.versionNumber} {version.label ? `- ${version.label}` : ""}</span>
                <span className="text-[var(--muted)]">Effective {formatDate(version.effectiveFrom)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <h2 className="text-lg font-semibold">Historical Runs</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="py-2">Run Date</th>
                  <th>Version</th>
                  <th>Evaluated</th>
                  <th>Eligible</th>
                  <th>Selected</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {strategy.runs.map((run) => (
                  <tr className="border-t border-[var(--border)]" key={run.id}>
                    <td className="py-3">
                      <Link className="font-medium text-[var(--accent)]" href={`/strategies/${strategy.id}/runs/${run.id}`}>
                        {formatDate(run.runDate)}
                      </Link>
                    </td>
                    <td>V{run.strategyVersion.versionNumber}</td>
                    <td>{run.evaluatedCount}</td>
                    <td>{run.eligibleCount}</td>
                    <td>{run.selectedCount}</td>
                    <td>{run.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
