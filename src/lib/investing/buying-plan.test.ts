import { describe, expect, it } from "vitest";

import { calculateBuyingPlan } from "@/lib/investing/buying-plan";

describe("buying plan", () => {
  it("caps each position by the smaller equal-weight and risk budgets", () => {
    const plan = calculateBuyingPlan({
      capital: 100_000,
      reservePercent: 20,
      maxPositions: 8,
      riskPerPositionPercent: 1,
      plannedExitPercent: 12,
    });

    expect(plan.reserve).toBe(20_000);
    expect(plan.equalWeightCap).toBe(10_000);
    expect(plan.positionCap).toBeCloseTo(8_333.33, 2);
    expect(plan.tranches).toEqual([
      plan.positionCap * 0.4,
      plan.positionCap * 0.3,
      plan.positionCap * 0.3,
    ]);
  });
});
