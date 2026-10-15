import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
const db = new PrismaClient();
async function main() {
  const prices = await db.dailyPrice.groupBy({ by: ["instrumentId"], where: { marketDataSource: "UPSTOX_REAL", instrument: { exchange: "NSE" } }, _count: { _all: true }, _min: { tradingDate: true }, _max: { tradingDate: true } });
  const latest = new Map<string, number>();
  const earliest = new Map<string, number>();
  for (const p of prices) {
    const first = p._min.tradingDate!.toISOString().slice(0, 10);
    const last = p._max.tradingDate!.toISOString().slice(0, 10);
    earliest.set(first, (earliest.get(first) ?? 0) + 1);
    latest.set(last, (latest.get(last) ?? 0) + 1);
  }
  const totalRows = prices.reduce((n, p) => n + p._count._all, 0);
  const summary = { checkedAt: new Date(), exchange: "NSE", source: "UPSTOX_REAL", nseInstruments: await db.instrument.count({ where: { exchange: "NSE", marketDataSource: "UPSTOX_REAL" } }), instrumentsWithPrices: prices.length, totalRows, rowsAddedSinceNseOnlyAudit: totalRows - 7053196, earliestDates: [...earliest].sort().slice(0, 10), latestDates: [...latest].sort().reverse().slice(0, 15), unresolvedIsinConflicts: ["BLSE", "BUILDPRO", "ORIANA", "TAALTECH"], notes: ["Counts verified from the database, not the older sync counter.", "Existing BSE records retained; all fetching after scope clarification was NSE-only.", "Coverage varies by instrument; this audit does not certify every interior date.", "Today is 2026-10-12; its daily session was incomplete during this sync."] };
  console.log(JSON.stringify(summary, null, 2));
  await mkdir("reports/market-data", { recursive: true });
  await writeFile("reports/market-data/nse-sync-2026-10-12.json", JSON.stringify(summary, null, 2));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
