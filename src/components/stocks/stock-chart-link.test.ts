import { describe, expect, it } from "vitest";

import { stockChartHref } from "@/components/stocks/stock-chart-link";

describe("stockChartHref", () => {
  it("creates a safe chart route with an optional historical date", () => {
    expect(stockChartHref({ exchange: "nse", symbol: "M&M", date: "2026-10-22" }))
      .toBe("/charts/NSE/M%26M?date=2026-10-22");
  });

  it("creates a shareable manual chart window", () => {
    expect(stockChartHref({ exchange: "nse", symbol: "reliance", startDate: "2020-03-01", endDate: "2021-03-01" }))
      .toBe("/charts/NSE/RELIANCE?startDate=2020-03-01&endDate=2021-03-01");
  });
});
