import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { prisma } from "@/lib/db/prisma";
import { getPositionEpisodeDetail } from "@/lib/exits/service";
import { formatCurrency, formatDate, formatPercent, formatQuantity } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type EpisodePageProps = {
  params: Promise<{ id: string; episodeId: string }>;
};

export default async function EpisodePage({ params }: EpisodePageProps) {
  const { id, episodeId } = await params;
  const episode = await getPositionEpisodeDetail(prisma, id, episodeId);
  if (!episode) notFound();

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">{episode.company.name}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {episode.instrument.symbol} ({episode.instrument.exchange}) in {episode.portfolio.name}. Episode status: {episode.status}.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Opened" value={formatDate(episode.openedAt)} />
          <Stat label="Closed" value={episode.closedAt ? formatDate(episode.closedAt) : "Open"} />
          <Stat label="First Buy Trade" value={episode.firstBuyTradeId} />
          <Stat label="Final Sell Trade" value={episode.finalSellTradeId ?? "-"} />
        </div>

        <Panel title="Trades">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-xs uppercase text-[var(--muted)]">
              <tr>
                {["Date", "Side", "Quantity", "Price", "Fees", "Source"].map((head) => <th className="py-2 pr-3" key={head}>{head}</th>)}
              </tr>
            </thead>
            <tbody>
              {episode.trades.map((trade) => (
                <tr className="border-t border-[var(--border)]" key={trade.id}>
                  <td className="py-3 pr-3">{formatDate(trade.tradeDate)}</td>
                  <td className="py-3 pr-3">{trade.side}</td>
                  <td className="py-3 pr-3">{formatQuantity(trade.quantity.toNumber())}</td>
                  <td className="py-3 pr-3">{formatCurrency(trade.price.toNumber())}</td>
                  <td className="py-3 pr-3">{formatCurrency(trade.fees.toNumber())}</td>
                  <td className="py-3 pr-3">
                    {trade.strategyReviewPositionSnapshot ? `Review ${trade.strategyReviewPositionSnapshot.review.reviewType}` : trade.strategyRun ? "Strategy run" : "Manual"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Exit Decision And Execution">
          {episode.exitSnapshot ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Info label="Exit Source" value={episode.exitSnapshot.exitSource.replace("_", " ")} />
              <Info label="Recommendation Date" value={episode.exitSnapshot.recommendationDate ? formatDate(episode.exitSnapshot.recommendationDate) : "MANUAL"} />
              <Info label="Recommendation Price" value={episode.exitSnapshot.recommendationPrice ? formatCurrency(episode.exitSnapshot.recommendationPrice.toNumber()) : "-"} />
              <Info label="Execution Date" value={formatDate(episode.exitSnapshot.exitDate)} />
              <Info label="Execution Price" value={formatCurrency(episode.exitSnapshot.executionPrice.toNumber())} />
              <Info label="Execution Delay" value={episode.exitSnapshot.executionDelayDays === null ? "-" : `${episode.exitSnapshot.executionDelayDays} days`} />
              <Info label="Final Trade Quantity" value={formatQuantity(episode.exitSnapshot.quantityClosedByFinalTrade.toNumber())} />
              <Info label="Total Purchased" value={formatQuantity(episode.exitSnapshot.totalQuantityPurchased.toNumber())} />
              <Info label="Avg Cost Before Closure" value={formatCurrency(episode.exitSnapshot.weightedAverageCostBeforeClosure.toNumber())} />
              <Info label="Realized P&L" value={formatCurrency(episode.exitSnapshot.totalRealizedPnl.toNumber())} />
              <Info label="Realized Return" value={formatPercent(episode.exitSnapshot.totalRealizedReturnPercent.toNumber())} />
              <Info label="Total Fees" value={formatCurrency(episode.exitSnapshot.totalFees.toNumber())} />
              <Info label="Reasons" value={episode.exitSnapshot.recommendationReasons.join(", ") || "MANUAL"} />
            </dl>
          ) : (
            <p className="text-sm text-[var(--muted)]">This episode is still open.</p>
          )}
        </Panel>

        <Panel title="Post-Exit Observations">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="text-xs uppercase text-[var(--muted)]">
              <tr>
                {["Horizon", "Status", "Target Date", "Actual Date", "Actual Price", "Return Since Exit"].map((head) => <th className="py-2 pr-3" key={head}>{head}</th>)}
              </tr>
            </thead>
            <tbody>
              {episode.postExitObservations.map((observation) => (
                <tr className="border-t border-[var(--border)]" key={observation.id}>
                  <td className="py-3 pr-3">{observation.horizon.replace("_", " ")}</td>
                  <td className="py-3 pr-3">{observation.status.replace("_", " ")}</td>
                  <td className="py-3 pr-3">{formatDate(observation.targetDate)}</td>
                  <td className="py-3 pr-3">{observation.actualPriceDate ? formatDate(observation.actualPriceDate) : "-"}</td>
                  <td className="py-3 pr-3">{observation.actualPrice ? formatCurrency(observation.actualPrice.toNumber()) : "-"}</td>
                  <td className="py-3 pr-3">{formatPercent(observation.returnSinceExit?.toNumber())}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {episode.postExitObservations.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No post-exit observations stored yet.</p> : null}
        </Panel>
      </div>
    </section>
  );
}

function Panel({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="max-w-full overflow-x-auto">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function Info({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
