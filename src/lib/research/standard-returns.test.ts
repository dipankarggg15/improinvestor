import { describe, expect, it } from "vitest";

import {
  calculateOneMonthReturn,
  calculateOneWeekReturn,
  calculateThreeMonthReturn,
} from "@/lib/research/standard-returns";
import { InMemoryPriceRepository } from "@/lib/research/test-utils";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

const repository = new InMemoryPriceRepository(
  [
    {
      instrumentId: "test-nse",
      companyId: "test",
      companyName: "Test Limited",
      isin: "INSYNTEST001",
      exchange: "NSE",
      symbol: "TEST",
    },
  ],
  [
    { instrumentId: "test-nse", tradingDate: date("2026-01-02"), close: 100 },
    { instrumentId: "test-nse", tradingDate: date("2026-01-05"), close: 101 },
    { instrumentId: "test-nse", tradingDate: date("2026-01-09"), close: 110 },
    { instrumentId: "test-nse", tradingDate: date("2026-02-09"), close: 121 },
    { instrumentId: "test-nse", tradingDate: date("2026-04-09"), close: 133.1 },
  ],
);

describe("standard return metrics", () => {
  it("calculates 1W return using approximately five trading sessions", async () => {
    const result = await calculateOneWeekReturn(repository, {
      instrumentId: "test-nse",
      endDate: date("2026-01-09"),
    });

    expect(result?.actualStartDate).toEqual(date("2026-01-02"));
    expect(result?.returnPercent).toBeCloseTo(10, 10);
  });

  it("calculates 1M return using a calendar-relative target date", async () => {
    const result = await calculateOneMonthReturn(repository, {
      instrumentId: "test-nse",
      endDate: date("2026-02-09"),
    });

    expect(result?.actualStartDate).toEqual(date("2026-01-09"));
    expect(result?.returnPercent).toBeCloseTo(10, 10);
  });

  it("calculates 3M return using a calendar-relative target date", async () => {
    const result = await calculateThreeMonthReturn(repository, {
      instrumentId: "test-nse",
      endDate: date("2026-04-09"),
    });

    expect(result?.actualStartDate).toEqual(date("2026-01-09"));
    expect(result?.returnPercent).toBeCloseTo(21, 10);
  });
});
