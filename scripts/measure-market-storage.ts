import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [databaseSize] = await prisma.$queryRaw<Array<{ bytes: bigint; pretty: string }>>`
    select pg_database_size(current_database())::bigint as bytes,
           pg_size_pretty(pg_database_size(current_database())) as pretty
  `;
  const tableSizes = await prisma.$queryRaw<Array<{ relation: string; total_bytes: bigint; table_bytes: bigint; index_bytes: bigint; pretty_total: string }>>`
    select relname as relation,
           pg_total_relation_size(format('%I', relname)::regclass)::bigint as total_bytes,
           pg_relation_size(format('%I', relname)::regclass)::bigint as table_bytes,
           (pg_total_relation_size(format('%I', relname)::regclass) - pg_relation_size(format('%I', relname)::regclass))::bigint as index_bytes,
           pg_size_pretty(pg_total_relation_size(format('%I', relname)::regclass)) as pretty_total
    from pg_stat_user_tables
    where relname in ('Company', 'Instrument', 'DailyPrice', 'CompanyFundamentals', 'DataSync')
    order by total_bytes desc
  `;
  const [counts] = await prisma.$queryRaw<Array<{
    real_companies: bigint;
    real_instruments: bigint;
    real_daily_prices: bigint;
    real_fundamentals: bigint;
    synthetic_companies: bigint;
    synthetic_instruments: bigint;
    synthetic_daily_prices: bigint;
  }>>`
    select
      (select count(*) from "Company" where "marketDataSource" = 'UPSTOX_REAL')::bigint as real_companies,
      (select count(*) from "Instrument" where "marketDataSource" = 'UPSTOX_REAL')::bigint as real_instruments,
      (select count(*) from "DailyPrice" where "marketDataSource" = 'UPSTOX_REAL')::bigint as real_daily_prices,
      (select count(*) from "CompanyFundamentals" where "marketDataSource" = 'UPSTOX_REAL')::bigint as real_fundamentals,
      (select count(*) from "Company" where "marketDataSource" = 'SYNTHETIC')::bigint as synthetic_companies,
      (select count(*) from "Instrument" where "marketDataSource" = 'SYNTHETIC')::bigint as synthetic_instruments,
      (select count(*) from "DailyPrice" where "marketDataSource" = 'SYNTHETIC')::bigint as synthetic_daily_prices
  `;

  console.log(JSON.stringify({
    database: {
      bytes: databaseSize?.bytes.toString(),
      mb: databaseSize ? bytesToMb(databaseSize.bytes) : null,
      pretty: databaseSize?.pretty,
    },
    counts: stringifyBigInts(counts),
    tableSizes: tableSizes.map((row) => ({
      relation: row.relation,
      totalMb: bytesToMb(row.total_bytes),
      tableMb: bytesToMb(row.table_bytes),
      indexMb: bytesToMb(row.index_bytes),
      prettyTotal: row.pretty_total,
    })),
  }, null, 2));
}

function stringifyBigInts<T extends Record<string, bigint>>(input: T | undefined) {
  if (!input) return null;
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value.toString()]));
}

function bytesToMb(input: bigint) {
  return Number((Number(input) / 1024 / 1024).toFixed(2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown storage measurement failure.");
    process.exit(1);
  });
