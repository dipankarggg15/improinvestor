import { notFound } from "next/navigation";

import { recordTradeAction } from "@/app/portfolio/actions";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { prisma } from "@/lib/db/prisma";
import { calculateRequiredCash, getDefaultTradePrice, valuePortfolioAsOf } from "@/lib/portfolio/service";
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

  if (!portfolioId && (!snapshot || !snapshot.selected) && (!reviewSnapshot || reviewSnapshot.recommendation !== "SELL")) notFound();

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
      include: { strategy: true },
    });
    const [instruments, valuations] = await Promise.all([
      prisma.instrument.findMany({
        where: { active: true },
        orderBy: [{ company: { name: "asc" } }, { exchange: "asc" }],
        include: { company: true },
      }),
      portfolio
        ? Promise.all([valuePortfolioAsOf(prisma, portfolio.id, new Date())])
        : Promise.all(portfolios.map((item) => valuePortfolioAsOf(prisma, item.id, new Date()))),
    ]);
    const instrumentById = new Map(instruments.map((instrument) => [instrument.id, instrument]));

    return (
      <ManualPortfolioTradePage
        instruments={instruments}
        openPositions={valuations.flatMap((valuation) => valuation.positions.map((position) => ({
          portfolioId: valuation.portfolio.id,
          companyId: position.companyId,
          instrumentId: position.instrumentId,
          companyName: instrumentById.get(position.instrumentId)?.company.name ?? position.companyId,
          symbol: instrumentById.get(position.instrumentId)?.symbol ?? position.instrumentId,
          exchange: instrumentById.get(position.instrumentId)?.exchange ?? "",
        })))}
        portfolioId={portfolio?.id ?? null}
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
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-4xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">Record Buy</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            This records an actual trade. The strategy selection remains a signal until this trade is saved.
          </p>
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
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

        <form action={recordTradeAction} className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
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

type ManualInstrument = Awaited<ReturnType<typeof prisma.instrument.findMany>>[number] & {
  readonly company: { readonly id: string; readonly name: string };
};
type ManualOpenPosition = {
  readonly portfolioId: string;
  readonly companyId: string;
  readonly instrumentId: string;
  readonly companyName: string;
  readonly symbol: string;
  readonly exchange: string;
};

function ManualPortfolioTradePage({
  instruments,
  openPositions,
  portfolioId,
  portfolios,
  strategyVersions,
}: {
  readonly instruments: ManualInstrument[];
  readonly openPositions: ManualOpenPosition[];
  readonly portfolioId: string | null;
  readonly portfolios: Array<{ readonly id: string; readonly name: string; readonly strategy: { readonly name: string } }>;
  readonly strategyVersions: Array<{ readonly id: string; readonly versionNumber: number; readonly label: string | null; readonly strategy: { readonly name: string } }>;
}) {
  const today = formatDate(new Date());
  const activePortfolioId = portfolioId ?? portfolios[0]?.id ?? "";

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-4xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">Record Trade</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Portfolio is already selected. A saved BUY or SELL is recorded in the immutable trade ledger.
          </p>
        </div>

        <form action={recordTradeAction} className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <input name="side" type="hidden" value="BUY" />
          <h2 className="text-lg font-semibold">Buy</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {portfolioId ? (
              <input name="portfolioId" type="hidden" value={portfolioId} />
            ) : (
              <PortfolioSelect defaultValue={activePortfolioId} portfolios={portfolios} />
            )}
            <StockSelect instruments={instruments} />
            <TradeDateField defaultValue={today} />
            <NumberField label="Quantity" min="0.000001" name="quantity" step="0.000001" />
            <NumberField label="Price" min="0.0001" name="price" step="0.0001" />
            <NumberField defaultValue="0.00" label="Fees" min="0" name="fees" step="0.0001" />
            <label className="grid gap-2 text-sm font-medium">
              Strategy Attribution
              <select className="h-11 rounded-md border border-[var(--border)] px-3" name="strategyVersionId">
                <option value="">None / Unassigned</option>
                {strategyVersions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.strategy.name} V{version.versionNumber}{version.label ? ` - ${version.label}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-4 grid gap-2 text-sm font-medium">
            Notes
            <textarea className="min-h-20 rounded-md border border-[var(--border)] p-3" name="notes" />
          </label>
          <ConfirmSubmitButton
            className="mt-5 h-11 rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            confirmMessage="Record this BUY trade in the immutable trade ledger?"
            pendingLabel="Saving..."
          >
            Save Buy
          </ConfirmSubmitButton>
        </form>

        <form action={recordTradeAction} className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <input name="portfolioId" type="hidden" value={activePortfolioId} />
          <input name="side" type="hidden" value="SELL" />
          <input name="strategyVersionId" type="hidden" value="" />
          <h2 className="text-lg font-semibold">Sell From Open Position</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Stock
              <select className="h-11 rounded-md border border-[var(--border)] px-3" name="stockKey" required>
                {openPositions.map((position) => (
                  <option key={`${position.portfolioId}:${position.companyId}:${position.instrumentId}`} value={`${position.portfolioId}:${position.companyId}:${position.instrumentId}`}>
                    {position.companyName} - {position.symbol} {position.exchange}
                  </option>
                ))}
              </select>
            </label>
            <TradeDateField defaultValue={today} />
            <NumberField label="Quantity" min="0.000001" name="quantity" step="0.000001" />
            <NumberField label="Price" min="0.0001" name="price" step="0.0001" />
            <NumberField defaultValue="0.00" label="Fees" min="0" name="fees" step="0.0001" />
          </div>
          <p className="mt-4 text-sm text-[var(--muted)]">
            Strategy attribution is inherited from the open position episode.
          </p>
          <ConfirmSubmitButton
            className="mt-5 h-11 rounded-md border border-[var(--border)] px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            confirmMessage="Record this SELL trade in the immutable trade ledger?"
            pendingLabel="Saving..."
          >
            Save Sell
          </ConfirmSubmitButton>
        </form>
      </div>
    </section>
  );
}

function PortfolioSelect({
  defaultValue,
  portfolios,
}: {
  readonly defaultValue: string;
  readonly portfolios: Array<{ readonly id: string; readonly name: string; readonly strategy: { readonly name: string } }>;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      Ledger
      <select className="h-11 rounded-md border border-[var(--border)] px-3" defaultValue={defaultValue} name="portfolioId" required>
        {portfolios.map((portfolio) => (
          <option key={portfolio.id} value={portfolio.id}>
            {portfolio.name} - {portfolio.strategy.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function StockSelect({ instruments }: { readonly instruments: ManualInstrument[] }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      Stock
      <select className="h-11 rounded-md border border-[var(--border)] px-3" name="stockKey" required>
        {instruments.map((instrument) => (
          <option key={instrument.id} value={`${instrument.companyId}:${instrument.id}`}>
            {instrument.company.name} - {instrument.symbol} ({instrument.exchange})
          </option>
        ))}
      </select>
    </label>
  );
}

function TradeDateField({ defaultValue }: { readonly defaultValue: string }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      Trade Date
      <input className="h-11 rounded-md border border-[var(--border)] px-3" defaultValue={defaultValue} name="tradeDate" type="date" />
    </label>
  );
}

function NumberField({
  defaultValue,
  label,
  min,
  name,
  step,
}: {
  readonly defaultValue?: string;
  readonly label: string;
  readonly min: string;
  readonly name: string;
  readonly step: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input className="h-11 rounded-md border border-[var(--border)] px-3" defaultValue={defaultValue} min={min} name={name} step={step} type="number" />
    </label>
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
