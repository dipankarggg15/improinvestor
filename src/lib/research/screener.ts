import type { Exchange } from "@prisma/client";

import type { PriceRepository } from "@/lib/research/price-repository";

const crore = 10_000_000;

export type ScreenerSortKey =
  | "rank"
  | "company"
  | "symbol"
  | "exchange"
  | "requestedStartDate"
  | "startDate"
  | "startPrice"
  | "requestedEndDate"
  | "endDate"
  | "endPrice"
  | "returnPercent"
  | "marketCap"
  | "debtToEquity"
  | "averageTradedValue";

export type ScreenerSortDirection = "asc" | "desc";

export type ScreenerFilters = {
  readonly minMarketCap: number;
  readonly maxDebtToEquity: number;
  readonly minAverageTradedValue: number;
};

export type ScreenerInput = {
  readonly startDate: Date;
  readonly endDate: Date;
  readonly filters: ScreenerFilters;
  readonly sortBy?: ScreenerSortKey;
  readonly sortDirection?: ScreenerSortDirection;
};

export type ScreenerCandidate = {
  readonly companyId: string;
  readonly companyName: string;
  readonly isin: string;
  readonly instrumentId: string;
  readonly exchange: Exchange;
  readonly symbol: string;
};

export type FundamentalsSnapshot = {
  readonly marketCap: number | null;
  readonly debtToEquity: number | null;
  readonly asOfDate: Date;
};

export type ScreenerRow = {
  readonly rank: number;
  readonly companyId: string;
  readonly companyName: string;
  readonly isin: string;
  readonly instrumentId: string;
  readonly symbol: string;
  readonly exchange: Exchange;
  readonly requestedStartDate: Date;
  readonly requestedEndDate: Date;
  readonly actualStartDate: Date;
  readonly actualEndDate: Date;
  readonly startClose: number;
  readonly endClose: number;
  readonly returnPercent: number;
  readonly marketCap: number;
  readonly debtToEquity: number;
  readonly averageTradedValue: number;
};

export type ScreenerPeriodData = {
  readonly startPricesByInstrumentId: Map<string, { readonly tradingDate: Date; readonly close: number }>;
  readonly endPricesByInstrumentId: Map<string, { readonly tradingDate: Date; readonly close: number }>;
  readonly averageTradedValueByInstrumentId: Map<string, number>;
  readonly fundamentalsByCompanyId: Map<string, FundamentalsSnapshot>;
};

export type ScreenerExclusionReason =
  | "missing_prices"
  | "missing_fundamentals"
  | "market_cap_below_minimum"
  | "debt_to_equity_above_maximum"
  | "liquidity_below_minimum";

export type ScreenerExclusion = {
  readonly companyId: string;
  readonly companyName: string;
  readonly symbol: string;
  readonly exchange: Exchange;
  readonly reason: ScreenerExclusionReason;
};

export type ScreenerResult =
  | {
      readonly ok: true;
      readonly rows: ScreenerRow[];
      readonly exclusions: ScreenerExclusion[];
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly rows: [];
      readonly exclusions: [];
    };

export type ScreenerRepository = PriceRepository & {
  findCanonicalScreenerCandidates(): Promise<ScreenerCandidate[]>;
  findLatestFundamentals(companyId: string, asOfDate: Date): Promise<FundamentalsSnapshot | null>;
  calculateAverageTradedValue(input: {
    readonly instrumentId: string;
    readonly startDate: Date;
    readonly endDate: Date;
  }): Promise<number | null>;
  findScreenerPeriodData(input: {
    readonly candidates: ScreenerCandidate[];
    readonly startDate: Date;
    readonly endDate: Date;
  }): Promise<ScreenerPeriodData>;
};

export const defaultScreenerFilters: ScreenerFilters = {
  minMarketCap: 2_000 * crore,
  maxDebtToEquity: 2,
  minAverageTradedValue: 5 * crore,
};

export async function runCustomReturnScreener(
  repository: ScreenerRepository,
  input: ScreenerInput,
): Promise<ScreenerResult> {
  if (input.endDate < input.startDate) {
    return {
      ok: false,
      error: "End date must be on or after start date.",
      rows: [],
      exclusions: [],
    };
  }

  const candidates = await repository.findCanonicalScreenerCandidates();
  const periodData = await repository.findScreenerPeriodData({
    candidates,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const rows: Omit<ScreenerRow, "rank">[] = [];
  const exclusions: ScreenerExclusion[] = [];

  for (const candidate of candidates) {
    const startPrice = periodData.startPricesByInstrumentId.get(candidate.instrumentId);
    const endPrice = periodData.endPricesByInstrumentId.get(candidate.instrumentId);
    const fundamentals = periodData.fundamentalsByCompanyId.get(candidate.companyId);
    const averageTradedValue = periodData.averageTradedValueByInstrumentId.get(candidate.instrumentId);

    if (!startPrice || !endPrice || startPrice.tradingDate > endPrice.tradingDate) {
      exclusions.push({ ...candidate, reason: "missing_prices" });
      continue;
    }

    if (
      !fundamentals ||
      fundamentals.marketCap === null ||
      fundamentals.debtToEquity === null
    ) {
      exclusions.push({ ...candidate, reason: "missing_fundamentals" });
      continue;
    }

    if (fundamentals.marketCap < input.filters.minMarketCap) {
      exclusions.push({ ...candidate, reason: "market_cap_below_minimum" });
      continue;
    }

    if (fundamentals.debtToEquity > input.filters.maxDebtToEquity) {
      exclusions.push({ ...candidate, reason: "debt_to_equity_above_maximum" });
      continue;
    }

    if (averageTradedValue === undefined || averageTradedValue < input.filters.minAverageTradedValue) {
      exclusions.push({ ...candidate, reason: "liquidity_below_minimum" });
      continue;
    }

    rows.push({
      ...candidate,
      requestedStartDate: input.startDate,
      requestedEndDate: input.endDate,
      actualStartDate: startPrice.tradingDate,
      actualEndDate: endPrice.tradingDate,
      startClose: startPrice.close,
      endClose: endPrice.close,
      returnPercent: ((endPrice.close / startPrice.close) - 1) * 100,
      marketCap: fundamentals.marketCap,
      debtToEquity: fundamentals.debtToEquity,
      averageTradedValue,
    });
  }

  const rankedRows = rows
    .sort((left, right) => right.returnPercent - left.returnPercent)
    .map((row, index) => ({
      rank: index + 1,
      ...row,
    }));

  return {
    ok: true,
    rows: sortScreenerRows(rankedRows, input.sortBy ?? "returnPercent", input.sortDirection ?? "desc"),
    exclusions,
  };
}

export function sortScreenerRows(
  rows: ScreenerRow[],
  sortBy: ScreenerSortKey,
  direction: ScreenerSortDirection,
): ScreenerRow[] {
  const multiplier = direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftValue = getSortValue(left, sortBy);
    const rightValue = getSortValue(right, sortBy);

    if (typeof leftValue === "string" && typeof rightValue === "string") {
      return leftValue.localeCompare(rightValue) * multiplier;
    }

    return (Number(leftValue) - Number(rightValue)) * multiplier;
  });
}

function getSortValue(row: ScreenerRow, sortBy: ScreenerSortKey): string | number {
  switch (sortBy) {
    case "rank":
      return row.rank;
    case "company":
      return row.companyName;
    case "symbol":
      return row.symbol;
    case "exchange":
      return row.exchange;
    case "requestedStartDate":
      return row.requestedStartDate.getTime();
    case "startDate":
      return row.actualStartDate.getTime();
    case "startPrice":
      return row.startClose;
    case "requestedEndDate":
      return row.requestedEndDate.getTime();
    case "endDate":
      return row.actualEndDate.getTime();
    case "endPrice":
      return row.endClose;
    case "marketCap":
      return row.marketCap;
    case "debtToEquity":
      return row.debtToEquity;
    case "averageTradedValue":
      return row.averageTradedValue;
    case "returnPercent":
      return row.returnPercent;
  }
}
