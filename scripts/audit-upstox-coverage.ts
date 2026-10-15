import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createUpstoxMarketDataProviderCore } from "../src/lib/market-data/providers/upstox-core";

const db = new PrismaClient();
async function main() {
  const provider = createUpstoxMarketDataProviderCore({ token: process.env.UPSTOX_ANALYTICS_TOKEN });
  const master = await provider.fetchInstruments();
  const stored = await db.instrument.findMany({ select: { id: true, symbol: true, exchange: true, instrumentKey: true, active: true, company: { select: { isin: true, name: true } } } });
  const conflicts = master.flatMap(m => {
    const s = stored.find(s => s.exchange === m.exchange && s.symbol === m.symbol && s.instrumentKey !== m.instrumentKey);
    return s ? [{ incoming: m, existing: s, oldKeyInMaster: master.some(m => m.instrumentKey === s.instrumentKey) }] : [];
  });
  console.log(JSON.stringify({ masterCount: master.length, conflicts }, null, 2));
  const sample = master.find(m => m.exchange === "NSE" && m.symbol === "RELIANCE")!;
  const old = await provider.fetchHistoricalDailyCandles({ instrumentKey: sample.instrumentKey, startDate: new Date("2000-01-01"), endDate: new Date("2006-09-10") });
  console.log(JSON.stringify({ olderHistorySample: sample.symbol, rows: old.length, first: old[0]?.tradingDate, last: old.at(-1)?.tradingDate }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
