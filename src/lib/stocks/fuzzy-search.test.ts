import { describe, expect, it } from "vitest";

import { rankStockSearchCandidates } from "@/lib/stocks/fuzzy-search";

const jivika = {
  companyId: "company-jivika",
  instrumentId: "instrument-jivika-nse",
  companyName: "Jivika Textiles 125 Limited",
  symbol: "JIVITE125",
  exchange: "NSE",
};

const other = {
  companyId: "company-other",
  instrumentId: "instrument-other-nse",
  companyName: "Jain Industrial Ventures Limited",
  symbol: "JAINVEN",
  exchange: "NSE",
};

describe("rankStockSearchCandidates", () => {
  it.each([
    "jivika",
    "jiveka",
    "jiveka textile",
    "jivika textile",
    "jivika tex",
    "JIVITE125",
  ])("finds Jivika Textiles for %s", (query) => {
    const [match] = rankStockSearchCandidates(query, [other, jivika]);

    expect(match).toEqual(jivika);
  });

  it("keeps exact symbol matches ahead of fuzzy company matches", () => {
    const exactSymbol = {
      companyId: "company-symbol",
      instrumentId: "instrument-symbol",
      companyName: "Different Textiles Limited",
      symbol: "JIVEKA",
      exchange: "NSE",
    };

    const [match] = rankStockSearchCandidates("jiveka", [jivika, exactSymbol]);

    expect(match).toEqual(exactSymbol);
  });
});
