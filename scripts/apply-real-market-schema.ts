import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketDataSource') THEN
    CREATE TYPE "MarketDataSource" AS ENUM ('SYNTHETIC', 'UPSTOX_REAL');
  END IF;
END
$$;
  `);

  for (const statement of [
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "marketDataSource" "MarketDataSource" NOT NULL DEFAULT 'SYNTHETIC'`,
    `ALTER TABLE "Instrument" ADD COLUMN IF NOT EXISTS "marketDataSource" "MarketDataSource" NOT NULL DEFAULT 'SYNTHETIC'`,
    `ALTER TABLE "DailyPrice" ADD COLUMN IF NOT EXISTS "marketDataSource" "MarketDataSource" NOT NULL DEFAULT 'SYNTHETIC'`,
    `ALTER TABLE "DailyPrice" ALTER COLUMN "open" DROP NOT NULL`,
    `ALTER TABLE "DailyPrice" ALTER COLUMN "high" DROP NOT NULL`,
    `ALTER TABLE "DailyPrice" ALTER COLUMN "low" DROP NOT NULL`,
    `ALTER TABLE "CompanyFundamentals" ADD COLUMN IF NOT EXISTS "peRatio" DECIMAL(12, 4)`,
    `ALTER TABLE "CompanyFundamentals" ADD COLUMN IF NOT EXISTS "marketDataSource" "MarketDataSource" NOT NULL DEFAULT 'SYNTHETIC'`,
    `ALTER TABLE "DataSync" ADD COLUMN IF NOT EXISTS "recordsSucceeded" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "DataSync" ADD COLUMN IF NOT EXISTS "recordsFailed" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "DataSync" ADD COLUMN IF NOT EXISTS "recordsSkipped" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "DataSync" ADD COLUMN IF NOT EXISTS "metadata" JSONB`,
    `CREATE INDEX IF NOT EXISTS "Company_marketDataSource_idx" ON "Company" ("marketDataSource")`,
    `CREATE INDEX IF NOT EXISTS "Instrument_marketDataSource_exchange_active_idx" ON "Instrument" ("marketDataSource", "exchange", "active")`,
    `CREATE INDEX IF NOT EXISTS "DailyPrice_marketDataSource_tradingDate_idx" ON "DailyPrice" ("marketDataSource", "tradingDate")`,
    `CREATE INDEX IF NOT EXISTS "CompanyFundamentals_marketDataSource_asOfDate_idx" ON "CompanyFundamentals" ("marketDataSource", "asOfDate")`,
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }

  console.log("Real-market schema additions verified.");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown schema update failure.");
    process.exit(1);
  });
