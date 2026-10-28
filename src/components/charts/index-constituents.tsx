"use client";

import { useMemo, useState } from "react";

import { StockChartLink } from "@/components/stocks/stock-chart-link";
import type { IndexConstituentResult } from "@/lib/market-data/index-constituents";
import type { IndexConstituentWithMarketData } from "@/lib/market-data/index-constituent-market";
import { formatCurrency } from "@/lib/ui/format";

const pageSize = 50;

type IndexConstituentMarketResult =
  | { readonly status: "available"; readonly sourceUrl: string; readonly stocks: readonly IndexConstituentWithMarketData[] }
  | Extract<IndexConstituentResult, { readonly status: "not-applicable" | "unavailable" }>;

export function IndexConstituents({ indexName, result }: {
  readonly indexName: string;
  readonly result: IndexConstituentMarketResult;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-IN");
    if (!needle) return result.stocks;
    return result.stocks.filter((stock) => `${stock.companyName} ${stock.symbol} ${stock.industry ?? ""}`.toLocaleLowerCase("en-IN").includes(needle));
  }, [query, result.stocks]);
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = matches.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const hasWeights = result.stocks.some((stock) => stock.weightPercent !== null);

  return (
    <section className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Index constituents</p>
          <h2 className="mt-1 text-xl font-semibold">Stocks in {indexName}{result.status === "available" ? ` (${result.stocks.length})` : ""}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {result.status === "available" ? "Current NSE constituents with latest stored close and trading-session P/L. Open any stock to inspect its chart." : result.message}
          </p>
        </div>
        {result.status === "available" ? <a className="text-xs font-semibold text-[var(--accent)] hover:underline" href={result.sourceUrl} rel="noreferrer" target="_blank">Official constituent CSV ↗</a> : null}
      </div>

      {result.status === "available" ? (
        <>
          <input
            aria-label={`Search stocks in ${indexName}`}
            className="mt-4 h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm sm:max-w-sm"
            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            placeholder="Search company, symbol, or industry"
            type="search"
            value={query}
          />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr><th className="py-2 pr-3">#</th><th className="py-2 pr-3">Stock</th><th className="py-2 pr-3">Price</th><th className="py-2 pr-3">1D P/L</th><th className="py-2 pr-3">1M P/L</th><th className="py-2 pr-3">3M P/L</th><th className="py-2 pr-3">Industry</th>{hasWeights ? <th className="py-2 text-right">Weight</th> : null}</tr>
              </thead>
              <tbody>{visible.map((stock, index) => (
                <tr className="border-t border-[var(--border)]" key={`${stock.symbol}:${stock.isin ?? index}`}>
                  <td className="py-3 pr-3 text-[var(--muted)]">{(currentPage - 1) * pageSize + index + 1}</td>
                  <td className="py-3 pr-3">
                    <StockChartLink className="font-semibold text-[var(--accent)] hover:underline" exchange="NSE" symbol={stock.symbol}>{stock.companyName}</StockChartLink>
                    <span className="block text-xs text-[var(--muted)]">{stock.symbol}{stock.priceDate ? ` · ${stock.priceDate}` : ""}</span>
                  </td>
                  <td className="py-3 pr-3 font-mono">{stock.lastPrice !== null ? formatCurrency(stock.lastPrice) : "—"}</td>
                  <ReturnCell value={stock.return1D} />
                  <ReturnCell value={stock.return1M} />
                  <ReturnCell value={stock.return3M} />
                  <td className="py-3 pr-3">{stock.industry ?? "—"}</td>
                  {hasWeights ? <td className="py-3 text-right font-mono">{stock.weightPercent === null ? "—" : `${stock.weightPercent.toFixed(2)}%`}</td> : null}
                </tr>
              ))}</tbody>
            </table>
          </div>
          {visible.length === 0 ? <p className="mt-4 rounded-md border border-dashed border-[var(--border)] p-5 text-center text-sm text-[var(--muted)]">No constituents match this search.</p> : null}
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
            <span>{matches.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, matches.length)} of {matches.length}</span>
            {pageCount > 1 ? <div className="flex items-center gap-2"><button className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 disabled:opacity-40" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button><span>Page {currentPage} of {pageCount}</span><button className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 disabled:opacity-40" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} type="button">Next</button></div> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function ReturnCell({ value }: { readonly value: number | null }) {
  return <td className={`py-3 pr-3 font-mono font-semibold ${value === null ? "text-[var(--muted)]" : value >= 0 ? "text-emerald-700" : "text-red-700"}`}>{value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`}</td>;
}
