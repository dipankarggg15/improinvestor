import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { getCounterfactualExperiment } from "@/lib/counterfactuals/service";
import { formatCurrency, formatDate, formatPercent } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ experimentId: string }>;
};

export default async function CounterfactualExperimentPage({ params }: PageProps) {
  const { experimentId } = await params;
  const experiment = await getCounterfactualExperiment(prisma, experimentId);
  if (!experiment) notFound();
  const control = experiment.variants.find((variant) => variant.isControl)?.runs[0];

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">COUNTERFACTUAL / SIMULATED</p>
          <h1 className="mt-2 text-3xl font-semibold">{experiment.name}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Research results are based on fictional development data. This experiment did not mutate actual trades, portfolios, strategy versions, or historical runs.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Base Strategy" value={`${experiment.baseStrategy.name} V${experiment.baseStrategyVersion.versionNumber}`} />
          <Stat label="Period" value={`${formatDate(experiment.startDate)} to ${formatDate(experiment.endDate)}`} />
          <Stat label="Initial Capital" value={formatCurrency(experiment.initialCapital.toNumber())} />
          <Stat label="Status" value={experiment.status} />
        </div>

        <Panel title="Variant Summary">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="text-xs uppercase text-[var(--muted)]">
              <tr>{["Variant", "Ending Value", "Total Return", "CAGR", "MDD", "Win Rate", "Payoff", "Profit Factor", "Avg Invested", "Turnover", "Trades", "Delta vs Control"].map((head) => <th className="py-2 pr-3" key={head}>{head}</th>)}</tr>
            </thead>
            <tbody>
              {experiment.variants.map((variant) => {
                const run = variant.runs[0];
                const metrics = metricsOf(run?.metrics);
                const controlMetrics = metricsOf(control?.metrics);
                return (
                  <tr className={`border-t border-[var(--border)] ${variant.isControl ? "bg-[var(--panel-soft)]" : ""}`} key={variant.id}>
                    <td className="py-3 pr-3">
                      <Link className="font-medium text-[var(--accent)]" href={`/research/counterfactuals/${experiment.id}/variants/${variant.id}`}>
                        {variant.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-3">{formatMaybeCurrency(numberMetric(metrics.endingValue))}</td>
                    <td className="py-3 pr-3">{formatPercent(numberMetric(metrics.totalReturnPercent))}</td>
                    <td className="py-3 pr-3">{formatPercent(numberMetric(metrics.cagrPercent))}</td>
                    <td className="py-3 pr-3">{formatPercent(numberMetric(metrics.maximumDrawdownPercent))}</td>
                    <td className="py-3 pr-3">{formatPercent(numberMetric(metrics.winRatePercent))}</td>
                    <td className="py-3 pr-3">{formatNumber(numberMetric(metrics.payoffRatio))}</td>
                    <td className="py-3 pr-3">{formatNumber(numberMetric(metrics.profitFactor))}</td>
                    <td className="py-3 pr-3">{formatPercent(numberMetric(metrics.averageInvestedPercent))}</td>
                    <td className="py-3 pr-3">{formatPercent(numberMetric(metrics.turnoverPercent))}</td>
                    <td className="py-3 pr-3">{textMetric(metrics.tradeCount)}</td>
                    <td className="py-3 pr-3">{variant.isControl ? "CONTROL" : `${formatPercent(delta(metrics.cagrPercent, controlMetrics.cagrPercent))} CAGR`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Equity Curve Comparison">
            <MultiLineChart
              series={experiment.variants.map((variant) => ({
                label: variant.name,
                values: variant.runs[0]?.dailyEquity.map((point) => point.totalEquity.toNumber()) ?? [],
              }))}
            />
          </Panel>
          <Panel title="Drawdown Comparison">
            <MultiLineChart
              series={experiment.variants.map((variant) => ({
                label: variant.name,
                values: variant.runs[0]?.dailyEquity.map((point) => point.drawdownPercent.toNumber()) ?? [],
              }))}
            />
          </Panel>
        </div>

        <Panel title="Decision Differences Vs Control">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-xs uppercase text-[var(--muted)]">
              <tr>{["Variant", "Date", "Company", "Control Decision", "Variant Decision", "Reason", "Rank", "Threshold"].map((head) => <th className="py-2 pr-3" key={head}>{head}</th>)}</tr>
            </thead>
            <tbody>
              {decisionDifferences(experiment.variants).slice(0, 80).map((row) => (
                <tr className="border-t border-[var(--border)]" key={`${row.variant}-${row.date}-${row.company}-${row.variantDecision}`}>
                  <td className="py-3 pr-3">{row.variant}</td>
                  <td className="py-3 pr-3">{row.date}</td>
                  <td className="py-3 pr-3">{row.company}</td>
                  <td className="py-3 pr-3">{row.controlDecision}</td>
                  <td className="py-3 pr-3">{row.variantDecision}</td>
                  <td className="py-3 pr-3">{row.reason}</td>
                  <td className="py-3 pr-3">{row.rank ?? "-"}</td>
                  <td className="py-3 pr-3">{row.threshold ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </section>
  );
}

function decisionDifferences(variants: NonNullable<Awaited<ReturnType<typeof getCounterfactualExperiment>>>["variants"]) {
  const control = variants.find((variant) => variant.isControl)?.runs[0];
  if (!control) return [];
  const controlByKey = new Map(control.decisions.map((decision) => [`${formatDate(decision.decisionDate)}:${decision.companyId}`, decision]));
  return variants.filter((variant) => !variant.isControl).flatMap((variant) => {
    const run = variant.runs[0];
    if (!run) return [];
    return run.decisions.flatMap((decision) => {
      const key = `${formatDate(decision.decisionDate)}:${decision.companyId}`;
      const controlDecision = controlByKey.get(key);
      if (controlDecision?.action === decision.action && controlDecision?.reason === decision.reason) return [];
      return [{
        variant: variant.name,
        date: formatDate(decision.decisionDate),
        company: decision.company.name,
        controlDecision: controlDecision ? `${controlDecision.action} ${controlDecision.reason}` : "NO CONTROL DECISION",
        variantDecision: `${decision.action} ${decision.reason}`,
        reason: decision.reason,
        rank: decision.rank,
        threshold: decision.threshold?.toString(),
      }];
    });
  });
}

function metricsOf(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function numberMetric(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return null;
}

function delta(value: unknown, control: unknown) {
  const left = numberMetric(value);
  const right = numberMetric(control);
  return left === null || right === null ? null : left - right;
}

function Panel({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5"><h2 className="text-lg font-semibold">{title}</h2><div className="mt-4 overflow-x-auto">{children}</div></div>;
}

function MultiLineChart({ series }: { readonly series: readonly { readonly label: string; readonly values: readonly number[] }[] }) {
  const allValues = series.flatMap((item) => item.values);
  const min = Math.min(...allValues, 0);
  const max = Math.max(...allValues, 1);
  const spread = max - min || 1;
  const colors = ["#2563eb", "#059669", "#dc2626", "#7c3aed", "#ca8a04", "#0891b2"];
  return (
    <div>
      <svg aria-label="Comparison chart" className="h-60 w-full" preserveAspectRatio="none" viewBox="0 0 100 44">
        {series.map((item, seriesIndex) => (
          <path
            d={pathFor(item.values, min, spread)}
            fill="none"
            key={item.label}
            stroke={colors[seriesIndex % colors.length]}
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
        {series.map((item, index) => <span key={item.label}><span style={{ color: colors[index % colors.length] }}>■</span> {item.label}</span>)}
      </div>
    </div>
  );
}

function pathFor(values: readonly number[], min: number, spread: number) {
  if (values.length === 0) return "";
  return values.map((value, index) => {
    const x = values.length <= 1 ? 0 : index / (values.length - 1) * 100;
    const y = 40 - ((value - min) / spread * 36);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4"><p className="text-xs uppercase text-[var(--muted)]">{label}</p><p className="mt-2 text-sm font-semibold">{value}</p></div>;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatMaybeCurrency(value: number | null) {
  return value === null ? "-" : formatCurrency(value);
}

function textMetric(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "-";
}
