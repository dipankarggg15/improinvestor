import "server-only";

import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { DailyClosePoint } from "@/lib/research/price-repository";
import type {
  ScreenerStandardReturns,
  FundamentalsSnapshot,
  ScreenerCandidate,
  ScreenerPeriodData,
  ScreenerRepository,
} from "@/lib/research/screener";
import { calculateStandardReturns } from "@/lib/research/screener";

export class PrismaScreenerRepository implements ScreenerRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findFirstCloseOnOrAfter(
    instrumentId: string,
    requestedDate: Date,
  ): Promise<DailyClosePoint | null> {
    const price = await this.client.dailyPrice.findFirst({
      where: {
        instrumentId,
        tradingDate: {
          gte: requestedDate,
        },
        marketDataSource: "SYNTHETIC",
      },
      orderBy: {
        tradingDate: "asc",
      },
      select: {
        instrumentId: true,
        tradingDate: true,
        close: true,
      },
    });

    return price ? { ...price, close: price.close.toNumber() } : null;
  }

  async findLastCloseOnOrBefore(
    instrumentId: string,
    requestedDate: Date,
  ): Promise<DailyClosePoint | null> {
    const price = await this.client.dailyPrice.findFirst({
      where: {
        instrumentId,
        tradingDate: {
          lte: requestedDate,
        },
        marketDataSource: "SYNTHETIC",
      },
      orderBy: {
        tradingDate: "desc",
      },
      select: {
        instrumentId: true,
        tradingDate: true,
        close: true,
      },
    });

    return price ? { ...price, close: price.close.toNumber() } : null;
  }

  async findReturnCandidates() {
    return this.findCanonicalScreenerCandidates();
  }

  async findCanonicalScreenerCandidates(): Promise<ScreenerCandidate[]> {
    const instruments = await this.client.instrument.findMany({
      where: {
        active: true,
        marketDataSource: "SYNTHETIC",
      },
      orderBy: [{ companyId: "asc" }, { exchange: "asc" }],
      select: {
        id: true,
        companyId: true,
        exchange: true,
        symbol: true,
      },
    });

    const companies = await this.client.company.findMany({
      where: {
        id: {
          in: [...new Set(instruments.map((instrument) => instrument.companyId))],
        },
        marketDataSource: "SYNTHETIC",
      },
      select: {
        id: true,
        name: true,
        isin: true,
      },
    });
    const companiesById = new Map(companies.map((company) => [company.id, company]));
    const instrumentsByCompany = new Map<string, typeof instruments>();

    for (const instrument of instruments) {
      const companyInstruments = instrumentsByCompany.get(instrument.companyId);
      if (companyInstruments) {
        companyInstruments.push(instrument);
      } else {
        instrumentsByCompany.set(instrument.companyId, [instrument]);
      }
    }

    return [...instrumentsByCompany.entries()]
      .map(([companyId, companyInstruments]) => {
        const selected =
          companyInstruments.find((instrument) => instrument.exchange === "NSE") ??
          companyInstruments.find((instrument) => instrument.exchange === "BSE");
        const company = companiesById.get(companyId);

        return selected && company
          ? {
              companyId,
              companyName: company.name,
              isin: company.isin,
              instrumentId: selected.id,
              exchange: selected.exchange,
              symbol: selected.symbol,
            }
          : null;
      })
      .filter((candidate): candidate is ScreenerCandidate => candidate !== null)
      .sort((left, right) => left.companyName.localeCompare(right.companyName));
  }

  async findLatestFundamentals(
    companyId: string,
    asOfDate: Date,
  ): Promise<FundamentalsSnapshot | null> {
    const fundamentals = await this.client.companyFundamentals.findFirst({
      where: {
        companyId,
        asOfDate: {
          lte: asOfDate,
        },
        marketDataSource: "SYNTHETIC",
      },
      orderBy: {
        asOfDate: "desc",
      },
      select: {
        asOfDate: true,
        marketCap: true,
        debtToEquity: true,
      },
    });

    return fundamentals
      ? {
          asOfDate: fundamentals.asOfDate,
          marketCap: fundamentals.marketCap?.toNumber() ?? null,
          debtToEquity: fundamentals.debtToEquity?.toNumber() ?? null,
          peRatio: null,
        }
      : null;
  }

  async calculateAverageTradedValue(input: {
    readonly instrumentId: string;
    readonly startDate: Date;
    readonly endDate: Date;
  }): Promise<number | null> {
    const prices = await this.client.dailyPrice.findMany({
      where: {
        instrumentId: input.instrumentId,
        tradingDate: {
          gte: input.startDate,
          lte: input.endDate,
        },
        marketDataSource: "SYNTHETIC",
      },
      select: {
        close: true,
        volume: true,
      },
    });

    if (prices.length === 0) {
      return null;
    }

    const totalTradedValue = prices.reduce(
      (total, price) => total + price.close.toNumber() * Number(price.volume),
      0,
    );

    return totalTradedValue / prices.length;
  }

  async findScreenerPeriodData(input: {
    readonly candidates: ScreenerCandidate[];
    readonly startDate: Date;
    readonly endDate: Date;
  }): Promise<ScreenerPeriodData> {
    const instrumentIds = input.candidates.map((candidate) => candidate.instrumentId);
    const companyIds = input.candidates.map((candidate) => candidate.companyId);
    const earliestDisplayReturnDate = earliestStandardReturnStartDate(input.endDate);
    const earliestPriceDate = earliestDisplayReturnDate < input.startDate
      ? earliestDisplayReturnDate
      : input.startDate;

    const [prices, fundamentals] = await Promise.all([
      this.client.dailyPrice.findMany({
        where: {
          instrumentId: {
            in: instrumentIds,
          },
          tradingDate: {
            gte: earliestPriceDate,
            lte: input.endDate,
          },
          marketDataSource: "SYNTHETIC",
        },
        orderBy: [{ instrumentId: "asc" }, { tradingDate: "asc" }],
        select: {
          instrumentId: true,
          tradingDate: true,
          close: true,
          volume: true,
        },
      }),
      this.client.companyFundamentals.findMany({
        where: {
          companyId: {
            in: companyIds,
          },
          asOfDate: {
            lte: input.endDate,
          },
          marketDataSource: "SYNTHETIC",
        },
        orderBy: [{ companyId: "asc" }, { asOfDate: "desc" }],
        select: {
          companyId: true,
          asOfDate: true,
          marketCap: true,
          debtToEquity: true,
        },
      }),
    ]);

    const priceRepository = new ScreenerPeriodPriceRepository(prices.map((price) => ({
      instrumentId: price.instrumentId,
      tradingDate: price.tradingDate,
      close: price.close.toNumber(),
    })));
    const startPricesByInstrumentId = new Map<string, { tradingDate: Date; close: number }>();
    const endPricesByInstrumentId = new Map<string, { tradingDate: Date; close: number }>();
    const tradedValueTotals = new Map<string, { total: number; count: number }>();
    const fundamentalsByCompanyId = new Map<string, FundamentalsSnapshot>();
    const standardReturnsByInstrumentId = new Map<string, ScreenerStandardReturns>();

    for (const price of prices) {
      if (price.tradingDate >= input.startDate && !startPricesByInstrumentId.has(price.instrumentId)) {
        startPricesByInstrumentId.set(price.instrumentId, {
          tradingDate: price.tradingDate,
          close: price.close.toNumber(),
        });
      }

      endPricesByInstrumentId.set(price.instrumentId, {
        tradingDate: price.tradingDate,
        close: price.close.toNumber(),
      });

      if (price.tradingDate >= input.startDate) {
        const existing = tradedValueTotals.get(price.instrumentId) ?? { total: 0, count: 0 };
        tradedValueTotals.set(price.instrumentId, {
          total: existing.total + price.close.toNumber() * Number(price.volume),
          count: existing.count + 1,
        });
      }
    }

    for (const fundamental of fundamentals) {
      if (!fundamentalsByCompanyId.has(fundamental.companyId)) {
        fundamentalsByCompanyId.set(fundamental.companyId, {
          asOfDate: fundamental.asOfDate,
          marketCap: fundamental.marketCap?.toNumber() ?? null,
          debtToEquity: fundamental.debtToEquity?.toNumber() ?? null,
          peRatio: null,
        });
      }
    }

    await Promise.all(input.candidates.map(async (candidate) => {
      standardReturnsByInstrumentId.set(
        candidate.instrumentId,
        await calculateStandardReturns(priceRepository, candidate.instrumentId, input.endDate),
      );
    }));

    return {
      startPricesByInstrumentId,
      endPricesByInstrumentId,
      averageTradedValueByInstrumentId: new Map(
        [...tradedValueTotals.entries()].map(([instrumentId, value]) => [
          instrumentId,
          value.total / value.count,
        ]),
      ),
      fundamentalsByCompanyId,
      standardReturnsByInstrumentId,
    };
  }
}

class ScreenerPeriodPriceRepository {
  constructor(private readonly prices: readonly { readonly instrumentId: string; readonly tradingDate: Date; readonly close: number }[]) {}

  async findReturnCandidates() {
    return [];
  }

  async findFirstCloseOnOrAfter(instrumentId: string, requestedDate: Date) {
    return this.prices.find((price) => (
      price.instrumentId === instrumentId &&
      price.tradingDate.getTime() >= requestedDate.getTime()
    )) ?? null;
  }

  async findLastCloseOnOrBefore(instrumentId: string, requestedDate: Date) {
    for (let index = this.prices.length - 1; index >= 0; index -= 1) {
      const price = this.prices[index]!;
      if (
        price.instrumentId === instrumentId &&
        price.tradingDate.getTime() <= requestedDate.getTime()
      ) {
        return price;
      }
    }

    return null;
  }
}

function earliestStandardReturnStartDate(endDate: Date) {
  const threeMonths = new Date(endDate);
  threeMonths.setUTCMonth(threeMonths.getUTCMonth() - 3);

  const oneWeek = new Date(endDate);
  oneWeek.setUTCDate(oneWeek.getUTCDate() - 7);

  return threeMonths < oneWeek ? threeMonths : oneWeek;
}
