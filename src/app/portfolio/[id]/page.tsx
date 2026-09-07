import Link from "next/link";
import { notFound } from "next/navigation";

import { runReviewAction } from "@/app/reviews/actions";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { prisma } from "@/lib/db/prisma";
import { listClosedEpisodes } from "@/lib/exits/service";
import { valuePortfolioAsOf } from "@/lib/portfolio/service";
import { earlySuperstarsPhase } from "@/lib/reviews/schedule";
import { getReviewScheduleForPosition } from "@/lib/reviews/service";
import { formatCurrency, formatDate, formatPercent, formatQuantity } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type PortfolioDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PortfolioDetailPage({ params }: PortfolioDetailPageProps) {
  const { id } = await params;
  const portfolio = await prisma.portfolio.findUnique({
    where: { id },
    include: {
      strategy: true,
      trades: {
        orderBy: [{ tradeDate: "desc" }, { createdAt: "desc" }],
        include: {
          company: true,
          instrument: true,
          strategyRun: true,
          strategyCandidateSnapshot: true,
        },
      },
      reviews: {
        orderBy: { reviewDate: "desc" },
        take: 10,
        include: { snapshots: true, strategyVersion: true },
      },
    },
  });

  if (!portfolio) notFound();

  const valuation = await valuePortfolioAsOf(prisma, portfolio.id, new Date());
  const portfolioClosedEpisodes = await listClosedEpisodes(prisma, { portfolioId: portfolio.id });
  const companies = await prisma.company.findMany({
    where: { id: { in: valuation.positions.map((position) => position.companyId) } },
    include: { instruments: true },
  });
  const companiesById = new Map(companies.map((company) => [company.id, company]));
  const schedules = await Promise.all(
    valuation.positions.map((position) =>
      getReviewScheduleForPosition({
        strategyName: portfolio.strategy.name,
        firstPurchaseDate: position.firstPurchaseDate ?? new Date(),
        asOfDate: new Date(),
      }),
    ),
  );

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
            <h1 className="mt-2 text-3xl font-semibold">{portfolio.name}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{portfolio.strategy.name}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Initial Capital" value={formatCurrency(portfolio.initialCapital.toNumber())} />
          <Stat label="Cash" value={formatCurrency(valuation.cash.toNumber())} />
          <Stat label="Invested Cost" value={formatCurrency(valuation.investedCost.toNumber())} />
          <Stat label="Market Value" value={formatCurrency(valuation.currentMarketValue.toNumber())} />
          <Stat label="Total Value" value={formatCurrency(valuation.totalPortfolioValue.toNumber())} />
          <Stat label="Realized P&L" value={formatCurrency(valuation.realizedPnl.toNumber())} />
          <Stat label="Unrealized P&L" value={formatCurrency(valuation.unrealizedPnl.toNumber())} />
          <Stat label="Return" value={formatPercent(valuation.totalReturnPercent.toNumber())} />
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <h2 className="text-lg font-semibold">Closed Positions</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1260px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {["Company", "Entry", "Exit", "Duration", "Average Cost", "Exit Ref", "Realized P&L", "Realized %", "Source", "Reason", "Post-Exit"].map((head) => (
                    <th className="py-2 pr-3" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {portfolioClosedEpisodes.map((episode) => (
                  <tr className="border-t border-[var(--border)]" key={episode.id}>
                    <td className="py-3 pr-3">
                      <Link className="font-medium text-[var(--accent)]" href={`/portfolio/${portfolio.id}/episodes/${episode.id}`}>
                        {episode.company.name}
                      </Link>
                      <span className="ml-2 text-xs text-[var(--muted)]">{episode.instrument.symbol} {episode.instrument.exchange}</span>
                    </td>
                    <td className="py-3 pr-3">{formatDate(episode.openedAt)}</td>
                    <td className="py-3 pr-3">{episode.closedAt ? formatDate(episode.closedAt) : "-"}</td>
                    <td className="py-3 pr-3">{episode.exitSnapshot?.holdingDurationDays ?? "-"} days</td>
                    <td className="py-3 pr-3">{episode.exitSnapshot ? formatCurrency(episode.exitSnapshot.weightedAverageCostBeforeClosure.toNumber()) : "-"}</td>
                    <td className="py-3 pr-3">{episode.exitSnapshot ? formatCurrency((episode.exitSnapshot.recommendationPrice ?? episode.exitSnapshot.executionPrice).toNumber()) : "-"}</td>
                    <td className="py-3 pr-3">{episode.exitSnapshot ? formatCurrency(episode.exitSnapshot.totalRealizedPnl.toNumber()) : "-"}</td>
                    <td className="py-3 pr-3">{formatPercent(episode.exitSnapshot?.totalRealizedReturnPercent.toNumber())}</td>
                    <td className="py-3 pr-3">{episode.exitSnapshot?.exitSource.replace("_", " ") ?? "-"}</td>
                    <td className="py-3 pr-3">{episode.exitSnapshot?.recommendationReasons.join(", ") || "MANUAL"}</td>
                    <td className="py-3 pr-3">
                      {episode.postExitObservations.filter((observation) => observation.status === "COMPLETED").length}/
                      {episode.postExitObservations.length} complete
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {portfolioClosedEpisodes.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No closed position episodes yet.</p> : null}
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <h2 className="text-lg font-semibold">Open Positions</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {["Company", "Symbol", "Quantity", "Average Cost", "Current Price", "Price Date", "Cost Basis", "Market Value", "Unrealized P&L", "Unrealized %", "First Buy Date", "Holding Age", "Entry Rank", "Strategy Run"].map((head) => (
                    <th className="py-2 pr-3" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {valuation.positions.map((position) => {
                  const company = companiesById.get(position.companyId);
                  const instrument = company?.instruments.find((item) => item.id === position.instrumentId);
                  const entryTrade = portfolio.trades.find((trade) => trade.strategyCandidateSnapshotId === position.originatingCandidateSnapshotId);

                  return (
                    <tr className="border-t border-[var(--border)]" key={`${position.companyId}-${position.instrumentId}`}>
                      <td className="py-3 pr-3">{company?.name ?? position.companyId}</td>
                      <td className="py-3 pr-3 font-medium">{instrument?.symbol ?? "-"}</td>
                      <td className="py-3 pr-3">{formatQuantity(position.quantity.toNumber())}</td>
                      <td className="py-3 pr-3">{formatCurrency(position.averageCost.toNumber())}</td>
                      <td className="py-3 pr-3">{position.currentPrice ? formatCurrency(position.currentPrice.toNumber()) : "-"}</td>
                      <td className="py-3 pr-3">{position.valuationDate ? formatDate(position.valuationDate) : "-"}</td>
                      <td className="py-3 pr-3">{formatCurrency(position.costBasis.toNumber())}</td>
                      <td className="py-3 pr-3">{formatCurrency(position.marketValue.toNumber())}</td>
                      <td className="py-3 pr-3">{formatCurrency(position.unrealizedPnl.toNumber())}</td>
                      <td className="py-3 pr-3">{formatPercent(position.unrealizedPnlPercent?.toNumber())}</td>
                      <td className="py-3 pr-3">{position.firstPurchaseDate ? formatDate(position.firstPurchaseDate) : "-"}</td>
                      <td className="py-3 pr-3">{holdingAge(position.firstPurchaseDate, new Date())}</td>
                      <td className="py-3 pr-3">{entryTrade?.strategyCandidateSnapshot?.rank ?? "-"}</td>
                      <td className="py-3 pr-3">
                        {position.originatingStrategyRunId ? (
                          <Link className="text-[var(--accent)]" href={`/strategies/${portfolio.strategyId}/runs/${position.originatingStrategyRunId}`}>
                            View run
                          </Link>
                        ) : (
                          "MANUAL"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {valuation.positions.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No open positions.</p> : null}
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Reviews</h2>
            <form action={runReviewAction} className="flex flex-wrap gap-2">
              <input name="portfolioId" type="hidden" value={portfolio.id} />
              <input name="reviewType" type="hidden" value="SCHEDULED" />
              <input className="h-10 rounded-md border border-[var(--border)] px-3 text-sm" defaultValue={formatDate(new Date())} name="reviewDate" type="date" />
              <ConfirmSubmitButton
                confirmMessage="Run this portfolio review and permanently store its review snapshots?"
                pendingLabel="Running..."
              >
                Run Review
              </ConfirmSubmitButton>
            </form>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {["Company", "Holding Age", "Current Phase", "Next Review", "Due", "Current Price", "Emergency Threshold", "Emergency"].map((head) => (
                    <th className="py-2 pr-3" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {valuation.positions.map((position, index) => {
                  const company = companiesById.get(position.companyId);
                  const schedule = schedules[index];
                  const threshold = portfolio.strategy.name === "Early Superstars" ? position.averageCost.mul("0.85") : null;

                  return (
                    <tr className="border-t border-[var(--border)]" key={`review-${position.companyId}-${position.instrumentId}`}>
                      <td className="py-3 pr-3">{company?.name ?? position.companyId}</td>
                      <td className="py-3 pr-3">{holdingAge(position.firstPurchaseDate, new Date())}</td>
                      <td className="py-3 pr-3">
                        {portfolio.strategy.name === "Early Superstars" && position.firstPurchaseDate
                          ? earlySuperstarsPhase(position.firstPurchaseDate, new Date())
                          : "HOLDING"}
                      </td>
                      <td className="py-3 pr-3">{formatDate(schedule.nextScheduledReviewDate)}</td>
                      <td className="py-3 pr-3">{schedule.daysUntilOrOverdue >= 0 ? `${schedule.daysUntilOrOverdue} days` : `${Math.abs(schedule.daysUntilOrOverdue)} days overdue`}</td>
                      <td className="py-3 pr-3">{position.currentPrice ? formatCurrency(position.currentPrice.toNumber()) : "-"}</td>
                      <td className="py-3 pr-3">{threshold ? formatCurrency(threshold.toNumber()) : "-"}</td>
                      <td className="py-3 pr-3">
                        {portfolio.strategy.name === "Early Superstars" ? (
                          <form action={runReviewAction}>
                            <input name="portfolioId" type="hidden" value={portfolio.id} />
                            <input name="reviewType" type="hidden" value="EMERGENCY" />
                            <input name="reviewDate" type="hidden" value={formatDate(new Date())} />
                            <ConfirmSubmitButton
                              className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                              confirmMessage="Run an emergency stop review and permanently store its review snapshot?"
                              pendingLabel="Checking..."
                            >
                              Check Emergency Stop
                            </ConfirmSubmitButton>
                          </form>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-semibold">Historical Reviews</h3>
            <div className="mt-2 grid gap-2 text-sm">
              {portfolio.reviews.map((review) => (
                <Link
                  className="flex justify-between rounded-md bg-[var(--panel-soft)] px-3 py-2"
                  href={`/portfolio/${portfolio.id}/reviews/${review.id}`}
                  key={review.id}
                >
                  <span>{formatDate(review.reviewDate)} {review.reviewType}</span>
                  <span>{review.snapshots.filter((snapshot) => snapshot.recommendation === "SELL").length} sell recommendations</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <h2 className="text-lg font-semibold">Trade History</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {["Date", "Company", "Side", "Quantity", "Price", "Fees", "Gross Value", "Strategy Run / Source"].map((head) => (
                    <th className="py-2 pr-3" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {portfolio.trades.map((trade) => (
                  <tr className="border-t border-[var(--border)]" key={trade.id}>
                    <td className="py-3 pr-3">
                      <Link className="font-medium text-[var(--accent)]" href={`/portfolio/${portfolio.id}/trades/${trade.id}`}>
                        {formatDate(trade.tradeDate)}
                      </Link>
                    </td>
                    <td className="py-3 pr-3">{trade.company.name}</td>
                    <td className="py-3 pr-3">{trade.side}</td>
                    <td className="py-3 pr-3">{formatQuantity(trade.quantity.toNumber())}</td>
                    <td className="py-3 pr-3">{formatCurrency(trade.price.toNumber())}</td>
                    <td className="py-3 pr-3">{formatCurrency(trade.fees.toNumber())}</td>
                    <td className="py-3 pr-3">{formatCurrency(trade.quantity.mul(trade.price).toNumber())}</td>
                    <td className="py-3 pr-3">
                      {trade.strategyRun ? (
                        <Link className="text-[var(--accent)]" href={`/strategies/${portfolio.strategyId}/runs/${trade.strategyRun.id}`}>
                          Strategy run, rank {trade.strategyCandidateSnapshot?.rank ?? "-"}
                        </Link>
                      ) : (
                        "MANUAL / UNSOURCED"
                      )}
                    </td>
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

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function holdingAge(start: Date | null, end: Date) {
  if (!start) return "-";
  const days = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
  return `${days} days`;
}
