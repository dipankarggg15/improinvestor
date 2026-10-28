import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { addMovingAverages, getDefaultNiftyChart, getStockChart, searchStockCharts } from "@/lib/stock-chart/service";
import type { MarketDataProvider } from "@/lib/market-data/types";
import type { SwingPrice } from "@/lib/swing-trading/service";

describe("stock chart calculations", () => {
  it("calculates 50-session and 200-session moving averages without look-ahead", () => {
    const prices: SwingPrice[] = Array.from({ length: 201 }, (_, index) => ({
      tradingDate: new Date(Date.UTC(2026, 0, index + 1)),
      open: index + 1,
      high: index + 2,
      low: index,
      close: index + 1,
      volume: 1_000,
    }));

    const result = addMovingAverages(prices);

    expect(result[48].sma50).toBeNull();
    expect(result[49].sma50).toBe(25.5);
    expect(result[199].sma200).toBe(100.5);
    expect(result[200].sma50).toBe(176.5);
    expect(result[200].sma200).toBe(101.5);
  });
});

describe("stock chart discovery", () => {
  it("does not load a default stock list until the user searches", async () => {
    const findMany = vi.fn();
    const client = {
      instrument: { count: vi.fn().mockResolvedValue(8_290), findMany },
      $queryRaw: vi.fn(),
    } as unknown as PrismaClient;

    await expect(searchStockCharts(client, "")).resolves.toEqual({ totalInstruments: 8_290, results: [] });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("uses the manual end date as the historical analysis cutoff", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "instrument-1",
      exchange: "BSE",
      symbol: "TEST",
      marketDataSource: "UPSTOX_REAL",
      company: { name: "Test Limited", sector: null },
      dailyPrices: [{ tradingDate: new Date("2020-06-30T00:00:00.000Z"), open: 99, high: 102, low: 98, close: 100, volume: 1_000 }],
    });
    const client = { instrument: { findUnique } } as unknown as PrismaClient;

    const result = await getStockChart(client, { exchange: "BSE", symbol: "TEST", endDate: "2020-06-30" });

    expect(result?.priceDate).toBe("2020-06-30");
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        dailyPrices: expect.objectContaining({ where: { tradingDate: { lte: new Date("2020-06-30T00:00:00.000Z") } } }),
      }),
    }));
  });

  it("loads a ten-year NIFTY 50 default chart from the index instrument", async () => {
    const fetchHistoricalDailyCandles = vi.fn().mockResolvedValue([
      { instrumentKey: "NSE_INDEX|Nifty 50", tradingDate: new Date("2026-10-22T00:00:00.000Z"), open: "25000", high: "25200", low: "24900", close: "25150", volume: BigInt(0) },
    ]);
    const provider = {
      name: "upstox",
      fetchInstruments: vi.fn(),
      fetchHistoricalDailyCandles,
      fetchCurrentQuote: vi.fn(),
    } as MarketDataProvider;

    const result = await getDefaultNiftyChart(provider, new Date("2026-10-23T12:00:00.000Z"));

    expect(fetchHistoricalDailyCandles).toHaveBeenCalledWith({
      instrumentKey: "NSE_INDEX|Nifty 50",
      startDate: new Date("2016-10-23T00:00:00.000Z"),
      endDate: new Date("2026-10-23T00:00:00.000Z"),
    });
    expect(result).toMatchObject({ company: "Nifty 50", symbol: "NIFTY", priceDate: "2026-10-22" });
  });

  it("searches the database by company or symbol even for a one-character query", async () => {
    const instrument = {
      id: "instrument-reliance",
      companyId: "company-reliance",
      exchange: "NSE",
      symbol: "RELIANCE",
      company: { name: "Reliance Industries Limited", sector: "Energy" },
    };
    const client = {
      instrument: {
        count: vi.fn().mockResolvedValue(2_000),
        findMany: vi.fn().mockResolvedValue([instrument]),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaClient;

    const result = await searchStockCharts(client, "R");

    expect(result.results).toEqual([expect.objectContaining({ symbol: "RELIANCE" })]);
    expect(client.instrument.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.any(Array) }),
      take: 100,
    }));
  });
});
