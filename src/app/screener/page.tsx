import { HistoricalExperimentWorkspace } from "@/components/research/historical-experiment-workspace";
import { HistoricalExperimentRepository } from "@/lib/research/historical-experiment";

export const dynamic = "force-dynamic";

export default async function ScreenerPage() {
  const repository = new HistoricalExperimentRepository();
  const latestMarketDate = await repository.getLatestRealMarketDate();

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-7xl">
        <div className="mb-6 flex flex-col gap-2">
          <p className="text-sm font-medium text-[var(--accent)]">REAL MARKET DATA</p>
          <h1 className="text-3xl font-semibold text-[var(--foreground)]">Research Screener</h1>
          <p className="max-w-full min-w-0 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Find stocks from stored UPSTOX_REAL history, select any set, then measure their later returns.
          </p>
        </div>

        <ol aria-label="Research workflow" className="mb-5 grid gap-2 sm:grid-cols-3">
          {[
            ["1", "Configure", "Choose dates, liquidity and ranking"],
            ["2", "Select", "Add candidates to the return set"],
            ["3", "Measure", "Calculate, compare and save results"],
          ].map(([number, title, detail]) => <li className="flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3" key={number}><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--panel-soft)] text-xs font-semibold text-[var(--accent)]">{number}</span><span><strong className="block text-sm">{title}</strong><span className="mt-0.5 block text-xs text-[var(--muted)]">{detail}</span></span></li>)}
        </ol>

        <HistoricalExperimentWorkspace latestMarketDate={latestMarketDate} />
      </div>
    </section>
  );
}
