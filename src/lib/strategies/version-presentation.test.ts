import { describe, expect, it } from "vitest";

import {
  nseMomentumVersionMetadata,
  strategyVersionDisplayName,
  strategyVersionPresentation,
} from "./version-presentation";

describe("NSE Momentum version presentation", () => {
  it.each([
    [1, "1M/3M Vol-Adjusted · Top 20 · Hold Top 50"],
    [2, "1M/3M Vol-Adjusted · Top 20 · 5%/50% Strength Gate"],
    [3, "6M/12M Vol-Adjusted · Top 25 · Hold Top 50 · Broad NSE"],
    [4, "6M/12M Vol-Adjusted · Top 25 · Hold Top 50 · INE Equities"],
  ])("names V%i by its real rules", (versionNumber, label) => {
    expect(strategyVersionPresentation({
      strategyName: "NSE Momentum",
      versionNumber,
      storedLabel: "misleading legacy label",
    }).label).toBe(label);
  });

  it("documents the behavior that separates each version", () => {
    expect(nseMomentumVersionMetadata[1].notes).toContain("sale proceeds");
    expect(nseMomentumVersionMetadata[2].notes).toContain("3M return at least 50%");
    expect(nseMomentumVersionMetadata[3].notes).toContain("broad NSE universe");
    expect(nseMomentumVersionMetadata[4].notes).toContain("NSE INE ordinary equities");
  });

  it("removes a duplicated version prefix from legacy labels", () => {
    expect(strategyVersionDisplayName({
      strategyName: "Another Strategy",
      versionNumber: 2,
      storedLabel: "V2 Strength Filter",
    })).toBe("V2 · Strength Filter");
  });
});
