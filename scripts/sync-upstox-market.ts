import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { createUpstoxMarketDataProviderCore } from "@/lib/market-data/providers/upstox-core";
import { runUpstoxRealMarketSync, type UpstoxSyncMode } from "@/lib/market-data/upstox-sync";

const prisma = new PrismaClient();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = readMode(args.mode);
  const limit = args.limit ? Number(args.limit) : undefined;
  const concurrency = args.concurrency ? Number(args.concurrency) : 2;
  const progressEvery = args.progressEvery ? Number(args.progressEvery) : 25;
  const years = args.years ? Number(args.years) : 1;
  const symbols = args.symbols?.split(",").map((symbol) => symbol.trim()).filter(Boolean);

  if (args.full !== "true" && !limit && (!symbols || symbols.length === 0)) {
    throw new Error("Refusing unbounded Upstox sync. Pass --limit, --symbols, or --full=true.");
  }

  const provider = createUpstoxMarketDataProviderCore({
    token: process.env.UPSTOX_ANALYTICS_TOKEN,
  });
  const result = await runUpstoxRealMarketSync({
    client: prisma,
    provider,
    mode,
    years,
    concurrency,
    progressEvery,
    limit,
    symbols,
  });

  console.log(JSON.stringify({
    source: "UPSTOX_REAL",
    mode,
    universeCounts: result.universeCounts,
    processed: result.processed,
    successful: result.successful,
    failed: result.failed,
    skipped: result.skipped,
    candlesUpserted: result.candlesUpserted,
    period: {
      startDate: result.startDate.toISOString().slice(0, 10),
      endDate: result.endDate.toISOString().slice(0, 10),
    },
    failures: result.failures,
  }, null, 2));
}

function parseArgs(args: readonly string[]) {
  return Object.fromEntries(args.map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  })) as Record<string, string>;
}

function readMode(input: string | undefined): UpstoxSyncMode {
  if (!input || input === "incremental") return "incremental";
  if (input === "backfill") return "backfill";
  throw new Error("Mode must be backfill or incremental.");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown Upstox sync failure.");
    process.exit(1);
  });
