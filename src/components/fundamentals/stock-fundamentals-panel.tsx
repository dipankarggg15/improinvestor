import type { StockFundamentals } from "@/lib/fundamentals/service";
import { formatCrores, formatPercent } from "@/lib/ui/format";

export function StockFundamentalsPanel({ fundamentals, historicalDate }: {
  readonly fundamentals: StockFundamentals | null;
  readonly historicalDate?: string;
}) {
  if (!fundamentals) {
    return <section className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Fundamentals</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {historicalDate
          ? `No point-in-time fundamental snapshot was available on or before ${historicalDate}. Current figures are deliberately hidden to prevent look-ahead bias.`
          : "Fundamentals are not available for this stock yet. Check that the Upstox analytics token is configured, then reopen the page."}
      </p>
    </section>;
  }

  const usesLaterSnapshot = Boolean(historicalDate && fundamentals.asOfDate > historicalDate);

  return <section className="space-y-4 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Fundamentals</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Snapshot {fundamentals.asOfDate} · Financial period {fundamentals.statementPeriod ?? "unavailable"} · Consolidated figures where available</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Status label="Quality" value={fundamentals.qualityStatus} />
        <Status label="Growth" value={fundamentals.growthStatus} />
        <Status label="Valuation" value={fundamentals.valuationStatus} />
      </div>
    </div>

    {fundamentals.refreshError ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Latest refresh failed: {fundamentals.refreshError} Showing the last saved snapshot.</p> : null}
    {usesLaterSnapshot ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      This is the latest fundamentals snapshot ({fundamentals.asOfDate}), while the price chart ends on {historicalDate}. It is shown for current research and is not used as point-in-time data in historical strategy calculations.
    </p> : null}
    {fundamentals.companyProfile ? <p className="text-sm leading-6 text-[var(--muted)]">{fundamentals.companyProfile}</p> : null}

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Market Cap" value={fundamentals.marketCap === null ? "-" : formatCrores(fundamentals.marketCap)} />
      <Metric label="P/E" value={multiple(fundamentals.peRatio)} comparison={sectorComparison(fundamentals.peRatio, fundamentals.sectorPeRatio)} />
      <Metric label="P/B" value={multiple(fundamentals.pbRatio)} comparison={sectorComparison(fundamentals.pbRatio, fundamentals.sectorPbRatio)} />
      <Metric label="EV / EBITDA" value={multiple(fundamentals.evEbitda)} comparison={sectorComparison(fundamentals.evEbitda, fundamentals.sectorEvEbitda)} />
      <Metric label="ROE" value={formatPercent(fundamentals.roePercent)} comparison={sectorPercent(fundamentals.sectorRoePercent)} />
      <Metric label="ROCE" value={formatPercent(fundamentals.rocePercent)} comparison={sectorPercent(fundamentals.sectorRocePercent)} />
      <Metric label="ROA" value={formatPercent(fundamentals.roaPercent)} comparison={sectorPercent(fundamentals.sectorRoaPercent)} />
      <Metric label="Cash Flow / Profit" value={fundamentals.cashFlowToProfit === null ? "-" : `${fundamentals.cashFlowToProfit.toFixed(2)}×`} />
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Growth and profitability">
        <DataRows rows={[
          ["Revenue", croreValue(fundamentals.revenueCrore)],
          ["Operating profit", croreValue(fundamentals.operatingProfitCrore)],
          ["Net profit", croreValue(fundamentals.netProfitCrore)],
          ["Revenue growth", formatPercent(fundamentals.revenueGrowthPercent)],
          ["Profit growth", formatPercent(fundamentals.profitGrowthPercent)],
          ["Sales CAGR (3Y)", formatPercent(fundamentals.salesCagr3YPercent)],
          ["Profit CAGR (3Y)", formatPercent(fundamentals.profitCagr3YPercent)],
          ["Operating margin", formatPercent(fundamentals.operatingMarginPercent)],
          ["Net margin", formatPercent(fundamentals.netMarginPercent)],
          ["Operating cash flow", croreValue(fundamentals.operatingCashFlowCrore)],
        ]} />
      </Panel>
      <Panel title={`Shareholding${fundamentals.holdingPeriod ? ` · ${fundamentals.holdingPeriod}` : ""}`}>
        <DataRows rows={[
          ["Promoters", holdingValue(fundamentals.promoterHoldingPercent, fundamentals.promoterHoldingChangePercent)],
          ["FII", holdingValue(fundamentals.fiiHoldingPercent, fundamentals.fiiHoldingChangePercent)],
          ["DII", holdingValue(fundamentals.diiHoldingPercent, fundamentals.diiHoldingChangePercent)],
          ["Mutual funds", formatPercent(fundamentals.mutualFundHoldingPercent)],
          ["Retail and others", formatPercent(fundamentals.retailHoldingPercent)],
        ]} />
      </Panel>
    </div>

    {fundamentals.revenueHistory.length ? <Panel title="Recent financial history (₹ crore)">
      <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
        <thead className="text-xs uppercase text-[var(--muted)]"><tr><th className="py-2 pr-3">Period</th><th className="py-2 pr-3">Revenue</th><th className="py-2 pr-3">Operating profit</th><th className="py-2 pr-3">Net profit</th></tr></thead>
        <tbody>{fundamentals.revenueHistory.slice(0, 6).map((revenue, index) => <tr className="border-t border-[var(--border)]" key={revenue.period}>
          <td className="py-2 pr-3 font-medium">{revenue.period}</td>
          <td className="py-2 pr-3">{numberValue(revenue.value)} <Change value={revenue.changePercent} /></td>
          <td className="py-2 pr-3">{numberValue(fundamentals.operatingProfitHistory[index]?.value)}</td>
          <td className="py-2 pr-3">{numberValue(fundamentals.netProfitHistory[index]?.value)} <Change value={fundamentals.netProfitHistory[index]?.changePercent ?? null} /></td>
        </tr>)}</tbody>
      </table></div>
    </Panel> : null}

    {fundamentals.corporateActions.length ? <Panel title="Recent corporate actions">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{fundamentals.corporateActions.map((action, index) => <div className="rounded-md border border-[var(--border)] bg-white p-3" key={`${action.name}-${action.date}-${index}`}>
        <p className="font-medium">{action.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{action.date ?? "Date unavailable"}{action.amount !== null ? ` · ₹${action.amount}` : ""}{action.ratio ? ` · ${action.ratio}` : ""}</p>
      </div>)}</div>
    </Panel> : null}

    {fundamentals.competitors.length ? <Panel title="Comparable companies">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{fundamentals.competitors.map((competitor) => <div className="rounded-md border border-[var(--border)] bg-white p-3" key={competitor.instrumentKey}>
        <p className="font-medium">{competitor.instrumentKey}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{competitor.sector ?? "Sector unavailable"}{competitor.marketCapCrore === null ? "" : ` · ₹${competitor.marketCapCrore.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`}</p>
      </div>)}</div>
    </Panel> : null}
  </section>;
}

function Status({ label, value }: { readonly label: string; readonly value: string }) {
  const positive = value === "Strong" || value === "Cheap";
  const negative = value === "Weak" || value === "Expensive";
  const classes = positive ? "border-emerald-200 bg-emerald-50 text-emerald-900" : negative ? "border-red-200 bg-red-50 text-red-900" : "border-[var(--border)] bg-[var(--panel-soft)] text-[var(--foreground)]";
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}>{label}: {value}</span>;
}
function Metric({ label, value, comparison }: { readonly label: string; readonly value: string; readonly comparison?: string }) { return <div className="rounded-md border border-[var(--border)] bg-white p-3"><p className="text-xs uppercase text-[var(--muted)]">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p>{comparison ? <p className="mt-1 text-xs text-[var(--muted)]">{comparison}</p> : null}</div>; }
function Panel({ title, children }: { readonly title: string; readonly children: React.ReactNode }) { return <div className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] p-4"><h3 className="font-semibold">{title}</h3><div className="mt-3">{children}</div></div>; }
function DataRows({ rows }: { readonly rows: readonly (readonly [string, string])[] }) { return <dl>{rows.map(([label, value]) => <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] py-2 first:border-t-0" key={label}><dt className="text-sm text-[var(--muted)]">{label}</dt><dd className="text-right text-sm font-medium">{value}</dd></div>)}</dl>; }
function Change({ value }: { readonly value: number | null }) { return value === null ? null : <span className={`ml-1 text-xs ${value >= 0 ? "text-emerald-700" : "text-red-700"}`}>{value >= 0 ? "+" : ""}{value.toFixed(1)}%</span>; }
function multiple(value: number | null) { return value === null ? "-" : `${value.toFixed(2)}×`; }
function sectorComparison(company: number | null, sector: number | null) { return sector === null ? undefined : `Sector ${sector.toFixed(2)}×${company === null ? "" : ` · ${company <= sector ? "below" : "above"}`}`; }
function sectorPercent(value: number | null) { return value === null ? undefined : `Sector ${formatPercent(value)}`; }
function croreValue(value: number | null) { return value === null ? "-" : `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr`; }
function holdingValue(value: number | null, change: number | null) { return `${formatPercent(value)}${change === null ? "" : ` (${change >= 0 ? "+" : ""}${change.toFixed(2)} pp QoQ)`}`; }
function numberValue(value: number | undefined) { return value === undefined ? "-" : value.toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
