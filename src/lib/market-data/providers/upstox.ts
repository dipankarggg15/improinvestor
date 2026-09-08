import "server-only";

import { env } from "@/lib/config/env";
import { createUpstoxMarketDataProviderCore } from "@/lib/market-data/providers/upstox-core";
import type { MarketDataProvider } from "@/lib/market-data/types";

export function createUpstoxMarketDataProvider(): MarketDataProvider {
  return createUpstoxMarketDataProviderCore({
    token: env.upstoxAnalyticsToken,
  });
}
