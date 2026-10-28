import { describe, expect, it, vi } from "vitest";

import type { MarketDataProvider, ProviderDailyCandle, ProviderInstrument } from "@/lib/market-data/types";
import {
  canonicalizeUpstoxEquities,
  chooseCanonicalInstrument,
  latestCompletedEodDate,
  marketHistoryStartDate,
  runUpstoxRealMarketSync,
} from "@/lib/market-data/upstox-sync";

describe("Upstox real-market sync", () => {
  it("waits for the full provider cooldown before retrying", async () => {
    vi.useFakeTimers();
    try {
      let requests = 0;
      const run = runUpstoxRealMarketSync({
        client: createFakePrisma() as never,
        provider: providerWith({
          instruments: [instrument({ exchange: "NSE", symbol: "RELIANCE", instrumentKey: "NSE_EQ|INE002A01018", isin: "INE002A01018" })],
          onCandles(input) {
            if (++requests === 1) throw Object.assign(new Error("Upstox rate limit exceeded."), { retryAfterMs: 310000 });
            return [candle(input.instrumentKey, "2026-09-07")];
          },
        }),
        mode: "backfill",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-09-07"),
      });
      await vi.advanceTimersByTimeAsync(309999);
      expect(requests).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await run).successful).toBe(1);
      expect(requests).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("canonicalizes dual-listed companies by ISIN and prefers NSE", () => {
    const companies = canonicalizeUpstoxEquities([
      instrument({ exchange: "BSE", symbol: "500325", instrumentKey: "BSE_EQ|INE002A01018", isin: "INE002A01018" }),
      instrument({ exchange: "NSE", symbol: "RELIANCE", instrumentKey: "NSE_EQ|INE002A01018", isin: "INE002A01018" }),
      instrument({ exchange: "BSE", symbol: "600000", instrumentKey: "BSE_EQ|INE999999999", isin: "INE999999999" }),
    ]);

    expect(companies).toHaveLength(2);
    expect(companies.find((company) => company.isin === "INE002A01018")?.canonicalInstrument.symbol).toBe("RELIANCE");
    expect(chooseCanonicalInstrument(companies.find((company) => company.isin === "INE999999999")?.instruments ?? []).exchange).toBe("BSE");
  });

  it("never selects the current calendar day as completed EOD", () => {
    expect(latestCompletedEodDate(new Date("2026-09-08T10:00:00.000Z")).toISOString().slice(0, 10)).toBe("2026-09-07");
    expect(marketHistoryStartDate(new Date("2026-09-07T00:00:00.000Z")).toISOString().slice(0, 10)).toBe("2025-09-07");
  });

  it("backfills a small batch idempotently with company, instrument, and candle upserts", async () => {
    const client = createFakePrisma();
    const options = {
      client: client as never,
      provider: providerWith({
        instruments: [
          instrument({ exchange: "NSE", symbol: "RELIANCE", instrumentKey: "NSE_EQ|INE002A01018", isin: "INE002A01018" }),
          instrument({ exchange: "BSE", symbol: "500325", instrumentKey: "BSE_EQ|INE002A01018", isin: "INE002A01018" }),
        ],
      }),
      mode: "backfill" as const,
      limit: 1,
      now: new Date("2026-09-08T08:00:00.000Z"),
    };
    const result = await runUpstoxRealMarketSync(options);

    expect(result.successful).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.candlesUpserted).toBe(4);
    expect(client.state.companies).toHaveLength(1);
    expect(client.state.instruments).toHaveLength(2);
    expect(client.state.dailyPrices).toHaveLength(4);
    expect(client.state.dailyPrices.every((price) => price.marketDataSource === "UPSTOX_REAL")).toBe(true);
    expect((await runUpstoxRealMarketSync(options)).candlesUpserted).toBe(0);
    expect(client.state.dailyPrices).toHaveLength(4);
  });

  it("updates a changed Upstox instrument key without duplicating the exchange symbol", async () => {
    const client = createFakePrisma();
    client.state.companies.push({ id: "company-1", isin: "INE002A01018", name: "Reliance", marketDataSource: "UPSTOX_REAL" });
    client.state.instruments.push({
      id: "instrument-1",
      companyId: "company-1",
      exchange: "NSE",
      symbol: "RELIANCE",
      instrumentKey: "NSE_EQ|OLD_KEY",
      marketDataSource: "UPSTOX_REAL",
    });

    const result = await runUpstoxRealMarketSync({
      client: client as never,
      provider: providerWith({
        instruments: [instrument({ exchange: "NSE", symbol: "RELIANCE", instrumentKey: "NSE_EQ|INE002A01018", isin: "INE002A01018" })],
      }),
      mode: "backfill",
      startDate: new Date("2026-09-07"),
      endDate: new Date("2026-09-07"),
    });

    expect(result.failed).toBe(0);
    expect(client.state.instruments).toHaveLength(1);
    expect(client.state.instruments[0]?.instrumentKey).toBe("NSE_EQ|INE002A01018");
  });

  it("reconciles separate rows that already own the current symbol and instrument key", async () => {
    const client = createFakePrisma();
    client.state.companies.push({ id: "company-1", isin: "INE002A01018", name: "Reliance", marketDataSource: "UPSTOX_REAL" });
    client.state.instruments.push(
      { id: "instrument-symbol", companyId: "company-1", exchange: "NSE", symbol: "RELIANCE", instrumentKey: "NSE_EQ|OLD_KEY", marketDataSource: "UPSTOX_REAL" },
      { id: "instrument-key", companyId: "company-1", exchange: "NSE", symbol: "RELIANCE-OLD", instrumentKey: "NSE_EQ|INE002A01018", marketDataSource: "UPSTOX_REAL" },
    );

    const result = await runUpstoxRealMarketSync({
      client: client as never,
      provider: providerWith({
        instruments: [instrument({ exchange: "NSE", symbol: "RELIANCE", instrumentKey: "NSE_EQ|INE002A01018", isin: "INE002A01018" })],
      }),
      mode: "backfill",
      startDate: new Date("2026-09-07"),
      endDate: new Date("2026-09-07"),
    });

    expect(result.failed).toBe(0);
    expect(client.state.instruments.find((row) => row.id === "instrument-symbol")).toMatchObject({
      symbol: "RELIANCE",
      instrumentKey: "NSE_EQ|INE002A01018",
    });
    expect(client.state.instruments.find((row) => row.id === "instrument-key")).toMatchObject({
      active: false,
      symbol: "__SUPERSEDED__instrument-key",
      instrumentKey: "__SUPERSEDED__instrument-key",
    });
  });

  it("incremental sync starts after the latest stored candle", async () => {
    const client = createFakePrisma();
    client.state.dailyPrices.push({
      instrumentId: "instrument-1",
      tradingDate: new Date("2026-09-06T00:00:00.000Z"),
      marketDataSource: "UPSTOX_REAL",
    });
    const requestedRanges: string[] = [];

    await runUpstoxRealMarketSync({
      client: client as never,
      provider: providerWith({
        instruments: [instrument({ exchange: "NSE", symbol: "RELIANCE", instrumentKey: "NSE_EQ|INE002A01018", isin: "INE002A01018" })],
        onCandles(input) {
          requestedRanges.push(`${input.startDate.toISOString().slice(0, 10)}:${input.endDate.toISOString().slice(0, 10)}`);
          return [candle(input.instrumentKey, "2026-09-07")];
        },
      }),
      mode: "incremental",
      limit: 1,
      now: new Date("2026-09-08T08:00:00.000Z"),
    });

    expect(requestedRanges).toEqual(["2026-09-07:2026-09-07"]);
  });

  it("records failed instruments without failing the whole sync", async () => {
    vi.useFakeTimers();
    try {
      const run = runUpstoxRealMarketSync({
        client: createFakePrisma() as never,
        provider: providerWith({
          instruments: [
            instrument({ exchange: "NSE", symbol: "RELIANCE", instrumentKey: "NSE_EQ|INE002A01018", isin: "INE002A01018" }),
            instrument({ exchange: "NSE", symbol: "TCS", instrumentKey: "NSE_EQ|INE467B01029", isin: "INE467B01029" }),
          ],
          onCandles(input) {
            if (input.instrumentKey.includes("INE467B")) throw new Error("simulated Upstox failure");
            return [candle(input.instrumentKey, "2026-09-07")];
          },
        }),
        mode: "backfill",
        limit: 2,
        now: new Date("2026-09-08T08:00:00.000Z"),
      });

      await vi.runAllTimersAsync();
      const result = await run;
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.failures[0]?.symbol).toBe("TCS");
    } finally {
      vi.useRealTimers();
    }
  });
});

function providerWith(options: {
  readonly instruments: readonly ProviderInstrument[];
  readonly onCandles?: (input: { readonly instrumentKey: string; readonly startDate: Date; readonly endDate: Date }) => readonly ProviderDailyCandle[];
}): MarketDataProvider {
  return {
    name: "upstox",
    async fetchInstruments() {
      return [...options.instruments];
    },
    async fetchHistoricalDailyCandles(input) {
      return [...(options.onCandles?.(input) ?? [candle(input.instrumentKey, "2026-09-06"), candle(input.instrumentKey, "2026-09-07")])];
    },
    async fetchCurrentQuote() {
      throw new Error("Current quotes are not part of EOD sync.");
    },
  };
}

function instrument(input: {
  readonly exchange: "NSE" | "BSE";
  readonly symbol: string;
  readonly instrumentKey: string;
  readonly isin: string;
}): ProviderInstrument {
  return {
    exchange: input.exchange,
    symbol: input.symbol,
    tradingSymbol: input.symbol,
    instrumentKey: input.instrumentKey,
    name: `${input.symbol} Limited`,
    isin: input.isin,
    segment: `${input.exchange}_EQ`,
    instrumentType: "EQ",
    active: true,
  };
}

function candle(instrumentKey: string, date: string): ProviderDailyCandle {
  return {
    instrumentKey,
    tradingDate: new Date(`${date}T00:00:00.000Z`),
    open: "100",
    high: "110",
    low: "95",
    close: "105",
    volume: BigInt(1000),
  };
}

function createFakePrisma() {
  const state = {
    companies: [] as Array<{ id: string; isin: string; name: string; marketDataSource: string }>,
    instruments: [] as Array<{ id: string; companyId: string; exchange: string; symbol: string; instrumentKey: string; marketDataSource: string; active?: boolean }>,
    dailyPrices: [] as Array<{ instrumentId: string; tradingDate: Date; marketDataSource: string }>,
    dataSync: [] as Array<{ id: string; data: unknown }>,
  };

  return {
    state,
    company: {
      async upsert(input: { where: { isin: string }; update: { name: string; marketDataSource: string }; create: { isin: string; name: string; marketDataSource: string } }) {
        const existing = state.companies.find((company) => company.isin === input.where.isin);
        if (existing) {
          existing.name = input.update.name;
          existing.marketDataSource = input.update.marketDataSource;
          return { id: existing.id };
        }
        const row = { id: `company-${state.companies.length + 1}`, ...input.create };
        state.companies.push(row);
        return { id: row.id };
      },
    },
    instrument: {
      async findFirst(input: { where: { exchange: string; instrumentKey?: string; symbol?: string } }) {
        return state.instruments.find((instrument) => instrument.exchange === input.where.exchange &&
          (input.where.instrumentKey ? instrument.instrumentKey === input.where.instrumentKey : instrument.symbol === input.where.symbol)) ?? null;
      },
      async update(input: { where: { id: string }; data: { companyId: string; symbol: string; instrumentKey: string; marketDataSource: string } }) {
        const existing = state.instruments.find((instrument) => instrument.id === input.where.id)!;
        Object.assign(existing, input.data);
        return { id: existing.id, instrumentKey: existing.instrumentKey };
      },
      async create(input: { data: { companyId: string; exchange: string; symbol: string; instrumentKey: string; marketDataSource: string } }) {
        const row = { id: `instrument-${state.instruments.length + 1}`, ...input.data };
        state.instruments.push(row);
        return { id: row.id, instrumentKey: row.instrumentKey };
      },
    },
    dailyPrice: {
      async findFirst(input: { where: { instrumentId: string; marketDataSource: string } }) {
        return state.dailyPrices
          .filter((price) => price.instrumentId === input.where.instrumentId && price.marketDataSource === input.where.marketDataSource)
          .sort((left, right) => right.tradingDate.getTime() - left.tradingDate.getTime())[0] ?? null;
      },
      async createMany(input: { data: Array<{ instrumentId: string; tradingDate: Date; marketDataSource: string }>; skipDuplicates: boolean }) {
        let count = 0;
        for (const row of input.data) {
          const existing = state.dailyPrices.find((price) => price.instrumentId === row.instrumentId && price.tradingDate.getTime() === row.tradingDate.getTime());
          if (existing && input.skipDuplicates) continue;
          state.dailyPrices.push(row);
          count += 1;
        }
        return { count };
      },
    },
    dataSync: {
      async create(input: { data: unknown }) {
        const row = { id: `sync-${state.dataSync.length + 1}`, data: input.data };
        state.dataSync.push(row);
        return { id: row.id };
      },
      async update(input: { where: { id: string }; data: unknown }) {
        const row = state.dataSync.find((sync) => sync.id === input.where.id);
        if (row) row.data = input.data;
        return row ?? null;
      },
      async updateMany() {
        return { count: 0 };
      },
    },
  };
}
