import { describe, expect, it } from "vitest";

import { buildEffectiveCounterfactualConfig } from "@/lib/counterfactuals/config";
import { momentum10V1Config } from "@/lib/strategies/config";

describe("counterfactual config", () => {
  it("merges overrides without mutating the base strategy config", () => {
    const effective = buildEffectiveCounterfactualConfig(momentum10V1Config, {
      entry: { minReturn3M: 40, maxPositions: 8 },
      momentum: { holdingRankThreshold: 50 },
      costs: { fixedFee: 25, percentFee: 0.1 },
    });

    expect(effective.strategyConfig.eligibility.returns?.return3M?.gt).toBe(40);
    expect(effective.strategyConfig.selection.maxPositions).toBe(8);
    expect(effective.momentum.holdingRankThreshold).toBe(50);
    expect(effective.costs.fixedFee).toBe(25);
    expect(momentum10V1Config.eligibility.returns?.return3M?.gt).toBe(50);
    expect(momentum10V1Config.selection.maxPositions).toBe(10);
  });
});
