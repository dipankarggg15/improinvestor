import { notFound } from "next/navigation";

import { recordTradeAction } from "@/app/portfolio/actions";
import { TradeEntryForm } from "@/components/trades/trade-entry-form";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { prisma } from "@/lib/db/prisma";
import { calculateRequiredCash, getDefaultTradePrice } from "@/lib/portfolio/service";
import { formatCurrency, formatDate, formatPercent } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type NewTradePageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function NewTradePage({ searchParams }: NewTradePageProps) {
  const query = await searchParams;
  const portfolioId = query.portfolioId;
  const candidateSnapshotId = query.candidateSnapshotId;
  const reviewSnapshotId = query.reviewSnapshotId;
  const snapshot = candidateSnapshotId
    ? await prisma.strategyCandidateSnapshot.findUnique({
        where: { id: candidateSnapshotId },
        include: {
          company: true,
          instrument: true,
          strategyRun: { include: { strategy: true, strategyVersion: true } },
        },
      })
    : null;
  const reviewSnapshot = reviewSnapshotId
    ? await prisma.strategyReviewPositionSnapshot.findUnique({
        where: { id: reviewSnapshotId },
        include: {
          company: true,
          instrument: true,
          review: { include: { portfolio: true, strategy: true, strategyVersion: true } },
        },
      })
    : null;

  if (candidateSnapshotId && (!snapshot || !snapshot.selected)) notFound();
  if (reviewSnapshotId && (!reviewSnapshot || reviewSnapshot.recommendation !== "SELL")) notFound();

  const portfolio = reviewSnapshot?.review.portfolio ?? (
    portfolioId
      ? await prisma.portfolio.findUnique({ where: { id: portfolioId } })
      : snapshot
        ? await prisma.portfolio.findFirst({
            where: { strategyId: snapshot.strategyRun.strategyId },
            orderBy: { inceptionDate: "asc" },
          })
        : null
  );

  if (!portfolio && (snapshot || reviewSnapshot || portfolioId)) notFound();
  const strategyVersions = await prisma.strategyVersion.findMany({
    where: { strategy: { status: "ACTIVE" } },
    orderBy: { versionNumber: "desc" },
    include: { strategy: true },
  });
  const defaultStrategyVersionId = snapshot?.strategyRun.strategyVersionId ?? "";

  if (!snapshot && !reviewSnapshot) {
    const portfolios = await prisma.portfolio.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, strategyId: true, strategy: { select: { name: true } } },
    });

    return (
      <TradeEntryForm
        portfolios={portfolios}
        strategyVersions={strategyVersions}
      />
    );
  }

  const instrumentId = reviewSnapshot?.instrumentId ?? snapshot?.instrumentId;
  const companyId = reviewSnapshot?.companyId ?? snapshot?.companyId;
  const defaultDate = reviewSnapshot?.review.reviewDate ?? snapshot?.strategyRun.runDate;
  if (!instrumentId || !companyId || !defaultDate) notFound();
  if (!portfolio) notFound();
  const defaultPrice = await getDefaultTradePrice(prisma, instrumentId, defaultDate);
  const tradeDate = defaultPrice?.tradingDate ?? defaultDate;
  const price = defaultPrice?.close.toNumber() ?? 0;
  const quantity = reviewSnapshot?.quantity.toNumber() ?? 10;
  const fees = 20;
  const requiredCash = calculateRequiredCash({
    quantity: String(quantity),
    price: String(price),
    fees: String(fees),
  });

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-4xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">Record {reviewSnapshot ? "Sell" : "Buy"}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            This records an actual trade. The strategy selection remains a signal until this trade is saved.
          </p>
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
          <h2 className="text-lg font-semibold">{reviewSnapshot?.company.name ?? snapshot?.company.name}</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Symbol" value={`${reviewSnapshot?.instrument.symbol ?? snapshot?.instrument.symbol} (${reviewSnapshot?.instrument.exchange ?? snapshot?.instrument.exchange})`} />
            <Info label="Strategy" value={reviewSnapshot?.review.strategy.name ?? snapshot?.strategyRun.strategy.name ?? "-"} />
            <Info label="Version" value={`V${reviewSnapshot?.review.strategyVersion.versionNumber ?? snapshot?.strategyRun.strategyVersion.versionNumber ?? "-"}`} />
            <Info label="Source Date" value={formatDate(defaultDate)} />
            <Info label="Selection / Review Rank" value={String(reviewSnapshot?.rank ?? snapshot?.rank ?? "-")} />
            <Info label="Ranking Metric" value={`${reviewSnapshot?.rankingMetric ?? snapshot?.rankingMetric}: ${formatPercent(reviewSnapshot?.rankingMetricValue?.toNumber() ?? snapshot?.rankingMetricValue?.toNumber())}`} />
          </dl>
        </div>

        <form action={recordTradeAction} className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
          <input name="portfolioId" type="hidden" value={portfolio.id} />
          <input name="companyId" type="hidden" value={companyId} />
          <input name="instrumentId" type="hidden" value={instrumentId} />
          <input name="strategyRunId" type="hidden" value={snapshot?.strategyRunId ?? ""} />
          {reviewSnapshot ? <input name="strategyVersionId" type="hidden" value="" /> : null}
          <input name="strategyCandidateSnapshotId" type="hidden" value={snapshot?.id ?? ""} />
          <input name="strategyReviewPositionSnapshotId" type="hidden" value={reviewSnapshot?.id ?? ""} />
          <input name="side" type="hidden" value={reviewSnapshot ? "SELL" : "BUY"} />
          {!reviewSnapshot ? (
            <label className="mb-4 grid gap-2 text-sm font-medium">
              Strategy Attribution
              <select
                className="h-11 rounded-md border border-[var(--border)] px-3"
                defaultValue={defaultStrategyVersionId}
                name="strategyVersionId"
              >
                <option value="">None / Unassigned</option>
                {strategyVersions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.strategy.name} V{version.versionNumber}{version.label ? ` - ${version.label}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Trade Date
              <input className="h-11 rounded-md border border-[var(--border)] px-3" defaultValue={formatDate(tradeDate)} name="tradeDate" type="date" />
            </label>
            <label className="grid gap-2 text-sm font-medium">
            Quantity
              <input className="h-11 rounded-md border border-[var(--border)] px-3" defaultValue={quantity} min="0.000001" name="quantity" step="0.000001" type="number" />
            </label>
            <label className="grid gap-2 text-sm font-medium">
            Price
              <input className="h-11 rounded-md border border-[var(--border)] px-3" defaultValue={price.toFixed(4)} min="0.0001" name="price" step="0.0001" type="number" />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Fees
              <input className="h-11 rounded-md border border-[var(--border)] px-3" defaultValue={fees.toFixed(2)} min="0" name="fees" step="0.0001" type="number" />
            </label>
          </div>
          <label className="mt-4 grid gap-2 text-sm font-medium">
            Notes
            <textarea className="min-h-24 rounded-md border border-[var(--border)] p-3" defaultValue={reviewSnapshot ? "Manual execution from stored SELL review recommendation." : "Development trade from selected strategy candidate."} name="notes" />
          </label>
          <p className="mt-4 text-sm text-[var(--muted)]">
            {reviewSnapshot ? "This SELL is manual execution; the review recommendation alone does not change the portfolio." : `Default required cash: ${formatCurrency(requiredCash.toNumber())}.`} Edit quantity, price, or fees before saving if needed.
          </p>
          <ConfirmSubmitButton
            className="mt-5 h-11 rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            confirmMessage={`Record this ${reviewSnapshot ? "SELL" : "BUY"} trade in the immutable trade ledger?`}
            pendingLabel="Saving..."
          >
            Save {reviewSnapshot ? "Sell" : "Trade"}
          </ConfirmSubmitButton>
        </form>
      </div>
    </section>
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
