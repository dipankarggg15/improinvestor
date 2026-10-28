export type BuyingPlanInput = {
  readonly capital: number;
  readonly reservePercent: number;
  readonly maxPositions: number;
  readonly riskPerPositionPercent: number;
  readonly plannedExitPercent: number;
};

export type BuyingPlan = {
  readonly reserve: number;
  readonly deployable: number;
  readonly riskBudgetPerPosition: number;
  readonly equalWeightCap: number;
  readonly positionCap: number;
  readonly plannedInvestment: number;
  readonly unallocatedCash: number;
  readonly tranches: readonly number[];
};

export function calculateBuyingPlan(input: BuyingPlanInput): BuyingPlan {
  const capital = Math.max(0, input.capital);
  const maxPositions = Math.max(1, Math.floor(input.maxPositions));
  const reserve = capital * clamp(input.reservePercent, 0, 100) / 100;
  const deployable = Math.max(0, capital - reserve);
  const riskBudgetPerPosition = capital * clamp(input.riskPerPositionPercent, 0, 100) / 100;
  const equalWeightCap = deployable / maxPositions;
  const exitFraction = clamp(input.plannedExitPercent, 0.1, 100) / 100;
  const riskBasedCap = riskBudgetPerPosition / exitFraction;
  const positionCap = Math.min(equalWeightCap, riskBasedCap);
  const plannedInvestment = positionCap * maxPositions;
  const unallocatedCash = Math.max(0, capital - plannedInvestment);

  return {
    reserve,
    deployable,
    riskBudgetPerPosition,
    equalWeightCap,
    positionCap,
    plannedInvestment,
    unallocatedCash,
    tranches: [positionCap * 0.4, positionCap * 0.3, positionCap * 0.3],
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}
