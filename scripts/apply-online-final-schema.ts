import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe('ALTER TABLE "HistoricalStrategyRun" ADD COLUMN IF NOT EXISTS "reportMetrics" JSONB');
  console.log("Final online schema additions verified.");
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown final online schema failure.");
    process.exit(1);
  });
