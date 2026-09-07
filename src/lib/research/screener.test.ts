import type { Exchange } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type {
  FundamentalsSnapshot,
  ScreenerCandidate,
  ScreenerRepository,
  ScreenerStandardReturns,
} from "@/lib/research/screener";
import { calculateStandardReturns, defaultScreenerFilters, runCustomReturnScreener } from "@/lib/research/screener";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

type PricePoint = {
  readonly instrumentId: string;
  readonly tradingDate: Date;
  readonly close: number;
  readonly volume: number;
};

class InMemoryScreenerRepository implements ScreenerRepository {
  constructor(
    private readonly candidates: ScreenerCandidate[],
    private readonly fundamentals: Record<string, FundamentalsSnapshot | FundamentalsSnapshot[] | null>,
    private readonly prices: PricePoint[],
  ) {}

  async findCanonicalScreenerCandidates(): Promise<ScreenerCandidate[]> {
    const byCompany = new Map<string, ScreenerCandidate[]>();

    for (const candidate of this.candidates) {
      const companyCandidates = byCompany.get(candidate.companyId);
      if (companyCandidates) {
        companyCandidates.push(candidate);
      } else {
        byCompany.set(candidate.companyId, [candidate]);
      }
    }

    return [...byCompany.values()].map(
      (companyCandidates) =>
        companyCandidates.find((candidate) => candidate.exchange === "NSE") ??
        companyCandidates.find((candidate) => candidate.exchange === "BSE") ??
        companyCandidates[0],
    );
  }

  async findLatestFundamentals(companyId: string, asOfDate: Date): Promise<FundamentalsSnapshot | null> {
    const snapshots = this.fundamentals[companyId];

    if (!snapshots) {
      return null;
    }

    const snapshotList = Array.isArray(snapshots) ? snapshots : [snapshots];

    return (
      snapshotList
        .filter((snapshot) => snapshot.asOfDate.getTime() <= asOfDate.getTime())
        .sort((left, right) => right.asOfDate.getTime() - left.asOfDate.getTime())[0] ?? null
    );
  }

  async findFirstCloseOnOrAfter(instrumentId: string, requestedDate: Date) {
    const point = this.prices
      .filter(
        (price) =>
          price.instrumentId === instrumentId && price.tradingDate.getTime() >= requestedDate.getTime(),
      )
      .sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime())[0];

    return point
      ? { instrumentId, tradingDate: point.tradingDate, close: point.close }
      : null;
  }

  async findLastCloseOnOrBefore(instrumentId: string, requestedDate: Date) {
    const point = this.prices
      .filter(
        (price) =>
          price.instrumentId === instrumentId && price.tradingDate.getTime() <= requestedDate.getTime(),
      )
      .sort((left, right) => right.tradingDate.getTime() - left.tradingDate.getTime())[0];

    return point
      ? { instrumentId, tradingDate: point.tradingDate, close: point.close }
      : null;
  }

  async findReturnCandidates() {
    return this.findCanonicalScreenerCandidates();
  }

  async calculateAverageTradedValue(input: {
    readonly instrumentId: string;
    readonly startDate: Date;
    readonly endDate: Date;
  }): Promise<number | null> {
    const points = this.prices.filter(
      (price) =>
        price.instrumentId === input.instrumentId &&
        price.tradingDate.getTime() >= input.startDate.getTime() &&
        price.tradingDate.getTime() <= input.endDate.getTime(),
    );

    if (points.length === 0) {
      return null;
    }

    return (
      points.reduce((total, point) => total + point.close * point.volume, 0) / points.length
    );
  }

  async findScreenerPeriodData(input: {
    readonly candidates: ScreenerCandidate[];
    readonly startDate: Date;
    readonly endDate: Date;
  }) {
    const startPricesByInstrumentId = new Map<string, { tradingDate: Date; close: number }>();
    const endPricesByInstrumentId = new Map<string, { tradingDate: Date; close: number }>();
    const averageTradedValueByInstrumentId = new Map<string, number>();
    const fundamentalsByCompanyId = new Map<string, FundamentalsSnapshot>();
    const standardReturnsByInstrumentId = new Map<string, ScreenerStandardReturns>();

    for (const candidate of input.candidates) {
      const start = await this.findFirstCloseOnOrAfter(candidate.instrumentId, input.startDate);
      const end = await this.findLastCloseOnOrBefore(candidate.instrumentId, input.endDate);
      const averageTradedValue = await this.calculateAverageTradedValue({
        instrumentId: candidate.instrumentId,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      const fundamental = await this.findLatestFundamentals(candidate.companyId, input.endDate);

      if (start) startPricesByInstrumentId.set(candidate.instrumentId, start);
      if (end) endPricesByInstrumentId.set(candidate.instrumentId, end);
      if (averageTradedValue !== null) {
        averageTradedValueByInstrumentId.set(candidate.instrumentId, averageTradedValue);
      }
      if (fundamental) fundamentalsByCompanyId.set(candidate.companyId, fundamental);
      standardReturnsByInstrumentId.set(
        candidate.instrumentId,
        await calculateStandardReturns(this, candidate.instrumentId, input.endDate),
      );
    }

    return {
      startPricesByInstrumentId,
      endPricesByInstrumentId,
      averageTradedValueByInstrumentId,
      fundamentalsByCompanyId,
      standardReturnsByInstrumentId,
    };
  }
}

const candidate = (
  companyId: string,
  symbol: string,
  exchange: Exchange = "NSE",
): ScreenerCandidate => ({
  companyId,
  companyName: `${companyId} Limited`,
  isin: `INE${companyId.padEnd(9, "0")}`,
  instrumentId: `${companyId}-${exchange.toLowerCase()}`,
  exchange,
  symbol,
});

const fundamentals = (
  marketCap: number,
  debtToEquity: number,
): FundamentalsSnapshot => ({
  marketCap,
  debtToEquity,
  peRatio: null,
  asOfDate: date("2026-01-01"),
});

describe("runCustomReturnScreener", () => {
  it("filters by minimum market cap", async () => {
    const repository = new InMemoryScreenerRepository(
      [candidate("smallcap", "SMALL")],
      { smallcap: fundamentals(1_000_000_000, 0.5) },
      [
        { instrumentId: "smallcap-nse", tradingDate: date("2026-01-02"), close: 100, volume: 1_000_000 },
        { instrumentId: "smallcap-nse", tradingDate: date("2026-01-09"), close: 120, volume: 1_000_000 },
      ],
    );

    const result = await runCustomReturnScreener(repository, {
      startDate: date("2026-01-02"),
      endDate: date("2026-01-09"),
      filters: defaultScreenerFilters,
    });

    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(0);
    expect(result.exclusions[0]?.reason).toBe("market_cap_below_minimum");
  });

  it("filters by maximum debt/equity", async () => {
    const repository = new InMemoryScreenerRepository(
      [candidate("levered", "LEVER")],
      { levered: fundamentals(40_000_000_000, 3.1) },
      [
        { instrumentId: "levered-nse", tradingDate: date("2026-01-02"), close: 100, volume: 1_000_000 },
        { instrumentId: "levered-nse", tradingDate: date("2026-01-09"), close: 120, volume: 1_000_000 },
      ],
    );

    const result = await runCustomReturnScreener(repository, {
      startDate: date("2026-01-02"),
      endDate: date("2026-01-09"),
      filters: defaultScreenerFilters,
    });

    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(0);
    expect(result.exclusions[0]?.reason).toBe("debt_to_equity_above_maximum");
  });

  it("calculates and filters average rupee traded value", async () => {
    const repository = new InMemoryScreenerRepository(
      [candidate("illiquid", "ILLIQ")],
      { illiquid: fundamentals(40_000_000_000, 0.6) },
      [
        { instrumentId: "illiquid-nse", tradingDate: date("2026-01-02"), close: 100, volume: 10_000 },
        { instrumentId: "illiquid-nse", tradingDate: date("2026-01-09"), close: 110, volume: 10_000 },
      ],
    );

    const result = await runCustomReturnScreener(repository, {
      startDate: date("2026-01-02"),
      endDate: date("2026-01-09"),
      filters: defaultScreenerFilters,
    });

    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(0);
    expect(result.exclusions[0]?.reason).toBe("liquidity_below_minimum");
  });

  it("prefers NSE when a company has both NSE and BSE instruments", async () => {
    const repository = new InMemoryScreenerRepository(
      [candidate("dual", "DUAL", "BSE"), candidate("dual", "DUAL", "NSE")],
      { dual: fundamentals(40_000_000_000, 0.6) },
      [
        { instrumentId: "dual-nse", tradingDate: date("2026-01-02"), close: 100, volume: 1_000_000 },
        { instrumentId: "dual-nse", tradingDate: date("2026-01-09"), close: 120, volume: 1_000_000 },
        { instrumentId: "dual-bse", tradingDate: date("2026-01-02"), close: 100, volume: 1_000_000 },
        { instrumentId: "dual-bse", tradingDate: date("2026-01-09"), close: 130, volume: 1_000_000 },
      ],
    );

    const result = await runCustomReturnScreener(repository, {
      startDate: date("2026-01-02"),
      endDate: date("2026-01-09"),
      filters: defaultScreenerFilters,
    });

    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.exchange).toBe("NSE");
    expect(result.rows[0]?.returnPercent).toBeCloseTo(20, 10);
  });

  it("adds investor display metrics without looking beyond the screener end date", async () => {
    const repository = new InMemoryScreenerRepository(
      [candidate("display", "DISP")],
      { display: fundamentals(40_000_000_000, 0.6) },
      [
        { instrumentId: "display-nse", tradingDate: date("2026-01-02"), close: 100, volume: 1_000_000 },
        { instrumentId: "display-nse", tradingDate: date("2026-01-05"), close: 105, volume: 1_000_000 },
        { instrumentId: "display-nse", tradingDate: date("2026-01-09"), close: 110, volume: 1_000_000 },
        { instrumentId: "display-nse", tradingDate: date("2026-02-09"), close: 121, volume: 1_000_000 },
        { instrumentId: "display-nse", tradingDate: date("2026-04-02"), close: 121, volume: 1_000_000 },
        { instrumentId: "display-nse", tradingDate: date("2026-04-09"), close: 133.1, volume: 1_000_000 },
        { instrumentId: "display-nse", tradingDate: date("2026-04-10"), close: 999, volume: 1_000_000 },
      ],
    );

    const result = await runCustomReturnScreener(repository, {
      startDate: date("2026-01-02"),
      endDate: date("2026-04-09"),
      filters: defaultScreenerFilters,
    });

    expect(result.ok).toBe(true);
    expect(result.rows[0]?.currentPrice).toBe(133.1);
    expect(result.rows[0]?.returnPercent).toBeCloseTo(33.1, 10);
    expect(result.rows[0]?.oneWeekReturnPercent).toBeCloseTo(10, 10);
    expect(result.rows[0]?.oneMonthReturnPercent).toBeCloseTo(10, 10);
    expect(result.rows[0]?.threeMonthReturnPercent).toBeCloseTo(21, 10);
    expect(result.rows[0]?.peRatio).toBeNull();
  });

  it("calculates selected-date return using resolved trading boundaries", async () => {
    const repository = new InMemoryScreenerRepository(
      [candidate("resolved", "RES")],
      { resolved: fundamentals(40_000_000_000, 0.6) },
      [
        { instrumentId: "resolved-nse", tradingDate: date("2026-01-02"), close: 90, volume: 1_000_000 },
        { instrumentId: "resolved-nse", tradingDate: date("2026-01-05"), close: 100, volume: 1_000_000 },
        { instrumentId: "resolved-nse", tradingDate: date("2026-01-09"), close: 120, volume: 1_000_000 },
        { instrumentId: "resolved-nse", tradingDate: date("2026-01-12"), close: 999, volume: 1_000_000 },
      ],
    );

    const result = await runCustomReturnScreener(repository, {
      startDate: date("2026-01-03"),
      endDate: date("2026-01-10"),
      filters: defaultScreenerFilters,
    });

    expect(result.ok).toBe(true);
    expect(result.rows[0]?.actualStartDate).toEqual(date("2026-01-05"));
    expect(result.rows[0]?.actualEndDate).toEqual(date("2026-01-09"));
    expect(result.rows[0]?.startClose).toBe(100);
    expect(result.rows[0]?.endClose).toBe(120);
    expect(result.rows[0]?.currentPrice).toBe(120);
    expect(result.rows[0]?.returnPercent).toBeCloseTo(20, 10);
  });

  it("ranks passing companies by return descending", async () => {
    const repository = new InMemoryScreenerRepository(
      [candidate("winner", "WIN"), candidate("steady", "STDY")],
      {
        winner: fundamentals(40_000_000_000, 0.6),
        steady: fundamentals(40_000_000_000, 0.6),
      },
      [
        { instrumentId: "winner-nse", tradingDate: date("2026-01-02"), close: 100, volume: 1_000_000 },
        { instrumentId: "winner-nse", tradingDate: date("2026-01-09"), close: 130, volume: 1_000_000 },
        { instrumentId: "steady-nse", tradingDate: date("2026-01-02"), close: 100, volume: 1_000_000 },
        { instrumentId: "steady-nse", tradingDate: date("2026-01-09"), close: 105, volume: 1_000_000 },
      ],
    );

    const result = await runCustomReturnScreener(repository, {
      startDate: date("2026-01-02"),
      endDate: date("2026-01-09"),
      filters: defaultScreenerFilters,
    });

    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => [row.rank, row.symbol])).toEqual([
      [1, "WIN"],
      [2, "STDY"],
    ]);
  });

  it("rejects invalid date ranges", async () => {
    const repository = new InMemoryScreenerRepository([], {}, []);

    const result = await runCustomReturnScreener(repository, {
      startDate: date("2026-01-09"),
      endDate: date("2026-01-02"),
      filters: defaultScreenerFilters,
    });

    expect(result).toEqual({
      ok: false,
      error: "End date must be on or after start date.",
      rows: [],
      exclusions: [],
    });
  });

  it("uses the latest fundamentals on or before the screen date", async () => {
    const repository = new InMemoryScreenerRepository(
      [candidate("historic", "HIST")],
      {
        historic: [
          fundamentals(30_000_000_000, 0.6),
          { ...fundamentals(100_000_000_000, 0.6), asOfDate: date("2026-02-01") },
        ],
      },
      [
        { instrumentId: "historic-nse", tradingDate: date("2026-01-02"), close: 100, volume: 1_000_000 },
        { instrumentId: "historic-nse", tradingDate: date("2026-01-09"), close: 110, volume: 1_000_000 },
      ],
    );

    const result = await runCustomReturnScreener(repository, {
      startDate: date("2026-01-02"),
      endDate: date("2026-01-09"),
      filters: { ...defaultScreenerFilters, minMarketCap: 50_000_000_000 },
    });

    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(0);
    expect(result.exclusions[0]?.reason).toBe("market_cap_below_minimum");
  });

  it("does not use future fundamentals to pass a historical screen", async () => {
    const repository = new InMemoryScreenerRepository(
      [candidate("future", "FUT")],
      {
        future: [{ ...fundamentals(100_000_000_000, 0.6), asOfDate: date("2026-02-01") }],
      },
      [
        { instrumentId: "future-nse", tradingDate: date("2026-01-02"), close: 100, volume: 1_000_000 },
        { instrumentId: "future-nse", tradingDate: date("2026-01-09"), close: 110, volume: 1_000_000 },
      ],
    );

    const result = await runCustomReturnScreener(repository, {
      startDate: date("2026-01-02"),
      endDate: date("2026-01-09"),
      filters: defaultScreenerFilters,
    });

    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(0);
    expect(result.exclusions[0]?.reason).toBe("missing_fundamentals");
  });

  it("keeps original ranks when sorting by another display column", async () => {
    const repository = new InMemoryScreenerRepository(
      [candidate("fast", "FAST"), candidate("large", "LARGE")],
      {
        fast: fundamentals(40_000_000_000, 0.6),
        large: fundamentals(80_000_000_000, 0.6),
      },
      [
        { instrumentId: "fast-nse", tradingDate: date("2026-01-02"), close: 100, volume: 1_000_000 },
        { instrumentId: "fast-nse", tradingDate: date("2026-01-09"), close: 130, volume: 1_000_000 },
        { instrumentId: "large-nse", tradingDate: date("2026-01-02"), close: 100, volume: 1_000_000 },
        { instrumentId: "large-nse", tradingDate: date("2026-01-09"), close: 110, volume: 1_000_000 },
      ],
    );

    const result = await runCustomReturnScreener(repository, {
      startDate: date("2026-01-02"),
      endDate: date("2026-01-09"),
      filters: defaultScreenerFilters,
      sortBy: "marketCap",
      sortDirection: "desc",
    });

    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => [row.rank, row.symbol])).toEqual([
      [2, "LARGE"],
      [1, "FAST"],
    ]);
  });

  it("sorts unavailable P/E values after known values in both directions", async () => {
    const candidates = [candidate("known", "KNOWN"), candidate("unknown", "UNKNOWN")];
    const prices = [
      { instrumentId: "known-nse", tradingDate: date("2026-01-02"), close: 100, volume: 1_000_000 },
      { instrumentId: "known-nse", tradingDate: date("2026-01-09"), close: 110, volume: 1_000_000 },
      { instrumentId: "unknown-nse", tradingDate: date("2026-01-02"), close: 100, volume: 1_000_000 },
      { instrumentId: "unknown-nse", tradingDate: date("2026-01-09"), close: 120, volume: 1_000_000 },
    ];

    const ascending = await runCustomReturnScreener(
      new InMemoryScreenerRepository(candidates, {
        known: { ...fundamentals(40_000_000_000, 0.6), peRatio: 22.5 },
        unknown: fundamentals(40_000_000_000, 0.6),
      }, prices),
      {
        startDate: date("2026-01-02"),
        endDate: date("2026-01-09"),
        filters: defaultScreenerFilters,
        sortBy: "peRatio",
        sortDirection: "asc",
      },
    );
    const descending = await runCustomReturnScreener(
      new InMemoryScreenerRepository(candidates, {
        known: { ...fundamentals(40_000_000_000, 0.6), peRatio: 22.5 },
        unknown: fundamentals(40_000_000_000, 0.6),
      }, prices),
      {
        startDate: date("2026-01-02"),
        endDate: date("2026-01-09"),
        filters: defaultScreenerFilters,
        sortBy: "peRatio",
        sortDirection: "desc",
      },
    );

    expect(ascending.ok).toBe(true);
    expect(descending.ok).toBe(true);
    expect(ascending.rows.map((row) => row.symbol)).toEqual(["KNOWN", "UNKNOWN"]);
    expect(descending.rows.map((row) => row.symbol)).toEqual(["KNOWN", "UNKNOWN"]);
  });
});
