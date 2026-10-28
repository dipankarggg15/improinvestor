"use client";

import { useMemo } from "react";

import { useLiveQuotes } from "@/lib/market-data/use-live-quotes";

type LivePosition = {
  readonly instrumentKey: string;
  readonly symbol: string;
  readonly quantity: number;
  readonly averageCost: number;
  readonly fallbackPrice: number | null;
};

export function LivePortfolioValuation({ cash, initialCapital, positions }: {
  readonly cash: number;
  readonly initialCapital: number;
  readonly positions: readonly LivePosition[];
}) {
  const instrumentKeys = useMemo(() => positions.map((position) => position.instrumentKey), [positions]);
  const { quotes, status, updatedAt } = useLiveQuotes(instrumentKeys);
  const valuation = useMemo(() => positions.reduce((total, position) => {
    const price = quotes[position.instrumentKey]?.lastPrice ?? position.fallbackPrice;
    if (price === null) return total;
    return {
      marketValue: total.marketValue + (price * position.quantity),
      unrealizedPnl: total.unrealizedPnl + ((price - position.averageCost) * position.quantity),
      livePositions: total.livePositions + Number(Boolean(quotes[position.instrumentKey])),
    };
  }, { marketValue: 0, unrealizedPnl: 0, livePositions: 0 }), [positions, quotes]);
  const totalValue = cash + valuation.marketValue;
  const returnPercent = initialCapital > 0 ? ((totalValue - initialCapital) / initialCapital) * 100 : 0;

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-emerald-950">Live portfolio overlay</h2>
          <p className="mt-1 text-xs text-emerald-800">
            {status === "live"
              ? `Upstox stream · ${valuation.livePositions}/${positions.length} positions live · ${formatTime(updatedAt)}`
              : status === "connecting" ? "Connecting to Upstox live prices…" : "Using stored closing prices while the live feed reconnects"}
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-900">No tick data saved</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Live Market Value" value={formatCurrency(valuation.marketValue)} />
        <Metric label="Live Total Value" value={formatCurrency(totalValue)} />
        <Metric label="Live Unrealized P&L" tone={valuation.unrealizedPnl >= 0 ? "positive" : "negative"} value={formatCurrency(valuation.unrealizedPnl)} />
        <Metric label="Live Return" tone={returnPercent >= 0 ? "positive" : "negative"} value={`${returnPercent.toFixed(2)}%`} />
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { readonly label: string; readonly value: string; readonly tone?: "positive" | "negative" }) {
  const toneClass = tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-red-700" : "text-[var(--foreground)]";
  return <div className="rounded-md border border-emerald-100 bg-white p-3"><p className="text-xs uppercase text-[var(--muted)]">{label}</p><p className={`mt-1 font-semibold ${toneClass}`}>{value}</p></div>;
}

function formatCurrency(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function formatTime(value: string | null) {
  if (!value) return "now";
  return new Intl.DateTimeFormat("en-IN", { timeStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(value));
}
