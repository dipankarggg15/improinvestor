import type { Exchange, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type DailyClosePoint = {
  readonly instrumentId: string;
  readonly tradingDate: Date;
  readonly close: number;
};

export type ReturnCandidateInstrument = {
  readonly instrumentId: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly isin: string;
  readonly exchange: string;
  readonly symbol: string;
};

export type PriceRepository = {
  findFirstCloseOnOrAfter(instrumentId: string, requestedDate: Date): Promise<DailyClosePoint | null>;
  findLastCloseOnOrBefore(instrumentId: string, requestedDate: Date): Promise<DailyClosePoint | null>;
  findReturnCandidates(filters?: RankingFilters): Promise<ReturnCandidateInstrument[]>;
};

export type RankingFilters = {
  readonly companyIds?: string[];
  readonly exchanges?: Exchange[];
  readonly activeOnly?: boolean;
};

export class PrismaPriceRepository implements PriceRepository {
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

  async findReturnCandidates(filters: RankingFilters = {}): Promise<ReturnCandidateInstrument[]> {
    const instruments = await this.client.instrument.findMany({
      where: {
        active: filters.activeOnly ?? true,
        companyId: filters.companyIds ? { in: filters.companyIds } : undefined,
        exchange: filters.exchanges ? { in: filters.exchanges } : undefined,
      },
      orderBy: [{ company: { name: "asc" } }, { exchange: "asc" }, { symbol: "asc" }],
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
      },
      select: {
        id: true,
        name: true,
        isin: true,
      },
    });
    const companiesById = new Map(companies.map((company) => [company.id, company]));

    return instruments.map((instrument) => ({
      instrumentId: instrument.id,
      companyId: instrument.companyId,
      companyName: companiesById.get(instrument.companyId)?.name ?? "Unknown company",
      isin: companiesById.get(instrument.companyId)?.isin ?? "",
      exchange: instrument.exchange,
      symbol: instrument.symbol,
    }));
  }
}
