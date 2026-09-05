import { describe, expect, it } from "vitest";

import { calculatePointToPointReturn } from "@/lib/research/returns";
import { InMemoryPriceRepository } from "@/lib/research/test-utils";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

const repository = new InMemoryPriceRepository(
  [
    {
      instrumentId: "aurora-nse",
      companyId: "aurora",
      companyName: "Aurora Mobility Limited",
      isin: "INE000A01010",
      exchange: "NSE",
      symbol: "AURORA",
    },
  ],
  [
    { instrumentId: "aurora-nse", tradingDate: date("2026-01-02"), close: 100 },
    { instrumentId: "aurora-nse", tradingDate: date("2026-01-05"), close: 106 },
    { instrumentId: "aurora-nse", tradingDate: date("2026-01-09"), close: 120 },
  ],
);

describe("calculatePointToPointReturn", () => {
  it("calculates an exact-date point-to-point return", async () => {
    const result = await calculatePointToPointReturn(repository, {
      instrumentId: "aurora-nse",
      startDate: date("2026-01-02"),
      endDate: date("2026-01-09"),
    });

    expect(result).toMatchObject({
      instrumentId: "aurora-nse",
      startClose: 100,
      endClose: 120,
    });
    expect(result?.returnPercent).toBeCloseTo(20, 10);
    expect(result?.actualStartDate).toEqual(date("2026-01-02"));
    expect(result?.actualEndDate).toEqual(date("2026-01-09"));
  });

  it("uses the next available start trading day and previous available end trading day", async () => {
    const result = await calculatePointToPointReturn(repository, {
      instrumentId: "aurora-nse",
      startDate: date("2026-01-03"),
      endDate: date("2026-01-10"),
    });

    expect(result?.requestedStartDate).toEqual(date("2026-01-03"));
    expect(result?.requestedEndDate).toEqual(date("2026-01-10"));
    expect(result?.actualStartDate).toEqual(date("2026-01-05"));
    expect(result?.actualEndDate).toEqual(date("2026-01-09"));
    expect(result?.returnPercent).toBeCloseTo(13.2075, 4);
  });
});
