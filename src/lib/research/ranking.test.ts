import { describe, expect, it } from "vitest";

import { rankInstrumentReturns } from "@/lib/research/ranking";
import { InMemoryPriceRepository } from "@/lib/research/test-utils";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("rankInstrumentReturns", () => {
  it("sorts eligible instruments by return descending and assigns ranks", async () => {
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
        {
          instrumentId: "banyan-nse",
          companyId: "banyan",
          companyName: "Banyan Foods Limited",
          isin: "INE000B01018",
          exchange: "NSE",
          symbol: "BANYAN",
        },
      ],
      [
        { instrumentId: "aurora-nse", tradingDate: date("2026-01-02"), close: 100 },
        { instrumentId: "aurora-nse", tradingDate: date("2026-01-09"), close: 120 },
        { instrumentId: "banyan-nse", tradingDate: date("2026-01-02"), close: 200 },
        { instrumentId: "banyan-nse", tradingDate: date("2026-01-09"), close: 194 },
      ],
    );

    const rankings = await rankInstrumentReturns(repository, {
      startDate: date("2026-01-02"),
      endDate: date("2026-01-09"),
    });

    expect(rankings.map((row) => [row.rank, row.symbol])).toEqual([
      [1, "AURORA"],
      [2, "BANYAN"],
    ]);
    expect(rankings[0]?.returnPercent).toBeCloseTo(20, 10);
    expect(rankings[1]?.returnPercent).toBeCloseTo(-3, 10);
  });
});
