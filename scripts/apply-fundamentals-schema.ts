import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const decimalColumns = [
  "pbRatio", "roaPercent", "roePercent", "rocePercent", "evEbitda",
  "sectorPeRatio", "sectorPbRatio", "sectorRoaPercent", "sectorRoePercent", "sectorRocePercent", "sectorEvEbitda",
  "revenueGrowthPercent", "profitGrowthPercent", "salesCagr3YPercent", "profitCagr3YPercent",
  "operatingMarginPercent", "netMarginPercent", "cashFlowToProfit",
  "promoterHoldingPercent", "promoterHoldingChangePercent", "fiiHoldingPercent", "fiiHoldingChangePercent",
  "diiHoldingPercent", "diiHoldingChangePercent", "mutualFundHoldingPercent", "retailHoldingPercent",
] as const;

const moneyColumns = ["revenueCrore", "operatingProfitCrore", "netProfitCrore", "operatingCashFlowCrore"] as const;

async function main() {
  for (const column of decimalColumns) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyFundamentals" ADD COLUMN IF NOT EXISTS "${column}" DECIMAL(12, 4)`);
  }
  for (const column of moneyColumns) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyFundamentals" ADD COLUMN IF NOT EXISTS "${column}" DECIMAL(20, 2)`);
  }
  await prisma.$executeRawUnsafe('ALTER TABLE "CompanyFundamentals" ADD COLUMN IF NOT EXISTS "companyProfile" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE "CompanyFundamentals" ADD COLUMN IF NOT EXISTS "statementPeriod" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE "CompanyFundamentals" ADD COLUMN IF NOT EXISTS "holdingPeriod" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE "CompanyFundamentals" ADD COLUMN IF NOT EXISTS "rawData" JSONB');
  await prisma.$executeRawUnsafe('ALTER TABLE "CompanyFundamentals" ADD COLUMN IF NOT EXISTS "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP');
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown fundamentals schema failure.");
    process.exit(1);
  });
