import Link from "next/link";

import { SectorRankingTable } from "@/components/sectors/sector-ranking-table";
import { prisma } from "@/lib/db/prisma";
import { getSectorDashboard, parseSectorDate, parseSectorUniverse, type SectorUniverse } from "@/lib/sectors/service";
import { formatDisplayDate } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function SectorsPage({ searchParams }: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const universe = parseSectorUniverse(query.universe);
  const result = await getSectorDashboard({ client: prisma, requestedDate: parseSectorDate(query.date), universe });
  const leaders = result.sectors.filter((sector) => sector.state === "LEADING").length;
  const improving = result.sectors.filter((sector) => sector.state === "IMPROVING").length;

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">{universe === "market" ? "WHOLE NSE MARKET" : "NIFTY 500"} · SECTOR ROTATION</p>
          <h1 className="mt-2 text-3xl font-semibold">Sectors</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--muted)]">Find where strength is broad and persistent. Status and ranking use only the selected universe’s returns, breadth and participation; NIFTY 50 is shown only as a reference.</p>
        </div>

        <UniverseTabs date={result.priceDateUsed ?? result.requestedDate} selected={universe} />

        <form className="flex flex-wrap items-end gap-3 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
          <input name="universe" type="hidden" value={universe} />
          <label className="grid gap-2 text-sm font-medium">As Of Date<input className="h-11 rounded-md border border-[var(--border)] px-3" defaultValue={result.requestedDate} name="date" type="date" /></label>
          <button className="h-11 rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white" type="submit">View sectors</button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Price Date" value={result.priceDateUsed ? formatDisplayDate(result.priceDateUsed) : "-"} />
          <Stat label="Classified Companies" value={result.classifiedCompanies.toLocaleString("en-IN")} />
          <Stat label="Leading Sectors" value={`${leaders}`} />
          <Stat label="Improving Sectors" value={`${improving}`} />
        </div>

        <SectorRotationMap date={result.priceDateUsed ?? result.requestedDate} sectors={result.sectors} universe={universe} />

        {result.priceDateUsed && result.priceDateUsed !== result.requestedDate ? <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{result.requestedDate} was not a trading session. The dashboard uses {result.priceDateUsed}.</p> : null}
        {result.benchmarkReturn1M === null ? <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">NIFTY 50 history is temporarily unavailable. Sector returns and breadth remain valid; relative-return fields are left blank.</p> : null}

        <div className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--panel)]">
          <div className="border-b border-[var(--border)] p-4"><h2 className="text-lg font-semibold">Sector ranking</h2><p className="mt-1 text-sm text-[var(--muted)]">One-day movement contributes only a small participation signal; sustained sector returns and breadth carry more weight. NIFTY comparison does not affect the score.</p></div>
          <SectorRankingTable date={result.priceDateUsed ?? result.requestedDate} sectors={result.sectors} universe={universe} />
          {result.sectors.length === 0 ? <p className="p-5 text-sm text-[var(--muted)]">No classified companies have prices for this date. Run the sector-classification sync first.</p> : null}
        </div>

        <details className="rounded-md border border-[var(--border)] bg-[var(--panel)]"><summary className="cursor-pointer p-4 font-semibold">How sector states are assigned</summary><div className="grid gap-3 border-t border-[var(--border)] p-4 text-sm leading-6 text-[var(--muted)] sm:grid-cols-2"><p><strong className="text-[var(--foreground)]">Leading / Improving:</strong> the sector has positive or strengthening returns supported by broad participation across its own constituents.</p><p><strong className="text-[var(--foreground)]">Weakening / Lagging:</strong> sector returns or participation are deteriorating. NIFTY 50 is reference context only and never changes these states.</p></div></details>
      </div>
    </section>
  );
}

function SectorRotationMap({ date, sectors, universe }: { readonly date: string; readonly sectors: Awaited<ReturnType<typeof getSectorDashboard>>["sectors"]; readonly universe: SectorUniverse }) {
  const quadrants = [
    { state: "LEADING", label: "Leading", detail: "Strong returns with broad participation", tone: "border-emerald-200 bg-emerald-50/60" },
    { state: "IMPROVING", label: "Improving", detail: "Participation and returns are strengthening", tone: "border-sky-200 bg-sky-50/60" },
    { state: "WEAKENING", label: "Weakening", detail: "Positive structure is losing momentum", tone: "border-amber-200 bg-amber-50/60" },
    { state: "LAGGING", label: "Lagging", detail: "Returns or participation remain weak", tone: "border-red-200 bg-red-50/60" },
  ] as const;
  return <section aria-labelledby="rotation-map-title" className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm sm:p-5">
    <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Rotation map</p><h2 className="mt-1 text-lg font-semibold" id="rotation-map-title">Where sectors sit now</h2></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {quadrants.map((quadrant) => {
        const matches = sectors.filter((sector) => sector.state === quadrant.state).slice(0, 4);
        const count = sectors.filter((sector) => sector.state === quadrant.state).length;
        return <div className={`rounded-lg border p-4 ${quadrant.tone}`} key={quadrant.state}>
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{quadrant.label}</h3><p className="mt-1 text-xs text-[var(--muted)]">{quadrant.detail}</p></div><span className="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold">{count}</span></div>
          <div className="mt-3 flex flex-wrap gap-2">{matches.length ? matches.map((sector) => <Link className="rounded-full border border-black/10 bg-white/80 px-2.5 py-1 text-xs font-medium hover:underline" href={`/sectors/${sector.slug}?date=${date}&universe=${universe}`} key={sector.slug}>{sector.name}</Link>) : <span className="text-xs text-[var(--muted)]">No sectors in this state</span>}</div>
        </div>;
      })}
    </div>
  </section>;
}

function UniverseTabs({ date, selected }: { readonly date: string; readonly selected: SectorUniverse }) {
  const tabs: readonly { readonly value: SectorUniverse; readonly label: string; readonly description: string }[] = [
    { value: "market", label: "Whole Market", description: "All classified NSE stocks" },
    { value: "nifty500", label: "Nifty 500", description: "Official Nifty 500 constituents" },
  ];
  return <nav aria-label="Sector universe" className="grid gap-3 sm:grid-cols-2">{tabs.map((tab) => <Link className={`rounded-md border p-4 transition ${selected === tab.value ? "border-[var(--accent)] bg-[var(--panel)] shadow-sm" : "border-[var(--border)] bg-[var(--panel-soft)] hover:border-[var(--accent)]"}`} href={`/sectors?date=${date}&universe=${tab.value}`} key={tab.value}><span className="block font-semibold">{tab.label}</span><span className="mt-1 block text-xs text-[var(--muted)]">{tab.description}</span></Link>)}</nav>;
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4"><p className="text-xs uppercase text-[var(--muted)]">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>;
}
