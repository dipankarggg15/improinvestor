import { notFound } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { getCounterfactualVariantDetail } from "@/lib/counterfactuals/service";
import { formatCurrency, formatDate, formatPercent, formatQuantity } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ experimentId: string; variantId: string }>;
};

export default async function CounterfactualVariantPage({ params }: PageProps) {
  const { experimentId, variantId } = await params;
  const detail = await getCounterfactualVariantDetail(prisma, experimentId, variantId);
  const experiment = detail?.experiment;
  const variant = detail?.variant;
  const run = detail?.run;
  if (!experiment || !variant || !run) notFound();
  const metrics = run.metrics && typeof run.metrics === "object" ? run.metrics as Record<string, unknown> : {};

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">COUNTERFACTUAL / SIMULATED</p>
          <h1 className="mt-2 text-3xl font-semibold">{variant.name}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{experiment.name}. Stored simulated records, not actual portfolio history.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <Stat label="Ending Value" value={formatCurrency(numberMetric(metrics.endingValue))} />
          <Stat label="Total Return" value={formatPercent(numberMetric(metrics.totalReturnPercent))} />
          <Stat label="Max Drawdown" value={formatPercent(numberMetric(metrics.maximumDrawdownPercent))} />
          <Stat label="Turnover" value={formatPercent(numberMetric(metrics.turnoverPercent))} />
          <Stat label="Trades" value={String(metrics.tradeCount ?? "-")} />
        </div>

        <Panel title="Effective Rules And Assumptions">
          <pre className="max-h-96 overflow-auto rounded-md bg-[var(--panel-soft)] p-4 text-xs">{JSON.stringify({ overrides: variant.parameterOverrides, assumptions: run.assumptions }, null, 2)}</pre>
        </Panel>

        <Panel title="Simulated Trades">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs uppercase text-[var(--muted)]">
              <tr>{["Date", "Company", "Side", "Quantity", "Price", "Fees", "Reason"].map((head) => <th className="py-2 pr-3" key={head}>{head}</th>)}</tr>
            </thead>
            <tbody>
              {run.trades.map((trade) => (
                <tr className="border-t border-[var(--border)]" key={trade.id}>
                  <td className="py-3 pr-3">{formatDate(trade.tradeDate)}</td>
                  <td className="py-3 pr-3">{trade.company.name}</td>
                  <td className="py-3 pr-3">{trade.side}</td>
                  <td className="py-3 pr-3">{formatQuantity(trade.quantity.toNumber())}</td>
                  <td className="py-3 pr-3">{formatCurrency(trade.price.toNumber())}</td>
                  <td className="py-3 pr-3">{formatCurrency(trade.fees.toNumber())}</td>
                  <td className="py-3 pr-3">{trade.decisionReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Simulated Episodes">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs uppercase text-[var(--muted)]">
              <tr>{["Company", "Opened", "Closed", "Status", "Entry Rank", "Return", "Exit Reason"].map((head) => <th className="py-2 pr-3" key={head}>{head}</th>)}</tr>
            </thead>
            <tbody>
              {run.positionEpisodes.map((episode) => (
                <tr className="border-t border-[var(--border)]" key={episode.id}>
                  <td className="py-3 pr-3">{episode.company.name}</td>
                  <td className="py-3 pr-3">{formatDate(episode.openedAt)}</td>
                  <td className="py-3 pr-3">{episode.closedAt ? formatDate(episode.closedAt) : "-"}</td>
                  <td className="py-3 pr-3">{episode.status}</td>
                  <td className="py-3 pr-3">{episode.entryRank ?? "-"}</td>
                  <td className="py-3 pr-3">{formatPercent(episode.realizedReturnPercent?.toNumber())}</td>
                  <td className="py-3 pr-3">{episode.exitReason ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </section>
  );
}

function Panel({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5"><h2 className="text-lg font-semibold">{title}</h2><div className="mt-4 overflow-x-auto">{children}</div></div>;
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4"><p className="text-xs uppercase text-[var(--muted)]">{label}</p><p className="mt-2 text-sm font-semibold">{value}</p></div>;
}

function numberMetric(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}
