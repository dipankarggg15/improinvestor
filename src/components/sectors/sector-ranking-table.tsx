"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { SectorState, SectorSummary, SectorUniverse } from "@/lib/sectors/service";
import { formatPercent } from "@/lib/ui/format";

type SortDirection = "asc" | "desc";
type SortKey = "name" | "state" | "return1D" | "return1W" | "return1M" | "return3M" | "return6M" | "return12M" | "relative1M" | "breadth50" | "score";

const columns: readonly { readonly key: SortKey; readonly label: string }[] = [
  { key: "name", label: "Sector" },
  { key: "state", label: "State" },
  { key: "return1D", label: "1D" },
  { key: "return1W", label: "1W" },
  { key: "return1M", label: "1M" },
  { key: "return3M", label: "3M" },
  { key: "return6M", label: "6M" },
  { key: "return12M", label: "12M" },
  { key: "relative1M", label: "vs Nifty 1M" },
  { key: "breadth50", label: "Breadth 50" },
  { key: "score", label: "Score" },
];

const stateRank: Readonly<Record<SectorState, number>> = { LAGGING: 0, WEAKENING: 1, IMPROVING: 2, LEADING: 3 };

export function SectorRankingTable({ date, sectors, universe }: {
  readonly date: string;
  readonly sectors: readonly SectorSummary[];
  readonly universe: SectorUniverse;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const sorted = useMemo(() => [...sectors].sort((left, right) => compareSectors(left, right, sortKey, direction)), [direction, sectors, sortKey]);

  function selectSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setDirection((current) => current === "desc" ? "asc" : "desc");
      return;
    }
    setSortKey(nextKey);
    setDirection(nextKey === "name" ? "asc" : "desc");
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="grid gap-1 text-xs font-semibold uppercase text-[var(--muted)]">
          Sort by
          <select className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm font-medium normal-case text-[var(--foreground)]" onChange={(event) => selectSort(event.target.value as SortKey)} value={sortKey}>
            {columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
          </select>
        </label>
        <button className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-semibold hover:bg-[var(--panel-soft)]" onClick={() => setDirection((current) => current === "desc" ? "asc" : "desc")} type="button">
          {direction === "desc" ? "Descending ↓" : "Ascending ↑"}
        </button>
        <span className="pb-2 text-xs text-[var(--muted)]">Click any column heading to sort or reverse it.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1350px] text-left text-sm">
          <thead className="text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Rank</th>
              {columns.map((column) => (
                <th aria-sort={sortKey === column.key ? (direction === "asc" ? "ascending" : "descending") : "none"} className="px-4 py-3" key={column.key}>
                  <button className="inline-flex items-center gap-1 whitespace-nowrap font-semibold hover:text-[var(--foreground)]" onClick={() => selectSort(column.key)} type="button">
                    {column.label}<span aria-hidden="true">{sortKey === column.key ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{sorted.map((sector, index) => (
            <tr className="border-t border-[var(--border)]" key={sector.slug}>
              <td className="px-4 py-3 font-semibold">{index + 1}</td>
              <td className="px-4 py-3"><Link className="font-semibold text-[var(--accent)] hover:underline" href={`/sectors/${sector.slug}?date=${date}&universe=${universe}`}>{sector.name}</Link><span className="block text-xs text-[var(--muted)]">{sector.constituentCount} stocks</span></td>
              <td className="px-4 py-3"><StateBadge state={sector.state} /></td>
              <ReturnCell value={sector.return1D} />
              <ReturnCell value={sector.return1W} />
              <ReturnCell value={sector.return1M} />
              <ReturnCell value={sector.return3M} />
              <ReturnCell value={sector.return6M} />
              <ReturnCell value={sector.return12M} />
              <ReturnCell value={sector.relative1M} />
              <td className="px-4 py-3 font-medium">{formatPercent(sector.breadth50)}</td>
              <td className="px-4 py-3 font-semibold">{sector.score}/100</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function compareSectors(left: SectorSummary, right: SectorSummary, key: SortKey, direction: SortDirection) {
  const leftValue = sortValue(left, key);
  const rightValue = sortValue(right, key);
  if (leftValue === null && rightValue === null) return left.name.localeCompare(right.name);
  if (leftValue === null) return 1;
  if (rightValue === null) return -1;
  const comparison = typeof leftValue === "string"
    ? leftValue.localeCompare(String(rightValue))
    : leftValue - Number(rightValue);
  return (direction === "asc" ? comparison : -comparison) || left.name.localeCompare(right.name);
}

function sortValue(sector: SectorSummary, key: SortKey): string | number | null {
  if (key === "name") return sector.name;
  if (key === "state") return stateRank[sector.state];
  return sector[key];
}

function ReturnCell({ value }: { readonly value: number | null }) {
  const tone = value === null ? "text-[var(--muted)]" : value > 0 ? "text-emerald-700" : value < 0 ? "text-red-700" : "";
  const direction = value === null || value === 0 ? "" : value > 0 ? "↑ " : "↓ ";
  return <td className={`px-4 py-3 font-medium ${tone}`}><span className="sr-only">{value === null ? "Unavailable" : value > 0 ? "Positive" : value < 0 ? "Negative" : "Unchanged"}: </span><span aria-hidden="true">{direction}</span>{value !== null && value > 0 ? "+" : ""}{formatPercent(value)}</td>;
}

function StateBadge({ state }: { readonly state: SectorState }) {
  const style = state === "LEADING" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : state === "IMPROVING" ? "border-sky-300 bg-sky-50 text-sky-900" : state === "WEAKENING" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-300 bg-red-50 text-red-900";
  return <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${style}`}>{state}</span>;
}
