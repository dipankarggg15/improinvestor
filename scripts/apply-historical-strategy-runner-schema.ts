import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HistoricalStrategyRunStatus') THEN
    CREATE TYPE "HistoricalStrategyRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HistoricalStrategyPositionStatus') THEN
    CREATE TYPE "HistoricalStrategyPositionStatus" AS ENUM ('OPEN', 'CLOSED', 'OPEN_AT_END');
  END IF;
END
$$;
  `);

  for (const statement of [
    `CREATE TABLE IF NOT EXISTS "HistoricalStrategyRun" (
      id TEXT PRIMARY KEY,
      "strategyId" TEXT NOT NULL,
      "strategyVersionId" TEXT NOT NULL,
      status "HistoricalStrategyRunStatus" NOT NULL,
      "requestedStartDate" DATE NOT NULL,
      "requestedEndDate" DATE NOT NULL,
      "effectiveStartDate" DATE,
      "effectiveEndDate" DATE,
      "initialCapital" DECIMAL(20, 2) NOT NULL,
      "endingValue" DECIMAL(20, 2),
      "totalReturnPercent" DECIMAL(12, 4),
      "cagrPercent" DECIMAL(12, 4),
      "maxDrawdownPercent" DECIMAL(12, 4),
      "initialPositionCount" INTEGER NOT NULL DEFAULT 0,
      "tradeCount" INTEGER NOT NULL DEFAULT 0,
      "stopLossExitCount" INTEGER NOT NULL DEFAULT 0,
      "monthlyRankExitCount" INTEGER NOT NULL DEFAULT 0,
      "graduationCount" INTEGER NOT NULL DEFAULT 0,
      "endingOpenPositionCount" INTEGER NOT NULL DEFAULT 0,
      "unavailableFilters" JSONB NOT NULL,
      limitations JSONB NOT NULL,
      assumptions JSONB NOT NULL,
      "errorMessage" TEXT,
      "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "HistoricalStrategyRun_strategyId_fkey"
        FOREIGN KEY ("strategyId") REFERENCES "Strategy"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "HistoricalStrategyRun_strategyVersionId_fkey"
        FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion"(id) ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "HistoricalStrategyPosition" (
      id TEXT PRIMARY KEY,
      "runId" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "instrumentId" TEXT NOT NULL,
      status "HistoricalStrategyPositionStatus" NOT NULL,
      "entryDate" DATE NOT NULL,
      "entryPrice" DECIMAL(18, 4) NOT NULL,
      quantity DECIMAL(20, 6) NOT NULL,
      allocation DECIMAL(20, 2) NOT NULL,
      "entryRank" INTEGER,
      "entryReturn1W" DECIMAL(12, 4),
      "stopTriggerDate" DATE,
      "stopTriggerPrice" DECIMAL(18, 4),
      "exitDate" DATE,
      "exitPrice" DECIMAL(18, 4),
      "exitReason" TEXT,
      "realizedReturnPercent" DECIMAL(12, 4),
      "reviewHistory" JSONB NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "HistoricalStrategyPosition_runId_fkey"
        FOREIGN KEY ("runId") REFERENCES "HistoricalStrategyRun"(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "HistoricalStrategyPosition_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "HistoricalStrategyPosition_instrumentId_fkey"
        FOREIGN KEY ("instrumentId") REFERENCES "Instrument"(id) ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "HistoricalStrategyEvent" (
      id TEXT PRIMARY KEY,
      "runId" TEXT NOT NULL,
      "positionId" TEXT,
      "companyId" TEXT,
      "instrumentId" TEXT,
      "eventDate" DATE NOT NULL,
      "eventType" TEXT NOT NULL,
      details JSONB NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "HistoricalStrategyEvent_runId_fkey"
        FOREIGN KEY ("runId") REFERENCES "HistoricalStrategyRun"(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "HistoricalStrategyEvent_positionId_fkey"
        FOREIGN KEY ("positionId") REFERENCES "HistoricalStrategyPosition"(id) ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "HistoricalStrategyDailyEquity" (
      id TEXT PRIMARY KEY,
      "runId" TEXT NOT NULL,
      date DATE NOT NULL,
      cash DECIMAL(20, 2) NOT NULL,
      "investedValue" DECIMAL(20, 2) NOT NULL,
      "totalEquity" DECIMAL(20, 2) NOT NULL,
      "cumulativeReturnPercent" DECIMAL(12, 4) NOT NULL,
      "drawdownPercent" DECIMAL(12, 4) NOT NULL,
      "openPositionCount" INTEGER NOT NULL,
      CONSTRAINT "HistoricalStrategyDailyEquity_runId_fkey"
        FOREIGN KEY ("runId") REFERENCES "HistoricalStrategyRun"(id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "HistoricalStrategyRun_strategyId_requestedStartDate_requestedEndDate_idx" ON "HistoricalStrategyRun" ("strategyId", "requestedStartDate", "requestedEndDate")`,
    `CREATE INDEX IF NOT EXISTS "HistoricalStrategyRun_strategyVersionId_createdAt_idx" ON "HistoricalStrategyRun" ("strategyVersionId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "HistoricalStrategyRun_status_createdAt_idx" ON "HistoricalStrategyRun" (status, "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "HistoricalStrategyPosition_runId_entryDate_idx" ON "HistoricalStrategyPosition" ("runId", "entryDate")`,
    `CREATE INDEX IF NOT EXISTS "HistoricalStrategyPosition_runId_status_idx" ON "HistoricalStrategyPosition" ("runId", status)`,
    `CREATE INDEX IF NOT EXISTS "HistoricalStrategyPosition_companyId_idx" ON "HistoricalStrategyPosition" ("companyId")`,
    `CREATE INDEX IF NOT EXISTS "HistoricalStrategyPosition_instrumentId_idx" ON "HistoricalStrategyPosition" ("instrumentId")`,
    `CREATE INDEX IF NOT EXISTS "HistoricalStrategyEvent_runId_eventDate_idx" ON "HistoricalStrategyEvent" ("runId", "eventDate")`,
    `CREATE INDEX IF NOT EXISTS "HistoricalStrategyEvent_runId_eventType_idx" ON "HistoricalStrategyEvent" ("runId", "eventType")`,
    `CREATE INDEX IF NOT EXISTS "HistoricalStrategyEvent_companyId_idx" ON "HistoricalStrategyEvent" ("companyId")`,
    `CREATE INDEX IF NOT EXISTS "HistoricalStrategyEvent_instrumentId_idx" ON "HistoricalStrategyEvent" ("instrumentId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "HistoricalStrategyDailyEquity_runId_date_key" ON "HistoricalStrategyDailyEquity" ("runId", date)`,
    `CREATE INDEX IF NOT EXISTS "HistoricalStrategyDailyEquity_runId_date_idx" ON "HistoricalStrategyDailyEquity" ("runId", date)`,
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }

  console.log("Historical strategy runner schema verified.");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown historical strategy schema update failure.");
    process.exit(1);
  });
