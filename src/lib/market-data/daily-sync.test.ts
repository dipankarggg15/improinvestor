import { describe, expect, it } from "vitest";

import { indiaCalendarDateKey, latestSafeMarketEodDate } from "@/lib/market-data/daily-sync";

describe("daily app-wide market-data sync dates", () => {
  it("uses the India calendar day for the once-per-day marker", () => {
    expect(indiaCalendarDateKey(new Date("2026-10-26T18:29:59.000Z"))).toBe("2026-10-26");
    expect(indiaCalendarDateKey(new Date("2026-10-26T18:30:00.000Z"))).toBe("2026-10-27");
  });

  it("only targets today's candle after the 18:00 IST completion window", () => {
    expect(latestSafeMarketEodDate(new Date("2026-10-22T11:30:00.000Z")).toISOString().slice(0, 10)).toBe("2026-10-21");
    expect(latestSafeMarketEodDate(new Date("2026-10-22T12:30:00.000Z")).toISOString().slice(0, 10)).toBe("2026-10-22");
  });
});
