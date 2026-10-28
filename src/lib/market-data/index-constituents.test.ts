import { describe, expect, it } from "vitest";

import { fetchIndexConstituents, parseIndexConstituentCsv, resolveIndexConstituentUrl } from "./index-constituents";

describe("index constituents", () => {
  it("resolves both official and abbreviated Upstox index names", () => {
    expect(resolveIndexConstituentUrl("Nifty 50")).toContain("ind_nifty50list.csv");
    expect(resolveIndexConstituentUrl("NIFTY CONSR DURBL")).toContain("ind_niftyconsumerdurableslist.csv");
    expect(resolveIndexConstituentUrl("Nifty500Momentm50")).toContain("ind_nifty500Momentum50_list.csv");
    expect(resolveIndexConstituentUrl("Nifty Capital Mkt")).toContain("ind_niftyCapitalMarkets_list.csv");
    expect(resolveIndexConstituentUrl("NIFTY100 EQL Wgt")).toContain("ind_nifty100list.csv");
  });

  it("parses quoted companies and optional weights", () => {
    expect(parseIndexConstituentCsv([
      "Company Name,Industry,Symbol,Series,ISIN Code,Weightage",
      '"Example, Limited",Financial Services,EXAMPLE,EQ,INE123A01012,4.25',
    ].join("\n"))).toEqual([{
      companyName: "Example, Limited",
      industry: "Financial Services",
      symbol: "EXAMPLE",
      series: "EQ",
      isin: "INE123A01012",
      weightPercent: 4.25,
    }]);
  });

  it("does not claim that global and non-equity indices contain NSE stocks", async () => {
    await expect(fetchIndexConstituents({ exchange: "GLOBAL", name: "S&P 500", tradingSymbol: "SPX", instrumentKey: "GLOBAL_INDEX|SPX", segment: "GLOBAL_INDEX", country: "US", latency: null })).resolves.toMatchObject({ status: "not-applicable" });
    await expect(fetchIndexConstituents({ exchange: "NSE", name: "India VIX", tradingSymbol: "INDIAVIX", instrumentKey: "NSE_INDEX|India VIX", segment: "NSE_INDEX", country: "India", latency: null })).resolves.toMatchObject({ status: "not-applicable" });
  });
});
