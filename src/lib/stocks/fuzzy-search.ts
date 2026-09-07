export type StockSearchCandidate = {
  readonly companyId: string;
  readonly instrumentId: string;
  readonly companyName: string;
  readonly symbol: string;
  readonly exchange?: string;
};

type ScoredCandidate<T extends StockSearchCandidate> = {
  readonly candidate: T;
  readonly score: number;
};

const companySuffixes = new Set(["limited", "ltd", "ltd.", "private", "pvt", "inc", "corp", "corporation"]);

export function normalizeStockSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function stockSearchPrefilterTerms(query: string) {
  const tokens = normalizeStockSearchText(query).split(" ").filter(Boolean);

  return [...new Set(tokens.flatMap((token) => token.length >= 3 ? [token, token.slice(0, 2)] : [token]))];
}

export function rankStockSearchCandidates<T extends StockSearchCandidate>(
  query: string,
  candidates: readonly T[],
  limit = 20,
) {
  const normalizedQuery = normalizeStockSearchText(query);
  if (normalizedQuery.length < 2) return [];

  return candidates
    .map((candidate) => ({ candidate, score: scoreStockSearchCandidate(normalizedQuery, candidate) }))
    .filter((item) => item.score > 0)
    .sort(compareScoredCandidates)
    .slice(0, limit)
    .map((item) => item.candidate);
}

export function scoreStockSearchCandidate(normalizedQuery: string, candidate: StockSearchCandidate) {
  const symbol = normalizeStockSearchText(candidate.symbol).replace(/\s+/g, "");
  const companyName = normalizeStockSearchText(candidate.companyName);
  const companyCore = stripCompanySuffixes(companyName);
  const compactCompany = companyCore.replace(/\s+/g, "");
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const queryTokens = tokenSet(normalizedQuery);
  const companyTokens = tokenSet(companyCore);

  if (compactQuery === symbol) return 1_000;
  if (symbol.startsWith(compactQuery)) return 950;
  if (companyCore === normalizedQuery || companyName === normalizedQuery) return 900;
  if (companyCore.startsWith(normalizedQuery) || companyName.startsWith(normalizedQuery)) return 850;
  if (companyCore.includes(normalizedQuery) || compactCompany.includes(compactQuery)) return 800;
  if (symbol.includes(compactQuery)) return 760;

  const tokenScore = scoreQueryTokens(queryTokens, companyTokens, symbol);
  if (tokenScore > 0) return tokenScore;

  const fullDistance = normalizedLevenshtein(compactQuery, compactCompany);
  if (fullDistance <= 0.22) return 520 - Math.round(fullDistance * 100);

  return 0;
}

function scoreQueryTokens(queryTokens: readonly string[], companyTokens: readonly string[], symbol: string) {
  if (queryTokens.length === 0) return 0;

  let total = 0;
  for (const queryToken of queryTokens) {
    if (queryToken === symbol) {
      total += 1;
      continue;
    }
    if (symbol.startsWith(queryToken)) {
      total += 0.95;
      continue;
    }

    const bestToken = Math.max(...companyTokens.map((companyToken) => scoreToken(queryToken, companyToken)), 0);
    if (bestToken < 0.72) return 0;
    total += bestToken;
  }

  return 600 + Math.round((total / queryTokens.length) * 120);
}

function scoreToken(queryToken: string, companyToken: string) {
  if (queryToken === companyToken) return 1;
  if (companyToken.startsWith(queryToken)) return 0.95;
  if (companyToken.includes(queryToken)) return 0.9;
  if (singular(companyToken) === singular(queryToken)) return 0.9;

  const distance = normalizedLevenshtein(queryToken, companyToken);
  if (distance <= 0.28) return 1 - distance;

  return 0;
}

function stripCompanySuffixes(value: string) {
  return tokenSet(value).filter((token) => !companySuffixes.has(token)).join(" ");
}

function tokenSet(value: string) {
  return normalizeStockSearchText(value)
    .split(" ")
    .map(singular)
    .filter(Boolean);
}

function singular(value: string) {
  return value.length > 3 && value.endsWith("s") ? value.slice(0, -1) : value;
}

function normalizedLevenshtein(left: string, right: string) {
  if (left === right) return 0;
  if (!left || !right) return 1;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + cost,
      );
    }
    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length] / Math.max(left.length, right.length);
}

function compareScoredCandidates<T extends StockSearchCandidate>(
  left: ScoredCandidate<T>,
  right: ScoredCandidate<T>,
) {
  const scoreComparison = right.score - left.score;
  if (scoreComparison !== 0) return scoreComparison;

  const exchangeComparison = exchangeRank(right.candidate.exchange) - exchangeRank(left.candidate.exchange);
  if (exchangeComparison !== 0) return exchangeComparison;

  return left.candidate.companyName.localeCompare(right.candidate.companyName);
}

function exchangeRank(exchange?: string) {
  if (exchange === "NSE") return 2;
  if (exchange === "BSE") return 1;
  return 0;
}
