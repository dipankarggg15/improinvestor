import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { latestCompletedEodDate } from "@/lib/market-data/upstox-sync";

const prisma = new PrismaClient();

async function main() {
  const latestAllowedDate = latestCompletedEodDate();
  const [duplicates] = await prisma.$queryRaw<Array<{ count: number }>>`
    select count(*)::int as count
    from (
      select "instrumentId", "tradingDate", count(*)
      from "DailyPrice"
      where "marketDataSource" = 'UPSTOX_REAL'
      group by "instrumentId", "tradingDate"
      having count(*) > 1
    ) duplicate_groups
  `;
  const [badRows] = await prisma.$queryRaw<Array<{ count: number }>>`
    select count(*)::int as count
    from "DailyPrice"
    where "marketDataSource" = 'UPSTOX_REAL'
      and ("tradingDate" > ${latestAllowedDate} or close < 0 or volume < 0)
  `;
  const [ohlcCounts] = await prisma.$queryRaw<Array<{ total: number; open_count: number; high_count: number; low_count: number }>>`
    select count(*)::int as total,
           count(open)::int as open_count,
           count(high)::int as high_count,
           count(low)::int as low_count
    from "DailyPrice"
    where "marketDataSource" = 'UPSTOX_REAL'
  `;
  const samples = await prisma.$queryRaw<Array<{
    name: string;
    isin: string;
    symbol: string;
    exchange: string;
    instrumentKey: string;
    candles: number;
    firstDate: Date | null;
    latestDate: Date | null;
  }>>`
    select c.name,
           c.isin,
           i.symbol,
           i.exchange::text as exchange,
           i."instrumentKey",
           count(dp.id)::int as candles,
           min(dp."tradingDate") as "firstDate",
           max(dp."tradingDate") as "latestDate"
    from "Company" c
    join "Instrument" i on i."companyId" = c.id
    left join "DailyPrice" dp on dp."instrumentId" = i.id and dp."marketDataSource" = 'UPSTOX_REAL'
    where c."marketDataSource" = 'UPSTOX_REAL'
      and i."marketDataSource" = 'UPSTOX_REAL'
      and i.symbol in ('RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'SBIN')
    group by c.name, c.isin, i.symbol, i.exchange, i."instrumentKey"
    order by i.symbol, i.exchange
  `;

  console.log(JSON.stringify({
    duplicateDailyPriceGroups: duplicates?.count ?? 0,
    badDailyPriceRows: badRows?.count ?? 0,
    realDailyPriceOhlcCounts: ohlcCounts,
    samples: samples.map((sample) => ({
      ...sample,
      firstDate: sample.firstDate?.toISOString().slice(0, 10) ?? null,
      latestDate: sample.latestDate?.toISOString().slice(0, 10) ?? null,
    })),
  }, null, 2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown real-market validation failure.");
    process.exit(1);
  });
