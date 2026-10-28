import { BuyingPlanWorkspace } from "@/components/portfolio/buying-plan-workspace";

export default function BuyingPlanPage() {
  return <section className="px-4 py-5 sm:px-6 lg:px-10"><div className="max-w-7xl space-y-6"><header><p className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">Before you buy</p><h1 className="mt-2 text-3xl font-semibold">Rule-based Buying Plan</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">Turn available capital into predefined entry, sizing, review, and exit decisions. A long holding period is never a substitute for a valid thesis.</p></header><BuyingPlanWorkspace /></div></section>;
}
