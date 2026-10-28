import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { StockChartLink } from "@/components/stocks/stock-chart-link";
import { SectorStatus } from "@/components/sectors/sector-status";
import { prisma } from "@/lib/db/prisma";
import {
  completeEarlySuperstarsHistoricalRun,
  entryMomentumLabelForEarlySuperstarsVariant,
  getHistoricalStrategyRun,
  isEarlySuperstarsHistoricalStrategy,
  isMomentum10HistoricalStrategy,
  isNseMomentumHistoricalStrategy,
  isParentNseMomentumHistoricalStrategy,
} from "@/lib/strategies/historical-run-service";
import { formatCurrency, formatDate, formatPercent, formatQuantity } from "@/lib/ui/format";
import { strategyVersionDisplayName } from "@/lib/strategies/version-presentation";

export const dynamic = "force-dynamic";

export default async function HistoricalStrategyRunPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string; readonly runId: string }>;
}) {
  const { id, runId } = await params;
  await completeRunningMomentum10Run({ strategyId: id, runId });
  const run = await getHistoricalStrategyRun({ client: prisma, strategyId: id, runId });

  if (!run) notFound();

  const isParentNseMomentumRun = isParentNseMomentumHistoricalStrategy(run.strategy.name, run.strategyVersion.config);
  const events = run.events;
  const entryMomentumLabel = isEarlySuperstarsHistoricalStrategy(run.strategy.name)
    ? entryMomentumLabelForEarlySuperstarsVariant(run.strategy.name, run.strategyVersion.config)
    : isMomentum10HistoricalStrategy(run.strategy.name)
      ? "1M"
      : isParentNseMomentumRun
        ? "Score"
      : isNseMomentumHistoricalStrategy(run.strategy.name)
        ? "Score"
      : "Entry";
  const strategyDisplayName = isEarlySuperstarsHistoricalStrategy(run.strategy.name)
    ? `Early Superstars - ${entryMomentumLabel} Entry`
    : run.strategy.name;
  const report = run.report;
  const cumulativeReturnByYear = yearEndCumulativeReturns(run.dailyEquity);

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      {run.status === "RUNNING" ? <meta content="10" httpEquiv="refresh" /> : null}
      <div className="max-w-full min-w-0 max-w-7xl space-y-6">
        <div>
          <Link className="text-sm font-medium text-[var(--accent)] hover:underline" href={`/strategies/${run.strategyId}`}>
            {strategyDisplayName}
          </Link>
          <p className="mt-3 text-sm font-medium text-[var(--accent)]">REAL MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">Automated Historical Run</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            {strategyVersionDisplayName({
              strategyName: run.strategy.name,
              versionNumber: run.strategyVersion.versionNumber,
              storedLabel: run.strategyVersion.label,
            })}, requested {formatDate(run.requestedStartDate)} to {formatDate(run.requestedEndDate)}.
            Effective simulation window {run.effectiveStartDate ? formatDate(run.effectiveStartDate) : "-"} to {run.effectiveEndDate ? formatDate(run.effectiveEndDate) : "-"}.
          </p>
        </div>

        {report ? (
          <>
            <MetricSection title="Performance" columns="lg:grid-cols-4">
              <Stat label="Starting Capital" value={formatCurrency(report.performance.startingCapital)} />
              <Stat label="Ending Value" value={formatCurrency(report.performance.endingValue)} />
              <Stat label="Total Return" value={formatPercent(report.performance.totalReturnPercent)} />
              <Stat label="CAGR" value={formatOptionalPercent(report.performance.cagrPercent)} />
            </MetricSection>

            <MetricSection title="Risk" columns="lg:grid-cols-5">
              <Stat label="Maximum Drawdown" value={formatPercent(report.risk.maxDrawdownPercent)} />
              <Stat label="MDD Peak" value={formatReportDate(report.risk.maxDrawdownPeakDate)} />
              <Stat label="MDD Bottom" value={formatReportDate(report.risk.maxDrawdownBottomDate)} />
              <Stat label="MDD Recovery" value={report.risk.maxDrawdownRecoveryDate ? formatReportDate(report.risk.maxDrawdownRecoveryDate) : "Not Recovered"} />
              <Stat label="Days Underwater" value={`${report.risk.maxDrawdownDaysUnderwater} days`} />
            </MetricSection>

            <MetricSection title="Calendar Return Summary" columns="lg:grid-cols-3">
              <Stat label="Worst Calendar Year" value={yearSummary(report.calendarSummary.worstYear, report.calendarSummary.worstYearReturnPercent)} />
              <Stat label="Best Calendar Year" value={yearSummary(report.calendarSummary.bestYear, report.calendarSummary.bestYearReturnPercent)} />
              <Stat label="Median Calendar-Year Return" value={formatOptionalPercent(report.calendarSummary.medianYearReturnPercent)} />
            </MetricSection>

            <MetricSection title="Trading" columns="lg:grid-cols-5">
              <Stat label="Total Buys" value={String(report.tradingStats.buys)} />
              <Stat label="Total Sells" value={String(report.tradingStats.sells)} />
              <Stat label="Total Transactions" value={String(report.tradingStats.totalTransactions)} />
              <Stat label="Annual Turnover (Two-Sided)" value={formatOptionalPercent(report.tradingStats.annualTurnoverPercent)} />
              <Stat label="Average Holding Period" value={report.tradingStats.averageHoldingDays === null ? "N/A" : `${report.tradingStats.averageHoldingDays.toFixed(1)} days`} />
            </MetricSection>

            <MetricSection title="Portfolio" columns="lg:grid-cols-4">
              <Stat label="Average Number of Holdings" value={report.portfolioStats.averageHoldings?.toFixed(2) ?? "N/A"} />
              <Stat
                detail={report.portfolioStats.maxPositionWeightSymbol && report.portfolioStats.maxPositionWeightDate
                  ? `${report.portfolioStats.maxPositionWeightSymbol} on ${formatReportDate(report.portfolioStats.maxPositionWeightDate)}`
                  : "Unavailable for runs completed before concentration tracking was added."}
                label="Maximum Single-Position Weight"
                value={formatOptionalPercent(report.portfolioStats.maxPositionWeightPercent)}
              />
              <Stat label="Cash at End" value={formatCurrency(report.portfolioStats.endingCash)} />
              <Stat label="Open Positions at End" value={String(report.portfolioStats.openPositionsAtEnd)} />
            </MetricSection>
          </>
        ) : null}

        {run.status === "RUNNING" ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)] sm:p-5">
            This historical run is still processing. The page will refresh automatically.
          </div>
        ) : null}

        {run.status === "FAILED" ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:p-5">
            {run.errorMessage ?? "This historical run failed."}
          </div>
        ) : null}

        {report ? (
          <details className="rounded-md border border-[var(--border)] bg-[var(--panel)]" open>
            <summary className="cursor-pointer px-4 py-4 text-lg font-semibold sm:px-5">Calendar Year Returns</summary>
            <div className="border-t border-[var(--border)] px-4 pb-5 sm:px-5">
              <table className="w-full max-w-3xl text-left text-sm">
                <thead className="text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="py-3 pr-3">Year</th>
                    <th className="py-3 pr-3">Calendar-Year Return</th>
                    <th className="py-3">Cumulative Portfolio Return</th>
                  </tr>
                </thead>
                <tbody>{report.calendarReturns.map((item, index) => (
                  <tr className="border-t border-[var(--border)]" key={item.year}>
                    <td className="py-3 pr-3 font-medium">{item.year}{item.isPartial && index === report.calendarReturns.length - 1 ? " YTD" : ""}</td>
                    <td className="py-3 pr-3">{formatPercent(item.returnPercent)}</td>
                    <td className="py-3 font-medium">{formatPercent(cumulativeReturnByYear.get(item.year))}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </details>
        ) : null}

        <details className="rounded-md border border-[var(--border)] bg-[var(--panel)]" open>
          <summary className="cursor-pointer px-4 py-4 text-lg font-semibold sm:px-5">Simulation Assumptions / Limitations</summary>
          <div className="space-y-5 border-t border-[var(--border)] p-4 sm:p-5">
            <AssumptionStatusGrid assumptions={jsonArray(run.assumptions)} />
            <InfoList title="Limitations" values={jsonArray(run.limitations)} />
            <InfoList title="Unavailable Historical Filters" values={jsonArray(run.unavailableFilters)} />
          </div>
        </details>

        <details className="rounded-md border border-[var(--border)] bg-[var(--panel)]">
          <summary className="cursor-pointer px-4 py-4 text-lg font-semibold sm:px-5">Position History</summary>
          <div className="max-w-full overflow-x-auto border-t border-[var(--border)] p-4 sm:p-5">
            <table className="w-full min-w-[1380px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {["Stock", "Entry", "Qty", "Entry Rank", "Stop Trigger", "Reviews", "Exit", "Realized", "If Held To End", "Status"].map((head) => (
                    <th className="py-2 pr-3" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {run.positions.map((position) => (
                  <tr className="border-t border-[var(--border)] align-top" key={position.id}>
                    <td className="py-3 pr-3">
                      <StockChartLink className="block font-medium text-[var(--accent)] hover:underline" date={formatDate(position.entryDate)} exchange={position.instrument.exchange} symbol={position.instrument.symbol}>{position.company.name}</StockChartLink>
                      <span className="text-xs text-[var(--muted)]">{position.instrument.exchange}:{position.instrument.symbol} · </span><SectorStatus className="text-xs text-[var(--muted)]" date={formatDate(position.entryDate)} sector={position.company.sector} />
                    </td>
                    <td className="py-3 pr-3">
                      <span className="block">{formatDate(position.entryDate)}</span>
                      <span className="text-xs text-[var(--muted)]">{formatCurrency(position.entryPrice.toNumber())}</span>
                    </td>
                    <td className="py-3 pr-3">{formatQuantity(position.quantity.toNumber())}</td>
                    <td className="py-3 pr-3">
                      <span className="block">{position.entryRank ?? "-"}</span>
                      <span className="text-xs text-[var(--muted)]">{entryMomentumLabel} {formatPercent(position.entryReturn1W?.toNumber())}</span>
                    </td>
                    <td className="py-3 pr-3">
                      {position.stopTriggerDate ? (
                        <>
                          <span className="block">{formatDate(position.stopTriggerDate)}</span>
                          <span className="text-xs text-[var(--muted)]">{formatCurrency(position.stopTriggerPrice?.toNumber() ?? 0)}</span>
                        </>
                      ) : "-"}
                    </td>
                    <td className="py-3 pr-3">
                      <ReviewList value={position.reviewHistory} />
                    </td>
                    <td className="py-3 pr-3">
                      {position.exitDate ? (
                        <>
                          <span className="block">{formatDate(position.exitDate)}</span>
                          <span className="text-xs text-[var(--muted)]">{position.exitReason} at {formatCurrency(position.exitPrice?.toNumber() ?? 0)}</span>
                        </>
                      ) : "-"}
                    </td>
                    <td className="py-3 pr-3">{formatPercent(position.realizedReturnPercent?.toNumber())}</td>
                    <td className="py-3 pr-3">{formatOptionalPercent(position.returnIfHeldToEndPercent)}</td>
                    <td className="py-3 pr-3">{position.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="rounded-md border border-[var(--border)] bg-[var(--panel)]">
          <summary className="cursor-pointer px-4 py-4 text-lg font-semibold sm:px-5">Decision / Event Log</summary>
          <div className="max-h-[520px] max-w-full overflow-auto border-t border-[var(--border)] p-4 sm:p-5">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="sticky top-0 bg-[var(--panel)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  {["Date", "Event", "Company", "Details"].map((head) => (
                    <th className="py-2 pr-3" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((item) => (
                  <tr className="border-t border-[var(--border)] align-top" key={item.id}>
                    <td className="py-3 pr-3">{formatDate(item.eventDate)}</td>
                    <td className="py-3 pr-3 font-medium">{item.eventType}</td>
                    <td className="py-3 pr-3">{companyLabel(item.companyId, run.positions)}</td>
                    <td className="py-3 pr-3 text-xs text-[var(--muted)]">
                      <pre className="max-w-[540px] whitespace-pre-wrap">{JSON.stringify(item.details, null, 2)}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {run._count.events > events.length ? <p className="mt-3 text-sm text-[var(--muted)]">Showing first {events.length} of {run._count.events.toLocaleString("en-IN")} events.</p> : null}
          </div>
        </details>

        <details className="rounded-md border border-[var(--border)] bg-[var(--panel)]">
          <summary className="cursor-pointer px-4 py-4 text-lg font-semibold sm:px-5">Daily Equity</summary>
          <div className="max-w-full overflow-x-auto border-t border-[var(--border)] p-4 sm:p-5">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {["Date", "Cash", "Invested", "Total Equity", "Return", "Drawdown", "Open Positions"].map((head) => (
                    <th className="py-2 pr-3" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {run.dailyEquity.map((point) => (
                  <tr className="border-t border-[var(--border)]" key={point.id}>
                    <td className="py-3 pr-3">{formatDate(point.date)}</td>
                    <td className="py-3 pr-3">{formatCurrency(point.cash.toNumber())}</td>
                    <td className="py-3 pr-3">{formatCurrency(point.investedValue.toNumber())}</td>
                    <td className="py-3 pr-3 font-medium">{formatCurrency(point.totalEquity.toNumber())}</td>
                    <td className="py-3 pr-3">{formatPercent(point.cumulativeReturnPercent.toNumber())}</td>
                    <td className="py-3 pr-3">{formatPercent(point.drawdownPercent.toNumber())}</td>
                    <td className="py-3 pr-3">{point.openPositionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

async function completeRunningMomentum10Run(input: { readonly strategyId: string; readonly runId: string }) {
  const run = await prisma.historicalStrategyRun.findFirst({
    where: { id: input.runId, strategyId: input.strategyId, status: "RUNNING" },
    select: {
      id: true,
      strategy: { select: { name: true } },
      strategyVersion: { select: { config: true } },
    },
  });

  if (
    !run ||
    (
      !isMomentum10HistoricalStrategy(run.strategy.name) &&
      !isNseMomentumHistoricalStrategy(run.strategy.name) &&
      !isParentNseMomentumHistoricalStrategy(run.strategy.name, run.strategyVersion.config)
    )
  ) return;

  await completeEarlySuperstarsHistoricalRun({ client: prisma, runId: run.id });
}

function MetricSection({ title, columns, children }: { readonly title: string; readonly columns: string; readonly children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase text-[var(--muted)]">{title}</h2>
      <div className={`grid gap-3 sm:grid-cols-2 ${columns}`}>{children}</div>
    </section>
  );
}

function Stat({ label, value, detail }: { readonly label: string; readonly value: string; readonly detail?: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p> : null}
    </div>
  );
}

function InfoList({ title, values }: { readonly title: string; readonly values: string[] }) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      {values.length > 0
        ? <ul className="mt-2 grid gap-2 text-sm text-[var(--muted)]">{values.map((value) => <li key={value}>{value}</li>)}</ul>
        : <p className="mt-2 text-sm text-[var(--muted)]">None recorded.</p>}
    </section>
  );
}

function AssumptionStatusGrid({ assumptions }: { readonly assumptions: string[] }) {
  const circuitDisabled = assumptions.some((value) => value.includes("No upper-circuit buy filter"));
  const circuitEnabled = !circuitDisabled && assumptions.some((value) => value.toLowerCase().includes("upper-circuit"));
  const statuses = [
    ["Price Data", "UPSTOX_REAL Daily Close"],
    ["Price Adjustment", "Unadjusted"],
    ["Corporate Actions", "Not Included"],
    ["Survivorship Bias", "Possible"],
    ["Trading Costs", "Not Included"],
    ["Taxes", "Not Included"],
    ["Circuit Handling", circuitEnabled ? "Enabled" : "Disabled"],
    ["Execution Price", assumptions.some((value) => value.includes("next available session open")) ? "Next Session Open" : "Close"],
  ];
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
      {statuses.map(([label, value]) => (
        <div key={label}>
          <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
          <p className="mt-1 text-sm font-medium">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ReviewList({ value }: { readonly value: unknown }) {
  const reviews = Array.isArray(value) ? value : [];
  if (reviews.length === 0) return "-";
  return (
    <div className="grid gap-1 text-xs">
      {reviews.map((review, index) => {
        const item = review && typeof review === "object" ? review as Record<string, unknown> : {};
        const metricLabel = typeof item.reviewMetricLabel === "string" ? item.reviewMetricLabel : "return";
        const isThreeMonthReview = metricLabel === "3M return";
        return (
          <span key={`${String(item.reviewDate)}-${index}`}>
            {String(item.reviewDate ?? "-")}: {String(item.decision ?? "-")} rank {String(item.rank ?? "-")}
            {!isThreeMonthReview && item.threshold ? `/${String(item.threshold)}` : ""}
            , {metricLabel} {formatPercent(numberOrNull(item.sinceEntryReturn))}
            {isThreeMonthReview && item.threshold ? ` / ${String(item.threshold)}%` : ""}
            {item.windowCalendarDays ? `, age ${String(item.windowCalendarDays)}d` : ""}
          </span>
        );
      })}
    </div>
  );
}

function companyLabel(companyId: string | null, positions: readonly { readonly companyId: string; readonly company: { readonly name: string }; readonly instrument: { readonly symbol: string } }[]) {
  if (!companyId) return "-";
  const position = positions.find((item) => item.companyId === companyId);
  return position ? `${position.company.name} (${position.instrument.symbol})` : companyId;
}

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function formatOptionalPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "N/A" : formatPercent(value);
}

function formatReportDate(value: string | null) {
  return value ? formatDate(new Date(`${value}T00:00:00.000Z`)) : "-";
}

function yearSummary(year: number | null, returnPercent: number | null) {
  return year === null || returnPercent === null ? "N/A" : `${year}, ${formatPercent(returnPercent)}`;
}

function yearEndCumulativeReturns(points: readonly {
  readonly date: Date;
  readonly cumulativeReturnPercent: { toNumber(): number };
}[]) {
  const byYear = new Map<number, number>();
  for (const point of points) {
    byYear.set(point.date.getUTCFullYear(), point.cumulativeReturnPercent.toNumber());
  }
  return byYear;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}
