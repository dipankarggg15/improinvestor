import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createUpstoxMarketDataProviderCore } from "../src/lib/market-data/providers/upstox-core";
import { runUpstoxRealMarketSync } from "../src/lib/market-data/upstox-sync";
const db = new PrismaClient();
async function main() {
  const coverage = await db.dailyPrice.groupBy({ by: ["instrumentId"], where: { marketDataSource: "UPSTOX_REAL", instrument: { exchange: "NSE" } }, _min: { tradingDate: true } });
  const ids = coverage.filter(c => c._min.tradingDate?.toISOString().slice(0, 10) === "2006-09-11").map(c => c.instrumentId);
  const targets = await db.instrument.findMany({ where: { id: { in: ids }, exchange: "NSE" }, select: { instrumentKey: true } });
  const keys = new Set(targets.map(t => t.instrumentKey));
  console.log("Remaining NSE instruments at original history boundary:", keys.size);
  await db.dataSync.updateMany({ where: { provider: "upstox", status: "RUNNING", startedAt: { gte: new Date("2026-10-12T05:06:00Z"), lt: new Date("2026-10-12T05:07:00Z") } }, data: { status: "FAILED", completedAt: new Date(), errorMessage: "Stopped after provider throttling; resumed as database-targeted, paced NSE backfill." } });
  // Respect the server cooldown before issuing another historical-data request.
  const resumeAt = Number(process.env.UPSTOX_RESUME_AT_MS ?? Date.now());
  while (Date.now() < resumeAt) await new Promise(r => setTimeout(r, Math.min(30000, resumeAt - Date.now())));
  const base = createUpstoxMarketDataProviderCore({ token: process.env.UPSTOX_ANALYTICS_TOKEN });
  let requests = 0;
  const provider = { ...base,
    async fetchInstruments() { return (await base.fetchInstruments()).filter(i => i.exchange === "NSE" && keys.has(i.instrumentKey)); },
    async fetchHistoricalDailyCandles(input: Parameters<typeof base.fetchHistoricalDailyCandles>[0]) {
      await new Promise(r => setTimeout(r, 1100));
      const result = await base.fetchHistoricalDailyCandles(input);
      if (++requests % 25 === 0) console.log("Historical requests completed:", requests, "/", keys.size);
      return result;
    },
  };
  const result = await runUpstoxRealMarketSync({ client: db, provider, exchanges: ["NSE"], mode: "backfill", startDate: new Date("2000-01-01"), endDate: new Date("2006-09-10"), concurrency: 1, progressEvery: 25 });
  console.log(JSON.stringify(result, null, 2));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
