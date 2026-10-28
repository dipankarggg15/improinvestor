import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { syncUpstoxCompanySectors } from "@/lib/sectors/upstox-profile";

const prisma = new PrismaClient();

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
    const [key, value = "true"] = argument.replace(/^--/, "").split("=");
    return [key, value];
  }));
  const result = await syncUpstoxCompanySectors({
    client: prisma,
    token: process.env.UPSTOX_ANALYTICS_TOKEN,
    concurrency: args.concurrency ? Number(args.concurrency) : 2,
    limit: args.limit ? Number(args.limit) : undefined,
    refresh: args.refresh === "true",
    onProgress: (progress) => console.log(`Processed ${progress.processed}: ${progress.updated} updated, ${progress.unchanged} unchanged, ${progress.failed} failed`),
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown Upstox sector sync failure.");
    process.exit(1);
  });
