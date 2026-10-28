import Link from "next/link";

import { createWatchlistAction } from "@/app/watchlists/actions";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/db/prisma";
import { listWatchlists } from "@/lib/watchlists/service";

export const dynamic = "force-dynamic";

export default async function WatchlistsPage() {
  const watchlists = await listWatchlists(prisma);
  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">DAILY MONITORING</p>
          <h1 className="mt-2 text-3xl font-semibold">Watchlists</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Keep separate lists for different ideas. A stock can appear in several watchlists with different notes, support zones and alert distances.
          </p>
        </div>

        <form action={createWatchlistAction} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm sm:grid-cols-[minmax(180px,0.8fr)_minmax(260px,1.5fr)_auto] sm:items-end" id="new-watchlist">
          <label className="grid gap-2 text-sm font-medium">Name<input className="h-11 rounded-md border border-[var(--border)] px-3" maxLength={80} name="name" placeholder="Swing – Near Support" required /></label>
          <label className="grid gap-2 text-sm font-medium">Description<input className="h-11 rounded-md border border-[var(--border)] px-3" maxLength={300} name="description" placeholder="Optional purpose or rules for this list" /></label>
          <button className="h-11 rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white" type="submit">Create Watchlist</button>
        </form>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {watchlists.map((watchlist) => (
            <Link className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5 transition hover:border-[var(--accent)]" href={`/watchlists/${watchlist.id}`} key={watchlist.id}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{watchlist.name}</h2>
                <span className="rounded-md bg-[var(--panel-soft)] px-2 py-1 text-xs font-semibold">{watchlist._count.items} stocks</span>
              </div>
              <p className="mt-2 min-h-10 text-sm text-[var(--muted)]">{watchlist.description ?? "No description."}</p>
              <p className="mt-4 text-xs text-[var(--muted)]">{watchlist.items.length} actively watching</p>
            </Link>
          ))}
        </div>
        {watchlists.length === 0 ? <EmptyState action={{ href: "#new-watchlist", label: "Create a watchlist" }} secondaryAction={{ href: "/finding-momentum", label: "Browse momentum leaders" }} title="Build your first monitoring list" description="Create a list for a thesis such as breakout retests or sector leaders, then add stocks from Discover or any chart." icon="◎" /> : null}
      </div>
    </section>
  );
}
