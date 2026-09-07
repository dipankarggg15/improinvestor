import Fuse, { type IFuseOptions } from "fuse.js";

export type StockSearchCandidate = {
  readonly companyId: string;
  readonly instrumentId: string;
  readonly companyName: string;
  readonly symbol: string;
  readonly exchange?: string;
};

type FuseStockSearchCandidate<T extends StockSearchCandidate> = T & {
  readonly normalizedCompanyName: string;
  readonly normalizedSymbol: string;
};

const companySuffixes = new Set(["limited", "ltd", "private", "pvt", "inc", "corp", "corporation"]);

export const stockFuseOptions = {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.36,
  keys: [
    { name: "normalizedSymbol", weight: 0.55 },
    { name: "symbol", weight: 0.25 },
    { name: "normalizedCompanyName", weight: 0.14 },
    { name: "companyName", weight: 0.06 },
  ],
} satisfies IFuseOptions<FuseStockSearchCandidate<StockSearchCandidate>>;

export function normalizeStockSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function rankStockSearchCandidates<T extends StockSearchCandidate>(
  query: string,
  candidates: readonly T[],
  limit = 20,
) {
  const normalizedQuery = normalizeStockSearchText(query);
  if (normalizedQuery.length < 2) return [];

  const fuseCandidates = candidates.map(toFuseCandidate);
  const fuse = new Fuse(fuseCandidates, stockFuseOptions);

  return fuse
    .search(normalizedQuery, { limit })
    .map((result) => result.item);
}

function toFuseCandidate<T extends StockSearchCandidate>(candidate: T): FuseStockSearchCandidate<T> {
  return {
    ...candidate,
    normalizedCompanyName: normalizeCompanyName(candidate.companyName),
    normalizedSymbol: normalizeStockSearchText(candidate.symbol).replace(/\s+/g, ""),
  };
}

function normalizeCompanyName(value: string) {
  return normalizeStockSearchText(value)
    .split(" ")
    .filter((token) => !companySuffixes.has(token))
    .join(" ");
}
