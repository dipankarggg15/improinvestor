import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReturnExperimentStatus') THEN
    CREATE TYPE "ReturnExperimentStatus" AS ENUM ('TEMPORARY', 'SAVED');
  END IF;
END
$$;
  `);

  for (const statement of [
    `CREATE TABLE IF NOT EXISTS "ReturnExperiment" (
      id TEXT PRIMARY KEY,
      name TEXT,
      status "ReturnExperimentStatus" NOT NULL DEFAULT 'TEMPORARY',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "savedAt" TIMESTAMP(3)
    )`,
    `CREATE TABLE IF NOT EXISTS "ReturnExperimentPosition" (
      id TEXT PRIMARY KEY,
      "experimentId" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "instrumentId" TEXT NOT NULL,
      "requestedStartDate" DATE NOT NULL,
      "requestedEndDate" DATE NOT NULL,
      "resolvedStartDate" DATE,
      "resolvedEndDate" DATE,
      "startPrice" DECIMAL(18, 4),
      "endPrice" DECIMAL(18, 4),
      "holdingDays" INTEGER,
      "returnPercent" DECIMAL(12, 4),
      "excludedReason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "ReturnExperimentPosition_experimentId_fkey"
        FOREIGN KEY ("experimentId") REFERENCES "ReturnExperiment"(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ReturnExperimentPosition_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "ReturnExperimentPosition_instrumentId_fkey"
        FOREIGN KEY ("instrumentId") REFERENCES "Instrument"(id) ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "ReturnExperiment_status_updatedAt_idx" ON "ReturnExperiment" (status, "updatedAt")`,
    `CREATE INDEX IF NOT EXISTS "ReturnExperiment_savedAt_idx" ON "ReturnExperiment" ("savedAt")`,
    `CREATE INDEX IF NOT EXISTS "ReturnExperimentPosition_experimentId_createdAt_idx" ON "ReturnExperimentPosition" ("experimentId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "ReturnExperimentPosition_companyId_idx" ON "ReturnExperimentPosition" ("companyId")`,
    `CREATE INDEX IF NOT EXISTS "ReturnExperimentPosition_instrumentId_idx" ON "ReturnExperimentPosition" ("instrumentId")`,
    `CREATE INDEX IF NOT EXISTS "ReturnExperimentPosition_requestedStartDate_requestedEndDate_idx" ON "ReturnExperimentPosition" ("requestedStartDate", "requestedEndDate")`,
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }

  console.log("Return experiment schema verified.");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown return experiment schema update failure.");
    process.exit(1);
  });
