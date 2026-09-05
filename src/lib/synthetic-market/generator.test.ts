import { describe, expect, it } from "vitest";

import { generateSyntheticMarket } from "@/lib/synthetic-market/generator";

describe("generateSyntheticMarket", () => {
  it("is deterministic for a fixed seed", () => {
    const first = generateSyntheticMarket({ companyCount: 12, seed: 123 });
    const second = generateSyntheticMarket({ companyCount: 12, seed: 123 });

    expect(first.companies).toEqual(second.companies);
    expect(first.candles.slice(0, 50)).toEqual(second.candles.slice(0, 50));
    expect(first.fundamentals).toEqual(second.fundamentals);
  });

  it("generates valid OHLC candles with positive price and volume values", () => {
    const market = generateSyntheticMarket({ companyCount: 24, seed: 456 });

    for (const candle of market.candles.slice(0, 1_000)) {
      const open = Number(candle.open);
      const high = Number(candle.high);
      const low = Number(candle.low);
      const close = Number(candle.close);

      expect(open).toBeGreaterThan(0);
      expect(high).toBeGreaterThan(0);
      expect(low).toBeGreaterThan(0);
      expect(close).toBeGreaterThan(0);
      expect(candle.volume).toBeGreaterThan(BigInt(0));
      expect(low).toBeLessThanOrEqual(open);
      expect(low).toBeLessThanOrEqual(close);
      expect(high).toBeGreaterThanOrEqual(open);
      expect(high).toBeGreaterThanOrEqual(close);
      expect(high).toBeGreaterThanOrEqual(low);
    }
  });

  it("creates NSE-only, BSE-only, and dual-listed synthetic companies", () => {
    const market = generateSyntheticMarket({ companyCount: 60, seed: 789 });
    const listingShapes = market.companies.map((company) =>
      company.instruments.map((instrument) => instrument.exchange).sort().join("+"),
    );

    expect(listingShapes).toContain("NSE");
    expect(listingShapes).toContain("BSE");
    expect(listingShapes).toContain("BSE+NSE");
  });
});
