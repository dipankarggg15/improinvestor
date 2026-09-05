import Link from "next/link";
import type { ReactNode } from "react";

import { prisma } from "@/lib/db/prisma";
import { getStrategyEvidence } from "@/lib/analytics/evidence";
import type { EquityCurvePoint } from "@/lib/analytics/equity";
import { formatPercent } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type AnalyticsPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const query = await searchParams;
  const portfolios = await prisma.portfolio.findMany({
    orderBy: { name: "asc" },
    include: { strategy: { include: { versions: { orderBy: { versionNumber: "asc" } } } } },
  });
  const selectedPortfolioId = query.portfolioId || portfolios[0]?.id;
  const selectedPortfolio = portfolios.find((portfolio) => portfolio.id === selectedPortfolioId);
  const selectedVersionId = query.strategyVersionId || undefined;
  const evidence = await getStrategyEvidence(prisma, {
    portfolioId: selectedPortfolioId,
    strategyVersionId: selectedVersionId,
    startDate: parseDate(query.startDate),
    endDate: parseDate(query.endDate),
  });
  const summary = evidence.summaries[0];

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">Strategy Analytics</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Development analytics based on fictional market data. These describe what happened; they do not change strategy rules.</p>
        </div>

        <form className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="grid gap-2 text-sm font-medium">
            Portfolio
            <select className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={selectedPortfolioId} name="portfolioId">
              {portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Version
            <select className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={selectedVersionId ?? ""} name="strategyVersionId">
              <option value="">All Versions</option>
              {selectedPortfolio?.strategy.versions.map((version) => (
                <option key={version.id} value={version.id}>V{version.versionNumber}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Start Date
            <input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={query.startDate ?? ""} name="startDate" type="date" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            End Date
            <input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={query.endDate ?? ""} name="endDate" type="date" />
          </label>
          <button className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white lg:self-end" type="submit">
            Run Analytics
          </button>
        </form>

        {summary ? (
          <>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Metric label="Total Return" value={formatPercent(summary.performance.totalReturnPercent?.toNumber())} />
              <Metric label="CAGR" value={formatPercent(summary.performance.cagrPercent?.toNumber())} />
              <Metric label="Max Drawdown" value={formatPercent(summary.drawdown.maximumDrawdownPercent.toNumber())} />
              <Metric label="Win Rate" value={`${formatPercent(summary.episodes.winRatePercent?.toNumber())} (N=${summary.episodes.totalClosedEpisodes})`} />
              <Metric label="Payoff Ratio" value={formatNumber(summary.episodes.payoffRatio?.toNumber())} />
              <Metric label="Avg Invested" value={formatPercent(summary.capital.averageInvestedPercent?.toNumber())} />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <ChartPanel title="Equity Curve">
                <LineChart points={summary.equityCurve} value={(point) => point.totalEquity.toNumber()} />
              </ChartPanel>
              <ChartPanel title="Drawdown Over Time">
                <LineChart points={summary.equityCurve} value={(point, index, points) => drawdownAt(points, index)} />
              </ChartPanel>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <EvidenceTable
                title="Winner / Loser Statistics"
                rows={[
                  ["Closed Episodes", String(summary.episodes.totalClosedEpisodes)],
                  ["Profitable / Losing / Breakeven", `${summary.episodes.profitableEpisodes} / ${summary.episodes.losingEpisodes} / ${summary.episodes.breakevenEpisodes}`],
                  ["Average Winner", formatPercent(summary.episodes.averageWinnerPercent?.toNumber())],
                  ["Average Loser", formatPercent(summary.episodes.averageLoserPercent?.toNumber())],
                  ["Profit Factor", formatNumber(summary.episodes.profitFactor?.toNumber())],
                  ["Best Episode", summary.episodes.bestEpisode ? `${summary.episodes.bestEpisode.companyName} ${formatPercent(toNumber(summary.episodes.bestEpisode.exitSnapshot?.totalRealizedReturnPercent))}` : "-"],
                  ["Worst Episode", summary.episodes.worstEpisode ? `${summary.episodes.worstEpisode.companyName} ${formatPercent(toNumber(summary.episodes.worstEpisode.exitSnapshot?.totalRealizedReturnPercent))}` : "-"],
                ]}
              />
              <EvidenceTable
                title="Winner Contribution"
                rows={[
                  ["Top 1 Winner Contribution", formatPercent(summary.episodes.topWinnerContributions.top1WinnerContributionPercent?.toNumber())],
                  ["Top 3 Winner Contribution", formatPercent(summary.episodes.topWinnerContributions.top3WinnerContributionPercent?.toNumber())],
                  ["Top 5 Winner Contribution", formatPercent(summary.episodes.topWinnerContributions.top5WinnerContributionPercent?.toNumber())],
                  ["Denominator", "Total positive realized P&L"],
                ]}
              />
              <EvidenceTable
                title="Holding Duration"
                rows={[
                  ["Average Holding", formatDays(summary.holding.averageHoldingDays?.toNumber())],
                  ["Median Holding", formatDays(summary.holding.medianHoldingDays?.toNumber())],
                  ["Winner Average", formatDays(summary.holding.averageWinnerHoldingDays?.toNumber())],
                  ["Loser Average", formatDays(summary.holding.averageLoserHoldingDays?.toNumber())],
                  ["Open Episodes", String(summary.holding.openEpisodeCount)],
                  ["Average Open Age", formatDays(summary.holding.averageOpenAgeDays?.toNumber())],
                ]}
              />
              <EvidenceTable
                title="Capital Utilization"
                rows={[
                  ["Average Cash", formatPercent(summary.capital.averageCashPercent?.toNumber())],
                  ["Days >50% Cash", `${summary.capital.daysAbove50PercentCash} (${formatPercent(summary.capital.percentDaysAbove50PercentCash.toNumber())})`],
                  ["Days >80% Cash", `${summary.capital.daysAbove80PercentCash} (${formatPercent(summary.capital.percentDaysAbove80PercentCash.toNumber())})`],
                  ["Average Positions", formatNumber(summary.capital.averageOpenPositions?.toNumber())],
                  ["Days At Max Capacity", formatPercent(summary.capital.percentDaysAtMaxCapacity)],
                  ["Days Below Max Capacity", formatPercent(summary.capital.percentDaysBelowMaxCapacity)],
                ]}
              />
            </div>

            <Section title="Entry Rank Outcomes">
              <SimpleTable heads={["Entry Rank", "Episodes", "Avg Return", "Median Return", "Win Rate"]}>
                {summary.entryRanks.map((row) => (
                  <tr className="border-t border-[var(--border)]" key={row.entryRank}>
                    <td className="py-3 pr-3">{row.entryRank}</td>
                    <td className="py-3 pr-3">{row.episodeCount}</td>
                    <td className="py-3 pr-3">{formatPercent(row.averageRealizedReturnPercent?.toNumber())}</td>
                    <td className="py-3 pr-3">{formatPercent(row.medianRealizedReturnPercent?.toNumber())}</td>
                    <td className="py-3 pr-3">{formatPercent(row.winRatePercent.toNumber())}</td>
                  </tr>
                ))}
              </SimpleTable>
            </Section>

            <Section title="Exit Reasons">
              <SimpleTable heads={["Reason", "N", "Avg Return", "Median Return", "Win Rate", "1W", "1M", "3M", "6M"]}>
                {summary.exitReasons.map((row) => (
                  <tr className="border-t border-[var(--border)]" key={row.reason}>
                    <td className="py-3 pr-3">{row.reason}</td>
                    <td className="py-3 pr-3">{row.count}</td>
                    <td className="py-3 pr-3">{formatPercent(row.averageRealizedReturnPercent?.toNumber())}</td>
                    <td className="py-3 pr-3">{formatPercent(row.medianRealizedReturnPercent?.toNumber())}</td>
                    <td className="py-3 pr-3">{formatPercent(row.winRatePercent.toNumber())}</td>
                    {row.postExit.map((horizon) => (
                      <td className="py-3 pr-3" key={horizon.horizon}>{formatPercent(horizon.averageReturnPercent?.toNumber())} (N={horizon.sampleSize})</td>
                    ))}
                  </tr>
                ))}
              </SimpleTable>
            </Section>

            <div className="grid gap-5 xl:grid-cols-2">
              <EvidenceTable
                title="Recommendation vs Execution"
                rows={[
                  ["SELL Recommendations", String(summary.execution.sellRecommendationCount)],
                  ["Executed", String(summary.execution.recommendationsExecuted)],
                  ["Not Executed", String(summary.execution.recommendationsNotExecuted)],
                  ["Avg Delay", formatDays(summary.execution.averageExecutionDelayDays?.toNumber())],
                  ["Median Delay", formatDays(summary.execution.medianExecutionDelayDays?.toNumber())],
                  ["Avg Price Move", `${formatPercent(summary.execution.averageExecutionPriceMovePercent?.toNumber())} execution vs recommendation`],
                ]}
              />
              <EvidenceTable
                title="Post-Exit Evidence"
                rows={summary.postExit.map((row) => [
                  row.horizon.replace("_", " "),
                  `${formatPercent(row.averageReturnPercent?.toNumber())} avg, ${formatPercent(row.medianReturnPercent?.toNumber())} median, N=${row.sampleSize}`,
                ])}
              />
            </div>

            <StrategyComparison currentPortfolioId={summary.portfolio.id} />

            <Link className="inline-flex rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--accent)]" href="/analytics/exits">
              Open Exit Analytics
            </Link>
          </>
        ) : (
          <p className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5 text-sm text-[var(--muted)]">No portfolio analytics are available yet.</p>
        )}
      </div>
    </section>
  );
}

async function StrategyComparison({ currentPortfolioId }: { readonly currentPortfolioId: string }) {
  const evidence = await getStrategyEvidence(prisma);
  return (
    <Section title="Strategy Comparison">
      <SimpleTable heads={["Portfolio", "Total Return", "CAGR", "MDD", "Win Rate", "Avg Winner", "Avg Loser", "Profit Factor", "Avg Invested", "Top 1 Contribution"]}>
        {evidence.summaries.map((summary) => (
          <tr className={`border-t border-[var(--border)] ${summary.portfolio.id === currentPortfolioId ? "bg-[var(--panel-soft)]" : ""}`} key={summary.portfolio.id}>
            <td className="py-3 pr-3">{summary.strategy.name}</td>
            <td className="py-3 pr-3">{formatPercent(summary.performance.totalReturnPercent?.toNumber())}</td>
            <td className="py-3 pr-3">{formatPercent(summary.performance.cagrPercent?.toNumber())}</td>
            <td className="py-3 pr-3">{formatPercent(summary.drawdown.maximumDrawdownPercent.toNumber())}</td>
            <td className="py-3 pr-3">{formatPercent(summary.episodes.winRatePercent?.toNumber())}</td>
            <td className="py-3 pr-3">{formatPercent(summary.episodes.averageWinnerPercent?.toNumber())}</td>
            <td className="py-3 pr-3">{formatPercent(summary.episodes.averageLoserPercent?.toNumber())}</td>
            <td className="py-3 pr-3">{formatNumber(summary.episodes.profitFactor?.toNumber())}</td>
            <td className="py-3 pr-3">{formatPercent(summary.capital.averageInvestedPercent?.toNumber())}</td>
            <td className="py-3 pr-3">{formatPercent(summary.episodes.topWinnerContributions.top1WinnerContributionPercent?.toNumber())}</td>
          </tr>
        ))}
      </SimpleTable>
    </Section>
  );
}

function LineChart({ points, value }: { readonly points: readonly EquityCurvePoint[]; readonly value: (point: EquityCurvePoint, index: number, points: readonly EquityCurvePoint[]) => number }) {
  const values = points.map(value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const spread = max - min || 1;
  const path = values.map((item, index) => {
    const x = points.length <= 1 ? 0 : index / (points.length - 1) * 100;
    const y = 40 - ((item - min) / spread * 36);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  return (
    <svg aria-label="Chart" className="h-56 w-full" preserveAspectRatio="none" viewBox="0 0 100 44">
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function drawdownAt(points: readonly EquityCurvePoint[], index: number) {
  const peak = points.slice(0, index + 1).reduce((max, point) => Math.max(max, point.totalEquity.toNumber()), 0);
  return peak === 0 ? 0 : (points[index]!.totalEquity.toNumber() / peak - 1) * 100;
}

function ChartPanel({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 overflow-x-auto">{children}</div>
    </div>
  );
}

function EvidenceTable({ title, rows }: { readonly title: string; readonly rows: readonly (readonly [string, string])[] }) {
  return (
    <Section title={title}>
      <table className="w-full text-left text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr className="border-t border-[var(--border)] first:border-t-0" key={label}>
              <td className="py-2 pr-3 text-[var(--muted)]">{label}</td>
              <td className="py-2 text-right font-medium">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function SimpleTable({ heads, children }: { readonly heads: readonly string[]; readonly children: ReactNode }) {
  return (
    <table className="w-full min-w-[860px] text-left text-sm">
      <thead className="text-xs uppercase text-[var(--muted)]">
        <tr>{heads.map((head) => <th className="py-2 pr-3" key={head}>{head}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatDays(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })} days`;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") return value.toNumber();
  return null;
}

function parseDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T00:00:00.000Z`);
}
