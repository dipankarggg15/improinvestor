import type {
  DailyClosePoint,
  PriceRepository,
  RankingFilters,
  ReturnCandidateInstrument,
} from "@/lib/research/price-repository";

export class InMemoryPriceRepository implements PriceRepository {
  constructor(
    private readonly candidates: ReturnCandidateInstrument[],
    private readonly prices: DailyClosePoint[],
  ) {}

  async findFirstCloseOnOrAfter(
    instrumentId: string,
    requestedDate: Date,
  ): Promise<DailyClosePoint | null> {
    return (
      this.prices
        .filter(
          (price) =>
            price.instrumentId === instrumentId && price.tradingDate.getTime() >= requestedDate.getTime(),
        )
        .sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime())[0] ?? null
    );
  }

  async findLastCloseOnOrBefore(
    instrumentId: string,
    requestedDate: Date,
  ): Promise<DailyClosePoint | null> {
    return (
      this.prices
        .filter(
          (price) =>
            price.instrumentId === instrumentId && price.tradingDate.getTime() <= requestedDate.getTime(),
        )
        .sort((left, right) => right.tradingDate.getTime() - left.tradingDate.getTime())[0] ?? null
    );
  }

  async findReturnCandidates(filters: RankingFilters = {}): Promise<ReturnCandidateInstrument[]> {
    return this.candidates.filter((candidate) => {
      if (filters.companyIds && !filters.companyIds.includes(candidate.companyId)) {
        return false;
      }

      if (filters.exchanges && !(filters.exchanges as readonly string[]).includes(candidate.exchange)) {
        return false;
      }

      return true;
    });
  }
}
