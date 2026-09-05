import "server-only";

import { env } from "@/lib/config/env";
import { createMockMarketDataProvider } from "@/lib/market-data/providers/mock";
import { createUpstoxMarketDataProvider } from "@/lib/market-data/providers/upstox";
import type { MarketDataProvider } from "@/lib/market-data/types";

export function getMarketDataProvider(): MarketDataProvider | null {
  switch (env.marketDataProvider) {
    case "mock":
      return createMockMarketDataProvider();
    case "upstox":
      return createUpstoxMarketDataProvider();
    default:
      return null;
  }
}

export type { MarketDataProvider, MarketDataProviderName } from "@/lib/market-data/types";
