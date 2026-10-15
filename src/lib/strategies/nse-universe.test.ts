import { describe, expect, it } from "vitest";

import {
  nseMomentumRawSixTwelveV3Config,
  nseMomentumRawSixTwelveV4Config,
  nseMomentumSixTwelveV3Config,
  nseMomentumSixTwelveV4Config,
  nseMomentumStrengthV2Config,
  nseMomentumWinnersV10Config,
  nseMomentumWinnersV11Config,
  nseParentMomentumFullUniverseV9Config,
  nseParentMomentumFullUniverseV10Config,
  nseParentMomentumSurvivorsV1Config,
  nseParentMomentumSurvivorsV2Config,
  nseParentMomentumSurvivorsV3Config,
} from "@/lib/strategies/config";
import { usesNseIneOrdinaryEquityUniverse } from "@/lib/strategies/historical-run-service";
import { isEligibleNseOrdinaryEquityInstrument } from "@/lib/strategies/nse-universe";

describe("NSE ordinary-equity universe", () => {
  it("accepts NSE INE ordinary equities and rejects funds and identifiable non-equities", () => {
    expect(isEligibleNseOrdinaryEquityInstrument({
      instrumentKey: "NSE_EQ|INE002A01018",
      companyName: "Reliance Industries Limited",
      symbol: "RELIANCE",
    })).toBe(true);
    expect(isEligibleNseOrdinaryEquityInstrument({
      instrumentKey: "NSE_EQ|INF846K01Z04",
      companyName: "Axis Gold ETF",
      symbol: "GOLDAXIS",
    })).toBe(false);
    expect(isEligibleNseOrdinaryEquityInstrument({
      instrumentKey: "NSE_EQ|INE000000001",
      companyName: "Example Preference Shares",
      symbol: "EXAMPLE-PREF",
    })).toBe(false);
    expect(isEligibleNseOrdinaryEquityInstrument({
      instrumentKey: "NSE_EQ|INE000000002",
      companyName: "Example REIT",
      symbol: "EXAMPLEREIT",
    })).toBe(false);
  });

  it("opts in only the successor versions of current 6M/12M strategies", () => {
    const priorVersions = [
      nseMomentumSixTwelveV3Config,
      nseMomentumRawSixTwelveV3Config,
      nseMomentumWinnersV10Config,
      nseParentMomentumFullUniverseV9Config,
      nseMomentumStrengthV2Config,
    ];
    const correctedVersions = [
      nseMomentumSixTwelveV4Config,
      nseMomentumRawSixTwelveV4Config,
      nseMomentumWinnersV11Config,
      nseParentMomentumFullUniverseV10Config,
      nseParentMomentumSurvivorsV1Config,
      nseParentMomentumSurvivorsV2Config,
      nseParentMomentumSurvivorsV3Config,
    ];

    expect(priorVersions.every((config) => !usesNseIneOrdinaryEquityUniverse(config))).toBe(true);
    expect(correctedVersions.every((config) => usesNseIneOrdinaryEquityUniverse(config))).toBe(true);
  });

  it("changes no strategy setting except universe mode", () => {
    const pairs = [
      [nseMomentumSixTwelveV3Config, nseMomentumSixTwelveV4Config],
      [nseMomentumRawSixTwelveV3Config, nseMomentumRawSixTwelveV4Config],
      [nseMomentumWinnersV10Config, nseMomentumWinnersV11Config],
      [nseParentMomentumFullUniverseV9Config, nseParentMomentumFullUniverseV10Config],
    ] as const;

    for (const [before, after] of pairs) {
      expect({
        ...after,
        nseMomentum: { ...after.nseMomentum, universeMode: undefined },
      }).toEqual(before);
    }
  });
});
