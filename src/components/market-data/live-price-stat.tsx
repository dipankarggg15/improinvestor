"use client";

import { useLiveQuotes } from "@/lib/market-data/use-live-quotes";

export function LivePriceStat({ instrumentKey, fallbackPrice, fallbackChangePercent }: {
  readonly instrumentKey: string;
  readonly fallbackPrice: number;
  readonly fallbackChangePercent: number;
}) {
  const { quotes, status, updatedAt } = useLiveQuotes([instrumentKey]);
  const quote = quotes[instrumentKey];
  const price = quote?.lastPrice ?? fallbackPrice;
  const changePercent = quote?.previousClose
    ? ((price - quote.previousClose) / quote.previousClose) * 100
    : fallbackChangePercent;
  const tone = changePercent >= 0 ? "text-emerald-700" : "text-red-700";

  return (
    <div className="mobile-compact-card rounded-lg border border-[var(--border)] bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{quote ? "Live Price" : "Latest Close"}</p>
      <p className={`metric-value mt-2 font-semibold ${tone}`}>{formatCurrency(price)}</p>
      <p className={`mt-1 text-xs ${tone}`}>{changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%</p>
      <p className="mt-1 text-[10px] text-[var(--muted)]">
        {status === "live" ? `Streaming · ${formatTime(updatedAt)}` : status === "connecting" ? "Connecting…" : "Stored-price fallback"}
      </p>
    </div>
  );
}

function formatCurrency(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function formatTime(value: string | null) {
  if (!value) return "now";
  return new Intl.DateTimeFormat("en-IN", { timeStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(value));
}
