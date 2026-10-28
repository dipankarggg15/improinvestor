import Link from "next/link";
import { notFound } from "next/navigation";

import { deleteWatchlistAction, removeWatchlistItemAction, updateWatchlistAction, updateWatchlistItemAction } from "@/app/watchlists/actions";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { StockChartLink } from "@/components/stocks/stock-chart-link";
import { WatchlistMonitor } from "@/components/watchlists/watchlist-monitor";
import { prisma } from "@/lib/db/prisma";
import { getWatchlist } from "@/lib/watchlists/service";

export const dynamic = "force-dynamic";

export default async function WatchlistPage({ params }: { readonly params: Promise<{ readonly id: string }> }) {
  const { id } = await params;
  const watchlist = await getWatchlist(prisma, id);
  if (!watchlist) notFound();
  const updateWatchlist = updateWatchlistAction.bind(null, id);
  const deleteWatchlist = deleteWatchlistAction.bind(null, id);

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link className="text-sm font-medium text-[var(--accent)] hover:underline" href="/watchlists">← All watchlists</Link>
            <h1 className="mt-2 text-3xl font-semibold">{watchlist.name}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{watchlist.description ?? "Daily monitoring list"}</p>
          </div>
          <form action={deleteWatchlist}>
            <ConfirmSubmitButton className="h-10 rounded-md border border-red-300 px-4 text-sm font-semibold text-red-700" confirmMessage={`Delete ${watchlist.name} and all of its saved levels?`} pendingLabel="Deleting…">Delete list</ConfirmSubmitButton>
          </form>
        </div>

        <WatchlistMonitor rows={watchlist.rows} watchlistId={watchlist.id} />

        <details className="rounded-md border border-[var(--border)] bg-[var(--panel)]">
          <summary className="cursor-pointer px-4 py-4 text-lg font-semibold">Rename or describe this watchlist</summary>
          <form action={updateWatchlist} className="grid gap-3 border-t border-[var(--border)] p-4 sm:grid-cols-[minmax(180px,0.8fr)_minmax(260px,1.5fr)_auto] sm:items-end">
            <label className="grid gap-2 text-sm font-medium">Name<input className="h-11 rounded-md border border-[var(--border)] px-3" defaultValue={watchlist.name} maxLength={80} name="name" required /></label>
            <label className="grid gap-2 text-sm font-medium">Description<input className="h-11 rounded-md border border-[var(--border)] px-3" defaultValue={watchlist.description ?? ""} maxLength={300} name="description" /></label>
            <button className="h-11 rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white" type="submit">Save list</button>
          </form>
        </details>

        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Review and edit levels</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Manual support overrides automatically detected or previously saved support for this watchlist only.</p>
          </div>
          {watchlist.rows.map((row) => {
            const updateItem = updateWatchlistItemAction.bind(null, watchlist.id, row.itemId);
            const removeItem = removeWatchlistItemAction.bind(null, watchlist.id, row.itemId);
            return (
              <details className="rounded-md border border-[var(--border)] bg-[var(--panel)]" key={row.itemId}>
                <summary className="cursor-pointer px-4 py-4 font-semibold">{row.company} <span className="ml-2 text-sm font-normal text-[var(--muted)]">{row.exchange}:{row.symbol} · {row.proximityStatus.replace("_", " ")}</span></summary>
                <div className="border-t border-[var(--border)] p-4">
                  <form action={updateItem} className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <label className="grid gap-2 text-sm font-medium">Support low<input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={row.manualSupportLow ?? ""} min="0.01" name="manualSupportLow" step="0.01" type="number" /></label>
                    <label className="grid gap-2 text-sm font-medium">Support high<input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={row.manualSupportHigh ?? ""} min="0.01" name="manualSupportHigh" step="0.01" type="number" /></label>
                    <label className="grid gap-2 text-sm font-medium">Alert distance %<input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={row.alertDistancePercent} max="20" min="0.1" name="alertDistancePercent" step="0.1" type="number" /></label>
                    <label className="grid gap-2 text-sm font-medium">Lifecycle<select className="h-10 rounded-md border border-[var(--border)] bg-white px-3" defaultValue={row.state} name="state"><option value="WATCHING">Watching</option><option value="BOUGHT">Bought</option><option value="ARCHIVED">Archived</option></select></label>
                    <label className="grid gap-2 text-sm font-medium md:col-span-2">Notes<input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={row.notes ?? ""} maxLength={1000} name="notes" placeholder="Why this level matters, invalidation, plan…" /></label>
                    <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-6">
                      <button className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white" type="submit">Save review</button>
                      <StockChartLink className="grid h-10 place-items-center rounded-md border border-[var(--border)] px-4 text-sm font-semibold" exchange={row.exchange} symbol={row.symbol}>Open chart</StockChartLink>
                    </div>
                  </form>
                  <form action={removeItem} className="mt-3">
                    <ConfirmSubmitButton className="text-xs font-semibold text-red-700 hover:underline" confirmMessage={`Remove ${row.symbol} from ${watchlist.name}?`} pendingLabel="Removing…">Remove from this watchlist</ConfirmSubmitButton>
                  </form>
                </div>
              </details>
            );
          })}
          {watchlist.rows.length === 0 ? <p className="rounded-md border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">No stocks yet. Add candidates from Swing Setups, Finding Momentum or Charts.</p> : null}
        </div>
      </div>
    </section>
  );
}
