import type { PriceRepository } from "@/lib/research/price-repository";

export type PointToPointReturn = {
  readonly instrumentId: string;
  readonly requestedStartDate: Date;
  readonly requestedEndDate: Date;
  readonly actualStartDate: Date;
  readonly actualEndDate: Date;
  readonly startClose: number;
  readonly endClose: number;
  readonly returnPercent: number;
};

export async function calculatePointToPointReturn(
  repository: PriceRepository,
  input: {
    readonly instrumentId: string;
    readonly startDate: Date;
    readonly endDate: Date;
  },
): Promise<PointToPointReturn | null> {
  if (input.startDate > input.endDate) {
    throw new Error("startDate must be on or before endDate.");
  }

  const [startPrice, endPrice] = await Promise.all([
    repository.findFirstCloseOnOrAfter(input.instrumentId, input.startDate),
    repository.findLastCloseOnOrBefore(input.instrumentId, input.endDate),
  ]);

  if (!startPrice || !endPrice || startPrice.tradingDate > endPrice.tradingDate) {
    return null;
  }

  return {
    instrumentId: input.instrumentId,
    requestedStartDate: input.startDate,
    requestedEndDate: input.endDate,
    actualStartDate: startPrice.tradingDate,
    actualEndDate: endPrice.tradingDate,
    startClose: startPrice.close,
    endClose: endPrice.close,
    returnPercent: ((endPrice.close / startPrice.close) - 1) * 100,
  };
}
