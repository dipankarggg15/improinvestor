export type StrategyVersionPresentation = {
  readonly label: string;
  readonly summary: string | null;
};

export const nseMomentumVersionMetadata = {
  1: {
    label: "1M/3M Vol-Adjusted · Top 20 · Hold Top 50",
    notes:
      "Ranks the broad NSE universe by equal-weighted cross-sectional z-scores of volatility-adjusted 1M and 3M returns. It buys 20 stocks, reviews monthly, retains holdings ranked inside the Top 50, and funds replacements only from that review's sale proceeds.",
  },
  2: {
    label: "1M/3M Vol-Adjusted · Top 20 · 5%/50% Strength Gate",
    notes:
      "Uses the V1 ranking and Top 50 monthly retention rule, but initial buys and monthly replacements must have 1M return at least 5% and 3M return at least 50%. New positions are capped at 5% of portfolio value, and accumulated cash may be redeployed.",
  },
  3: {
    label: "6M/12M Vol-Adjusted · Top 25 · Hold Top 50 · Broad NSE",
    notes:
      "Ranks the broad NSE universe by equal-weighted cross-sectional z-scores of volatility-adjusted 6M and 12M returns. It buys from the Top 25, holds at most 25 stocks, retains holdings inside the Top 50, removes V2's absolute return gate, caps new positions at 5%, and may redeploy accumulated cash.",
  },
  4: {
    label: "6M/12M Vol-Adjusted · Top 25 · Hold Top 50 · INE Equities",
    notes:
      "Uses V3's 6M/12M ranking, Top 25 entry, Top 50 monthly retention, 5% new-position cap, and cash redeployment, but restricts the universe to active NSE INE ordinary equities and excludes identifiable funds, indices, debt, preference shares, InvITs, REITs, and other non-ordinary-equity instruments.",
  },
} as const satisfies Record<number, { readonly label: string; readonly notes: string }>;

export function strategyVersionPresentation(input: {
  readonly strategyName: string;
  readonly versionNumber: number;
  readonly storedLabel?: string | null;
  readonly storedNotes?: string | null;
}): StrategyVersionPresentation {
  if (input.strategyName === "NSE Momentum") {
    const metadata = nseMomentumVersionMetadata[input.versionNumber as keyof typeof nseMomentumVersionMetadata];
    if (metadata) return { label: metadata.label, summary: metadata.notes };
  }

  return {
    label: normalizedStoredLabel(input.storedLabel, input.versionNumber) ?? `Version ${input.versionNumber}`,
    summary: input.storedNotes ?? null,
  };
}

export function strategyVersionDisplayName(input: Parameters<typeof strategyVersionPresentation>[0]) {
  const presentation = strategyVersionPresentation(input);
  return `V${input.versionNumber} · ${presentation.label}`;
}

function normalizedStoredLabel(label: string | null | undefined, versionNumber: number) {
  const normalized = label
    ?.trim()
    .replace(new RegExp(`^V${versionNumber}\\s*(?:[-–—:·]|\\s)\\s*`, "i"), "")
    .trim();
  return normalized || null;
}
