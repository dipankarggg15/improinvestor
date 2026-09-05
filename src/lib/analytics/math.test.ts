import { describe, expect, it } from "vitest";

import { cagrPercent, totalReturnPercent, xirrPercent } from "@/lib/analytics/math";

describe("analytics math", () => {
  it("calculates total return and CAGR over elapsed calendar time", () => {
    expect(totalReturnPercent("100", "125")?.toFixed(4)).toBe("25.0000");
    expect(cagrPercent({
      beginningValue: "100",
      endingValue: "121",
      startDate: day("2025-01-01"),
      endDate: day("2027-01-01"),
    })?.toNumber()).toBeCloseTo(10, 1);
  });

  it("calculates short-period CAGR when mathematically valid", () => {
    const result = cagrPercent({
      beginningValue: "100",
      endingValue: "101",
      startDate: day("2025-01-01"),
      endDate: day("2025-01-31"),
    });
    expect(result?.toNumber()).toBeGreaterThan(10);
  });

  it("calculates XIRR and returns null when undefined", () => {
    expect(xirrPercent([
      { date: day("2025-01-01"), amount: "-100" },
      { date: day("2026-01-01"), amount: "110" },
    ])?.toNumber()).toBeCloseTo(10, 1);
    expect(xirrPercent([{ date: day("2025-01-01"), amount: "100" }])).toBeNull();
  });
});

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
