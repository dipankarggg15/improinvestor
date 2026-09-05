import Link from "next/link";

import { runCounterfactualExperimentAction } from "@/app/research/counterfactuals/actions";
import { prisma } from "@/lib/db/prisma";
import { listCounterfactualExperiments } from "@/lib/counterfactuals/service";
import { formatCurrency, formatDate } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function CounterfactualLabPage() {
  const [strategies, experiments] = await Promise.all([
    prisma.strategy.findMany({ orderBy: { name: "asc" }, include: { versions: { orderBy: { versionNumber: "desc" } } } }),
    listCounterfactualExperiments(prisma),
  ]);

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">COUNTERFACTUAL / SIMULATED</p>
          <h1 className="mt-2 text-3xl font-semibold">Counterfactual Lab</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Research results are based on fictional development data. Historical counterfactual performance does not establish that a parameter will perform better in future data.</p>
        </div>

        <form action={runCounterfactualExperimentAction} className="grid gap-4 rounded-md border border-[var(--border)] bg-[var(--panel)] p-5 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-2 text-sm font-medium">
            Strategy
            <select className="h-10 rounded-md border border-[var(--border)] px-3" name="strategyId">
              {strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Strategy Version
            <select className="h-10 rounded-md border border-[var(--border)] px-3" name="strategyVersionId">
              {strategies.flatMap((strategy) => strategy.versions.map((version) => (
                <option key={version.id} value={version.id}>{strategy.name} V{version.versionNumber}</option>
              )))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Start Date
            <input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue="2025-03-31" name="startDate" type="date" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            End Date
            <input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue="2025-12-31" name="endDate" type="date" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Parameter
            <select className="h-10 rounded-md border border-[var(--border)] px-3" name="parameter">
              <option value="momentum.holdingRankThreshold">Momentum Holding Rank Threshold</option>
              <option value="momentum.minReturn3M">Momentum Entry 3M Return</option>
              <option value="early.phase2RankThreshold">Early Phase 2 Rank Threshold</option>
              <option value="early.phase1RankThreshold">Early Phase 1 Rank Threshold</option>
              <option value="early.emergencyStopPercent">Early Emergency Stop %</option>
              <option value="early.phase1DurationDays">Early Phase 1 Duration Days</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Variant Values
            <input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue="20,40,50" name="values" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Initial Capital
            <input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue="1000000" min="1" name="initialCapital" step="0.01" type="number" />
          </label>
          <button className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white xl:self-end" type="submit">
            Run Experiment
          </button>
        </form>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <h2 className="text-lg font-semibold">Research History</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>{["Experiment", "Base", "Period", "Capital", "Variants", "Status"].map((head) => <th className="py-2 pr-3" key={head}>{head}</th>)}</tr>
              </thead>
              <tbody>
                {experiments.map((experiment) => (
                  <tr className="border-t border-[var(--border)]" key={experiment.id}>
                    <td className="py-3 pr-3">
                      <Link className="font-medium text-[var(--accent)]" href={`/research/counterfactuals/${experiment.id}`}>{experiment.name}</Link>
                    </td>
                    <td className="py-3 pr-3">{experiment.baseStrategy.name} V{experiment.baseStrategyVersion.versionNumber}</td>
                    <td className="py-3 pr-3">{formatDate(experiment.startDate)} to {formatDate(experiment.endDate)}</td>
                    <td className="py-3 pr-3">{formatCurrency(experiment.initialCapital.toNumber())}</td>
                    <td className="py-3 pr-3">{experiment.variants.length}</td>
                    <td className="py-3 pr-3">{experiment.status}</td>
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
