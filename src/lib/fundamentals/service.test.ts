import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchAndStoreStockFundamentals, getStockFundamentals } from "@/lib/fundamentals/service";

afterEach(() => vi.useRealTimers());

describe("Upstox fundamental snapshot", () => {
  it("uses the latest saved snapshot for a recent lagging market date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00.000Z"));
    const latestSnapshot = fundamentalRow(new Date("2026-10-26T00:00:00.000Z"));
    const findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(latestSnapshot);
    const client = {
      instrument: { findUnique: vi.fn().mockResolvedValue({ company: { id: "company-1", isin: "INE000000001", sector: "Textiles" } }) },
      companyFundamentals: { findFirst },
    } as unknown as PrismaClient;

    const result = await getStockFundamentals(client, {
      exchange: "NSE",
      symbol: "CUPID",
      asOfDate: new Date("2026-10-23T00:00:00.000Z"),
    });

    expect(result?.asOfDate).toBe("2026-10-26");
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("does not leak a current snapshot into an old historical chart", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00.000Z"));
    const findFirst = vi.fn().mockResolvedValue(null);
    const client = {
      instrument: { findUnique: vi.fn().mockResolvedValue({ company: { id: "company-1", isin: "INE000000001", sector: "Textiles" } }) },
      companyFundamentals: { findFirst },
    } as unknown as PrismaClient;

    const result = await getStockFundamentals(client, {
      exchange: "NSE",
      symbol: "CUPID",
      asOfDate: new Date("2024-12-31T00:00:00.000Z"),
    });

    expect(result).toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("derives valuation, growth, margins, cash quality, and ownership changes", async () => {
    const upsert = vi.fn(({ create }) => Promise.resolve(create));
    const client = { companyFundamentals: { upsert } } as unknown as PrismaClient;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const data = url.includes("/profile") ? {
        company_profile: "Example business", sector_market_cap_inr: { value: 1_000 },
      } : url.includes("key-ratios") ? [
        { name: "P/E", company_value: "10", sector_value: "20" },
        { name: "ROE", company_value: "18%", sector_value: "12%" },
        { name: "ROCE", company_value: "20%", sector_value: "14%" },
      ] : url.includes("income-statement") ? {
        income_statement: [
          { category: "revenue", history: [{ period: "Jun 2026", value: 120, change: "+20%" }, { period: "Mar 2026", value: 100 }, { period: "Mar 2025", value: 90 }, { period: "Mar 2023", value: 60 }] },
          { category: "operating_profit", history: [{ period: "Jun 2026", value: 30, change: "+25%" }] },
          { category: "net_profit", history: [{ period: "Jun 2026", value: 20, change: "+30%" }, { period: "Mar 2026", value: 18 }, { period: "Mar 2025", value: 15 }, { period: "Mar 2023", value: 10 }] },
        ],
      } : url.includes("cash-flow") ? {
        cash_flow: [{ category: "operating", history: [{ period: "Mar 2026", value: 18 }] }],
      } : url.includes("share-holdings") ? [
        { category: "promoters", history: [{ period: "Jun 2026", value: 55 }, { period: "Mar 2026", value: 54 }] },
        { category: "fii", history: [{ period: "Jun 2026", value: 10 }, { period: "Mar 2026", value: 9 }] },
      ] : url.includes("corporate-actions") ? [{ name: "Dividend", expiry_date: "1 Aug 2026", amount: 2, ratio: null }] : [];
      return new Response(JSON.stringify({ status: "success", data }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    await fetchAndStoreStockFundamentals(client, {
      companyId: "company-1", isin: "INE000000001", token: "token", fetch: fetcher as typeof fetch,
      asOfDate: new Date("2026-10-26T00:00:00.000Z"),
    });

    const create = upsert.mock.calls[0]?.[0].create;
    expect(create.marketCap).toBe(10_000_000_000);
    expect(create.peRatio).toBe(10);
    expect(create.roePercent).toBe(18);
    expect(create.revenueGrowthPercent).toBe(20);
    expect(create.profitGrowthPercent).toBe(30);
    expect(create.operatingMarginPercent).toBe(25);
    expect(create.netMarginPercent).toBeCloseTo(16.6667, 3);
    expect(create.cashFlowToProfit).toBe(0.9);
    expect(create.promoterHoldingChangePercent).toBe(1);
    expect(create.fiiHoldingChangePercent).toBe(1);
  });
});

function fundamentalRow(asOfDate: Date) {
  return {
    id: "snapshot-1", companyId: "company-1", asOfDate,
    fetchedAt: new Date("2026-10-26T11:00:00.000Z"), marketDataSource: "UPSTOX_REAL",
    companyProfile: null, marketCap: null, peRatio: null, pbRatio: null, roaPercent: null,
    roePercent: null, rocePercent: null, evEbitda: null, sectorPeRatio: null,
    sectorPbRatio: null, sectorRoaPercent: null, sectorRoePercent: null,
    sectorRocePercent: null, sectorEvEbitda: null, revenueCrore: null,
    operatingProfitCrore: null, netProfitCrore: null, revenueGrowthPercent: null,
    profitGrowthPercent: null, salesCagr3YPercent: null, profitCagr3YPercent: null,
    operatingMarginPercent: null, netMarginPercent: null, operatingCashFlowCrore: null,
    cashFlowToProfit: null, promoterHoldingPercent: null, promoterHoldingChangePercent: null,
    fiiHoldingPercent: null, fiiHoldingChangePercent: null, diiHoldingPercent: null,
    diiHoldingChangePercent: null, mutualFundHoldingPercent: null, retailHoldingPercent: null,
    statementPeriod: null, holdingPeriod: null, rawData: {}, createdAt: asOfDate, updatedAt: asOfDate,
  };
}
