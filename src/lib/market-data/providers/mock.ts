import { generateSyntheticMarket } from "@/lib/synthetic-market/generator";
import type { MarketDataProvider } from "@/lib/market-data/types";

export function createMockMarketDataProvider(): MarketDataProvider {
  const market = generateSyntheticMarket();
  const instruments = market.companies.flatMap((company) => company.instruments);

  return {
    name: "mock",
    async fetchInstruments() {
      return instruments;
    },
    async fetchHistoricalDailyCandles(input) {
      return market.candles.filter(
        (candle) =>
          candle.instrumentKey === input.instrumentKey &&
          candle.tradingDate >= input.startDate &&
          candle.tradingDate <= input.endDate,
      );
    },
  };
}
