import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { generateSyntheticMarket, syntheticMarketSeed } from "../src/lib/synthetic-market/generator";

const prisma = new PrismaClient();
const chunkSize = 5_000;

async function main() {
  assertSafeSyntheticReset();

  const market = generateSyntheticMarket({ seed: syntheticMarketSeed, companyCount: 300 });

  await prisma.$transaction([
    prisma.dailyPrice.deleteMany(),
    prisma.companyFundamentals.deleteMany(),
    prisma.instrument.deleteMany(),
    prisma.company.deleteMany(),
    prisma.dataSync.deleteMany({
      where: {
        provider: "mock",
        dataType: "synthetic_market",
      },
    }),
  ]);

  const syncJob = await prisma.dataSync.create({
    data: {
      provider: "mock",
      dataType: "synthetic_market",
      status: "RUNNING",
      recordsProcessed: 0,
    },
  });

  await prisma.company.createMany({
    data: market.companies.map((company) => ({
      name: company.name,
      isin: company.isin,
      sector: company.sector,
    })),
  });

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      isin: true,
    },
  });
  const companyIdByIsin = new Map(companies.map((company) => [company.isin, company.id]));

  await prisma.instrument.createMany({
    data: market.companies.flatMap((company) => {
      const companyId = companyIdByIsin.get(company.isin);
      if (!companyId) {
        throw new Error(`Missing company for synthetic ISIN ${company.isin}`);
      }

      return company.instruments.map((instrument) => ({
        companyId,
        exchange: instrument.exchange,
        symbol: instrument.symbol,
        instrumentKey: instrument.instrumentKey,
        active: instrument.active,
      }));
    }),
  });

  const instruments = await prisma.instrument.findMany({
    select: {
      id: true,
      instrumentKey: true,
    },
  });
  const instrumentIdByKey = new Map(
    instruments.map((instrument) => [instrument.instrumentKey, instrument.id]),
  );

  await createInChunks(
    market.fundamentals.map((fundamental) => {
      const companyId = companyIdByIsin.get(fundamental.isin);
      if (!companyId) {
        throw new Error(`Missing company for synthetic fundamentals ${fundamental.isin}`);
      }

      return {
        companyId,
        asOfDate: fundamental.asOfDate,
        marketCap: fundamental.marketCap,
        debtToEquity: fundamental.debtToEquity,
      };
    }),
    (data) => prisma.companyFundamentals.createMany({ data }),
  );

  await createInChunks(
    market.candles.map((candle) => {
      const instrumentId = instrumentIdByKey.get(candle.instrumentKey);
      if (!instrumentId) {
        throw new Error(`Missing instrument for synthetic candle ${candle.instrumentKey}`);
      }

      return {
        instrumentId,
        tradingDate: candle.tradingDate,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      };
    }),
    (data) => prisma.dailyPrice.createMany({ data }),
  );

  await prisma.dataSync.update({
    where: {
      id: syncJob.id,
    },
    data: {
      completedAt: new Date(),
      status: "COMPLETED",
      recordsProcessed: market.companies.length + instruments.length + market.fundamentals.length + market.candles.length,
    },
  });

  console.log(
    JSON.stringify(
      {
        seed: market.seed,
        companies: market.companies.length,
        instruments: instruments.length,
        dailyPrices: market.candles.length,
        fundamentals: market.fundamentals.length,
        regimes: market.regimes,
      },
      null,
      2,
    ),
  );
}

async function createInChunks<T>(items: T[], create: (data: T[]) => Promise<unknown>) {
  for (let index = 0; index < items.length; index += chunkSize) {
    await create(items.slice(index, index + chunkSize));
  }
}

function assertSafeSyntheticReset() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to reset synthetic market data while NODE_ENV=production.");
  }

  if (process.env.ALLOW_SYNTHETIC_MARKET_RESET !== "true") {
    throw new Error("Set ALLOW_SYNTHETIC_MARKET_RESET=true to rebuild synthetic market data.");
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
