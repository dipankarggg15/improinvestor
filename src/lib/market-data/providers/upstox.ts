import "server-only";

import type { MarketDataProvider } from "@/lib/market-data/types";

export function createUpstoxMarketDataProvider(): MarketDataProvider {
  return {
    name: "upstox",
    async fetchInstruments() {
      throw new Error("Upstox market-data integration is not implemented yet.");
    },
    async fetchHistoricalDailyCandles() {
      throw new Error("Upstox historical candle integration is not implemented yet.");
    },
  };
}
