import type { PriceRepository } from "@/lib/research/price-repository";
import { calculatePointToPointReturn } from "@/lib/research/returns";

export const standardReturnDefinitions = {
  oneWeek: { label: "1W", tradingSessions: 5 },
  oneMonth: { label: "1M", calendarMonths: 1 },
  threeMonths: { label: "3M", calendarMonths: 3 },
  sixMonths: { label: "6M", calendarMonths: 6 },
  oneYear: { label: "1Y", calendarYears: 1 },
} as const;

export async function calculateArbitraryDateReturn(
  repository: PriceRepository,
  input: {
    readonly instrumentId: string;
    readonly startDate: Date;
    readonly endDate: Date;
  },
) {
  return calculatePointToPointReturn(repository, input);
}

export async function calculateOneWeekReturn(
  repository: PriceRepository,
  input: {
    readonly instrumentId: string;
    readonly endDate: Date;
  },
) {
  const startDate = new Date(input.endDate);
  startDate.setUTCDate(startDate.getUTCDate() - standardReturnDefinitions.oneWeek.tradingSessions - 2);

  return calculatePointToPointReturn(repository, {
    instrumentId: input.instrumentId,
    startDate,
    endDate: input.endDate,
  });
}

export async function calculateOneMonthReturn(
  repository: PriceRepository,
  input: {
    readonly instrumentId: string;
    readonly endDate: Date;
  },
) {
  return calculateCalendarRelativeReturn(repository, {
    ...input,
    months: standardReturnDefinitions.oneMonth.calendarMonths,
  });
}

export async function calculateThreeMonthReturn(
  repository: PriceRepository,
  input: {
    readonly instrumentId: string;
    readonly endDate: Date;
  },
) {
  return calculateCalendarRelativeReturn(repository, {
    ...input,
    months: standardReturnDefinitions.threeMonths.calendarMonths,
  });
}

export async function calculateSixMonthReturn(
  repository: PriceRepository,
  input: {
    readonly instrumentId: string;
    readonly endDate: Date;
  },
) {
  return calculateCalendarRelativeReturn(repository, {
    ...input,
    months: standardReturnDefinitions.sixMonths.calendarMonths,
  });
}

export async function calculateOneYearReturn(
  repository: PriceRepository,
  input: {
    readonly instrumentId: string;
    readonly endDate: Date;
  },
) {
  const startDate = new Date(input.endDate);
  startDate.setUTCFullYear(startDate.getUTCFullYear() - standardReturnDefinitions.oneYear.calendarYears);

  return calculatePointToPointReturn(repository, {
    instrumentId: input.instrumentId,
    startDate,
    endDate: input.endDate,
  });
}

function calculateCalendarRelativeReturn(
  repository: PriceRepository,
  input: {
    readonly instrumentId: string;
    readonly endDate: Date;
    readonly months: number;
  },
) {
  const startDate = new Date(input.endDate);
  startDate.setUTCMonth(startDate.getUTCMonth() - input.months);

  return calculatePointToPointReturn(repository, {
    instrumentId: input.instrumentId,
    startDate,
    endDate: input.endDate,
  });
}
