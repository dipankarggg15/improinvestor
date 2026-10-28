import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { fetchAndStoreStockFundamentals } from "@/lib/fundamentals/service";
import { isEligibleNseOrdinaryEquityInstrument } from "@/lib/strategies/nse-universe";

const prisma = new PrismaClient();

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
    const [key, value = "true"] = argument.replace(/^--/, "").split("=");
    return [key, value];
  }));
  const token = process.env.UPSTOX_ANALYTICS_TOKEN;
  if (!token) throw new Error("Missing UPSTOX_ANALYTICS_TOKEN.");
  const companies = (await prisma.company.findMany({
    where: { marketDataSource: "UPSTOX_REAL", ...(args.symbol ? { instruments: { some: { exchange: "NSE", symbol: args.symbol.toUpperCase() } } } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, isin: true, name: true, instruments: { where: { exchange: "NSE", active: true, marketDataSource: "UPSTOX_REAL" }, select: { instrumentKey: true, symbol: true } } },
  }))
    .filter((company) => company.instruments.some((instrument) => isEligibleNseOrdinaryEquityInstrument({ instrumentKey: instrument.instrumentKey, companyName: company.name, symbol: instrument.symbol })))
    .slice(0, args.limit ? Number(args.limit) : undefined);

  let succeeded = 0;
  const failures: Array<{ readonly company: string; readonly error: string }> = [];
  for (const [index, company] of companies.entries()) {
    try {
      await fetchAndStoreStockFundamentals(prisma, { companyId: company.id, isin: company.isin, token });
      succeeded += 1;
    } catch (error) {
      failures.push({ company: company.name, error: error instanceof Error ? error.message : "Unknown failure." });
    }
    if ((index + 1) % 10 === 0 || index + 1 === companies.length) {
      console.log(`Processed ${index + 1}/${companies.length}: ${succeeded} saved, ${failures.length} failed`);
    }
  }
  console.log(JSON.stringify({ total: companies.length, succeeded, failed: failures.length, failures: failures.slice(-25) }, null, 2));
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown fundamentals sync failure.");
    process.exit(1);
  });
