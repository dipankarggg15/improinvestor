import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { isEligibleNseOrdinaryEquityInstrument } from "../src/lib/strategies/nse-universe";

type Row = {
  instrumentKey: string;
  symbol: string;
  companyName: string;
  sessions: number;
  latestClose: number;
  oneYearHigh: number | null;
  olderHigh: number | null;
  sma50: number | null;
  atr14: number | null;
  averageTradedValue20: number | null;
  latestVolume: number;
  averageVolume20: number | null;
  currentTenHigh: number | null;
  currentTenLow: number | null;
  previousTenHigh: number | null;
  previousTenLow: number | null;
};

async function main() {
  const client = new PrismaClient();
  try {
  const rows = await client.$queryRaw<Row[]>`
    WITH priced AS (
      SELECT
        i."instrumentKey",
        i.symbol,
        c.name AS "companyName",
        dp."tradingDate",
        COALESCE(dp.high, dp.close)::float8 AS high,
        COALESCE(dp.low, dp.close)::float8 AS low,
        dp.close::float8 AS close,
        dp.volume::float8 AS volume,
        lag(dp.close) OVER (PARTITION BY dp."instrumentId" ORDER BY dp."tradingDate")::float8 AS "previousClose",
        row_number() OVER (PARTITION BY dp."instrumentId" ORDER BY dp."tradingDate" DESC)::int AS position
      FROM "DailyPrice" dp
      JOIN "Instrument" i ON i.id = dp."instrumentId"
      JOIN "Company" c ON c.id = i."companyId"
      WHERE dp."marketDataSource"::text = 'UPSTOX_REAL'
        AND i.exchange::text = 'NSE'
        AND i.active = true
        AND dp."tradingDate" >= DATE '2021-05-01'
        AND dp."tradingDate" <= DATE '2026-10-27'
    ), measured AS (
      SELECT *, greatest(high - low, abs(high - "previousClose"), abs(low - "previousClose")) AS "trueRange"
      FROM priced
    )
    SELECT
      "instrumentKey",
      symbol,
      "companyName",
      count(*)::int AS sessions,
      max(close) FILTER (WHERE position = 1)::float8 AS "latestClose",
      max(high) FILTER (WHERE position BETWEEN 2 AND 253)::float8 AS "oneYearHigh",
      max(high) FILTER (WHERE position BETWEEN 254 AND 1261)::float8 AS "olderHigh",
      avg(close) FILTER (WHERE position <= 50)::float8 AS sma50,
      avg("trueRange") FILTER (WHERE position <= 14)::float8 AS atr14,
      avg(close * volume) FILTER (WHERE position BETWEEN 2 AND 21)::float8 AS "averageTradedValue20",
      max(volume) FILTER (WHERE position = 1)::float8 AS "latestVolume",
      avg(volume) FILTER (WHERE position BETWEEN 2 AND 21)::float8 AS "averageVolume20",
      max(high) FILTER (WHERE position <= 10)::float8 AS "currentTenHigh",
      min(low) FILTER (WHERE position <= 10)::float8 AS "currentTenLow",
      max(high) FILTER (WHERE position BETWEEN 11 AND 20)::float8 AS "previousTenHigh",
      min(low) FILTER (WHERE position BETWEEN 11 AND 20)::float8 AS "previousTenLow"
    FROM measured
    GROUP BY "instrumentKey", symbol, "companyName"
  `;

  const ordinary = rows.filter((row) => isEligibleNseOrdinaryEquityInstrument({
    instrumentKey: row.instrumentKey,
    companyName: row.companyName,
    symbol: row.symbol,
  }));
  const conditions = [
    ["ordinary NSE equity", () => true],
    ["20-day ATV at least ₹5 crore", (row: Row) => (row.averageTradedValue20 ?? 0) >= 5 * 10_000_000],
    ["at least 504 sessions", (row: Row) => row.sessions >= 504],
    ["older high at least 10% above 52W high", (row: Row) => Boolean(row.oneYearHigh && row.olderHigh && row.olderHigh >= row.oneYearHigh * 1.1)],
    ["not more than 15% above 50 DMA", (row: Row) => Boolean(row.sma50 && ((row.latestClose - row.sma50) / row.sma50) * 100 <= 15)],
    ["within 10% of 52W high", (row: Row) => Boolean(row.oneYearHigh && Math.abs(((row.oneYearHigh - row.latestClose) / row.oneYearHigh) * 100) <= 10)],
  ] as const;

  let survivors = ordinary;
  const report = conditions.map(([condition, predicate]) => {
    survivors = survivors.filter(predicate);
    return { condition, survivors: survivors.length };
  });
  console.table(report);
  console.log("Final symbols:", survivors.map((row) => row.symbol).join(", "));
  } finally {
    await client.$disconnect();
  }
}

void main();
