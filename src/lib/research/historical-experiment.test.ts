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
