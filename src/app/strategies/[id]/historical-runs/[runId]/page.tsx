import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import {
  completeEarlySuperstarsHistoricalRun,
  entryMomentumLabelForEarlySuperstarsVariant,
  getHistoricalStrategyRun,
  isEarlySuperstarsHistoricalStrategy,
  isMomentum10HistoricalStrategy,
} from "@/lib/strategies/historical-run-service";
import { formatCurrency, formatDate, formatPercent, formatQuantity } from "@/lib/ui/format";

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

  const events = run.events.slice(0, 500);
  const entryMomentumLabel = isEarlySuperstarsHistoricalStrategy(run.strategy.name)
    ? entryMomentumLabelForEarlySuperstarsVariant(run.strategy.name, run.strategyVersion.config)
    : isMomentum10HistoricalStrategy(run.strategy.name)
      ? "1M"
      : "Entry";
  const strategyDisplayName = isEarlySuperstarsHistoricalStrategy(run.strategy.name)
    ? `Early Superstars - ${entryMomentumLabel} Entry`
    : run.strategy.name;

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
            V{run.strategyVersion.versionNumber} {run.strategyVersion.label ? `(${run.strategyVersion.label})` : ""}, requested {formatDate(run.requestedStartDate)} to {formatDate(run.requestedEndDate)}.
            Effective simulation window {run.effectiveStartDate ? formatDate(run.effectiveStartDate) : "-"} to {run.effectiveEndDate ? formatDate(run.effectiveEndDate) : "-"}.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Starting Capital" value={formatCurrency(run.initialCapital.toNumber())} />
          <Stat label="Ending Value" value={formatCurrency(run.endingValue?.toNumber() ?? 0)} />
          <Stat label="Total Return" value={formatPercent(run.totalReturnPercent?.toNumber())} />
          <Stat label="CAGR" value={formatPercent(run.cagrPercent?.toNumber())} />
          <Stat label="Max Drawdown" value={formatPercent(run.maxDrawdownPercent?.toNumber())} />
          <Stat label="Initial Positions" value={String(run.initialPositionCount)} />
          <Stat label="Trades" value={String(run.tradeCount)} />
          <Stat label="Stop Exits" value={String(run.stopLossExitCount)} />
          <Stat label="Rank Failures" value={String(run.monthlyRankExitCount)} />
          <Stat label="Open At End" value={String(run.endingOpenPositionCount)} />
        </div>

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

        <InfoBlock
          title="Unavailable Historical Filters"
          values={jsonArray(run.unavailableFilters)}
        />

        <InfoBlock
          title="Limitations"
          values={jsonArray(run.limitations)}
        />

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Position History</h2>
          <div className="mt-4 max-w-full overflow-x-auto">
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
                      <span className="block font-medium">{position.company.name}</span>
                      <span className="text-xs text-[var(--muted)]">{position.instrument.exchange}:{position.instrument.symbol}</span>
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
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Decision / Event Log</h2>
          <div className="mt-4 max-h-[520px] max-w-full overflow-auto">
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
          </div>
          {run.events.length > events.length ? <p className="mt-3 text-sm text-[var(--muted)]">Showing first {events.length} events.</p> : null}
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Daily Equity</h2>
          <div className="mt-4 max-w-full overflow-x-auto">
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
        </div>
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
    },
  });

  if (!run || !isMomentum10HistoricalStrategy(run.strategy.name)) return;

  await completeEarlySuperstarsHistoricalRun({ client: prisma, runId: run.id });
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function InfoBlock({ title, values }: { readonly title: string; readonly values: string[] }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="mt-3 grid gap-2 text-sm text-[var(--muted)]">
        {values.map((value) => <li key={value}>{value}</li>)}
      </ul>
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
        return (
          <span key={`${String(item.reviewDate)}-${index}`}>
            {String(item.reviewDate ?? "-")}: {String(item.decision ?? "-")} since-entry rank {String(item.rank ?? "-")}
            {item.threshold ? `/${String(item.threshold)}` : ""}, return {formatPercent(numberOrNull(item.sinceEntryReturn))}
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

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}
