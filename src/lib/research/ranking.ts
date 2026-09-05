import type { RankingFilters, PriceRepository } from "@/lib/research/price-repository";
import { calculatePointToPointReturn } from "@/lib/research/returns";

export type ReturnRankingRow = {
  readonly rank: number;
  readonly companyId: string;
  readonly companyName: string;
  readonly isin: string;
  readonly instrumentId: string;
  readonly exchange: string;
  readonly symbol: string;
  readonly requestedStartDate: Date;
  readonly requestedEndDate: Date;
  readonly actualStartDate: Date;
  readonly actualEndDate: Date;
  readonly startClose: number;
  readonly endClose: number;
  readonly returnPercent: number;
};

export async function rankInstrumentReturns(
  repository: PriceRepository,
  input: {
    readonly startDate: Date;
    readonly endDate: Date;
    readonly filters?: RankingFilters;
  },
): Promise<ReturnRankingRow[]> {
  const candidates = await repository.findReturnCandidates(input.filters);
  const rows = await Promise.all(
    candidates.map(async (candidate) => {
      const result = await calculatePointToPointReturn(repository, {
        instrumentId: candidate.instrumentId,
        startDate: input.startDate,
        endDate: input.endDate,
      });

      return result ? { ...candidate, ...result } : null;
    }),
  );

  return rows
    .filter((row): row is Omit<ReturnRankingRow, "rank"> => row !== null)
    .sort((left, right) => right.returnPercent - left.returnPercent)
    .map((row, index) => ({
      rank: index + 1,
      ...row,
    }));
}
