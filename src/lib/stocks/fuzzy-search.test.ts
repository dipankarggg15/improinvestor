import { describe, expect, it } from "vitest";

import { rankStockSearchCandidates } from "@/lib/stocks/fuzzy-search";

const jivika = {
  companyId: "company-jivika",
  instrumentId: "instrument-jivika-nse",
  companyName: "Jivika Textiles 125 Limited",
  symbol: "JIVITE125",
  exchange: "NSE",
};

const aarav = {
  companyId: "company-aarav",
  instrumentId: "instrument-aarav-nse",
  companyName: "Aarav Appliances 169 Limited",
  symbol: "AARAP169",
  exchange: "NSE",
};

const weakerTextile = {
  companyId: "company-weaker",
  instrumentId: "instrument-weaker-nse",
  companyName: "Jain Industrial Textiles Limited",
  symbol: "JAINTE",
  exchange: "NSE",
};

describe("rankStockSearchCandidates", () => {
  it.each([
    "Jivika",
    "Jivika Textile",
    "Jiveka",
    "Jevika",
    "Jiveka Textile",
    "Jevika Textile",
    "JIVITE125",
  ])("finds Jivika Textiles for %s", (query) => {
    const [match] = rankStockSearchCandidates(query, [weakerTextile, aarav, jivika]);

    expect(match).toEqual(expect.objectContaining({ companyId: jivika.companyId }));
  });

  it.each(["Aarav", "Arav Appliance", "AARAP169"])("also handles another company for %s", (query) => {
    const [match] = rankStockSearchCandidates(query, [weakerTextile, jivika, aarav]);

    expect(match).toEqual(expect.objectContaining({ companyId: aarav.companyId }));
  });

  it("keeps exact symbol matches ahead of weaker fuzzy matches", () => {
    const exactSymbol = {
      companyId: "company-symbol",
      instrumentId: "instrument-symbol",
      companyName: "Different Textiles Limited",
      symbol: "JEVIKA",
      exchange: "NSE",
    };

    const [match] = rankStockSearchCandidates("JEVIKA", [jivika, exactSymbol]);

    expect(match).toEqual(expect.objectContaining({ companyId: exactSymbol.companyId }));
  });

  it("keeps exact company matches ahead of weaker fuzzy matches", () => {
    const [match] = rankStockSearchCandidates("Aarav Appliances 169 Limited", [jivika, aarav]);

    expect(match).toEqual(expect.objectContaining({ companyId: aarav.companyId }));
  });
});
