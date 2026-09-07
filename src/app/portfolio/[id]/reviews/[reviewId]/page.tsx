import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { formatCurrency, formatDate, formatPercent, formatQuantity } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type ReviewDetailPageProps = {
  params: Promise<{ id: string; reviewId: string }>;
};

type UniverseRow = {
  rank?: number | null;
  companyName?: string;
  symbol?: string;
  exchange?: string;
  rankingMetricValue?: number | null;
};

export default async function ReviewDetailPage({ params }: ReviewDetailPageProps) {
  const { id, reviewId } = await params;
  const review = await prisma.strategyReview.findFirst({
    where: { id: reviewId, portfolioId: id },
    include: {
      portfolio: true,
      strategy: true,
      strategyVersion: true,
      snapshots: {
        orderBy: [{ recommendation: "desc" }, { rank: "asc" }],
        include: { company: true, instrument: true, trades: true },
      },
    },
  });

  if (!review) notFound();

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">{review.strategy.name} Review</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            V{review.strategyVersion.versionNumber} {review.reviewType} review on {formatDate(review.reviewDate)}.
            Stored review snapshot, not recalculated from current data.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Portfolio" value={review.portfolio.name} />
          <Stat label="Status" value={review.status} />
          <Stat label="Positions Reviewed" value={String(review.snapshots.length)} />
          <Stat label="Sell Recommendations" value={String(review.snapshots.filter((snapshot) => snapshot.recommendation === "SELL").length)} />
        </div>

        {review.snapshots.map((snapshot) => {
          const context = nearbyUniverse(snapshot.comparisonUniverse, snapshot.rank);
          return (
            <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5" key={snapshot.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{snapshot.company.name}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{snapshot.instrument.symbol} ({snapshot.instrument.exchange})</p>
                </div>
                <span className={`rounded-md px-3 py-1 text-sm font-semibold ${snapshot.recommendation === "SELL" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                  {snapshot.recommendation}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <Info label="First Buy Date" value={formatDate(snapshot.firstPurchaseDate)} />
                <Info label="Holding Age" value={`${snapshot.holdingAgeDays} days`} />
                <Info label="Phase" value={snapshot.phase ?? "-"} />
                <Info label="Quantity" value={formatQuantity(snapshot.quantity.toNumber())} />
                <Info label="Average Cost" value={formatCurrency(snapshot.averageCost.toNumber())} />
                <Info label="Price Used" value={snapshot.priceAtReview ? formatCurrency(snapshot.priceAtReview.toNumber()) : "-"} />
                <Info label="Actual Price Date" value={snapshot.actualPriceDate ? formatDate(snapshot.actualPriceDate) : "-"} />
                <Info label="Return Since Reference" value={formatPercent(snapshot.returnSinceReference?.toNumber())} />
                <Info label="Ranking Metric" value={snapshot.rankingMetric ?? "-"} />
                <Info label="Rank" value={snapshot.rank ? String(snapshot.rank) : "-"} />
                <Info label="Universe Size" value={snapshot.eligibleUniverseSize ? String(snapshot.eligibleUniverseSize) : "-"} />
                <Info label="Ranking Period" value={snapshot.rankingPeriodStart ? `${formatDate(snapshot.rankingPeriodStart)} to ${snapshot.rankingPeriodEnd ? formatDate(snapshot.rankingPeriodEnd) : "-"}` : "-"} />
                <Info label="Acquisition Cost" value={snapshot.acquisitionCost ? formatCurrency(snapshot.acquisitionCost.toNumber()) : "-"} />
                <Info label="Stop Threshold" value={snapshot.stopThresholdPrice ? formatCurrency(snapshot.stopThresholdPrice.toNumber()) : "-"} />
                <Info label="Drawdown" value={formatPercent(snapshot.drawdownPercent?.toNumber())} />
              </dl>
              <p className="mt-4 text-sm text-[var(--muted)]">{snapshot.explanation}</p>
              <p className="mt-2 text-xs font-semibold uppercase text-[var(--muted)]">{snapshot.reasonCodes.join(", ")}</p>
              {snapshot.recommendation === "SELL" ? (
                <Link
                  className="mt-4 inline-flex rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--accent)]"
                  href={`/trades/new?reviewSnapshotId=${snapshot.id}`}
                >
                  Record Sell
                </Link>
              ) : null}

              {context.length > 0 ? (
                <div className="mt-5 overflow-x-auto">
                  <h3 className="text-sm font-semibold">Nearby Ranking Context</h3>
                  <table className="mt-2 w-full text-left text-sm">
                    <thead className="text-xs uppercase text-[var(--muted)]">
                      <tr>
                        <th className="py-2 pr-3">Rank</th>
                        <th className="py-2 pr-3">Company</th>
                        <th className="py-2 pr-3">Symbol</th>
                        <th className="py-2 pr-3">Metric</th>
                      </tr>
                    </thead>
                    <tbody>
                      {context.map((row) => (
                        <tr className="border-t border-[var(--border)]" key={`${row.rank}-${row.symbol}`}>
                          <td className="py-2 pr-3">{row.rank}</td>
                          <td className="py-2 pr-3">{row.companyName}</td>
                          <td className="py-2 pr-3">{row.symbol} {row.exchange}</td>
                          <td className="py-2 pr-3">{formatPercent(row.rankingMetricValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function nearbyUniverse(value: unknown, rank: number | null): UniverseRow[] {
  if (!Array.isArray(value) || !rank) return [];
  return (value as UniverseRow[]).filter((row) => {
    const rowRank = row.rank ?? 0;
    return rowRank >= rank - 3 && rowRank <= rank + 3;
  });
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-base font-semibold">{value}</p>
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
