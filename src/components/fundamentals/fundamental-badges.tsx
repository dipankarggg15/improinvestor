import type { FundamentalBadgeSummary } from "@/lib/fundamentals/service";

export function FundamentalBadges({ summary }: { readonly summary: FundamentalBadgeSummary | undefined }) {
  if (!summary) return <span className="text-xs text-[var(--muted)]">Fundamentals on chart</span>;
  return <div className="flex min-w-32 flex-col gap-1 text-xs">
    <Badge label="Q" value={summary.qualityStatus} />
    <Badge label="G" value={summary.growthStatus} />
    <Badge label="V" value={summary.valuationStatus} />
  </div>;
}

function Badge({ label, value }: { readonly label: string; readonly value: string }) {
  const positive = value === "Strong" || value === "Cheap";
  const negative = value === "Weak" || value === "Expensive";
  const color = positive ? "text-emerald-700" : negative ? "text-red-700" : "text-[var(--muted)]";
  return <span className={color}><strong>{label}</strong> {value}</span>;
}
