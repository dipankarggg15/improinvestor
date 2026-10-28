import type { Exchange } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { HistoricalExperimentRepository } from "@/lib/research/historical-experiment";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const decimal = (value: number) => ({ toNumber: () => value });

type FakeCompany = {
  readonly id: string;
  readonly name: string;
  readonly isin: string;
  readonly instruments: readonly {
    readonly id: string;
    readonly exchange: Exchange;
    readonly symbol: string;
  }[];
};

type FakePrice = {
  readonly instrumentId: string;
  readonly tradingDate: Date;
  readonly close: { toNumber(): number };
  readonly volume: bigint;
};

function fakeClient(companies: readonly FakeCompany[], prices: readonly FakePrice[]) {
  return {
    company: {
      findMany: async () => companies,
    },
    instrument: {
      findMany: async (input: { where: { id: { in: string[] } } }) => {
        const wanted = new Set(input.where.id.in);
        return companies.flatMap((company) =>
          company.instruments
            .filter((instrument) => wanted.has(instrument.id))
            .map((instrument) => ({
              id: instrument.id,
              exchange: instrument.exchange,
              symbol: instrument.symbol,
              company: {
                id: company.id,
                name: company.name,
                isin: company.isin,
              },
            })),
        );
      },
    },
    dailyPrice: {
      aggregate: async () => ({
        _max: {
          tradingDate: prices.length > 0
            ? new Date(Math.max(...prices.map((item) => item.tradingDate.getTime())))
            : null,
        },
      }),
      findMany: async (input: {
        where: {
          instrumentId: { in: string[] };
          tradingDate: { gte: Date; lte: Date };
        };
      }) => {
        const wanted = new Set(input.where.instrumentId.in);
        return prices
          .filter((price) =>
            wanted.has(price.instrumentId) &&
            price.tradingDate >= input.where.tradingDate.gte &&
            price.tradingDate <= input.where.tradingDate.lte,
          )
          .sort((left, right) =>
            left.instrumentId.localeCompare(right.instrumentId) ||
            left.tradingDate.getTime() - right.tradingDate.getTime(),
          );
      },
    },
  };
}

function price(instrumentId: string, tradingDate: string, close: number, volume = 1_000_000): FakePrice {
  return {
    instrumentId,
    tradingDate: date(tradingDate),
    close: decimal(close),
    volume: BigInt(volume),
  };
}

describe("HistoricalExperimentRepository", () => {
  it("reports the latest available real-market trading date", async () => {
    const repository = new HistoricalExperimentRepository(fakeClient([], [
      price("i1", "2026-10-13", 100),
      price("i1", "2026-10-15", 105),
    ]) as never);

    await expect(repository.getLatestRealMarketDate()).resolves.toBe("2026-10-15");
  });

  it("filters real-market candidates using only price/volume-derived metrics", async () => {
    const repository = new HistoricalExperimentRepository(fakeClient(
      [
        { id: "c1", name: "Winner Ltd", isin: "INE000000001", instruments: [{ id: "i1", exchange: "NSE", symbol: "WIN" }] },
        { id: "c2", name: "Illiquid Ltd", isin: "INE000000002", instruments: [{ id: "i2", exchange: "NSE", symbol: "ILL" }] },
      ],
      [
        price("i1", "2026-02-28", 95),
        price("i1", "2026-03-01", 100),
        price("i1", "2026-03-08", 112),
        price("i1", "2026-04-01", 130),
        price("i2", "2026-03-01", 100, 10_000),
        price("i2", "2026-04-01", 140, 10_000),
      ],
    ) as never);

    const result = await repository.runFilter({
      startDate: date("2026-03-01"),
      endDate: date("2026-04-01"),
      minAverageTradedValue: 50_000_000,
      minReturnPercent: 10,
      maxReturnPercent: null,
      rankingOption: "raw1M3M",
      sortBy: "return",
      sortDirection: "desc",
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      companyName: "Winner Ltd",
      symbol: "WIN",
      actualStartDate: "2026-03-01",
      actualEndDate: "2026-04-01",
    });
    expect(result.rows[0]?.returnPercent).toBeCloseTo(30);
    expect(result.rows[0]?.averageTradedValue).toBeCloseTo(114_000_000);
    expect(result.excluded.liquidity).toBe(1);
  });

  it("supports all four momentum ranking formulas", async () => {
    const companies = [
      { id: "c1", name: "Fast Ltd", isin: "INE000000011", instruments: [{ id: "i1", exchange: "NSE" as const, symbol: "FAST" }] },
      { id: "c2", name: "Steady Ltd", isin: "INE000000012", instruments: [{ id: "i2", exchange: "NSE" as const, symbol: "STEADY" }] },
      { id: "c3", name: "Slow Ltd", isin: "INE000000013", instruments: [{ id: "i3", exchange: "NSE" as const, symbol: "SLOW" }] },
    ];
    const prices = companies.flatMap((company, companyIndex) => {
      const points: FakePrice[] = [];
      const start = date("2025-10-01");
      for (let day = 0; day <= 365; day += 1) {
        const tradingDate = new Date(start);
        tradingDate.setUTCDate(tradingDate.getUTCDate() + day);
        const trend = [0.002, 0.0015, 0.001][companyIndex] ?? 0.001;
        const swing = [0.03, 0.01, 0.02][companyIndex] ?? 0.01;
        const close = 100 * Math.exp(trend * day) * (1 + Math.sin(day / 5) * swing);
        points.push(price(company.instruments[0]!.id, tradingDate.toISOString().slice(0, 10), close));
      }
      return points;
    });
    const repository = new HistoricalExperimentRepository(fakeClient(companies, prices) as never);
    const rankingOptions = [
      "volatilityZScore1M3M",
      "volatilityZScore6M12M",
      "raw1M3M",
      "raw6M12M",
    ] as const;

    for (const rankingOption of rankingOptions) {
      const result = await repository.runFilter({
        startDate: date("2026-04-01"),
        endDate: date("2026-10-01"),
        minAverageTradedValue: 0,
        minReturnPercent: null,
        maxReturnPercent: null,
        rankingOption,
        sortBy: "momentumScore",
        sortDirection: "desc",
      });

      expect(result.rankingOption).toBe(rankingOption);
      expect(result.rows).toHaveLength(3);
      expect(result.rows.map((row) => row.rank)).toEqual([1, 2, 3]);
      expect(result.rows.every((row) => Number.isFinite(row.momentumScore))).toBe(true);
      if (rankingOption.startsWith("raw")) {
        expect(result.rows[0]!.momentumScore).toBeCloseTo(
          (result.rows[0]!.firstMomentumReturnPercent + result.rows[0]!.secondMomentumReturnPercent) / 2,
        );
      }
    }
  });

  it("calculates selected-stock returns using next start price and previous end price", async () => {
    const repository = new HistoricalExperimentRepository(fakeClient(
      [
        { id: "c1", name: "Weekend Ltd", isin: "INE000000003", instruments: [{ id: "i1", exchange: "NSE", symbol: "WEEK" }] },
        { id: "c2", name: "Missing Ltd", isin: "INE000000004", instruments: [{ id: "i2", exchange: "NSE", symbol: "MISS" }] },
      ],
      [
        price("i1", "2026-03-02", 100),
        price("i1", "2026-03-06", 110),
        price("i2", "2026-03-09", 50),
      ],
    ) as never);

    const result = await repository.calculateReturns({
      instrumentIds: ["i1", "i2"],
      startDate: date("2026-03-01"),
      endDate: date("2026-03-07"),
    });

    expect(result.includedCount).toBe(1);
    expect(result.excludedCount).toBe(1);
    expect(result.averageReturnPercent).toBeCloseTo(10);
    expect(result.rows[0]).toMatchObject({
      actualStartDate: "2026-03-02",
      actualEndDate: "2026-03-06",
    });
    expect(result.rows[0]?.returnPercent).toBeCloseTo(10);
    expect(result.rows[1]?.excludedReason).toBe("No valid historical price");
  });
});
