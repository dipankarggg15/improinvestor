import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WatchlistItemState') THEN
    CREATE TYPE "WatchlistItemState" AS ENUM ('WATCHING', 'BOUGHT', 'ARCHIVED');
  END IF;
END
$$;
  `);

  for (const statement of [
    `CREATE TABLE IF NOT EXISTS "Watchlist" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "WatchlistItem" (
      id TEXT PRIMARY KEY,
      "watchlistId" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "instrumentId" TEXT NOT NULL,
      source TEXT,
      state "WatchlistItemState" NOT NULL DEFAULT 'WATCHING',
      "manualSupportLow" DECIMAL(18, 4),
      "manualSupportHigh" DECIMAL(18, 4),
      "detectedSupportLow" DECIMAL(18, 4),
      "detectedSupportHigh" DECIMAL(18, 4),
      "detectedAt" DATE,
      "alertDistancePercent" DECIMAL(8, 4) NOT NULL DEFAULT 1,
      notes TEXT,
      "lastReviewedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "WatchlistItem_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist"(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "WatchlistItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "WatchlistItem_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"(id) ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Watchlist_name_key" ON "Watchlist" (name)`,
    `CREATE INDEX IF NOT EXISTS "Watchlist_updatedAt_idx" ON "Watchlist" ("updatedAt")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "WatchlistItem_watchlistId_instrumentId_key" ON "WatchlistItem" ("watchlistId", "instrumentId")`,
    `CREATE INDEX IF NOT EXISTS "WatchlistItem_watchlistId_state_updatedAt_idx" ON "WatchlistItem" ("watchlistId", state, "updatedAt")`,
    `CREATE INDEX IF NOT EXISTS "WatchlistItem_companyId_idx" ON "WatchlistItem" ("companyId")`,
    `CREATE INDEX IF NOT EXISTS "WatchlistItem_instrumentId_idx" ON "WatchlistItem" ("instrumentId")`,
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }

  console.log("Watchlist schema verified.");
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown watchlist schema update failure.");
    process.exit(1);
  });
