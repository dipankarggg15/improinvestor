import { describe, expect, it } from "vitest";

import { parseNifty500ClassificationCsv } from "@/lib/sectors/classification";

describe("parseNifty500ClassificationCsv", () => {
  it("parses official rows including quoted company names", () => {
    const rows = parseNifty500ClassificationCsv([
      "Company Name,Industry,Symbol,Series,ISIN Code",
      '"Example, Holdings Ltd.",Financial Services,EXAMPLE,EQ,INE123A01012',
      "Tech Limited,Information Technology,TECH,EQ,INE 456B 01018",
    ].join("\n"));

    expect(rows).toEqual([
      { companyName: "Example, Holdings Ltd.", sector: "Financial Services", symbol: "EXAMPLE", series: "EQ", isin: "INE123A01012" },
      { companyName: "Tech Limited", sector: "Information Technology", symbol: "TECH", series: "EQ", isin: "INE456B01018" },
    ]);
  });

  it("rejects files without the official classification columns", () => {
    expect(() => parseNifty500ClassificationCsv("Symbol,Name\nABC,ABC Ltd.")).toThrow("missing required columns");
  });
});
