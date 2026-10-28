"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useLiveQuotes } from "@/lib/market-data/use-live-quotes";
import type { ProviderIndexInstrument } from "@/lib/market-data/types";

const pageSize = 24;
const popularNseOrder = [
  "NSE_INDEX|Nifty 50", "NSE_INDEX|Nifty Bank", "NSE_INDEX|Nifty Next 50", "NSE_INDEX|Nifty 100",
  "NSE_INDEX|Nifty 200", "NSE_INDEX|Nifty 500", "NSE_INDEX|NIFTY MIDCAP 100", "NSE_INDEX|NIFTY MIDCAP 150",
  "NSE_INDEX|NIFTY SMLCAP 100", "NSE_INDEX|NIFTY SMLCAP 250", "NSE_INDEX|NIFTY TOTAL MKT", "NSE_INDEX|India VIX",
];

export function MarketIndexBrowser({ activeInstrumentKey, indices }: {
  readonly activeInstrumentKey: string;
  readonly indices: readonly ProviderIndexInstrument[];
}) {
  const active = indices.find((index) => index.instrumentKey === activeInstrumentKey);
  const [market, setMarket] = useState<"NSE" | "GLOBAL">(active?.exchange ?? "NSE");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const sortedIndices = useMemo(() => sortIndices(indices), [indices]);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-IN");
    return sortedIndices.filter((index) => index.exchange === market && (!needle || `${index.name} ${index.tradingSymbol} ${index.country ?? ""}`.toLocaleLowerCase("en-IN").includes(needle)));
  }, [market, query, sortedIndices]);
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = matches.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const liveFeed = useLiveQuotes(visible.map((index) => index.instrumentKey));

  return (
    <section className="space-y-4 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Market indices</p>
          <h2 className="mt-1 text-xl font-semibold">Choose an index to chart</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Every index comes from Upstox’s current instrument master. Select one to load its chart and constituent stocks above.</p>
        </div>
        <span className={`text-xs font-medium ${liveFeed.status === "live" ? "text-emerald-700" : "text-amber-700"}`}>
          {liveFeed.status === "live" ? "Live prices" : "Connecting to live prices"}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <MarketButton active={market === "NSE"} label={`India (${indices.filter((index) => index.exchange === "NSE").length})`} onClick={() => { setMarket("NSE"); setPage(1); }} />
        <MarketButton active={market === "GLOBAL"} label={`Global (${indices.filter((index) => index.exchange === "GLOBAL").length})`} onClick={() => { setMarket("GLOBAL"); setPage(1); }} />
        <input
          aria-label="Search market indices"
          className="h-9 min-w-52 flex-1 rounded-md border border-[var(--border)] bg-white px-3 text-sm"
          onChange={(event) => { setQuery(event.target.value); setPage(1); }}
          placeholder="Search indices"
          type="search"
          value={query}
        />
      </div>

      {visible.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((index) => {
            const quote = liveFeed.quotes[index.instrumentKey];
            const change = quote && quote.previousClose && quote.previousClose > 0
              ? ((quote.lastPrice - quote.previousClose) / quote.previousClose) * 100
              : null;
            const isActive = index.instrumentKey === activeInstrumentKey;
            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`rounded-md border p-3 transition-colors hover:border-[var(--accent)] hover:bg-[var(--panel-soft)] ${isActive ? "border-[var(--accent)] bg-emerald-50" : "border-[var(--border)] bg-white"}`}
                href={`/charts?index=${encodeURIComponent(index.instrumentKey)}`}
                key={index.instrumentKey}
                scroll
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{index.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{index.exchange === "GLOBAL" ? index.country : index.tradingSymbol}</p>
                  </div>
                  {isActive ? <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-white">OPEN</span> : null}
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">{quote ? formatIndexValue(quote.lastPrice) : "—"}</span>
                  <span className={`text-xs font-semibold ${change === null ? "text-[var(--muted)]" : change >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {change === null ? "Waiting" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
                  </span>
                </div>
                {index.latency ? <p className="mt-1 text-[10px] text-[var(--muted)]">Provider delay: {index.latency}</p> : null}
              </Link>
            );
          })}
        </div>
      ) : <p className="rounded-md border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">No indices match this search.</p>}

      <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
        <span>{matches.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, matches.length)} of {matches.length}</span>
        <div className="flex items-center gap-2">
          <button className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 disabled:opacity-40" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button>
          <span>Page {currentPage} of {pageCount}</span>
          <button className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 disabled:opacity-40" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} type="button">Next</button>
        </div>
      </div>
    </section>
  );
}

function sortIndices(indices: readonly ProviderIndexInstrument[]) {
  const priority = new Map(popularNseOrder.map((key, position) => [key, position]));
  return [...indices].sort((left, right) => {
    if (left.exchange !== right.exchange) return left.exchange === "NSE" ? -1 : 1;
    const leftPriority = priority.get(left.instrumentKey) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = priority.get(right.instrumentKey) ?? Number.MAX_SAFE_INTEGER;
    return leftPriority - rightPriority || left.name.localeCompare(right.name);
  });
}

function MarketButton({ active, label, onClick }: { readonly active: boolean; readonly label: string; readonly onClick: () => void }) {
  return <button className={`h-9 rounded-md border px-4 text-xs font-semibold ${active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] bg-white"}`} onClick={onClick} type="button">{label}</button>;
}

function formatIndexValue(value: number) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
