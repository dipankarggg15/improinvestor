import { Prisma } from "@prisma/client";

import { decimal } from "@/lib/portfolio/accounting";

const hundred = new Prisma.Decimal(100);
const daysPerYear = 365.2425;

export function average(values: readonly Prisma.Decimal[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0)).div(values.length);
}

export function median(values: readonly Prisma.Decimal[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left.comparedTo(right));
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return sorted[middle - 1]!.plus(sorted[middle]!).div(2);
}

export function standardDeviation(values: readonly Prisma.Decimal[]) {
  if (values.length < 2) return null;
  const mean = average(values);
  if (!mean) return null;
  const variance = values
    .reduce((sum, value) => sum.plus(value.minus(mean).pow(2)), new Prisma.Decimal(0))
    .div(values.length - 1);
  return new Prisma.Decimal(Math.sqrt(variance.toNumber()));
}

export function totalReturnPercent(beginningValue: Prisma.Decimal | string | number, endingValue: Prisma.Decimal | string | number) {
  const beginning = decimal(beginningValue);
  if (beginning.lte(0)) return null;
  return decimal(endingValue).div(beginning).minus(1).mul(hundred);
}

export function cagrPercent(input: {
  readonly beginningValue: Prisma.Decimal | string | number;
  readonly endingValue: Prisma.Decimal | string | number;
  readonly startDate: Date;
  readonly endDate: Date;
}) {
  const beginning = decimal(input.beginningValue);
  const ending = decimal(input.endingValue);
  const elapsedDays = elapsedCalendarDays(input.startDate, input.endDate);
  if (beginning.lte(0) || ending.lte(0) || elapsedDays <= 0) return null;
  const annualized = Math.pow(ending.div(beginning).toNumber(), daysPerYear / elapsedDays) - 1;
  if (!Number.isFinite(annualized)) return null;
  return new Prisma.Decimal(annualized).mul(hundred);
}

export function xirrPercent(cashFlows: readonly DatedCashFlow[]) {
  const values = cashFlows.map((flow) => decimal(flow.amount));
  if (!values.some((value) => value.lt(0)) || !values.some((value) => value.gt(0))) return null;

  const ordered = [...cashFlows].sort((left, right) => left.date.getTime() - right.date.getTime());
  const baseDate = ordered[0]!.date;
  let rate = 0.1;

  for (let index = 0; index < 100; index += 1) {
    const { value, derivative } = xnpvAndDerivative(ordered, baseDate, rate);
    if (Math.abs(value) < 1e-7) return new Prisma.Decimal(rate).mul(hundred);
    if (Math.abs(derivative) < 1e-12) break;
    const nextRate = rate - value / derivative;
    if (!Number.isFinite(nextRate) || nextRate <= -0.999999999) break;
    if (Math.abs(nextRate - rate) < 1e-10) return new Prisma.Decimal(nextRate).mul(hundred);
    rate = nextRate;
  }

  return bisectionXirr(ordered, baseDate);
}

export function elapsedCalendarDays(startDate: Date, endDate: Date) {
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000);
}

export type DatedCashFlow = {
  readonly date: Date;
  readonly amount: Prisma.Decimal | string | number;
};

function xnpvAndDerivative(cashFlows: readonly DatedCashFlow[], baseDate: Date, rate: number) {
  let value = 0;
  let derivative = 0;
  for (const flow of cashFlows) {
    const years = elapsedCalendarDays(baseDate, flow.date) / daysPerYear;
    const amount = decimal(flow.amount).toNumber();
    const denominator = Math.pow(1 + rate, years);
    value += amount / denominator;
    derivative += (-years * amount) / Math.pow(1 + rate, years + 1);
  }
  return { value, derivative };
}

function bisectionXirr(cashFlows: readonly DatedCashFlow[], baseDate: Date) {
  let low = -0.9999;
  let high = 10;
  let lowValue = xnpvAndDerivative(cashFlows, baseDate, low).value;
  let highValue = xnpvAndDerivative(cashFlows, baseDate, high).value;

  if (Math.sign(lowValue) === Math.sign(highValue)) return null;
  for (let index = 0; index < 200; index += 1) {
    const mid = (low + high) / 2;
    const midValue = xnpvAndDerivative(cashFlows, baseDate, mid).value;
    if (Math.abs(midValue) < 1e-7) return new Prisma.Decimal(mid).mul(hundred);
    if (Math.sign(midValue) === Math.sign(lowValue)) {
      low = mid;
      lowValue = midValue;
    } else {
      high = mid;
      highValue = midValue;
    }
  }
  if (!Number.isFinite(highValue)) return null;
  return new Prisma.Decimal((low + high) / 2).mul(hundred);
}
