"use client";

import { useMemo, useState } from "react";

import { calculateBuyingPlan } from "@/lib/investing/buying-plan";
import { formatCurrency } from "@/lib/ui/format";

export function BuyingPlanWorkspace() {
  const [capital, setCapital] = useState(100_000);
  const [reservePercent, setReservePercent] = useState(20);
  const [maxPositions, setMaxPositions] = useState(8);
  const [riskPercent, setRiskPercent] = useState(1);
  const [plannedExitPercent, setPlannedExitPercent] = useState(12);
  const plan = useMemo(() => calculateBuyingPlan({
    capital,
    reservePercent,
    maxPositions,
    riskPerPositionPercent: riskPercent,
    plannedExitPercent,
  }), [capital, maxPositions, plannedExitPercent, reservePercent, riskPercent]);

  return <div className="space-y-6">
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <NumberField label="Investable capital" min={0} step={1000} value={capital} onChange={setCapital} />
        <NumberField label="Cash reserve %" min={0} max={100} value={reservePercent} onChange={setReservePercent} />
        <NumberField label="Maximum stocks" min={1} max={30} value={maxPositions} onChange={setMaxPositions} />
        <NumberField label="Risk per stock %" min={0.1} max={10} step={0.1} value={riskPercent} onChange={setRiskPercent} />
        <NumberField label="Planned exit distance %" min={1} max={50} value={plannedExitPercent} onChange={setPlannedExitPercent} />
      </div>
      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">Use only debt-free investable money after keeping emergency needs outside this amount. The exit distance is a sizing assumption—not an automatic instruction to sell solely because price falls.</p>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Position cap" value={formatCurrency(plan.positionCap)} detail="Lower of equal-weight and risk-based size" />
      <Metric label="Maximum planned investment" value={formatCurrency(plan.plannedInvestment)} detail={`Across up to ${maxPositions} stocks`} />
      <Metric label="Cash left" value={formatCurrency(plan.unallocatedCash)} detail="Reserve plus unused risk capacity" />
      <Metric label="Maximum planned loss / stock" value={formatCurrency(plan.riskBudgetPerPosition)} detail={`${riskPercent}% of starting capital`} />
    </section>

    <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Staged entry</p>
        <h2 className="mt-2 text-xl font-semibold">Do not buy the full position at once</h2>
        <div className="mt-5 space-y-3">
          <Tranche number="1" amount={plan.tranches[0] ?? 0} title="40% · Qualification" text="Buy only when the stock passes the selected strategy and the thesis is written down." />
          <Tranche number="2" amount={plan.tranches[1] ?? 0} title="30% · Confirmation" text="Add at the next planned review only if the thesis and ranking remain valid—not merely because price is lower." />
          <Tranche number="3" amount={plan.tranches[2] ?? 0} title="30% · Strength" text="Complete the position only after continued strength or a confirmed setup. Otherwise keep the cash." />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Decision rules</p>
        <h2 className="mt-2 text-xl font-semibold">What to do after buying</h2>
        <div className="mt-5 grid gap-3">
          <Rule tone="neutral" title="Price falls, thesis unchanged" text="Do not average down automatically. Hold the current tranche and reassess on the scheduled review date." />
          <Rule tone="warning" title="Strategy signal weakens" text="Stop further tranches. At the monthly review, follow the strategy’s retention or replacement rule." />
          <Rule tone="danger" title="Fundamental thesis breaks" text="Cancel every pending tranche and plan an exit at the next tradable opportunity. Examples: governance failure, material debt deterioration, or the original business thesis becoming false." />
          <Rule tone="success" title="Price rises and thesis strengthens" text="Add only through the remaining planned tranches. Never exceed the position cap just because the stock is winning." />
        </div>
      </div>
    </section>
  </div>;
}

function NumberField({ label, max, min, onChange, step = 1, value }: { readonly label: string; readonly min: number; readonly max?: number; readonly step?: number; readonly value: number; readonly onChange: (value: number) => void }) {
  return <label className="grid gap-2 text-sm font-medium">{label}<input className="h-11 rounded-md border border-[var(--border)] bg-[var(--panel-raised)] px-3" max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} type="number" value={value} /></label>;
}

function Metric({ detail, label, value }: { readonly detail: string; readonly label: string; readonly value: string }) {
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4"><p className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</p><p className="metric-value mt-2 text-xl font-semibold">{value}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{detail}</p></div>;
}

function Tranche({ amount, number, text, title }: { readonly amount: number; readonly number: string; readonly text: string; readonly title: string }) {
  return <article className="rounded-lg border border-[var(--border)] bg-[var(--panel-raised)] p-4"><div className="flex items-center justify-between gap-3"><strong>{number}. {title}</strong><span className="metric-value font-semibold">{formatCurrency(amount)}</span></div><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{text}</p></article>;
}

function Rule({ text, title, tone }: { readonly text: string; readonly title: string; readonly tone: "neutral" | "warning" | "danger" | "success" }) {
  const styles = { neutral: "border-slate-200 bg-slate-50", warning: "border-amber-200 bg-amber-50", danger: "border-red-200 bg-red-50", success: "border-emerald-200 bg-emerald-50" };
  return <article className={`rounded-lg border p-4 ${styles[tone]}`}><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-700">{text}</p></article>;
}
