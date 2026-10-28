import { SectorStatus } from "@/components/sectors/sector-status";
import { StockChartLink } from "@/components/stocks/stock-chart-link";
import { AddToWatchlist } from "@/components/watchlists/add-to-watchlist";
import { FundamentalBadges } from "@/components/fundamentals/fundamental-badges";
import {
  getSwingSetups,
  minimumBreakoutRetestRelativeMomentumZ,
  parseSwingDate,
  parseSwingNumber,
  type SwingSetupDecision,
  type SwingSetupStatus,
} from "@/lib/swing-trading/service";
import {
  getSwingFilterGroup,
  parseSwingFilterGroup,
  swingFilterGroups,
  type SwingFilterGroupValue,
} from "@/lib/swing-trading/filter-groups";
import { prisma } from "@/lib/db/prisma";
import { formatCurrency, formatDisplayDate, formatPercent } from "@/lib/ui/format";
import { listWatchlistOptions } from "@/lib/watchlists/service";
import { getFundamentalBadgesBySymbols } from "@/lib/fundamentals/service";

export const dynamic = "force-dynamic";

type SwingSetupsPageProps = {
  readonly searchParams: Promise<Record<string, string | undefined>>;
};

export default async function SwingSetupsPage({ searchParams }: SwingSetupsPageProps) {
  const query = await searchParams;
  const selectedFilterGroup = parseSwingFilterGroup(query.group);
  const usesRelativeMomentum = selectedFilterGroup === "breakout-retest-momentum";
  const filterGroup = getSwingFilterGroup(selectedFilterGroup);
  if (!filterGroup.configured) return <PendingFilterGroup selectedFilterGroup={selectedFilterGroup} />;
  const requestedDate = parseSwingDate(query.date);
  const minimumAverageTradedValueCrores = parseSwingNumber(query.minAtv, { defaultValue: 5, min: 1, max: 500 });
  const maximumDistancePercent = selectedFilterGroup === "early-momentum"
    ? parseSwingNumber(query.earlyRange, { defaultValue: 10, min: 0.25, max: 10 })
    : parseSwingNumber(query.maxDistance, { defaultValue: selectedFilterGroup === "established-support" ? 5 : 3, min: 0.25, max: 10 });
  const minimumTouches = Math.round(parseSwingNumber(query.minTouches, { defaultValue: 2, min: 2, max: 6 }));
  const minimumRewardRisk = parseSwingNumber(query.minRR, { defaultValue: 0, min: 0, max: 10 });
  const [result, watchlists] = await Promise.all([
    getSwingSetups({
      client: prisma,
      filterGroup: selectedFilterGroup,
      requestedDate,
      minimumAverageTradedValue: minimumAverageTradedValueCrores * 10_000_000,
      maximumDistancePercent,
      minimumTouches,
      minimumRewardRisk,
    }),
    listWatchlistOptions(prisma),
  ]);
  const fundamentalBadges = result.priceDateUsed
    ? await getFundamentalBadgesBySymbols(prisma, result.setups.map((setup) => setup.symbol), new Date(`${result.priceDateUsed}T00:00:00.000Z`))
    : new Map();

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-[1500px] space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">REAL MARKET DATA · RESEARCH SIGNAL</p>
          <h1 className="mt-2 text-3xl font-semibold">Swing Setups · {filterGroup.label}</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--muted)]">
            {filterGroup.description} A setup is a research candidate, not an instruction to trade.
          </p>
        </div>

        <form className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:grid-cols-2 xl:grid-cols-7">
          <FilterGroupSelect selected={selectedFilterGroup} />
          <Field label="As Of Date">
            <input className="h-11 rounded-md border border-[var(--border)] px-3" defaultValue={result.requestedDate} name="date" type="date" />
          </Field>
          <Field label="Minimum ATV">
            <div className="flex items-center rounded-md border border-[var(--border)] bg-white pr-3">
              <input className="h-10 min-w-0 flex-1 px-3" defaultValue={minimumAverageTradedValueCrores} min="1" name="minAtv" step="1" type="number" />
              <span className="text-xs text-[var(--muted)]">Cr/day</span>
            </div>
          </Field>
          <Field label={selectedFilterGroup === "early-momentum" ? "Distance to 52W High" : "Maximum Distance"}>
            <div className="flex items-center rounded-md border border-[var(--border)] bg-white pr-3">
              <input className="h-10 min-w-0 flex-1 px-3" defaultValue={maximumDistancePercent} max="10" min="0.25" name={selectedFilterGroup === "early-momentum" ? "earlyRange" : "maxDistance"} step="0.25" type="number" />
              <span className="text-xs text-[var(--muted)]">%</span>
            </div>
          </Field>
          {selectedFilterGroup !== "early-momentum" ? <Field label="Minimum Touches">
            <input className="h-11 rounded-md border border-[var(--border)] px-3" defaultValue={minimumTouches} max="6" min="2" name="minTouches" step="1" type="number" />
          </Field> : null}
          {selectedFilterGroup !== "early-momentum" ? <Field label="R:R Display Filter">
            <select className="h-11 rounded-md border border-[var(--border)] bg-white px-3" defaultValue={minimumRewardRisk} name="minRR">
              <option value="0">All setups</option>
              <option value="1">At least 1:1</option>
              <option value="2">At least 1:2</option>
              <option value="3">At least 1:3</option>
              <option value="4">At least 1:4</option>
              <option value="5">At least 1:5</option>
            </select>
          </Field> : null}
          <button className="h-11 rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white xl:self-end" type="submit">
            Find Setups
          </button>
        </form>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Price Date Used" value={result.priceDateUsed ? formatDisplayDate(result.priceDateUsed) : "-"} />
          <Stat label="Setups Found" value={result.totalSetupsFound.toLocaleString("en-IN")} />
          <Stat label={selectedFilterGroup === "early-momentum" ? "Above 52W High" : "Trade-ready"} value={result.tradeReadyCount.toLocaleString("en-IN")} />
        </div>

        {result.priceDateUsed && result.priceDateUsed !== result.requestedDate ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            {result.requestedDate} was not an available trading session. The scan uses {result.priceDateUsed}.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${result.calculation.reused ? "border-slate-200 bg-slate-50 text-slate-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}><span aria-hidden="true" className={`size-1.5 rounded-full ${result.calculation.reused ? "bg-slate-500" : "bg-emerald-600"}`} />{result.calculation.reused ? "Cached result" : "Fresh result"}</span><span>Calculated {formatCalculationTime(result.calculation.calculatedAt)}</span></div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
          <div>
            <h2 className="text-lg font-semibold">{selectedFilterGroup === "early-momentum" ? "Ranked Early Momentum" : "Ranked Support Setups"}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {selectedFilterGroup === "early-momentum"
                ? "Preparing stocks are below their 52-week high; Above-high stocks are above it. ATR, contraction, volume confirmation, and one-day crossing are not required."
                : selectedFilterGroup === "established-support"
                ? "Candidates are ranked by historical rebound quality and current defence of the one-year-low zone. Risk/reward is shown separately and does not affect ranking."
                : usesRelativeMomentum
                ? `Requires the original Breakout Retest rules plus a combined relative-momentum Z-score of at least +${minimumBreakoutRetestRelativeMomentumZ.toFixed(2)}. Ranking uses 35% 1M Z-score and 65% 3M Z-score.`
                : "Shows all valid breakout-retest patterns. Risk/reward is an informational projection and does not affect ranking or Trade-ready status."}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:hidden">
            {result.setups.map((setup, index) => <article className="rounded-lg border border-[var(--border)] bg-[var(--panel-raised)] p-4" key={`mobile-${setup.symbol}`}>
              <div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--panel-soft)] text-xs font-semibold">{index + 1}</span><div className="min-w-0 flex-1"><StockChartLink className="block font-semibold text-[var(--accent)]" date={setup.priceDate} exchange="NSE" symbol={setup.symbol}>{setup.company}</StockChartLink><p className="mt-1 text-xs text-[var(--muted)]">NSE:{setup.symbol} · <SectorStatus date={setup.priceDate} sector={setup.sector} /></p></div>{selectedFilterGroup === "early-momentum" ? <StatusBadge status={setup.status} /> : <DecisionBadge decision={setup.decision} />}</div>
              <dl className="mt-4 grid grid-cols-3 gap-2 rounded-md bg-white p-3"><CompactMetric label="Price" value={formatCurrency(setup.currentPrice)} /><CompactMetric label={selectedFilterGroup === "early-momentum" ? "To 52W high" : "Distance"} value={selectedFilterGroup === "early-momentum" ? formatHighDistance(setup.distanceToHighPercent ?? 0) : formatPercent(setup.distancePercent)} /><CompactMetric label="Quality" value={`${setup.score}/100`} /></dl>
              {selectedFilterGroup === "early-momentum" ? <p className="mt-3 text-xs text-[var(--muted)]">5Y high {formatCurrency(setup.longTermHigh ?? 0)} · Headroom {formatPercent(setup.longTermHighHeadroomPercent ?? 0)} · 1M {formatPercent(setup.return1MPercent ?? 0)}</p> : null}
              {selectedFilterGroup !== "early-momentum" ? <p className="mt-3 text-xs text-[var(--muted)]">Support {formatCurrency(setup.supportLow)}–{formatCurrency(setup.supportHigh)} · R:R {setup.rewardRisk === null ? "—" : `1:${setup.rewardRisk.toFixed(2)}`}{usesRelativeMomentum && setup.relativeMomentumZScore !== undefined ? ` · Relative momentum ${setup.relativeMomentumZScore.toFixed(2)} Z (${setup.relativeMomentumScore}/15)` : ""}</p> : null}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><FundamentalBadges summary={fundamentalBadges.get(setup.symbol)} /><AddToWatchlist compact detectedAt={setup.priceDate} exchange="NSE" source={selectedFilterGroup === "early-momentum" ? "EARLY_MOMENTUM" : "SWING_SETUP"} supportHigh={selectedFilterGroup === "early-momentum" ? undefined : setup.supportHigh} supportLow={selectedFilterGroup === "early-momentum" ? undefined : setup.supportLow} symbol={setup.symbol} watchlists={watchlists} /></div>
            </article>)}
          </div>
          <div className="mt-4 hidden max-w-full overflow-x-auto sm:block">
            {selectedFilterGroup === "early-momentum" ? <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>{["Rank", "Stock", "Stage", "Price", "52W High", "Distance", "5Y High", "50DMA Ext.", "1M Return", "Day Move", "Score", "Fundamentals", "Watchlist"].map((head) => <th className="py-2 pr-3" key={head}>{head}</th>)}</tr>
              </thead>
              <tbody>{result.setups.map((setup, index) => (
                <tr className="border-t border-[var(--border)] align-top" key={setup.symbol}>
                  <td className="py-3 pr-3 font-semibold">{index + 1}</td>
                  <td className="py-3 pr-3"><StockChartLink className="block min-w-48 font-medium text-[var(--accent)] hover:underline" date={setup.priceDate} exchange="NSE" symbol={setup.symbol}>{setup.company}</StockChartLink><span className="text-xs text-[var(--muted)]">NSE:{setup.symbol}</span><SectorStatus className="mt-1 text-xs text-[var(--accent)]" date={setup.priceDate} sector={setup.sector} /></td>
                  <td className="py-3 pr-3"><StatusBadge status={setup.status} /></td>
                  <td className="py-3 pr-3">{formatCurrency(setup.currentPrice)}</td>
                  <td className="py-3 pr-3">{formatCurrency(setup.referenceHigh ?? 0)}</td>
                  <td className="py-3 pr-3 font-semibold">{formatHighDistance(setup.distanceToHighPercent ?? 0)}</td>
                  <td className="py-3 pr-3">{formatCurrency(setup.longTermHigh ?? 0)}<span className="block text-xs text-[var(--muted)]">{formatPercent(setup.longTermHighHeadroomPercent ?? 0)} headroom</span></td>
                  <td className="py-3 pr-3">{formatPercent(setup.extensionFromSma50Percent ?? 0)}</td>
                  <td className="py-3 pr-3">{formatPercent(setup.return1MPercent ?? 0)}</td>
                  <td className="py-3 pr-3">{formatPercent(setup.breakoutDayReturnPercent ?? 0)}</td>
                  <td className="py-3 pr-3 font-semibold">{setup.score}/100</td>
                  <td className="py-3 pr-3"><FundamentalBadges summary={fundamentalBadges.get(setup.symbol)} /></td>
                  <td className="py-3 pr-3"><AddToWatchlist compact detectedAt={setup.priceDate} exchange="NSE" source="EARLY_MOMENTUM" symbol={setup.symbol} watchlists={watchlists} /></td>
                </tr>
              ))}</tbody>
            </table> : <table className={`w-full text-left text-sm ${usesRelativeMomentum ? "min-w-[1200px]" : "min-w-[1000px]"}`}>
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {[
                    "Rank", "Stock", "Setup", "Price", "Support", "Distance",
                    ...(usesRelativeMomentum ? ["Relative Momentum"] : []),
                    "Trade Plan", "R:R", "Fundamentals", "Watchlist",
                  ].map((head) => <th className="py-2 pr-3" key={head}>{head}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.setups.map((setup, index) => (
                  <tr className="border-t border-[var(--border)] align-top" key={setup.symbol}>
                    <td className="py-3 pr-3 font-semibold">{index + 1}</td>
                    <td className="py-3 pr-3">
                      <StockChartLink className="block min-w-48 font-medium text-[var(--accent)] hover:underline" date={setup.priceDate} exchange="NSE" symbol={setup.symbol}>{setup.company}</StockChartLink>
                      <span className="text-xs text-[var(--muted)]">NSE:{setup.symbol}</span>
                      <SectorStatus className="mt-1 text-xs text-[var(--accent)]" date={setup.priceDate} sector={setup.sector} />
                    </td>
                    <td className="py-3 pr-3"><DecisionBadge decision={setup.decision} /><span className="mt-1 block"><StatusBadge status={setup.status} /></span><span className="mt-1 block text-xs text-[var(--muted)]">Quality {setup.score}/100</span></td>
                    <td className="py-3 pr-3">{formatCurrency(setup.currentPrice)}</td>
                    <td className="py-3 pr-3">{formatCurrency(setup.supportLow)}–{formatCurrency(setup.supportHigh)}{setup.yearLow !== null ? <span className="block text-xs text-[var(--muted)]">1Y low {formatCurrency(setup.yearLow)}</span> : null}</td>
                    <td className="py-3 pr-3">{formatPercent(setup.distancePercent)}</td>
                    {usesRelativeMomentum ? <td className="py-3 pr-3">
                      {setup.relativeMomentumZScore === undefined ? "-" : <><span className={`font-semibold ${setup.relativeMomentumZScore >= 0 ? "text-emerald-700" : "text-red-700"}`}>{setup.relativeMomentumZScore.toFixed(2)} Z</span><span className="block text-xs text-[var(--muted)]">1M {setup.relativeMomentumZ1M?.toFixed(2)} · 3M {setup.relativeMomentumZ3M?.toFixed(2)} · {setup.relativeMomentumScore}/15</span></>}
                    </td> : null}
                    <td className="min-w-36 py-3 pr-3 text-xs">
                      <span className="block"><span className="text-[var(--muted)]">Entry</span> {formatCurrency(setup.entryTrigger)}</span>
                      <span className="mt-1 block text-red-700"><span className="text-[var(--muted)]">Stop</span> {formatCurrency(setup.stopPrice)}</span>
                      <span className="mt-1 block"><span className="text-[var(--muted)]">Target</span> {setup.targetPrice ? formatCurrency(setup.targetPrice) : "-"}</span>
                    </td>
                    <td className="py-3 pr-3 font-semibold text-emerald-700">
                      {setup.rewardRisk === null ? "-" : `1 : ${setup.rewardRisk.toFixed(2)}`}
                    </td>
                    <td className="py-3 pr-3"><FundamentalBadges summary={fundamentalBadges.get(setup.symbol)} /></td>
                    <td className="py-3 pr-3"><AddToWatchlist compact detectedAt={setup.priceDate} exchange="NSE" source="SWING_SETUP" supportHigh={setup.supportHigh} supportLow={setup.supportLow} symbol={setup.symbol} watchlists={watchlists} /></td>
                  </tr>
                ))}
              </tbody>
            </table>}
          </div>
          {result.setups.length === 0 ? (
            <p className="mt-4 rounded-md bg-[var(--panel-soft)] p-4 text-sm text-[var(--muted)]">
              {selectedFilterGroup === "early-momentum"
                ? "No stocks are preparing near their 20-day high or triggering with confirmation on this date."
                : "No stocks satisfy the support, trend, proximity, and liquidity rules for this date. Widen the distance carefully or test an earlier date."}
            </p>
          ) : null}
        </div>

        {selectedFilterGroup === "breakout-retest" ? <details className="rounded-md border border-[var(--border)] bg-[var(--panel)]">
          <summary className="cursor-pointer px-4 py-4 text-lg font-semibold">Near 52-Week Low ({result.nearYearLow.length})</summary>
          <div className="border-t border-[var(--border)] p-4 sm:p-5">
            <p className="mb-4 text-sm text-[var(--muted)]">Liquid stocks within 10% of their rolling 252-session low. This is a separate research list—not proof of support. “Below 200 DMA” is a weakness warning.</p>
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="text-xs uppercase text-[var(--muted)]"><tr>{["Rank", "Stock", "Price", "52W Low", "Distance", "Trend", "Watchlist"].map((head) => <th className="py-2 pr-3" key={head}>{head}</th>)}</tr></thead>
                <tbody>{result.nearYearLow.map((stock, index) => (
                  <tr className="border-t border-[var(--border)]" key={stock.symbol}>
                    <td className="py-3 pr-3 font-semibold">{index + 1}</td>
                    <td className="py-3 pr-3"><StockChartLink className="font-medium text-[var(--accent)] hover:underline" date={stock.priceDate} exchange="NSE" symbol={stock.symbol}>{stock.company}</StockChartLink><span className="block text-xs text-[var(--muted)]">NSE:{stock.symbol}</span><SectorStatus className="text-xs text-[var(--muted)]" date={stock.priceDate} sector={stock.sector} /></td>
                    <td className="py-3 pr-3">{formatCurrency(stock.currentPrice)}</td>
                    <td className="py-3 pr-3">{formatCurrency(stock.yearLow)}</td>
                    <td className="py-3 pr-3 font-semibold">{formatPercent(stock.distancePercent)}</td>
                    <td className={`py-3 pr-3 font-semibold ${stock.aboveSma200 ? "text-emerald-700" : "text-red-700"}`}>{stock.aboveSma200 ? "Above 200 DMA" : "Below 200 DMA"}</td>
                    <td className="py-3 pr-3"><AddToWatchlist compact detectedAt={stock.priceDate} exchange="NSE" source="NEAR_52_WEEK_LOW" symbol={stock.symbol} watchlists={watchlists} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {result.nearYearLow.length === 0 ? <p className="text-sm text-[var(--muted)]">No liquid stocks are within 10% of their 52-week low for this date.</p> : null}
          </div>
        </details> : null}

        <details className="rounded-md border border-[var(--border)] bg-[var(--panel)]">
          <summary className="cursor-pointer px-4 py-4 text-base font-semibold">How the scan works and its limitations</summary>
          <div className="grid gap-4 border-t border-[var(--border)] p-4 lg:grid-cols-2">
            <InfoPanel title="Signal Definition">
              {selectedFilterGroup === "early-momentum" ? (
                <ul className="list-disc space-y-2 pl-5">
                  <li>Price must be within the selected percentage of the previous 252-session high. ATR is not used.</li>
                  <li>The older five-year high must be at least 10% above the 52-week high, leaving recovery headroom.</li>
                  <li>Preparing means below the 52-week high. Above High means above it. Contraction, volume confirmation, and a today-versus-yesterday crossing are not required.</li>
                  <li>Stocks more than 15% above the 50 DMA are excluded to avoid already-extended moves. The one-month return is displayed for context but does not filter or rank results.</li>
                  <li>Ranking uses proximity to the 52-week high, five-year headroom, 50-DMA extension, and liquidity. Volume, ATR, contraction, and risk/reward are not used.</li>
                </ul>
              ) : selectedFilterGroup === "established-support" ? (
                <ul className="list-disc space-y-2 pl-5">
                  <li>Support must be near the rolling 252-session low and established for at least 60 sessions.</li>
                  <li>At least two separated historical tests must have rebounded by 1.5 ATR or more.</li>
                  <li>A brief undercut is allowed when price remains within the break tolerance; persistent closes below it are rejected.</li>
                  <li>Ranking emphasizes bounce count, bounce strength, location, stabilization, participation, volatility contraction, and liquidity.</li>
                  <li>Risk/reward is shown as an informational projection. It does not affect ranking or Trade-ready status unless you explicitly use the R:R display filter.</li>
                </ul>
              ) : (
                <ul className="list-disc space-y-2 pl-5">
                  <li>At least 220 valid daily sessions, a price of ₹50 or more, and the selected liquidity floor.</li>
                  <li>Close above the 200 DMA with a rising 50 DMA.</li>
                  <li>Support uses clustered pivot lows from the last 180 sessions.</li>
                  <li>Risk/reward is shown but is not scored or used for ranking. The optional R:R display filter is off by default.</li>
                  <li>Ranking prioritizes support strength, location, trend and momentum, participation, and volatility contraction.</li>
                  {usesRelativeMomentum ? <li>Relative momentum uses volatility-adjusted cross-sectional Z-scores: 35% of 1M Z plus 65% of 3M Z. Setups below +{minimumBreakoutRetestRelativeMomentumZ.toFixed(2)} are excluded; qualifying setups can receive up to 15 ranking points.</li> : null}
                </ul>
              )}
            </InfoPanel>
            <InfoPanel title="Limitations">
              <ul className="list-disc space-y-2 pl-5">
                <li>Unadjusted splits and bonuses can create false levels.</li>
                <li>ASM, GSM, trade-to-trade, and price-band classifications are not yet stored.</li>
                <li>Entry is a future trigger—not a filled price. Targets use significant resistance when available, otherwise the minimum 3R objective.</li>
              </ul>
            </InfoPanel>
          </div>
        </details>
      </div>
    </section>
  );
}

function PendingFilterGroup({ selectedFilterGroup }: { readonly selectedFilterGroup: SwingFilterGroupValue }) {
  const group = getSwingFilterGroup(selectedFilterGroup);
  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-4xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">SWING FILTER GROUP</p>
          <h1 className="mt-2 text-3xl font-semibold">Swing Setups · {group.label}</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{group.description}</p>
        </div>
        <form className="flex flex-wrap items-end gap-3 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
          <FilterGroupSelect selected={selectedFilterGroup} />
          <button className="h-11 rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white" type="submit">Open filter group</button>
        </form>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          This filter group is ready to receive its rules, but no screening logic has been assigned yet. It will not reuse Breakout Retest results or show misleading candidates.
        </div>
      </div>
    </section>
  );
}

function FilterGroupSelect({ selected }: { readonly selected: SwingFilterGroupValue }) {
  return (
    <Field label="Filtering Method">
      <select className="h-11 rounded-md border border-[var(--border)] bg-white px-3" defaultValue={selected} name="group">
        {swingFilterGroups.map((group) => <option key={group.value} value={group.value}>{group.label}{group.configured ? "" : " · Rules pending"}</option>)}
      </select>
    </Field>
  );
}

function formatCalculationTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function formatHighDistance(value: number) {
  return value <= 0
    ? `${formatPercent(Math.abs(value))} above`
    : `${formatPercent(value)} below`;
}

function Field({ children, label }: { readonly children: React.ReactNode; readonly label: string }) {
  return <label className="grid gap-2 text-sm font-medium">{label}{children}</label>;
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4"><p className="text-xs uppercase text-[var(--muted)]">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>;
}

function StatusBadge({ status }: { readonly status: SwingSetupStatus }) {
  const style = status === "CONFIRMED" || status === "HOLDING" || status === "RECLAIMED" || status === "ABOVE_HIGH"
    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
    : status === "AT_SUPPORT" || status === "TESTING"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-sky-300 bg-sky-50 text-sky-900";
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${style}`}>{status.replace("_", " ")}</span>;
}

function DecisionBadge({ decision }: { readonly decision: SwingSetupDecision }) {
  const style = decision === "TRADE_READY"
    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
    : "border-sky-300 bg-sky-50 text-sky-900";
  const label = decision === "TRADE_READY" ? "READY" : decision === "SUPPORT_CANDIDATE" ? "CANDIDATE" : "WATCH";
  return <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${style}`}>{label}</span>;
}

function InfoPanel({ children, title }: { readonly children: React.ReactNode; readonly title: string }) {
  return <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted)] sm:p-5"><h2 className="mb-3 text-base font-semibold text-[var(--foreground)]">{title}</h2>{children}</div>;
}

function CompactMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</dt><dd className="metric-value mt-1 text-xs font-semibold">{value}</dd></div>;
}
