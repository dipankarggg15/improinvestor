"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import type {
  HistoricalFilterResult,
  HistoricalFilterRow,
  HistoricalFilterSortKey,
  ReturnExperimentPositionView,
  ReturnExperimentStats,
  ReturnExperimentView,
} from "@/lib/research/historical-experiment";
import { formatCrores, formatPercent } from "@/lib/ui/format";

type ApiSuccess<T> = {
  readonly ok: true;
  readonly result: T;
};

type ApiFailure = {
  readonly ok: false;
  readonly error: string;
};

type Tab = "filter" | "returns";

type WorkspacePosition = ReturnExperimentPositionView & {
  readonly persisted: boolean;
};

const emptyStats: ReturnExperimentStats = {
  totalPositions: 0,
  validPositions: 0,
  averagePositionReturnPercent: null,
  medianPositionReturnPercent: null,
  winningPositions: 0,
  losingPositions: 0,
  winRatePercent: null,
  bestPositionReturnPercent: null,
  worstPositionReturnPercent: null,
  averageHoldingDays: null,
};

export function HistoricalExperimentWorkspace() {
  const [filterStartDate, setFilterStartDate] = useState("2026-04-03");
  const [filterEndDate, setFilterEndDate] = useState("2026-09-07");
  const [minAverageTradedValueCr, setMinAverageTradedValueCr] = useState("5");
  const [minReturnPercent, setMinReturnPercent] = useState("");
  const [maxReturnPercent, setMaxReturnPercent] = useState("");
  const [sortBy, setSortBy] = useState<HistoricalFilterSortKey>("return");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [activeTab, setActiveTab] = useState<Tab>("filter");
  const [filterResult, setFilterResult] = useState<HistoricalFilterResult | null>(null);
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [positions, setPositions] = useState<WorkspacePosition[]>([]);
  const [stats, setStats] = useState<ReturnExperimentStats>(emptyStats);
  const [calculated, setCalculated] = useState(false);
  const [filterPending, setFilterPending] = useState(false);
  const [returnPending, setReturnPending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [restartPending, setRestartPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restoreExperiment = useCallback((experiment: ReturnExperimentView) => {
    setExperimentId(experiment.status === "TEMPORARY" ? experiment.id : null);
    setPositions(experiment.positions.map((position) => ({ ...position, persisted: true })));
    setStats(experiment.stats);
  }, []);

  useEffect(() => {
    let mounted = true;
    postlessJson<ReturnExperimentView | null>("/api/research/return-experiment")
      .then((experiment) => {
        if (!mounted || !experiment) return;
        restoreExperiment(experiment);
        setCalculated(experiment.positions.some((position) => position.returnPercent !== null || position.excludedReason));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [restoreExperiment]);

  const primaryLabel = calculated || experimentId ? "Recalculate" : "Get Return";
  const validStats = useMemo(() => stats, [stats]);

  async function runFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilterPending(true);
    setError(null);

    try {
      const payload = await postJson<HistoricalFilterResult>("/api/research/historical-filter", {
        startDate: filterStartDate,
        endDate: filterEndDate,
        minAverageTradedValueCr,
        minReturnPercent,
        maxReturnPercent,
        sortBy,
        sortDirection,
      });
      setFilterResult(payload);
      setActiveTab("filter");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to run historical filter.");
    } finally {
      setFilterPending(false);
    }
  }

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (positions.length === 0) return;
    setReturnPending(true);
    setError(null);

    try {
      const payload = await postJson<ReturnExperimentView>("/api/research/historical-returns", {
        positions: positions.map(toApiPosition),
      });
      restoreExperiment(payload);
      setCalculated(true);
      setActiveTab("returns");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to calculate returns.");
    } finally {
      setReturnPending(false);
    }
  }

  async function addPosition(row: HistoricalFilterRow) {
    const nextPosition = pendingPositionFromFilterRow(row);
    setError(null);

    if (!experimentId) {
      setPositions((current) => [...current, nextPosition]);
      setStats((current) => ({ ...current, totalPositions: current.totalPositions + 1 }));
      setActiveTab("returns");
      return;
    }

    try {
      const payload = await postJson<ReturnExperimentView | null>("/api/research/return-experiment/position", {
        companyId: row.companyId,
        instrumentId: row.instrumentId,
        requestedStartDate: nextPosition.requestedStartDate,
        requestedEndDate: nextPosition.requestedEndDate,
      });
      if (payload) restoreExperiment(payload);
      setActiveTab("returns");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add position.");
    }
  }

  async function removePosition(positionId: string) {
    const position = positions.find((item) => item.id === positionId);
    setPositions((current) => current.filter((item) => item.id !== positionId));
    if (!position?.persisted) return;

    try {
      const payload = await fetchJson<ReturnExperimentView | null>("/api/research/return-experiment/position", {
        method: "DELETE",
        body: JSON.stringify({ positionId }),
      });
      if (payload) restoreExperiment(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove position.");
    }
  }

  async function restartCalculation() {
    if (!window.confirm("Restart calculation?\n\nThis will permanently delete the current unsaved strategy calculation. Saved Return History and historical market data will not be affected.")) {
      return;
    }

    setRestartPending(true);
    setError(null);

    try {
      await postJson<null>("/api/research/return-experiment/restart", {});
      setExperimentId(null);
      setPositions([]);
      setStats(emptyStats);
      setCalculated(false);
      setActiveTab("returns");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to restart calculation.");
    } finally {
      setRestartPending(false);
    }
  }

  async function saveReturn() {
    const name = window.prompt("Save Return name");
    if (!name) return;
    setSavePending(true);
    setError(null);

    try {
      const payload = await postJson<ReturnExperimentView>("/api/research/return-experiment/save", {
        name,
        positions: positions.map(toApiPosition),
      });
      restoreExperiment(payload);
      setExperimentId(null);
      setPositions([]);
      setStats(emptyStats);
      setCalculated(false);
      setActiveTab("returns");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save return.");
    } finally {
      setSavePending(false);
    }
  }

  function updatePositionDate(positionId: string, key: "requestedStartDate" | "requestedEndDate", value: string) {
    setPositions((current) =>
      current.map((position) =>
        position.id === positionId
          ? {
              ...position,
              [key]: value,
              actualStartDate: null,
              actualEndDate: null,
              startPrice: null,
              endPrice: null,
              holdingDays: null,
              returnPercent: null,
              excludedReason: null,
            }
          : position,
      ),
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(320px,0.8fr)_minmax(560px,1.4fr)]">
        <form className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm" onSubmit={calculate}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">Return Calculator</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {positions.length} position{positions.length === 1 ? "" : "s"}
              </p>
            </div>
            <button
              className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={returnPending || positions.length === 0}
              type="submit"
            >
              {returnPending ? "Calculating..." : primaryLabel}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--panel-soft)] disabled:opacity-60"
              disabled={savePending || positions.length === 0}
              onClick={saveReturn}
              type="button"
            >
              {savePending ? "Saving..." : "Save Return"}
            </button>
            <button
              className="h-9 rounded-md border border-red-200 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
              disabled={restartPending || (positions.length === 0 && !experimentId)}
              onClick={restartCalculation}
              type="button"
            >
              {restartPending ? "Restarting..." : "Restart Calculation"}
            </button>
          </div>
        </form>

        <form className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm" onSubmit={runFilter}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">Find Stocks</p>
              <p className="mt-1 text-sm text-[var(--muted)]">UPSTOX_REAL close and volume history</p>
            </div>
            <button
              className="h-10 rounded-md bg-[var(--foreground)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={filterPending}
              type="submit"
            >
              {filterPending ? "Finding..." : "Find Stocks"}
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DateField label="Filter Start Date" onChange={setFilterStartDate} value={filterStartDate} />
            <DateField label="Filter End Date" onChange={setFilterEndDate} value={filterEndDate} />
            <NumberField label="Min ATV" onChange={setMinAverageTradedValueCr} suffix="Cr/day" value={minAverageTradedValueCr} />
            <SelectField label="Sort By" onChange={(value) => setSortBy(value as HistoricalFilterSortKey)} value={sortBy}>
              <option value="return">Filter Return</option>
              <option value="oneWeekReturn">1W Return</option>
              <option value="oneMonthReturn">1M Return</option>
              <option value="threeMonthReturn">3M Return</option>
              <option value="averageTradedValue">ATV/D</option>
              <option value="company">Company</option>
            </SelectField>
            <NumberField label="Min Return" onChange={setMinReturnPercent} suffix="%" value={minReturnPercent} />
            <NumberField label="Max Return" onChange={setMaxReturnPercent} suffix="%" value={maxReturnPercent} />
            <SelectField label="Direction" onChange={(value) => setSortDirection(value === "asc" ? "asc" : "desc")} value={sortDirection}>
              <option value="desc">High to Low</option>
              <option value="asc">Low to High</option>
            </SelectField>
          </div>
        </form>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] shadow-sm">
        <div className="flex border-b border-[var(--border)] bg-[var(--panel-soft)]">
          <TabButton active={activeTab === "filter"} onClick={() => setActiveTab("filter")}>Filter Results</TabButton>
          <TabButton active={activeTab === "returns"} onClick={() => setActiveTab("returns")}>Return Results</TabButton>
        </div>
        {activeTab === "filter" ? (
          <FilterResults result={filterResult} onAdd={addPosition} />
        ) : (
          <ReturnResults
            positions={positions}
            stats={validStats}
            onDateChange={updatePositionDate}
            onRemove={removePosition}
          />
        )}
      </div>
    </div>
  );
}

async function postlessJson<T>(url: string) {
  return fetchJson<T>(url);
}

async function postJson<T>(url: string, body: Record<string, unknown>) {
  return fetchJson<T>(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function fetchJson<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json() as ApiSuccess<T> | ApiFailure;
  if (!payload.ok) throw new Error(payload.error);
  return payload.result;
}

function FilterResults({
  result,
  onAdd,
}: {
  readonly result: HistoricalFilterResult | null;
  readonly onAdd: (row: HistoricalFilterRow) => void;
}) {
  if (!result) return <EmptyState detail="Choose historical filters and find stocks." title="No filter run yet" />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-[var(--muted)]">
        <span>{result.rows.length} matching stock{result.rows.length === 1 ? "" : "s"}</span>
        <span>{result.excluded.missingPrices + result.excluded.liquidity + result.excluded.returnFilter} excluded</span>
      </div>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="border-y border-[var(--border)] bg-[var(--panel-soft)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3 font-semibold">Add</th>
              <th className="px-3 py-3 font-semibold">Rank</th>
              <th className="px-3 py-3 font-semibold">Stock</th>
              <th className="px-3 py-3 font-semibold">Price</th>
              <th className="px-3 py-3 font-semibold">Filter Return</th>
              <th className="px-3 py-3 font-semibold">1W</th>
              <th className="px-3 py-3 font-semibold">1M</th>
              <th className="px-3 py-3 font-semibold">3M</th>
              <th className="px-3 py-3 font-semibold">ATV/D</th>
              <th className="px-3 py-3 font-semibold">Actual Dates</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr className="border-b border-[var(--border)] last:border-b-0" key={`${row.instrumentId}-${row.rank}`}>
                <td className="px-3 py-3">
                  <button
                    className="h-8 rounded-md border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--panel-soft)]"
                    onClick={() => onAdd(row)}
                    type="button"
                  >
                    Add
                  </button>
                </td>
                <td className="px-3 py-3 font-medium">{row.rank}</td>
                <td className="px-3 py-3">
                  <span className="block font-medium text-[var(--foreground)]">{row.companyName}</span>
                  <span className="text-xs text-[var(--muted)]">{row.exchange}:{row.symbol}</span>
                </td>
                <td className="px-3 py-3 font-medium">{formatRupees(row.price)}</td>
                <td className="px-3 py-3 font-semibold">{formatPercent(row.returnPercent)}</td>
                <td className="px-3 py-3 font-semibold">{formatNullablePercent(row.oneWeekReturnPercent)}</td>
                <td className="px-3 py-3 font-semibold">{formatNullablePercent(row.oneMonthReturnPercent)}</td>
                <td className="px-3 py-3 font-semibold">{formatNullablePercent(row.threeMonthReturnPercent)}</td>
                <td className="px-3 py-3">{formatCrores(row.averageTradedValue)}</td>
                <td className="px-3 py-3 text-xs text-[var(--muted)]">{row.actualStartDate} {"->"} {row.actualEndDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReturnResults({
  positions,
  stats,
  onDateChange,
  onRemove,
}: {
  readonly positions: readonly WorkspacePosition[];
  readonly stats: ReturnExperimentStats;
  readonly onDateChange: (positionId: string, key: "requestedStartDate" | "requestedEndDate", value: string) => void;
  readonly onRemove: (positionId: string) => void;
}) {
  if (positions.length === 0) {
    return <EmptyState detail="Add stocks from Filter Results to build a manual strategy test." title="No return positions yet" />;
  }

  return (
    <div>
      <StatsStrip stats={stats} />
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead className="border-y border-[var(--border)] bg-[var(--panel-soft)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3 font-semibold">Company / Stock</th>
              <th className="px-3 py-3 font-semibold">Symbol</th>
              <th className="px-3 py-3 font-semibold">Start Date</th>
              <th className="px-3 py-3 font-semibold">End Date</th>
              <th className="px-3 py-3 font-semibold">Holding Days</th>
              <th className="px-3 py-3 font-semibold">Start Price</th>
              <th className="px-3 py-3 font-semibold">End Price</th>
              <th className="px-3 py-3 font-semibold">Return %</th>
              <th className="px-3 py-3 font-semibold">Resolved Dates</th>
              <th className="px-3 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => (
              <tr className={`border-b border-[var(--border)] last:border-b-0 ${position.returnPercent === null && position.excludedReason ? "bg-neutral-50 text-[var(--muted)]" : ""}`} key={position.id}>
                <td className="px-3 py-3">
                  <span className="block font-medium text-[var(--foreground)]">{position.companyName}</span>
                  <span className="text-xs text-[var(--muted)]">{position.isin}</span>
                </td>
                <td className="px-3 py-3">{position.exchange}:{position.symbol}</td>
                <td className="px-3 py-3">
                  <input className="h-9 rounded-md border border-[var(--border)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]" onChange={(event) => onDateChange(position.id, "requestedStartDate", event.target.value)} type="date" value={position.requestedStartDate} />
                </td>
                <td className="px-3 py-3">
                  <input className="h-9 rounded-md border border-[var(--border)] bg-white px-2 text-sm outline-none focus:border-[var(--accent)]" onChange={(event) => onDateChange(position.id, "requestedEndDate", event.target.value)} type="date" value={position.requestedEndDate} />
                </td>
                <td className="px-3 py-3">{position.holdingDays === null ? "-" : `${position.holdingDays}d`}</td>
                <td className="px-3 py-3 font-medium">{formatRupees(position.startPrice)}</td>
                <td className="px-3 py-3 font-medium">{formatRupees(position.endPrice)}</td>
                <td className="px-3 py-3 font-semibold">{formatNullablePercent(position.returnPercent)}</td>
                <td className="px-3 py-3 text-xs text-[var(--muted)]">
                  {position.excludedReason ?? `${position.actualStartDate} -> ${position.actualEndDate}`}
                </td>
                <td className="px-3 py-3">
                  <button className="h-8 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50" onClick={() => onRemove(position.id)} type="button">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatsStrip({ stats }: { readonly stats: ReturnExperimentStats }) {
  const items = [
    ["Total Positions", String(stats.totalPositions)],
    ["Average Position Return", formatNullablePercent(stats.averagePositionReturnPercent)],
    ["Median", formatNullablePercent(stats.medianPositionReturnPercent)],
    ["Winners", String(stats.winningPositions)],
    ["Losers", String(stats.losingPositions)],
    ["Win Rate", formatNullablePercent(stats.winRatePercent)],
    ["Best", formatNullablePercent(stats.bestPositionReturnPercent)],
    ["Worst", formatNullablePercent(stats.worstPositionReturnPercent)],
    ["Avg Hold", stats.averageHoldingDays === null ? "-" : `${stats.averageHoldingDays.toFixed(1)}d`],
  ];

  return (
    <div className="grid gap-2 border-b border-[var(--border)] p-4 sm:grid-cols-2 lg:grid-cols-5">
      {items.map(([label, value]) => (
        <div className="rounded-md bg-[var(--panel-soft)] px-3 py-2" key={label}>
          <p className="text-xs text-[var(--muted)]">{label}</p>
          <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{value}</p>
        </div>
      ))}
    </div>
  );
}

function pendingPositionFromFilterRow(row: HistoricalFilterRow): WorkspacePosition {
  return {
    id: `pending-${crypto.randomUUID()}`,
    persisted: false,
    companyId: row.companyId,
    companyName: row.companyName,
    isin: row.isin,
    instrumentId: row.instrumentId,
    symbol: row.symbol,
    exchange: row.exchange,
    requestedStartDate: row.actualEndDate,
    requestedEndDate: row.actualEndDate,
    actualStartDate: null,
    actualEndDate: null,
    startPrice: null,
    endPrice: null,
    holdingDays: null,
    returnPercent: null,
    excludedReason: null,
    createdAt: new Date().toISOString(),
  };
}

function toApiPosition(position: WorkspacePosition) {
  return {
    id: position.persisted ? position.id : null,
    companyId: position.companyId,
    instrumentId: position.instrumentId,
    requestedStartDate: position.requestedStartDate,
    requestedEndDate: position.requestedEndDate,
  };
}

function DateField({ label, value, onChange }: { readonly label: string; readonly value: string; readonly onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-[var(--foreground)]">
      <span>{label}</span>
      <input className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]" onChange={(event) => onChange(event.target.value)} type="date" value={value} />
    </label>
  );
}

function NumberField({ label, suffix, value, onChange }: { readonly label: string; readonly suffix: string; readonly value: string; readonly onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-[var(--foreground)]">
      <span>{label}</span>
      <span className="flex h-10 items-center rounded-md border border-[var(--border)] bg-white px-3 focus-within:border-[var(--accent)]">
        <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" onChange={(event) => onChange(event.target.value)} step="0.1" type="number" value={value} />
        <span className="ml-2 text-xs text-[var(--muted)]">{suffix}</span>
      </span>
    </label>
  );
}

function SelectField({ children, label, value, onChange }: { readonly children: ReactNode; readonly label: string; readonly value: string; readonly onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-[var(--foreground)]">
      <span>{label}</span>
      <select className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]" onChange={(event) => onChange(event.target.value)} value={value}>
        {children}
      </select>
    </label>
  );
}

function TabButton({ active, children, onClick }: { readonly active: boolean; readonly children: ReactNode; readonly onClick: () => void }) {
  return (
    <button className={`border-r border-[var(--border)] px-4 py-3 text-sm font-semibold transition ${active ? "bg-white text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function EmptyState({ title, detail }: { readonly title: string; readonly detail: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function formatRupees(value: number | null) {
  return value === null
    ? "-"
    : `₹${value.toLocaleString("en-IN", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      })}`;
}

function formatNullablePercent(value: number | null) {
  return value === null ? "-" : formatPercent(value);
}
