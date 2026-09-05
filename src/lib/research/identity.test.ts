import { describe, expect, it } from "vitest";

import { InMemoryPriceRepository } from "@/lib/research/test-utils";

describe("company identity across exchanges", () => {
  it("allows NSE and BSE instruments to belong to the same company identity", async () => {
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
          instrumentId: "aurora-bse",
          companyId: "aurora",
          companyName: "Aurora Mobility Limited",
          isin: "INE000A01010",
          exchange: "BSE",
          symbol: "543210",
        },
      ],
      [],
    );

    const instruments = await repository.findReturnCandidates({ companyIds: ["aurora"] });

    expect(instruments).toHaveLength(2);
    expect(new Set(instruments.map((instrument) => instrument.companyId))).toEqual(new Set(["aurora"]));
    expect(new Set(instruments.map((instrument) => instrument.exchange))).toEqual(new Set(["NSE", "BSE"]));
  });
});
