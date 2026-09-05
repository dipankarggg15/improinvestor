import { describe, expect, it } from "vitest";

import {
  assertStrategyVersionConfigEditable,
  canEditStrategyVersionConfig,
  getNextStrategyVersionNumber,
} from "@/lib/strategies/versioning";

describe("strategy versioning", () => {
  it("assigns the next version number after the highest existing version", () => {
    expect(getNextStrategyVersionNumber([])).toBe(1);
    expect(getNextStrategyVersionNumber([1, 2, 4])).toBe(5);
  });

  it("prevents editing a version once completed runs exist", () => {
    expect(canEditStrategyVersionConfig(0)).toBe(true);
    expect(canEditStrategyVersionConfig(1)).toBe(false);
    expect(() => assertStrategyVersionConfigEditable(1)).toThrow(/cannot be edited/i);
  });
});
