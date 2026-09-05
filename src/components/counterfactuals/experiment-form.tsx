"use client";

import { useMemo, useState } from "react";

import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";

type StrategyOption = {
  readonly id: string;
  readonly name: string;
  readonly versions: readonly {
    readonly id: string;
    readonly versionNumber: number;
  }[];
};

export function CounterfactualExperimentForm({
  action,
  strategies,
}: {
  readonly action: (formData: FormData) => void | Promise<void>;
  readonly strategies: readonly StrategyOption[];
}) {
  const [strategyId, setStrategyId] = useState(strategies[0]?.id ?? "");
  const selectedStrategy = useMemo(
    () => strategies.find((strategy) => strategy.id === strategyId) ?? strategies[0],
    [strategies, strategyId],
  );

  return (
    <form action={action} className="grid gap-4 rounded-md border border-[var(--border)] bg-[var(--panel)] p-5 md:grid-cols-2 xl:grid-cols-4">
      <label className="grid gap-2 text-sm font-medium">
        Strategy
        <select
          className="h-10 rounded-md border border-[var(--border)] px-3"
          name="strategyId"
          onChange={(event) => setStrategyId(event.target.value)}
          value={strategyId}
        >
          {strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Strategy Version
        <select className="h-10 rounded-md border border-[var(--border)] px-3" name="strategyVersionId">
          {selectedStrategy?.versions.map((version) => (
            <option key={version.id} value={version.id}>{selectedStrategy.name} V{version.versionNumber}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Start Date
        <input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue="2025-03-31" name="startDate" type="date" />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        End Date
        <input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue="2025-12-31" name="endDate" type="date" />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Parameter
        <select className="h-10 rounded-md border border-[var(--border)] px-3" name="parameter">
          <option value="momentum.holdingRankThreshold">Momentum Holding Rank Threshold</option>
          <option value="momentum.minReturn3M">Momentum Entry 3M Return</option>
          <option value="early.phase2RankThreshold">Early Phase 2 Rank Threshold</option>
          <option value="early.phase1RankThreshold">Early Phase 1 Rank Threshold</option>
          <option value="early.emergencyStopPercent">Early Emergency Stop %</option>
          <option value="early.phase1DurationDays">Early Phase 1 Duration Days</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Variant Values
        <input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue="20,40,50" name="values" />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Initial Capital
        <input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue="1000000" min="1" name="initialCapital" step="0.01" type="number" />
      </label>
      <ConfirmSubmitButton
        className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 xl:self-end"
        confirmMessage="Run and persist this counterfactual experiment with the selected synthetic market period?"
        pendingLabel="Running..."
      >
        Run Experiment
      </ConfirmSubmitButton>
    </form>
  );
}
