import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { fetchNifty500Classifications, syncNifty500Classifications } from "@/lib/sectors/classification";

const prisma = new PrismaClient();

async function main() {
  const classifications = await fetchNifty500Classifications();
  const result = await syncNifty500Classifications(prisma, classifications);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown sector classification sync failure.");
    process.exit(1);
  });
