import { HistoricalExperimentWorkspace } from "@/components/research/historical-experiment-workspace";

export const dynamic = "force-dynamic";

export default function ScreenerPage() {
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

        <HistoricalExperimentWorkspace />
      </div>
    </section>
  );
}
