import "server-only";

export const env = {
  databaseUrl: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_URL,
  marketDataProvider: process.env.MARKET_DATA_PROVIDER,
  upstoxAccessToken: process.env.UPSTOX_ACCESS_TOKEN,
} as const;
