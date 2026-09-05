import { Prisma } from "@prisma/client";

import { postExitHorizons, targetDateForHorizon, type PostExitHorizonKey } from "@/lib/exits/horizons";
import { decimal } from "@/lib/portfolio/accounting";

export type ObservationPricePoint = {
  readonly tradingDate: Date;
  readonly close: Prisma.Decimal | string | number;
};

export type CalculatedPostExitObservation = {
  readonly horizon: PostExitHorizonKey;
  readonly status: "COMPLETED" | "PENDING" | "DATA_NOT_AVAILABLE";
  readonly targetDate: Date;
  readonly actualPriceDate: Date | null;
  readonly actualPrice: Prisma.Decimal | null;
  readonly exitReferencePrice: Prisma.Decimal;
  readonly returnSinceExit: Prisma.Decimal | null;
};

export type PathStats = {
  readonly targetDate: string;
  readonly actualWindowEndDate: string | null;
  readonly complete: boolean;
  readonly maximumPrice: string | null;
  readonly maximumPriceDate: string | null;
  readonly maximumGainPercent: string | null;
  readonly minimumPrice: string | null;
  readonly minimumPriceDate: string | null;
  readonly maximumDeclinePercent: string | null;
  readonly missedUpsidePercent: string | null;
};

export function calculatePostExitObservations(input: {
  readonly exitDate: Date;
  readonly exitReferencePrice: Prisma.Decimal | string | number;
  readonly pricesAfterExit: readonly ObservationPricePoint[];
  readonly asOfDate: Date;
}) {
  return postExitHorizons.map((horizon) => calculatePostExitObservation({ ...input, horizon }));
}

export function calculatePostExitObservation(input: {
  readonly horizon: PostExitHorizonKey;
  readonly exitDate: Date;
  readonly exitReferencePrice: Prisma.Decimal | string | number;
  readonly pricesAfterExit: readonly ObservationPricePoint[];
  readonly asOfDate: Date;
}): CalculatedPostExitObservation {
  const targetDate = targetDateForHorizon(input.exitDate, input.horizon);
  const exitReferencePrice = decimal(input.exitReferencePrice);

  if (targetDate > input.asOfDate) {
    return {
      horizon: input.horizon,
      status: "PENDING",
      targetDate,
      actualPriceDate: null,
      actualPrice: null,
      exitReferencePrice,
      returnSinceExit: null,
    };
  }

  const actual = [...input.pricesAfterExit]
    .sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime())
    .find((price) => price.tradingDate >= targetDate);

  if (!actual) {
    return {
      horizon: input.horizon,
      status: "DATA_NOT_AVAILABLE",
      targetDate,
      actualPriceDate: null,
      actualPrice: null,
      exitReferencePrice,
      returnSinceExit: null,
    };
  }

  const actualPrice = decimal(actual.close);
  return {
    horizon: input.horizon,
    status: "COMPLETED",
    targetDate,
    actualPriceDate: actual.tradingDate,
    actualPrice,
    exitReferencePrice,
    returnSinceExit: actualPrice.div(exitReferencePrice).minus(1).mul(100),
  };
}

export function calculatePathStats(input: {
  readonly exitDate: Date;
  readonly exitReferencePrice: Prisma.Decimal | string | number;
  readonly pricesAfterExit: readonly ObservationPricePoint[];
  readonly horizon: Exclude<PostExitHorizonKey, "ONE_WEEK">;
}) {
  const targetDate = targetDateForHorizon(input.exitDate, input.horizon);
  const prices = input.pricesAfterExit
    .filter((price) => price.tradingDate > input.exitDate && price.tradingDate <= targetDate)
    .sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime());
  const exitReferencePrice = decimal(input.exitReferencePrice);
  const max = prices.reduce<ObservationPricePoint | null>(
    (best, price) => (!best || decimal(price.close).gt(decimal(best.close)) ? price : best),
    null,
  );
  const min = prices.reduce<ObservationPricePoint | null>(
    (best, price) => (!best || decimal(price.close).lt(decimal(best.close)) ? price : best),
    null,
  );
  const actualWindowEnd = prices.at(-1)?.tradingDate ?? null;

  return {
    targetDate: toDateKey(targetDate),
    actualWindowEndDate: actualWindowEnd ? toDateKey(actualWindowEnd) : null,
    complete: actualWindowEnd !== null && actualWindowEnd >= targetDate,
    maximumPrice: max ? decimal(max.close).toFixed(4) : null,
    maximumPriceDate: max ? toDateKey(max.tradingDate) : null,
    maximumGainPercent: max ? decimal(max.close).div(exitReferencePrice).minus(1).mul(100).toFixed(4) : null,
    minimumPrice: min ? decimal(min.close).toFixed(4) : null,
    minimumPriceDate: min ? toDateKey(min.tradingDate) : null,
    maximumDeclinePercent: min ? decimal(min.close).div(exitReferencePrice).minus(1).mul(100).toFixed(4) : null,
    missedUpsidePercent: max ? decimal(max.close).div(exitReferencePrice).minus(1).mul(100).toFixed(4) : null,
  } satisfies PathStats;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
