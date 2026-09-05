import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const crore = 10_000_000;

async function main() {
  const [company, instrument, dailyPrice, companyFundamentals, dataSync] = await Promise.all([
    prisma.company.count(),
    prisma.instrument.count(),
    prisma.dailyPrice.count(),
    prisma.companyFundamentals.count(),
    prisma.dataSync.count(),
  ]);
  const duplicateDailyPrices = await prisma.$queryRaw<Array<{ count: number }>>`
    select count(*)::int as count
    from (
      select "instrumentId", "tradingDate", count(*)
      from "DailyPrice"
      group by "instrumentId", "tradingDate"
      having count(*) > 1
    ) duplicates
  `;
  const instruments = await prisma.instrument.findMany({
    select: {
      companyId: true,
      exchange: true,
    },
  });
  const byCompany = new Map<string, Set<string>>();

  for (const row of instruments) {
    byCompany.set(row.companyId, new Set([...(byCompany.get(row.companyId) ?? []), row.exchange]));
  }

  const dualListedCompanies = [...byCompany.values()].filter(
    (exchanges) => exchanges.has("NSE") && exchanges.has("BSE"),
  ).length;
  const bseOnlyCompanies = [...byCompany.values()].filter(
    (exchanges) => exchanges.has("BSE") && !exchanges.has("NSE"),
  ).length;
  const priceRange = await prisma.dailyPrice.aggregate({
    _min: { tradingDate: true },
    _max: { tradingDate: true },
  });
  const fundamentalsRange = await prisma.companyFundamentals.aggregate({
    _min: { asOfDate: true },
    _max: { asOfDate: true },
  });
  const screener = await runDatabaseBackedScreener();

  console.log(
    JSON.stringify(
      {
        counts: {
          Company: company,
          Instrument: instrument,
          DailyPrice: dailyPrice,
          CompanyFundamentals: companyFundamentals,
          DataSync: dataSync,
        },
        duplicateDailyPriceGroups: duplicateDailyPrices[0]?.count ?? 0,
        dualListedCompanies,
        bseOnlyCompanies,
        priceRange: {
          min: priceRange._min.tradingDate?.toISOString().slice(0, 10),
          max: priceRange._max.tradingDate?.toISOString().slice(0, 10),
        },
        fundamentalsRange: {
          min: fundamentalsRange._min.asOfDate?.toISOString().slice(0, 10),
          max: fundamentalsRange._max.asOfDate?.toISOString().slice(0, 10),
        },
        screener,
      },
      null,
      2,
    ),
  );
}

async function runDatabaseBackedScreener() {
  const startDate = new Date("2025-03-03T00:00:00.000Z");
  const endDate = new Date("2025-12-31T00:00:00.000Z");
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      isin: true,
      instruments: {
        where: { active: true },
        select: {
          id: true,
          exchange: true,
          symbol: true,
        },
      },
    },
  });
  const candidates = companies
    .map((company) => {
      const instrument =
        company.instruments.find((item) => item.exchange === "NSE") ??
        company.instruments.find((item) => item.exchange === "BSE");

      return instrument ? { company, instrument } : null;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  const instrumentIds = candidates.map((candidate) => candidate.instrument.id);
  const companyIds = candidates.map((candidate) => candidate.company.id);
  const [prices, fundamentals] = await Promise.all([
    prisma.dailyPrice.findMany({
      where: {
        instrumentId: { in: instrumentIds },
        tradingDate: { gte: startDate, lte: endDate },
      },
      orderBy: [{ instrumentId: "asc" }, { tradingDate: "asc" }],
      select: { instrumentId: true, tradingDate: true, close: true, volume: true },
    }),
    prisma.companyFundamentals.findMany({
      where: {
        companyId: { in: companyIds },
        asOfDate: { lte: endDate },
      },
      orderBy: [{ companyId: "asc" }, { asOfDate: "desc" }],
      select: { companyId: true, marketCap: true, debtToEquity: true },
    }),
  ]);
  const startByInstrument = new Map<string, { close: number }>();
  const endByInstrument = new Map<string, { close: number }>();
  const tradedValueByInstrument = new Map<string, { total: number; count: number }>();
  const fundamentalsByCompany = new Map<string, { marketCap: number; debtToEquity: number }>();

  for (const price of prices) {
    if (!startByInstrument.has(price.instrumentId)) {
      startByInstrument.set(price.instrumentId, { close: price.close.toNumber() });
    }
    endByInstrument.set(price.instrumentId, { close: price.close.toNumber() });
    const existing = tradedValueByInstrument.get(price.instrumentId) ?? { total: 0, count: 0 };
    tradedValueByInstrument.set(price.instrumentId, {
      total: existing.total + price.close.toNumber() * Number(price.volume),
      count: existing.count + 1,
    });
  }

  for (const fundamental of fundamentals) {
    if (
      !fundamentalsByCompany.has(fundamental.companyId) &&
      fundamental.marketCap &&
      fundamental.debtToEquity
    ) {
      fundamentalsByCompany.set(fundamental.companyId, {
        marketCap: fundamental.marketCap.toNumber(),
        debtToEquity: fundamental.debtToEquity.toNumber(),
      });
    }
  }

  const rows = candidates
    .map(({ company, instrument }) => {
      const start = startByInstrument.get(instrument.id);
      const end = endByInstrument.get(instrument.id);
      const fundamental = fundamentalsByCompany.get(company.id);
      const tradedValue = tradedValueByInstrument.get(instrument.id);

      if (!start || !end || !fundamental || !tradedValue) {
        return null;
      }

      return {
        company: company.name,
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        returnPercent: ((end.close / start.close) - 1) * 100,
        marketCap: fundamental.marketCap,
        debtToEquity: fundamental.debtToEquity,
        averageTradedValue: tradedValue.total / tradedValue.count,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .filter(
      (row) =>
        row.marketCap >= 2_000 * crore &&
        row.debtToEquity <= 2 &&
        row.averageTradedValue >= 5 * crore,
    )
    .sort((left, right) => right.returnPercent - left.returnPercent);

  return {
    requestedStartDate: "2025-03-03",
    requestedEndDate: "2025-12-31",
    minMarketCap: "2000 Cr",
    maxDebtToEquity: 2,
    minAverageTradedValue: "5 Cr/day",
    rows: rows.length,
    top: rows.slice(0, 5).map((row, index) => ({
      rank: index + 1,
      company: row.company,
      symbol: row.symbol,
      exchange: row.exchange,
      returnPercent: Number(row.returnPercent.toFixed(2)),
    })),
  };
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
