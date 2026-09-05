import Link from "next/link";

import { runCounterfactualExperimentAction } from "@/app/research/counterfactuals/actions";
import { CounterfactualExperimentForm } from "@/components/counterfactuals/experiment-form";
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

        <CounterfactualExperimentForm action={runCounterfactualExperimentAction} strategies={strategies} />

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
