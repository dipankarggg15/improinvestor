export const swingFilterGroups = [
  {
    value: "breakout-retest",
    label: "Breakout Retest",
    description: "Strong-trend stocks retesting a recent breakout area near their highs.",
    configured: true,
  },
  {
    value: "breakout-retest-momentum",
    label: "Breakout Retest + Z-Score",
    description: "Breakout Retest setups confirmed by a volatility-adjusted 1M and 3M relative-momentum Z-score of at least +0.50.",
    configured: true,
  },
  {
    value: "established-support",
    label: "52-Week Low Support",
    description: "Stocks testing an established support zone near their rolling one-year low, ranked by previous rebound quality.",
    configured: true,
  },
  {
    value: "early-momentum",
    label: "Early Momentum",
    description: "Stocks within the selected range of a 52-week high, with meaningful headroom to an older five-year high.",
    configured: true,
  },
] as const;

export type SwingFilterGroupValue = (typeof swingFilterGroups)[number]["value"];

export function parseSwingFilterGroup(value: unknown): SwingFilterGroupValue {
  return swingFilterGroups.some((group) => group.value === value)
    ? value as SwingFilterGroupValue
    : "breakout-retest";
}

export function getSwingFilterGroup(value: SwingFilterGroupValue) {
  return swingFilterGroups.find((group) => group.value === value)!;
}
