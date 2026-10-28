import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import type { IndexConstituent } from "@/lib/market-data/index-constituents";
import { calculateIndexConstituentReturns } from "@/lib/market-data/index-constituent-returns";

export type IndexConstituentWithMarketData = IndexConstituent & {
  readonly priceDate: string | null;
  readonly lastPrice: number | null;
  readonly return1D: number | null;
  readonly return1M: number | null;
  readonly return3M: number | null;
};

type PriceRow = {
  readonly instrumentId: string;
  readonly tradingDate: Date;
  readonly close: number;
  readonly position: bigint;
};

export async function loadIndexConstituentMarketData(
  client: PrismaClient,
  stocks: readonly IndexConstituent[],
): Promise<IndexConstituentWithMarketData[]> {
  if (stocks.length === 0) return [];
  const instruments = await client.instrument.findMany({
    where: {
      active: true,
      exchange: "NSE",
      marketDataSource: "UPSTOX_REAL",
      symbol: { in: [...new Set(stocks.map((stock) => stock.symbol))] },
    },
    select: { id: true, symbol: true },
  });
  if (instruments.length === 0) return stocks.map(withoutMarketData);

  const prices = await client.$queryRaw<PriceRow[]>`
    SELECT "instrumentId", "tradingDate", close::float8 AS close, position
    FROM (
      SELECT
        "instrumentId",
        "tradingDate",
        close,
        row_number() OVER (PARTITION BY "instrumentId" ORDER BY "tradingDate" DESC) AS position
      FROM "DailyPrice"
      WHERE "instrumentId" IN (${Prisma.join(instruments.map((instrument) => instrument.id))})
        AND "marketDataSource"::text = 'UPSTOX_REAL'
    ) ranked
    WHERE position <= 64
    ORDER BY "instrumentId" ASC, position ASC
  `;
  const pricesByInstrument = new Map<string, PriceRow[]>();
  for (const price of prices) {
    const instrumentPrices = pricesByInstrument.get(price.instrumentId);
    if (instrumentPrices) instrumentPrices.push(price);
    else pricesByInstrument.set(price.instrumentId, [price]);
  }
  const instrumentBySymbol = new Map(instruments.map((instrument) => [instrument.symbol, instrument]));

  return stocks.map((stock) => {
    const instrument = instrumentBySymbol.get(stock.symbol);
    const instrumentPrices = instrument ? pricesByInstrument.get(instrument.id) ?? [] : [];
    const metrics = calculateIndexConstituentReturns(instrumentPrices.map((price) => price.close));
    return {
      ...stock,
      priceDate: instrumentPrices[0]?.tradingDate.toISOString().slice(0, 10) ?? null,
      ...metrics,
    };
  });
}

function withoutMarketData(stock: IndexConstituent): IndexConstituentWithMarketData {
  return { ...stock, priceDate: null, lastPrice: null, return1D: null, return1M: null, return3M: null };
}
