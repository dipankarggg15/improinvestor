import "server-only";

export const env = {
  databaseUrl: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_URL,
  marketDataProvider: process.env.MARKET_DATA_PROVIDER,
  ownerEmail: process.env.OWNER_EMAIL,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  upstoxAnalyticsToken: process.env.UPSTOX_ANALYTICS_TOKEN,
} as const;
