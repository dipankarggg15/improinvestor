import Link from "next/link";
import type { ReactNode } from "react";

import { formatCrores, formatPercent } from "@/lib/ui/format";

export type StockResearchSortKey =
  | "rank"
  | "stock"
  | "price"
  | "return"
  | "oneWeekReturn"
  | "oneMonthReturn"
  | "threeMonthReturn"
  | "marketCap"
  | "debtToEquity"
  | "averageTradedValue"
  | "peRatio";

export type StockResearchRowTone = "selected" | "normal" | "muted";

export type StockResearchRow = {
  readonly id: string;
  readonly rank: number | null;
  readonly stockName: string;
  readonly stockDetail: string;
  readonly price: number | null;
  readonly returnPercent?: number | null;
  readonly oneWeekReturnPercent: number | null;
  readonly oneMonthReturnPercent: number | null;
  readonly threeMonthReturnPercent: number | null;
  readonly marketCap: number | null;
  readonly debtToEquity: number | null;
  readonly averageTradedValue: number | null;
  readonly peRatio: number | null;
  readonly action?: ReactNode;
  readonly tone?: StockResearchRowTone;
};

type StockResearchTableProps = {
  readonly rows: readonly StockResearchRow[];
  readonly basePath: string;
  readonly params: Record<string, string | string[] | undefined>;
  readonly currentSort: StockResearchSortKey;
  readonly currentDirection: "asc" | "desc";
  readonly showReturn?: boolean;
  readonly showAction?: boolean;
};

const columns: readonly {
  readonly label: string;
  readonly sortKey: StockResearchSortKey;
  readonly title?: string;
}[] = [
  { label: "Rank", sortKey: "rank" },
  { label: "Stock", sortKey: "stock" },
  { label: "Price", sortKey: "price", title: "Latest available close on or before the relevant as-of date" },
  { label: "Return", sortKey: "return" },
  { label: "1W", sortKey: "oneWeekReturn", title: "One-week return as of the relevant as-of date" },
  { label: "1M", sortKey: "oneMonthReturn", title: "One-month return as of the relevant as-of date" },
  { label: "3M", sortKey: "threeMonthReturn", title: "Three-month return as of the relevant as-of date" },
  { label: "MCap", sortKey: "marketCap", title: "Market Capitalization" },
  { label: "D/E", sortKey: "debtToEquity", title: "Debt to Equity" },
  { label: "ATV/D", sortKey: "averageTradedValue", title: "Average Traded Value per Day" },
  { label: "P/E", sortKey: "peRatio", title: "Price to Earnings" },
] as const;

export function StockResearchTable({
  rows,
  basePath,
  params,
  currentSort,
  currentDirection,
  showReturn = true,
  showAction = false,
}: StockResearchTableProps) {
  const visibleColumns = showReturn ? columns : columns.filter((column) => column.sortKey !== "return");

  return (
    <div className="max-w-full overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--panel)] shadow-sm">
      <table className="w-full min-w-[920px] border-collapse text-left text-sm">
        <thead className="bg-[var(--panel-soft)] text-xs uppercase text-[var(--muted)]">
          <tr>
            {visibleColumns.map((column) => (
              <th className="border-b border-[var(--border)] px-3 py-3 font-semibold" key={column.sortKey}>
                <ResearchSortLink
                  currentDirection={currentDirection}
                  currentSort={currentSort}
                  label={column.label}
                  params={params}
                  sortKey={column.sortKey}
                  title={column.title}
                  basePath={basePath}
                />
              </th>
            ))}
            {showAction ? <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className={`border-b border-[var(--border)] last:border-b-0 ${toneClass(row.tone)}`} key={row.id}>
              <td className="px-3 py-3 font-medium">{row.rank ?? "-"}</td>
              <td className="px-3 py-3">
                <span className="block font-medium text-[var(--foreground)]">{row.stockName}</span>
                <span className="text-xs text-[var(--muted)]">{row.stockDetail}</span>
              </td>
              <td className="px-3 py-3 font-medium">{formatRupees(row.price)}</td>
              {showReturn ? <td className="px-3 py-3 font-semibold">{formatNullablePercent(row.returnPercent ?? null)}</td> : null}
              <td className="px-3 py-3 font-semibold">{formatNullablePercent(row.oneWeekReturnPercent)}</td>
              <td className="px-3 py-3 font-semibold">{formatNullablePercent(row.oneMonthReturnPercent)}</td>
              <td className="px-3 py-3 font-semibold">{formatNullablePercent(row.threeMonthReturnPercent)}</td>
              <td className="px-3 py-3">{formatNullableCrores(row.marketCap)}</td>
              <td className="px-3 py-3">{formatNullableNumber(row.debtToEquity)}</td>
              <td className="px-3 py-3">{formatNullableCrores(row.averageTradedValue)}</td>
              <td className="px-3 py-3">{formatNullableNumber(row.peRatio)}</td>
              {showAction ? <td className="px-3 py-3">{row.action ?? "-"}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function sortStockResearchRows(
  rows: readonly StockResearchRow[],
  sortBy: StockResearchSortKey,
  direction: "asc" | "desc",
) {
  const multiplier = direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftValue = stockResearchSortValue(left, sortBy);
    const rightValue = stockResearchSortValue(right, sortBy);

    if (leftValue === null && rightValue === null) return 0;
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    if (typeof leftValue === "string" && typeof rightValue === "string") {
      return leftValue.localeCompare(rightValue) * multiplier;
    }
    return (Number(leftValue) - Number(rightValue)) * multiplier;
  });
}

export function isStockResearchSortKey(value: string | undefined): value is StockResearchSortKey {
  return Boolean(value && columns.some((column) => column.sortKey === value));
}

function ResearchSortLink({
  basePath,
  currentDirection,
  currentSort,
  label,
  params,
  sortKey,
  title,
}: {
  readonly basePath: string;
  readonly currentDirection: "asc" | "desc";
  readonly currentSort: StockResearchSortKey;
  readonly label: string;
  readonly params: Record<string, string | string[] | undefined>;
  readonly sortKey: StockResearchSortKey;
  readonly title?: string;
}) {
  const isCurrent = currentSort === sortKey;
  const nextDirection = isCurrent && currentDirection === "desc" ? "asc" : "desc";
  const nextParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && key !== "sortBy" && key !== "sortDirection") {
      nextParams.set(key, value);
    }
  }

  nextParams.set("sortBy", sortKey);
  nextParams.set("sortDirection", nextDirection);

  return (
    <Link
      aria-label={title ? `Sort by ${label}: ${title}` : `Sort by ${label}`}
      className="inline-flex items-center gap-1 hover:text-[var(--foreground)]"
      href={`${basePath}?${nextParams}`}
      title={title}
    >
      {label}
      {isCurrent ? <span>{currentDirection === "desc" ? "↓" : "↑"}</span> : null}
    </Link>
  );
}

function stockResearchSortValue(row: StockResearchRow, sortBy: StockResearchSortKey): string | number | null {
  switch (sortBy) {
    case "rank":
      return row.rank;
    case "stock":
      return row.stockName;
    case "price":
      return row.price;
    case "return":
      return row.returnPercent ?? null;
    case "oneWeekReturn":
      return row.oneWeekReturnPercent;
    case "oneMonthReturn":
      return row.oneMonthReturnPercent;
    case "threeMonthReturn":
      return row.threeMonthReturnPercent;
    case "marketCap":
      return row.marketCap;
    case "debtToEquity":
      return row.debtToEquity;
    case "averageTradedValue":
      return row.averageTradedValue;
    case "peRatio":
      return row.peRatio;
  }
}

function toneClass(tone: StockResearchRowTone | undefined) {
  if (tone === "selected") return "bg-green-50";
  if (tone === "muted") return "bg-neutral-50 text-[var(--muted)]";
  return "";
}

function formatRupees(value: number | null) {
  return value === null
    ? "—"
    : `₹${value.toLocaleString("en-IN", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      })}`;
}

function formatNullableCrores(value: number | null) {
  return value === null ? "—" : formatCrores(value);
}

function formatNullableNumber(value: number | null) {
  return value === null
    ? "—"
    : value.toLocaleString("en-IN", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      });
}

function formatNullablePercent(value: number | null) {
  return value === null ? "—" : formatPercent(value);
}
