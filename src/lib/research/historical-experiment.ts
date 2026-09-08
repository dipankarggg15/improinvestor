import type { Exchange, Prisma, PrismaClient } from "@prisma/client";

const realSource = "UPSTOX_REAL";
const crore = 10_000_000;

export type HistoricalFilterSortKey =
  | "rank"
  | "company"
  | "symbol"
  | "exchange"
  | "price"
  | "return"
  | "oneWeekReturn"
  | "oneMonthReturn"
  | "threeMonthReturn"
  | "averageTradedValue";

export type HistoricalSortDirection = "asc" | "desc";

export type HistoricalFilterInput = {
  readonly startDate: Date;
  readonly endDate: Date;
  readonly minAverageTradedValue: number;
  readonly minReturnPercent?: number | null;
  readonly maxReturnPercent?: number | null;
  readonly sortBy: HistoricalFilterSortKey;
  readonly sortDirection: HistoricalSortDirection;
};

export type HistoricalFilterRow = {
  readonly rank: number;
  readonly companyId: string;
  readonly companyName: string;
  readonly isin: string;
  readonly instrumentId: string;
  readonly symbol: string;
  readonly exchange: Exchange;
  readonly startPrice: number;
  readonly endPrice: number;
  readonly price: number;
  readonly requestedStartDate: string;
  readonly requestedEndDate: string;
  readonly actualStartDate: string;
  readonly actualEndDate: string;
  readonly returnPercent: number;
  readonly oneWeekReturnPercent: number | null;
  readonly oneMonthReturnPercent: number | null;
  readonly threeMonthReturnPercent: number | null;
  readonly averageTradedValue: number;
};

export type HistoricalFilterResult = {
  readonly rows: HistoricalFilterRow[];
  readonly excluded: {
    readonly missingPrices: number;
    readonly liquidity: number;
    readonly returnFilter: number;
  };
};

export type HistoricalReturnInput = {
  readonly instrumentIds: readonly string[];
  readonly startDate: Date;
  readonly endDate: Date;
};

export type HistoricalReturnRow = {
  readonly companyId: string;
  readonly companyName: string;
  readonly isin: string;
  readonly instrumentId: string;
  readonly symbol: string;
  readonly exchange: Exchange;
  readonly requestedStartDate: string;
  readonly requestedEndDate: string;
  readonly actualStartDate: string | null;
  readonly actualEndDate: string | null;
  readonly startPrice: number | null;
  readonly endPrice: number | null;
  readonly returnPercent: number | null;
  readonly excludedReason: string | null;
};

export type HistoricalReturnResult = {
  readonly rows: HistoricalReturnRow[];
  readonly selectedCount: number;
  readonly includedCount: number;
  readonly excludedCount: number;
  readonly averageReturnPercent: number | null;
};

export type ManualReturnPositionInput = {
  readonly id?: string | null;
  readonly companyId: string;
  readonly instrumentId: string;
  readonly requestedStartDate: Date;
  readonly requestedEndDate: Date;
};

export type ReturnExperimentStats = {
  readonly totalPositions: number;
  readonly validPositions: number;
  readonly averagePositionReturnPercent: number | null;
  readonly medianPositionReturnPercent: number | null;
  readonly winningPositions: number;
  readonly losingPositions: number;
  readonly winRatePercent: number | null;
  readonly bestPositionReturnPercent: number | null;
  readonly worstPositionReturnPercent: number | null;
  readonly averageHoldingDays: number | null;
};

export type ReturnExperimentPositionView = HistoricalReturnRow & {
  readonly id: string;
  readonly holdingDays: number | null;
  readonly createdAt: string;
};

export type ReturnExperimentView = {
  readonly id: string;
  readonly name: string | null;
  readonly status: "TEMPORARY" | "SAVED";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly savedAt: string | null;
  readonly positions: ReturnExperimentPositionView[];
  readonly stats: ReturnExperimentStats;
};

export type SavedReturnExperimentSummary = {
  readonly id: string;
  readonly name: string;
  readonly savedAt: string;
  readonly stats: ReturnExperimentStats;
};

type Candidate = {
  readonly companyId: string;
  readonly companyName: string;
  readonly isin: string;
  readonly instrumentId: string;
  readonly symbol: string;
  readonly exchange: Exchange;
};

type PricePoint = {
  readonly instrumentId: string;
  readonly tradingDate: Date;
  readonly close: number;
  readonly volume: number;
};

type RawFilterRow = {
  readonly companyId: string;
  readonly companyName: string;
  readonly isin: string;
  readonly instrumentId: string;
  readonly symbol: string;
  readonly exchange: string;
  readonly startDate: Date | null;
  readonly startClose: unknown;
  readonly endDate: Date | null;
  readonly endClose: unknown;
  readonly oneWeekStartClose: unknown;
  readonly oneMonthStartClose: unknown;
  readonly threeMonthStartClose: unknown;
  readonly averageTradedValue: unknown;
};

const returnExperimentInclude = {
  positions: {
    orderBy: [{ createdAt: "asc" as const }],
    include: {
      company: { select: { id: true, name: true, isin: true } },
      instrument: { select: { id: true, exchange: true, symbol: true } },
    },
  },
} satisfies Prisma.ReturnExperimentInclude;

export class HistoricalExperimentRepository {
  constructor(private readonly client?: PrismaClient) {}

  async runFilter(input: HistoricalFilterInput): Promise<HistoricalFilterResult> {
    assertDateOrder(input.startDate, input.endDate);

    const client = await this.getClient();
    if ("$queryRaw" in client) {
      return this.runFilterWithSql(client, input);
    }

    const candidates = await this.findCanonicalCandidates();
    const earliestDate = minDate(
      input.startDate,
      addUtcDays(input.endDate, -9),
      addUtcMonths(input.endDate, -1),
      addUtcMonths(input.endDate, -3),
    );
    const prices = await this.loadPrices(candidates.map((candidate) => candidate.instrumentId), earliestDate, input.endDate);
    const pricesByInstrument = groupPrices(prices);
    const rows: Omit<HistoricalFilterRow, "rank">[] = [];
    const excluded = { missingPrices: 0, liquidity: 0, returnFilter: 0 };

    for (const candidate of candidates) {
      const points = pricesByInstrument.get(candidate.instrumentId) ?? [];
      const start = firstOnOrAfter(points, input.startDate);
      const end = lastOnOrBefore(points, input.endDate);

      if (!start || !end || start.tradingDate > end.tradingDate || start.close <= 0) {
        excluded.missingPrices += 1;
        continue;
      }

      const averageTradedValue = calculateAverageTradedValue(points, input.startDate, input.endDate);
      if (averageTradedValue === null || averageTradedValue < input.minAverageTradedValue) {
        excluded.liquidity += 1;
        continue;
      }

      const returnPercent = calculateReturnPercent(start.close, end.close);
      if (
        (input.minReturnPercent !== null && input.minReturnPercent !== undefined && returnPercent < input.minReturnPercent) ||
        (input.maxReturnPercent !== null && input.maxReturnPercent !== undefined && returnPercent > input.maxReturnPercent)
      ) {
        excluded.returnFilter += 1;
        continue;
      }

      rows.push({
        ...candidate,
        startPrice: start.close,
        endPrice: end.close,
        price: end.close,
        requestedStartDate: formatDate(input.startDate),
        requestedEndDate: formatDate(input.endDate),
        actualStartDate: formatDate(start.tradingDate),
        actualEndDate: formatDate(end.tradingDate),
        returnPercent,
        oneWeekReturnPercent: calculateWindowReturn(points, addUtcDays(input.endDate, -9), input.endDate),
        oneMonthReturnPercent: calculateWindowReturn(points, addUtcMonths(input.endDate, -1), input.endDate),
        threeMonthReturnPercent: calculateWindowReturn(points, addUtcMonths(input.endDate, -3), input.endDate),
        averageTradedValue,
      });
    }

    return {
      rows: sortFilterRows(rows, input.sortBy, input.sortDirection).map((row, index) => ({ ...row, rank: index + 1 })),
      excluded,
    };
  }

  async calculateReturns(input: HistoricalReturnInput): Promise<HistoricalReturnResult> {
    assertDateOrder(input.startDate, input.endDate);

    const uniqueInstrumentIds = [...new Set(input.instrumentIds)].filter(Boolean);
    if (uniqueInstrumentIds.length === 0) {
      return { rows: [], selectedCount: 0, includedCount: 0, excludedCount: 0, averageReturnPercent: null };
    }

    const [candidates, prices] = await Promise.all([
      this.findCandidatesByInstrumentIds(uniqueInstrumentIds),
      this.loadPrices(uniqueInstrumentIds, input.startDate, input.endDate),
    ]);
    const pricesByInstrument = groupPrices(prices);
    const candidateByInstrument = new Map(candidates.map((candidate) => [candidate.instrumentId, candidate]));
    const rows: HistoricalReturnRow[] = uniqueInstrumentIds.map((instrumentId) => {
      const candidate = candidateByInstrument.get(instrumentId);
      const points = pricesByInstrument.get(instrumentId) ?? [];
      const start = firstOnOrAfter(points, input.startDate);
      const end = lastOnOrBefore(points, input.endDate);
      const invalidPrice = start && end && start.close > 0 && start.tradingDate <= end.tradingDate ? null : "No valid historical price";
      const returnPercent = start && end && !invalidPrice ? calculateReturnPercent(start.close, end.close) : null;

      return {
        companyId: candidate?.companyId ?? "",
        companyName: candidate?.companyName ?? "Unknown stock",
        isin: candidate?.isin ?? "",
        instrumentId,
        symbol: candidate?.symbol ?? "",
        exchange: candidate?.exchange ?? "NSE",
        requestedStartDate: formatDate(input.startDate),
        requestedEndDate: formatDate(input.endDate),
        actualStartDate: start ? formatDate(start.tradingDate) : null,
        actualEndDate: end ? formatDate(end.tradingDate) : null,
        startPrice: start?.close ?? null,
        endPrice: end?.close ?? null,
        returnPercent,
        excludedReason: candidate ? invalidPrice : "Stock no longer found",
      };
    });
    const validReturns = rows
      .map((row) => row.returnPercent)
      .filter((value): value is number => value !== null && Number.isFinite(value));

    return {
      rows,
      selectedCount: uniqueInstrumentIds.length,
      includedCount: validReturns.length,
      excludedCount: uniqueInstrumentIds.length - validReturns.length,
      averageReturnPercent: validReturns.length > 0
        ? validReturns.reduce((total, value) => total + value, 0) / validReturns.length
        : null,
    };
  }

  async getActiveTemporaryExperiment(): Promise<ReturnExperimentView | null> {
    const client = await this.getClient();
    const experiment = await client.returnExperiment.findFirst({
      where: { status: "TEMPORARY" },
      orderBy: { updatedAt: "desc" },
      include: returnExperimentInclude,
    });

    return experiment ? toExperimentView(experiment) : null;
  }

  async getSavedExperiments(): Promise<SavedReturnExperimentSummary[]> {
    const client = await this.getClient();
    const experiments = await client.returnExperiment.findMany({
      where: { status: "SAVED" },
      orderBy: [{ savedAt: "desc" }, { updatedAt: "desc" }],
      include: returnExperimentInclude,
    });

    return experiments.map((experiment) => ({
      id: experiment.id,
      name: experiment.name ?? "Untitled return",
      savedAt: formatDateTime(experiment.savedAt ?? experiment.updatedAt),
      stats: calculateStats(experiment.positions.map(toPositionView)),
    }));
  }

  async getSavedExperiment(id: string): Promise<ReturnExperimentView | null> {
    const client = await this.getClient();
    const experiment = await client.returnExperiment.findFirst({
      where: { id, status: "SAVED" },
      include: returnExperimentInclude,
    });

    return experiment ? toExperimentView(experiment) : null;
  }

  async addPositionToTemporaryExperiment(input: ManualReturnPositionInput): Promise<ReturnExperimentView | null> {
    const client = await this.getClient();
    const existing = await this.getActiveTemporaryExperiment();
    if (!existing) return null;

    const candidate = await this.findRealCandidate(input.companyId, input.instrumentId);
    if (!candidate) {
      throw new Error("Selected stock is not available in UPSTOX_REAL market data.");
    }
    assertDateOrder(input.requestedStartDate, input.requestedEndDate);

    await client.returnExperimentPosition.create({
      data: {
        experimentId: existing.id,
        companyId: candidate.companyId,
        instrumentId: candidate.instrumentId,
        requestedStartDate: input.requestedStartDate,
        requestedEndDate: input.requestedEndDate,
        updatedAt: new Date(),
      },
    });

    return this.getActiveTemporaryExperiment();
  }

  async removeTemporaryPosition(positionId: string): Promise<ReturnExperimentView | null> {
    const client = await this.getClient();
    const experiment = await client.returnExperiment.findFirst({
      where: { status: "TEMPORARY", positions: { some: { id: positionId } } },
      select: { id: true },
    });

    if (!experiment) return this.getActiveTemporaryExperiment();

    await client.returnExperimentPosition.delete({
      where: { id: positionId },
    });
    await client.returnExperiment.update({
      where: { id: experiment.id },
      data: { updatedAt: new Date() },
    });

    return this.getActiveTemporaryExperiment();
  }

  async restartTemporaryExperiment(): Promise<void> {
    const client = await this.getClient();
    await client.returnExperiment.deleteMany({ where: { status: "TEMPORARY" } });
  }

  async calculateAndPersistTemporaryExperiment(input: {
    readonly positions: readonly ManualReturnPositionInput[];
  }): Promise<ReturnExperimentView> {
    if (input.positions.length === 0) {
      throw new Error("Add at least one position before calculating.");
    }

    const client = await this.getClient();
    const calculated = await this.calculatePositionInputs(input.positions);
    const now = new Date();
    const result = await client.$transaction(async (tx) => {
      let experiment = await tx.returnExperiment.findFirst({
        where: { status: "TEMPORARY" },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });

      if (!experiment) {
        experiment = await tx.returnExperiment.create({
          data: { status: "TEMPORARY", updatedAt: now },
          select: { id: true },
        });
      }

      const persistedIds = calculated
        .map((position) => position.id)
        .filter((id): id is string => Boolean(id && !id.startsWith("pending-")));
      await tx.returnExperimentPosition.deleteMany({
        where: {
          experimentId: experiment.id,
          id: { notIn: persistedIds },
        },
      });

      for (const position of calculated) {
        const data = {
          companyId: position.companyId,
          instrumentId: position.instrumentId,
          requestedStartDate: parseHistoricalDate(position.requestedStartDate, position.requestedStartDate),
          requestedEndDate: parseHistoricalDate(position.requestedEndDate, position.requestedEndDate),
          resolvedStartDate: nullableDate(position.actualStartDate),
          resolvedEndDate: nullableDate(position.actualEndDate),
          startPrice: nullableDecimalString(position.startPrice, 4),
          endPrice: nullableDecimalString(position.endPrice, 4),
          holdingDays: position.holdingDays,
          returnPercent: nullableDecimalString(position.returnPercent, 4),
          excludedReason: position.excludedReason,
          updatedAt: now,
        };

        if (position.id && !position.id.startsWith("pending-")) {
          await tx.returnExperimentPosition.updateMany({
            where: { id: position.id, experimentId: experiment.id },
            data,
          });
        } else {
          await tx.returnExperimentPosition.create({
            data: {
              id: position.id?.startsWith("pending-") ? undefined : position.id,
              experimentId: experiment.id,
              ...data,
            },
          });
        }
      }

      return tx.returnExperiment.update({
        where: { id: experiment.id },
        data: { updatedAt: now },
        include: returnExperimentInclude,
      });
    }, { timeout: 120000 });

    return toExperimentView(result);
  }

  async saveTemporaryExperiment(input: {
    readonly name: string;
    readonly positions: readonly ManualReturnPositionInput[];
  }): Promise<ReturnExperimentView> {
    const name = input.name.trim();
    if (!name) {
      throw new Error("Enter a name before saving.");
    }

    const experiment = await this.calculateAndPersistTemporaryExperiment({ positions: input.positions });
    const client = await this.getClient();
    const saved = await client.returnExperiment.update({
      where: { id: experiment.id },
      data: {
        name,
        status: "SAVED",
        savedAt: new Date(),
        updatedAt: new Date(),
      },
      include: returnExperimentInclude,
    });

    return toExperimentView(saved);
  }

  private async findCanonicalCandidates(): Promise<Candidate[]> {
    const client = await this.getClient();
    const companies = await client.company.findMany({
      where: { marketDataSource: realSource },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        isin: true,
        instruments: {
          where: { active: true, marketDataSource: realSource },
          select: { id: true, exchange: true, symbol: true },
        },
      },
    });

    return companies
      .map((company) => {
        const instrument =
          company.instruments.find((item) => item.exchange === "NSE") ??
          company.instruments.find((item) => item.exchange === "BSE");

        return instrument
          ? {
              companyId: company.id,
              companyName: company.name,
              isin: company.isin,
              instrumentId: instrument.id,
              symbol: instrument.symbol,
              exchange: instrument.exchange,
            }
          : null;
      })
      .filter((candidate): candidate is Candidate => candidate !== null);
  }

  private async runFilterWithSql(client: PrismaClient, input: HistoricalFilterInput): Promise<HistoricalFilterResult> {
    const oneWeekStartDate = addUtcDays(input.endDate, -9);
    const oneMonthStartDate = addUtcMonths(input.endDate, -1);
    const threeMonthStartDate = addUtcMonths(input.endDate, -3);
    const earliestDate = minDate(input.startDate, oneWeekStartDate, oneMonthStartDate, threeMonthStartDate);
    const rows = await client.$queryRaw<RawFilterRow[]>`
      with canonical as (
        select distinct on (c.id)
               c.id as "companyId",
               c.name as "companyName",
               c.isin,
               i.id as "instrumentId",
               i.symbol,
               i.exchange::text as exchange
        from "Company" c
        join "Instrument" i on i."companyId" = c.id
        where c."marketDataSource" = 'UPSTOX_REAL'
          and i."marketDataSource" = 'UPSTOX_REAL'
          and i.active = true
        order by c.id,
                 case when i.exchange = 'NSE' then 0 else 1 end,
                 i.symbol
      )
      select c."companyId",
             c."companyName",
             c.isin,
             c."instrumentId",
             c.symbol,
             c.exchange,
             (array_agg(dp."tradingDate" order by dp."tradingDate" asc)
               filter (where dp."tradingDate" >= ${input.startDate}))[1] as "startDate",
             (array_agg(dp.close order by dp."tradingDate" asc)
               filter (where dp."tradingDate" >= ${input.startDate}))[1] as "startClose",
             (array_agg(dp."tradingDate" order by dp."tradingDate" desc))[1] as "endDate",
             (array_agg(dp.close order by dp."tradingDate" desc))[1] as "endClose",
             (array_agg(dp.close order by dp."tradingDate" asc)
               filter (where dp."tradingDate" >= ${oneWeekStartDate}))[1] as "oneWeekStartClose",
             (array_agg(dp.close order by dp."tradingDate" asc)
               filter (where dp."tradingDate" >= ${oneMonthStartDate}))[1] as "oneMonthStartClose",
             (array_agg(dp.close order by dp."tradingDate" asc)
               filter (where dp."tradingDate" >= ${threeMonthStartDate}))[1] as "threeMonthStartClose",
             avg(dp.close * dp.volume::numeric)
               filter (where dp."tradingDate" >= ${input.startDate}) as "averageTradedValue"
      from canonical c
      left join "DailyPrice" dp
        on dp."instrumentId" = c."instrumentId"
       and dp."marketDataSource" = 'UPSTOX_REAL'
       and dp."tradingDate" >= ${earliestDate}
       and dp."tradingDate" <= ${input.endDate}
      group by c."companyId", c."companyName", c.isin, c."instrumentId", c.symbol, c.exchange
    `;
    const resultRows: Omit<HistoricalFilterRow, "rank">[] = [];
    const excluded = { missingPrices: 0, liquidity: 0, returnFilter: 0 };

    for (const row of rows) {
      const startClose = numberValue(row.startClose);
      const endClose = numberValue(row.endClose);
      const averageTradedValue = numberValue(row.averageTradedValue);

      if (!row.startDate || !row.endDate || startClose === null || endClose === null || startClose <= 0 || row.startDate > row.endDate) {
        excluded.missingPrices += 1;
        continue;
      }

      if (averageTradedValue === null || averageTradedValue < input.minAverageTradedValue) {
        excluded.liquidity += 1;
        continue;
      }

      const returnPercent = calculateReturnPercent(startClose, endClose);
      if (
        (input.minReturnPercent !== null && input.minReturnPercent !== undefined && returnPercent < input.minReturnPercent) ||
        (input.maxReturnPercent !== null && input.maxReturnPercent !== undefined && returnPercent > input.maxReturnPercent)
      ) {
        excluded.returnFilter += 1;
        continue;
      }

      resultRows.push({
        companyId: row.companyId,
        companyName: row.companyName,
        isin: row.isin,
        instrumentId: row.instrumentId,
        symbol: row.symbol,
        exchange: row.exchange as Exchange,
        startPrice: startClose,
        endPrice: endClose,
        price: endClose,
        requestedStartDate: formatDate(input.startDate),
        requestedEndDate: formatDate(input.endDate),
        actualStartDate: formatDate(row.startDate),
        actualEndDate: formatDate(row.endDate),
        returnPercent,
        oneWeekReturnPercent: returnFromNullable(row.oneWeekStartClose, row.endClose),
        oneMonthReturnPercent: returnFromNullable(row.oneMonthStartClose, row.endClose),
        threeMonthReturnPercent: returnFromNullable(row.threeMonthStartClose, row.endClose),
        averageTradedValue,
      });
    }

    return {
      rows: sortFilterRows(resultRows, input.sortBy, input.sortDirection).map((row, index) => ({ ...row, rank: index + 1 })),
      excluded,
    };
  }

  private async findCandidatesByInstrumentIds(instrumentIds: readonly string[]): Promise<Candidate[]> {
    const client = await this.getClient();
    const instruments = await client.instrument.findMany({
      where: { id: { in: [...instrumentIds] }, marketDataSource: realSource },
      select: {
        id: true,
        exchange: true,
        symbol: true,
        company: { select: { id: true, name: true, isin: true } },
      },
    });

    return instruments.map((instrument) => ({
      companyId: instrument.company.id,
      companyName: instrument.company.name,
      isin: instrument.company.isin,
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      exchange: instrument.exchange,
    }));
  }

  private async findRealCandidate(companyId: string, instrumentId: string): Promise<Candidate | null> {
    const candidates = await this.findCandidatesByInstrumentIds([instrumentId]);
    return candidates.find((candidate) => candidate.companyId === companyId) ?? null;
  }

  private async calculatePositionInputs(
    positions: readonly ManualReturnPositionInput[],
  ): Promise<ReturnExperimentPositionView[]> {
    const uniqueInstrumentIds = [...new Set(positions.map((position) => position.instrumentId))];
    const [candidates, prices] = await Promise.all([
      this.findCandidatesByInstrumentIds(uniqueInstrumentIds),
      this.loadPrices(
        uniqueInstrumentIds,
        minDate(...positions.map((position) => position.requestedStartDate)),
        maxDate(...positions.map((position) => position.requestedEndDate)),
      ),
    ]);
    const candidateByInstrument = new Map(candidates.map((candidate) => [candidate.instrumentId, candidate]));
    const pricesByInstrument = groupPrices(prices);
    const now = formatDateTime(new Date());

    return positions.map((position) => {
      assertDateOrder(position.requestedStartDate, position.requestedEndDate);
      const candidate = candidateByInstrument.get(position.instrumentId);
      const points = pricesByInstrument.get(position.instrumentId) ?? [];
      const start = firstOnOrAfter(points, position.requestedStartDate);
      const end = lastOnOrBefore(points, position.requestedEndDate);
      const valid = Boolean(candidate && start && end && start.close > 0 && start.tradingDate <= end.tradingDate);
      const returnPercent = valid && start && end ? calculateReturnPercent(start.close, end.close) : null;
      const holdingDays = valid && start && end ? daysBetween(start.tradingDate, end.tradingDate) : null;

      return {
        id: position.id ?? pendingId(),
        companyId: candidate?.companyId ?? position.companyId,
        companyName: candidate?.companyName ?? "Unknown stock",
        isin: candidate?.isin ?? "",
        instrumentId: position.instrumentId,
        symbol: candidate?.symbol ?? "",
        exchange: candidate?.exchange ?? "NSE",
        requestedStartDate: formatDate(position.requestedStartDate),
        requestedEndDate: formatDate(position.requestedEndDate),
        actualStartDate: start ? formatDate(start.tradingDate) : null,
        actualEndDate: end ? formatDate(end.tradingDate) : null,
        startPrice: start?.close ?? null,
        endPrice: end?.close ?? null,
        holdingDays,
        returnPercent,
        excludedReason: valid ? null : "No valid historical price",
        createdAt: now,
      };
    });
  }

  private async loadPrices(instrumentIds: readonly string[], startDate: Date, endDate: Date): Promise<PricePoint[]> {
    if (instrumentIds.length === 0) return [];

    const client = await this.getClient();
    const prices = await client.dailyPrice.findMany({
      where: {
        instrumentId: { in: [...instrumentIds] },
        tradingDate: { gte: startDate, lte: endDate },
        marketDataSource: realSource,
      },
      orderBy: [{ instrumentId: "asc" }, { tradingDate: "asc" }],
      select: { instrumentId: true, tradingDate: true, close: true, volume: true },
    });

    return prices.map((price) => ({
      instrumentId: price.instrumentId,
      tradingDate: price.tradingDate,
      close: price.close.toNumber(),
      volume: Number(price.volume),
    }));
  }

  private async getClient() {
    if (this.client) return this.client;
    const db = await import("@/lib/db/prisma");
    return db.prisma;
  }
}

export function parseHistoricalDate(value: unknown, fallback: string): Date {
  const input = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
  return new Date(`${input}T00:00:00.000Z`);
}

export function parseOptionalNumber(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePositiveCrores(value: unknown, fallbackCrores: number): number {
  if (typeof value !== "string" || value.trim() === "") return fallbackCrores * crore;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * crore : fallbackCrores * crore;
}

export function parseFilterSortKey(value: unknown): HistoricalFilterSortKey {
  const allowed = new Set<HistoricalFilterSortKey>([
    "rank",
    "company",
    "symbol",
    "exchange",
    "price",
    "return",
    "oneWeekReturn",
    "oneMonthReturn",
    "threeMonthReturn",
    "averageTradedValue",
  ]);
  return typeof value === "string" && allowed.has(value as HistoricalFilterSortKey)
    ? value as HistoricalFilterSortKey
    : "return";
}

export function parseSortDirection(value: unknown): HistoricalSortDirection {
  return value === "asc" ? "asc" : "desc";
}

export function parseManualPositions(value: unknown): ManualReturnPositionInput[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseManualPosition);
}

export function parseManualPosition(value: unknown): ManualReturnPositionInput {
  if (!value || typeof value !== "object") {
    throw new Error("Position input is malformed.");
  }
  const record = value as Record<string, unknown>;
  const companyId = stringValue(record.companyId);
  const instrumentId = stringValue(record.instrumentId);
  const requestedStartDate = stringValue(record.requestedStartDate);
  const requestedEndDate = stringValue(record.requestedEndDate);

  if (!companyId || !instrumentId || !requestedStartDate || !requestedEndDate) {
    throw new Error("Position input is missing stock or date fields.");
  }

  return {
    id: stringValue(record.id),
    companyId,
    instrumentId,
    requestedStartDate: parseHistoricalDate(requestedStartDate, requestedStartDate),
    requestedEndDate: parseHistoricalDate(requestedEndDate, requestedEndDate),
  };
}

function assertDateOrder(startDate: Date, endDate: Date) {
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Enter valid start and end dates.");
  }
  if (startDate > endDate) {
    throw new Error("Start date must be on or before end date.");
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function groupPrices(prices: readonly PricePoint[]) {
  const grouped = new Map<string, PricePoint[]>();
  for (const price of prices) {
    const values = grouped.get(price.instrumentId);
    if (values) values.push(price);
    else grouped.set(price.instrumentId, [price]);
  }
  return grouped;
}

function firstOnOrAfter(points: readonly PricePoint[], requestedDate: Date) {
  return points.find((point) => point.tradingDate >= requestedDate) ?? null;
}

function lastOnOrBefore(points: readonly PricePoint[], requestedDate: Date) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point && point.tradingDate <= requestedDate) return point;
  }
  return null;
}

function calculateAverageTradedValue(points: readonly PricePoint[], startDate: Date, endDate: Date) {
  let total = 0;
  let count = 0;

  for (const point of points) {
    if (point.tradingDate >= startDate && point.tradingDate <= endDate) {
      total += point.close * point.volume;
      count += 1;
    }
  }

  return count > 0 ? total / count : null;
}

function calculateWindowReturn(points: readonly PricePoint[], startDate: Date, endDate: Date) {
  const start = firstOnOrAfter(points, startDate);
  const end = lastOnOrBefore(points, endDate);
  return start && end && start.tradingDate <= end.tradingDate && start.close > 0
    ? calculateReturnPercent(start.close, end.close)
    : null;
}

function calculateReturnPercent(startClose: number, endClose: number) {
  return ((endClose / startClose) - 1) * 100;
}

function returnFromNullable(startCloseInput: unknown, endCloseInput: unknown) {
  const startClose = numberValue(startCloseInput);
  const endClose = numberValue(endCloseInput);
  return startClose !== null && endClose !== null && startClose > 0
    ? calculateReturnPercent(startClose, endClose)
    : null;
}

function numberValue(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && Number.isFinite(Number(input))) return Number(input);
  if (input && typeof input === "object" && "toNumber" in input && typeof input.toNumber === "function") {
    const value = input.toNumber() as unknown;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return null;
}

function sortFilterRows(
  rows: readonly Omit<HistoricalFilterRow, "rank">[],
  sortBy: HistoricalFilterSortKey,
  direction: HistoricalSortDirection,
) {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = filterSortValue(left, sortBy);
    const rightValue = filterSortValue(right, sortBy);

    if (leftValue === null && rightValue === null) return 0;
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    if (typeof leftValue === "string" && typeof rightValue === "string") {
      return leftValue.localeCompare(rightValue) * multiplier;
    }
    return (Number(leftValue) - Number(rightValue)) * multiplier;
  });
}

function filterSortValue(row: Omit<HistoricalFilterRow, "rank">, sortBy: HistoricalFilterSortKey) {
  switch (sortBy) {
    case "rank":
      return row.returnPercent;
    case "company":
      return row.companyName;
    case "symbol":
      return row.symbol;
    case "exchange":
      return row.exchange;
    case "price":
      return row.price;
    case "return":
      return row.returnPercent;
    case "oneWeekReturn":
      return row.oneWeekReturnPercent;
    case "oneMonthReturn":
      return row.oneMonthReturnPercent;
    case "threeMonthReturn":
      return row.threeMonthReturnPercent;
    case "averageTradedValue":
      return row.averageTradedValue;
  }
}

function minDate(...dates: readonly Date[]) {
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function maxDate(...dates: readonly Date[]) {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date) {
  return date.toISOString();
}

function nullableDate(value: string | null) {
  return value ? parseHistoricalDate(value, value) : null;
}

function nullableDecimalString(value: number | null, decimals: number) {
  return value === null || !Number.isFinite(value) ? null : value.toFixed(decimals);
}

function daysBetween(startDate: Date, endDate: Date) {
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000));
}

function pendingId() {
  return `pending-${crypto.randomUUID()}`;
}

function toExperimentView(experiment: {
  readonly id: string;
  readonly name: string | null;
  readonly status: "TEMPORARY" | "SAVED";
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly savedAt: Date | null;
  readonly positions: readonly {
    readonly id: string;
    readonly requestedStartDate: Date;
    readonly requestedEndDate: Date;
    readonly resolvedStartDate: Date | null;
    readonly resolvedEndDate: Date | null;
    readonly startPrice: unknown;
    readonly endPrice: unknown;
    readonly holdingDays: number | null;
    readonly returnPercent: unknown;
    readonly excludedReason: string | null;
    readonly createdAt: Date;
    readonly company: { readonly id: string; readonly name: string; readonly isin: string };
    readonly instrument: { readonly id: string; readonly exchange: Exchange; readonly symbol: string };
  }[];
}): ReturnExperimentView {
  const positions = experiment.positions.map(toPositionView);
  return {
    id: experiment.id,
    name: experiment.name,
    status: experiment.status,
    createdAt: formatDateTime(experiment.createdAt),
    updatedAt: formatDateTime(experiment.updatedAt),
    savedAt: experiment.savedAt ? formatDateTime(experiment.savedAt) : null,
    positions,
    stats: calculateStats(positions),
  };
}

function toPositionView(position: {
  readonly id: string;
  readonly requestedStartDate: Date;
  readonly requestedEndDate: Date;
  readonly resolvedStartDate: Date | null;
  readonly resolvedEndDate: Date | null;
  readonly startPrice: unknown;
  readonly endPrice: unknown;
  readonly holdingDays: number | null;
  readonly returnPercent: unknown;
  readonly excludedReason: string | null;
  readonly createdAt: Date;
  readonly company: { readonly id: string; readonly name: string; readonly isin: string };
  readonly instrument: { readonly id: string; readonly exchange: Exchange; readonly symbol: string };
}): ReturnExperimentPositionView {
  return {
    id: position.id,
    companyId: position.company.id,
    companyName: position.company.name,
    isin: position.company.isin,
    instrumentId: position.instrument.id,
    symbol: position.instrument.symbol,
    exchange: position.instrument.exchange,
    requestedStartDate: formatDate(position.requestedStartDate),
    requestedEndDate: formatDate(position.requestedEndDate),
    actualStartDate: position.resolvedStartDate ? formatDate(position.resolvedStartDate) : null,
    actualEndDate: position.resolvedEndDate ? formatDate(position.resolvedEndDate) : null,
    startPrice: numberValue(position.startPrice),
    endPrice: numberValue(position.endPrice),
    holdingDays: position.holdingDays,
    returnPercent: numberValue(position.returnPercent),
    excludedReason: position.excludedReason,
    createdAt: formatDateTime(position.createdAt),
  };
}

function calculateStats(positions: readonly ReturnExperimentPositionView[]): ReturnExperimentStats {
  const validPositions = positions.filter((position) => position.returnPercent !== null && position.holdingDays !== null);
  const returns = validPositions.map((position) => position.returnPercent as number).sort((left, right) => left - right);
  const holdingDays = validPositions.map((position) => position.holdingDays as number);
  const winningPositions = validPositions.filter((position) => (position.returnPercent ?? 0) > 0).length;
  const losingPositions = validPositions.filter((position) => (position.returnPercent ?? 0) < 0).length;

  return {
    totalPositions: positions.length,
    validPositions: validPositions.length,
    averagePositionReturnPercent: returns.length > 0 ? average(returns) : null,
    medianPositionReturnPercent: returns.length > 0 ? median(returns) : null,
    winningPositions,
    losingPositions,
    winRatePercent: validPositions.length > 0 ? (winningPositions / validPositions.length) * 100 : null,
    bestPositionReturnPercent: returns.at(-1) ?? null,
    worstPositionReturnPercent: returns[0] ?? null,
    averageHoldingDays: holdingDays.length > 0 ? average(holdingDays) : null,
  };
}

function average(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: readonly number[]) {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[middle] ?? null
    : ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2;
}
