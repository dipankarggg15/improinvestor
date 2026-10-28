import Link from "next/link";

import { addStockToWatchlistAction } from "@/app/watchlists/actions";

type WatchlistOption = { readonly id: string; readonly name: string };

export function AddToWatchlist({
  exchange,
  symbol,
  source,
  watchlists,
  supportLow,
  supportHigh,
  detectedAt,
  compact = false,
}: {
  readonly exchange: "NSE" | "BSE";
  readonly symbol: string;
  readonly source: string;
  readonly watchlists: readonly WatchlistOption[];
  readonly supportLow?: number | null;
  readonly supportHigh?: number | null;
  readonly detectedAt?: string | null;
  readonly compact?: boolean;
}) {
  if (watchlists.length === 0) {
    return <Link className="text-xs font-semibold text-[var(--accent)] hover:underline" href="/watchlists">Create watchlist</Link>;
  }
  const action = addStockToWatchlistAction.bind(null, exchange, symbol, source);
  return (
    <form action={action} className={`flex ${compact ? "min-w-48" : "min-w-64"} items-center gap-2`}>
      <select aria-label={`Watchlist for ${symbol}`} className="h-9 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-2 text-xs" name="watchlistId">
        {watchlists.map((watchlist) => <option key={watchlist.id} value={watchlist.id}>{watchlist.name}</option>)}
      </select>
      {supportLow ? <input name="supportLow" type="hidden" value={supportLow} /> : null}
      {supportHigh ? <input name="supportHigh" type="hidden" value={supportHigh} /> : null}
      {detectedAt ? <input name="detectedAt" type="hidden" value={detectedAt} /> : null}
      <button className="h-9 rounded-md border border-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--panel-soft)]" type="submit">Add</button>
    </form>
  );
}
