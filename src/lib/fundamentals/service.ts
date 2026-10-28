import { Prisma, type Exchange, type PrismaClient } from "@prisma/client";

const baseUrl = "https://api.upstox.com/v2/fundamentals";
const freshnessMs = 7 * 24 * 60 * 60 * 1_000;

export type FundamentalHistoryPoint = { readonly period: string; readonly value: number; readonly changePercent: number | null };
export type CorporateActionSummary = { readonly name: string; readonly date: string | null; readonly amount: number | null; readonly ratio: string | null };
export type CompetitorSummary = { readonly instrumentKey: string; readonly sector: string | null; readonly marketCapCrore: number | null; readonly companyProfile: string | null };
export type StockFundamentals = {
  readonly asOfDate: string;
  readonly fetchedAt: string;
  readonly companyProfile: string | null;
  readonly marketCap: number | null;
  readonly peRatio: number | null;
  readonly pbRatio: number | null;
  readonly roaPercent: number | null;
  readonly roePercent: number | null;
  readonly rocePercent: number | null;
  readonly evEbitda: number | null;
  readonly sectorPeRatio: number | null;
  readonly sectorPbRatio: number | null;
  readonly sectorRoaPercent: number | null;
  readonly sectorRoePercent: number | null;
  readonly sectorRocePercent: number | null;
  readonly sectorEvEbitda: number | null;
  readonly revenueCrore: number | null;
  readonly operatingProfitCrore: number | null;
  readonly netProfitCrore: number | null;
  readonly revenueGrowthPercent: number | null;
  readonly profitGrowthPercent: number | null;
  readonly salesCagr3YPercent: number | null;
  readonly profitCagr3YPercent: number | null;
  readonly operatingMarginPercent: number | null;
  readonly netMarginPercent: number | null;
  readonly operatingCashFlowCrore: number | null;
  readonly cashFlowToProfit: number | null;
  readonly promoterHoldingPercent: number | null;
  readonly promoterHoldingChangePercent: number | null;
  readonly fiiHoldingPercent: number | null;
  readonly fiiHoldingChangePercent: number | null;
  readonly diiHoldingPercent: number | null;
  readonly diiHoldingChangePercent: number | null;
  readonly mutualFundHoldingPercent: number | null;
  readonly retailHoldingPercent: number | null;
  readonly statementPeriod: string | null;
  readonly holdingPeriod: string | null;
  readonly revenueHistory: readonly FundamentalHistoryPoint[];
  readonly operatingProfitHistory: readonly FundamentalHistoryPoint[];
  readonly netProfitHistory: readonly FundamentalHistoryPoint[];
  readonly corporateActions: readonly CorporateActionSummary[];
  readonly competitors: readonly CompetitorSummary[];
  readonly qualityStatus: "Strong" | "Average" | "Weak" | "Insufficient data";
  readonly growthStatus: "Strong" | "Average" | "Weak" | "Insufficient data";
  readonly valuationStatus: "Cheap" | "Fair" | "Expensive" | "Insufficient data";
  readonly refreshError: string | null;
};

export type FundamentalBadgeSummary = Pick<StockFundamentals, "qualityStatus" | "growthStatus" | "valuationStatus" | "asOfDate">;

export async function getFundamentalBadgesBySymbols(
  client: PrismaClient,
  symbols: readonly string[],
  asOfDate: Date,
): Promise<Map<string, FundamentalBadgeSummary>> {
  if (!symbols.length) return new Map();
  const snapshots = await client.companyFundamentals.findMany({
    where: {
      marketDataSource: "UPSTOX_REAL",
      asOfDate: { lte: asOfDate },
      company: { instruments: { some: { exchange: "NSE", symbol: { in: [...symbols] } } } },
    },
    orderBy: [{ companyId: "asc" }, { asOfDate: "desc" }],
    select: {
      companyId: true, asOfDate: true, rocePercent: true, roePercent: true, cashFlowToProfit: true,
      revenueGrowthPercent: true, profitGrowthPercent: true,
      peRatio: true, pbRatio: true, evEbitda: true, sectorPeRatio: true, sectorPbRatio: true, sectorEvEbitda: true,
      company: { select: { instruments: { where: { exchange: "NSE", symbol: { in: [...symbols] } }, select: { symbol: true } } } },
    },
  });
  const result = new Map<string, FundamentalBadgeSummary>();
  const seenCompanies = new Set<string>();
  for (const snapshot of snapshots) {
    if (seenCompanies.has(snapshot.companyId)) continue;
    seenCompanies.add(snapshot.companyId);
    const values = {
      rocePercent: snapshot.rocePercent?.toNumber() ?? null,
      roePercent: snapshot.roePercent?.toNumber() ?? null,
      cashFlowToProfit: snapshot.cashFlowToProfit?.toNumber() ?? null,
      revenueGrowthPercent: snapshot.revenueGrowthPercent?.toNumber() ?? null,
      profitGrowthPercent: snapshot.profitGrowthPercent?.toNumber() ?? null,
      peRatio: snapshot.peRatio?.toNumber() ?? null,
      pbRatio: snapshot.pbRatio?.toNumber() ?? null,
      evEbitda: snapshot.evEbitda?.toNumber() ?? null,
      sectorPeRatio: snapshot.sectorPeRatio?.toNumber() ?? null,
      sectorPbRatio: snapshot.sectorPbRatio?.toNumber() ?? null,
      sectorEvEbitda: snapshot.sectorEvEbitda?.toNumber() ?? null,
    };
    const summary = {
      asOfDate: snapshot.asOfDate.toISOString().slice(0, 10),
      qualityStatus: qualityStatus(values), growthStatus: growthStatus(values), valuationStatus: valuationStatus(values),
    };
    for (const instrument of snapshot.company.instruments) result.set(instrument.symbol, summary);
  }
  return result;
}

export async function getStockFundamentals(client: PrismaClient, input: {
  readonly exchange: Exchange;
  readonly symbol: string;
  readonly asOfDate?: Date;
  readonly token?: string;
}): Promise<StockFundamentals | null> {
  const instrument = await client.instrument.findUnique({
    where: { exchange_symbol: { exchange: input.exchange, symbol: input.symbol.toUpperCase() } },
    select: { company: { select: { id: true, isin: true, sector: true } } },
  });
  if (!instrument) return null;

  const today = utcDateOnly(new Date());
  const requestedDate = input.asOfDate ? utcDateOnly(input.asOfDate) : today;
  let snapshot = await client.companyFundamentals.findFirst({
    where: { companyId: instrument.company.id, marketDataSource: "UPSTOX_REAL", asOfDate: { lte: requestedDate } },
    orderBy: [{ asOfDate: "desc" }, { fetchedAt: "desc" }],
  });
  const isRecentRequest = requestedDate.getTime() >= today.getTime() - freshnessMs;
  let refreshError: string | null = null;

  // Scanner dates commonly lag the wall clock by a weekend, holiday, or data-sync
  // delay. For those recent dates, show the latest snapshot instead of making the
  // panel appear empty. Older research dates remain strictly point-in-time.
  if (isRecentRequest) {
    const latestSnapshot = await client.companyFundamentals.findFirst({
      where: { companyId: instrument.company.id, marketDataSource: "UPSTOX_REAL" },
      orderBy: [{ asOfDate: "desc" }, { fetchedAt: "desc" }],
    });
    const latestIsFresh = latestSnapshot && Date.now() - latestSnapshot.fetchedAt.getTime() < freshnessMs;
    snapshot = latestSnapshot ?? snapshot;

    if (!latestIsFresh && input.token) {
      try {
        snapshot = await fetchAndStoreStockFundamentals(client, {
          companyId: instrument.company.id,
          isin: instrument.company.isin,
          token: input.token,
          asOfDate: today,
        });
      } catch (error) {
        refreshError = error instanceof Error ? error.message : "Fundamentals refresh failed.";
      }
    }
  }

  return snapshot ? toStockFundamentals(snapshot, refreshError) : null;
}

export async function fetchAndStoreStockFundamentals(client: PrismaClient, input: {
  readonly companyId: string;
  readonly isin: string;
  readonly token: string;
  readonly asOfDate?: Date;
  readonly fetch?: typeof fetch;
}) {
  const fetcher = input.fetch ?? fetch;
  const endpoints = {
    profile: "profile",
    ratios: "key-ratios",
    quarterlyIncome: "income-statement?type=consolidated&time_period=quarterly&fs=false",
    yearlyIncome: "income-statement?type=consolidated&time_period=yearly&fs=true",
    cashFlow: "cash-flow?type=consolidated&fs=true",
    holdings: "share-holdings",
    corporateActions: "corporate-actions",
    competitors: "competitors",
  } as const;
  const entries = await Promise.all(Object.entries(endpoints).map(async ([key, endpoint]) => {
    try {
      return [key, await fetchFundamentalEndpoint(fetcher, input.isin, endpoint, input.token)] as const;
    } catch (error) {
      return [key, { error: error instanceof Error ? error.message : "Request failed." }] as const;
    }
  }));
  const payloads = Object.fromEntries(entries) as Record<string, unknown>;
  if (Object.values(payloads).every((payload) => isRecord(payload) && typeof payload.error === "string")) {
    throw new Error("Upstox did not return any fundamental data for this stock.");
  }

  const profile = responseData(payloads.profile);
  const ratios = parseRatios(responseData(payloads.ratios));
  const quarterlyIncome = parseIncome(responseData(payloads.quarterlyIncome));
  const yearlyIncome = parseIncome(responseData(payloads.yearlyIncome));
  const cashFlow = parseCashFlow(responseData(payloads.cashFlow));
  const holdings = parseHoldings(responseData(payloads.holdings));
  const latestRevenue = quarterlyIncome.revenue[0] ?? yearlyIncome.revenue[0] ?? null;
  const latestOperatingProfit = quarterlyIncome.operatingProfit[0] ?? yearlyIncome.operatingProfit[0] ?? null;
  const latestNetProfit = quarterlyIncome.netProfit[0] ?? yearlyIncome.netProfit[0] ?? null;
  const operatingCashFlow = cashFlow.operating[0]?.value ?? null;
  const marketCapCrore = nestedNumber(profile, ["sector_market_cap_inr", "value"]);
  const asOfDate = input.asOfDate ?? utcDateOnly(new Date());

  return client.companyFundamentals.upsert({
    where: { companyId_asOfDate: { companyId: input.companyId, asOfDate } },
    create: {
      companyId: input.companyId,
      asOfDate,
      marketDataSource: "UPSTOX_REAL",
      ...snapshotData(),
    },
    update: snapshotData(),
  });

  function snapshotData() {
    return {
      fetchedAt: new Date(),
      companyProfile: stringValue(isRecord(profile) ? profile.company_profile : null),
      marketCap: marketCapCrore === null ? null : marketCapCrore * 10_000_000,
      peRatio: ratios.company.pe,
      pbRatio: ratios.company.pb,
      roaPercent: ratios.company.roa,
      roePercent: ratios.company.roe,
      rocePercent: ratios.company.roce,
      evEbitda: ratios.company.evEbitda,
      sectorPeRatio: ratios.sector.pe,
      sectorPbRatio: ratios.sector.pb,
      sectorRoaPercent: ratios.sector.roa,
      sectorRoePercent: ratios.sector.roe,
      sectorRocePercent: ratios.sector.roce,
      sectorEvEbitda: ratios.sector.evEbitda,
      revenueCrore: latestRevenue?.value ?? null,
      operatingProfitCrore: latestOperatingProfit?.value ?? null,
      netProfitCrore: latestNetProfit?.value ?? null,
      revenueGrowthPercent: latestRevenue?.changePercent ?? null,
      profitGrowthPercent: latestNetProfit?.changePercent ?? null,
      salesCagr3YPercent: cagr(yearlyIncome.revenue),
      profitCagr3YPercent: cagr(yearlyIncome.netProfit),
      operatingMarginPercent: ratioPercent(latestOperatingProfit?.value, latestRevenue?.value),
      netMarginPercent: ratioPercent(latestNetProfit?.value, latestRevenue?.value),
      operatingCashFlowCrore: operatingCashFlow,
      cashFlowToProfit: operatingCashFlow !== null && yearlyIncome.netProfit[0]?.value
        ? operatingCashFlow / yearlyIncome.netProfit[0].value : null,
      promoterHoldingPercent: holdings.promoters.current,
      promoterHoldingChangePercent: holdings.promoters.change,
      fiiHoldingPercent: holdings.fii.current,
      fiiHoldingChangePercent: holdings.fii.change,
      diiHoldingPercent: holdings.dii.current,
      diiHoldingChangePercent: holdings.dii.change,
      mutualFundHoldingPercent: holdings.mutualFunds.current,
      retailHoldingPercent: holdings.retail.current,
      statementPeriod: latestRevenue?.period ?? null,
      holdingPeriod: holdings.period,
      rawData: payloads as Prisma.InputJsonValue,
    };
  }
}

async function fetchFundamentalEndpoint(fetcher: typeof fetch, isin: string, endpoint: string, token: string) {
  const response = await fetcher(`${baseUrl}/${encodeURIComponent(isin)}/${endpoint}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) throw new Error("Upstox fundamentals authentication failed.");
  if (response.status === 429) throw new Error("Upstox fundamentals rate limit exceeded.");
  if (!response.ok) throw new Error(`Upstox fundamentals request failed (${response.status}).`);
  return response.json();
}

function parseRatios(data: unknown) {
  const company = emptyRatios();
  const sector = emptyRatios();
  if (!Array.isArray(data)) return { company, sector };
  for (const item of data) {
    if (!isRecord(item)) continue;
    const key = ratioKey(stringValue(item.name));
    if (!key) continue;
    company[key] = numberValue(item.company_value);
    sector[key] = numberValue(item.sector_value);
  }
  return { company, sector };
}

function parseIncome(data: unknown) {
  const result = { revenue: [] as FundamentalHistoryPoint[], operatingProfit: [] as FundamentalHistoryPoint[], netProfit: [] as FundamentalHistoryPoint[] };
  if (!isRecord(data) || !Array.isArray(data.income_statement)) return result;
  for (const row of data.income_statement) {
    if (!isRecord(row) || !Array.isArray(row.history)) continue;
    const history = parseHistory(row.history);
    if (row.category === "revenue") result.revenue = history;
    if (row.category === "operating_profit") result.operatingProfit = history;
    if (row.category === "net_profit") result.netProfit = history;
  }
  return result;
}

function parseCashFlow(data: unknown) {
  const result = { operating: [] as FundamentalHistoryPoint[] };
  if (!isRecord(data) || !Array.isArray(data.cash_flow)) return result;
  const row = data.cash_flow.find((item) => isRecord(item) && item.category === "operating");
  if (isRecord(row) && Array.isArray(row.history)) result.operating = parseHistory(row.history);
  return result;
}

function parseHoldings(data: unknown) {
  const result = {
    promoters: holdingValue(data, "promoters"), fii: holdingValue(data, "fii"),
    dii: holdingValue(data, "other_dii"), mutualFunds: holdingValue(data, "mutual_funds"),
    retail: holdingValue(data, "retail_and_other"), period: null as string | null,
  };
  if (Array.isArray(data)) {
    for (const row of data) {
      if (isRecord(row) && Array.isArray(row.history) && isRecord(row.history[0])) {
        result.period = stringValue(row.history[0].period);
        if (result.period) break;
      }
    }
  }
  return result;
}

function holdingValue(data: unknown, category: string) {
  if (!Array.isArray(data)) return { current: null, change: null };
  const row = data.find((item) => isRecord(item) && item.category === category);
  if (!isRecord(row) || !Array.isArray(row.history)) return { current: null, change: null };
  const current = isRecord(row.history[0]) ? numberValue(row.history[0].value) : null;
  const previous = isRecord(row.history[1]) ? numberValue(row.history[1].value) : null;
  return { current, change: current !== null && previous !== null ? current - previous : null };
}

function parseHistory(history: unknown[]): FundamentalHistoryPoint[] {
  return history.flatMap((item) => isRecord(item) && stringValue(item.period) && numberValue(item.value) !== null ? [{
    period: stringValue(item.period)!, value: numberValue(item.value)!, changePercent: numberValue(item.change),
  }] : []);
}

function toStockFundamentals(snapshot: Awaited<ReturnType<PrismaClient["companyFundamentals"]["findFirst"]>>, refreshError: string | null): StockFundamentals {
  if (!snapshot) throw new Error("Fundamentals snapshot is required.");
  const raw = isRecord(snapshot.rawData) ? snapshot.rawData : {};
  const quarterly = parseIncome(responseData(raw.quarterlyIncome));
  const yearly = parseIncome(responseData(raw.yearlyIncome));
  const corporateActions = parseCorporateActions(responseData(raw.corporateActions));
  const competitors = parseCompetitors(responseData(raw.competitors));
  const number = (value: Prisma.Decimal | null) => value?.toNumber() ?? null;
  const result = {
    asOfDate: snapshot.asOfDate.toISOString().slice(0, 10), fetchedAt: snapshot.fetchedAt.toISOString(),
    companyProfile: snapshot.companyProfile, marketCap: number(snapshot.marketCap), peRatio: number(snapshot.peRatio), pbRatio: number(snapshot.pbRatio),
    roaPercent: number(snapshot.roaPercent), roePercent: number(snapshot.roePercent), rocePercent: number(snapshot.rocePercent), evEbitda: number(snapshot.evEbitda),
    sectorPeRatio: number(snapshot.sectorPeRatio), sectorPbRatio: number(snapshot.sectorPbRatio), sectorRoaPercent: number(snapshot.sectorRoaPercent),
    sectorRoePercent: number(snapshot.sectorRoePercent), sectorRocePercent: number(snapshot.sectorRocePercent), sectorEvEbitda: number(snapshot.sectorEvEbitda),
    revenueCrore: number(snapshot.revenueCrore), operatingProfitCrore: number(snapshot.operatingProfitCrore), netProfitCrore: number(snapshot.netProfitCrore),
    revenueGrowthPercent: number(snapshot.revenueGrowthPercent), profitGrowthPercent: number(snapshot.profitGrowthPercent),
    salesCagr3YPercent: number(snapshot.salesCagr3YPercent), profitCagr3YPercent: number(snapshot.profitCagr3YPercent),
    operatingMarginPercent: number(snapshot.operatingMarginPercent), netMarginPercent: number(snapshot.netMarginPercent),
    operatingCashFlowCrore: number(snapshot.operatingCashFlowCrore), cashFlowToProfit: number(snapshot.cashFlowToProfit),
    promoterHoldingPercent: number(snapshot.promoterHoldingPercent), promoterHoldingChangePercent: number(snapshot.promoterHoldingChangePercent),
    fiiHoldingPercent: number(snapshot.fiiHoldingPercent), fiiHoldingChangePercent: number(snapshot.fiiHoldingChangePercent),
    diiHoldingPercent: number(snapshot.diiHoldingPercent), diiHoldingChangePercent: number(snapshot.diiHoldingChangePercent),
    mutualFundHoldingPercent: number(snapshot.mutualFundHoldingPercent), retailHoldingPercent: number(snapshot.retailHoldingPercent),
    statementPeriod: snapshot.statementPeriod, holdingPeriod: snapshot.holdingPeriod,
    revenueHistory: quarterly.revenue.length ? quarterly.revenue : yearly.revenue,
    operatingProfitHistory: quarterly.operatingProfit.length ? quarterly.operatingProfit : yearly.operatingProfit,
    netProfitHistory: quarterly.netProfit.length ? quarterly.netProfit : yearly.netProfit,
    corporateActions, competitors, refreshError,
  };
  return { ...result, qualityStatus: qualityStatus(result), growthStatus: growthStatus(result), valuationStatus: valuationStatus(result) };
}

function parseCorporateActions(data: unknown): CorporateActionSummary[] {
  if (!Array.isArray(data)) return [];
  return data.slice(0, 8).flatMap((item) => isRecord(item) && stringValue(item.name) ? [{
    name: stringValue(item.name)!, date: stringValue(item.expiry_date), amount: numberValue(item.amount), ratio: stringValue(item.ratio),
  }] : []);
}

function parseCompetitors(data: unknown): CompetitorSummary[] {
  if (!Array.isArray(data)) return [];
  return data.slice(0, 8).flatMap((item) => isRecord(item) && stringValue(item.instrument_key) ? [{
    instrumentKey: stringValue(item.instrument_key)!,
    sector: stringValue(item.sector),
    marketCapCrore: nestedNumber(item, ["sector_market_cap_inr", "value"]),
    companyProfile: stringValue(item.company_profile),
  }] : []);
}

function qualityStatus(value: Pick<StockFundamentals, "rocePercent" | "roePercent" | "cashFlowToProfit">): StockFundamentals["qualityStatus"] {
  const metrics = [value.rocePercent, value.roePercent, value.cashFlowToProfit].filter((item): item is number => item !== null);
  if (metrics.length < 2) return "Insufficient data";
  if ((value.rocePercent ?? 0) >= 15 && (value.roePercent ?? 0) >= 15 && (value.cashFlowToProfit ?? 1) >= 0.8) return "Strong";
  if ((value.rocePercent ?? 0) < 8 || (value.roePercent ?? 0) < 8 || (value.cashFlowToProfit ?? 1) < 0.5) return "Weak";
  return "Average";
}

function growthStatus(value: Pick<StockFundamentals, "revenueGrowthPercent" | "profitGrowthPercent">): StockFundamentals["growthStatus"] {
  if (value.revenueGrowthPercent === null || value.profitGrowthPercent === null) return "Insufficient data";
  if (value.revenueGrowthPercent >= 10 && value.profitGrowthPercent >= 10) return "Strong";
  if (value.revenueGrowthPercent < 0 || value.profitGrowthPercent < 0) return "Weak";
  return "Average";
}

function valuationStatus(value: Pick<StockFundamentals, "peRatio" | "pbRatio" | "evEbitda" | "sectorPeRatio" | "sectorPbRatio" | "sectorEvEbitda">): StockFundamentals["valuationStatus"] {
  const comparisons = [[value.peRatio, value.sectorPeRatio], [value.pbRatio, value.sectorPbRatio], [value.evEbitda, value.sectorEvEbitda]]
    .flatMap(([company, sector]) => company !== null && sector !== null && sector > 0 ? [company / sector] : []);
  if (!comparisons.length) return "Insufficient data";
  const average = comparisons.reduce((sum, item) => sum + item, 0) / comparisons.length;
  return average <= 0.85 ? "Cheap" : average >= 1.2 ? "Expensive" : "Fair";
}

function responseData(payload: unknown) {
  return isRecord(payload) && payload.status === "success" ? payload.data : null;
}
function emptyRatios() { return { pe: null as number | null, pb: null as number | null, roa: null as number | null, roe: null as number | null, roce: null as number | null, evEbitda: null as number | null }; }
function ratioKey(name: string | null): keyof ReturnType<typeof emptyRatios> | null {
  const normalized = name?.toUpperCase().replace(/\s/g, "");
  return normalized === "P/E" ? "pe" : normalized === "P/B" ? "pb" : normalized === "ROA" ? "roa" : normalized === "ROE" ? "roe" : normalized === "ROCE" ? "roce" : normalized === "EV/EBITDA" ? "evEbitda" : null;
}
function cagr(history: readonly FundamentalHistoryPoint[]) { const end = history[0]?.value; const start = history[3]?.value; return end && start && end > 0 && start > 0 ? ((end / start) ** (1 / 3) - 1) * 100 : null; }
function ratioPercent(numerator: number | undefined | null, denominator: number | undefined | null) { return numerator !== null && numerator !== undefined && denominator ? numerator / denominator * 100 : null; }
function nestedNumber(value: unknown, path: readonly string[]) { let current: unknown = value; for (const key of path) { if (!isRecord(current)) return null; current = current[key]; } return numberValue(current); }
function numberValue(value: unknown): number | null { const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[%+,]/g, "")) : NaN; return Number.isFinite(parsed) ? parsed : null; }
function stringValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function utcDateOnly(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())); }
