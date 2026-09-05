import "dotenv/config";

import { PrismaClient, type StrategyCandidateSnapshot } from "@prisma/client";

import { getDefaultTradePrice, recordTrade } from "../src/lib/portfolio/service";
import { runCurrentStrategyVersion } from "../src/lib/strategies/run-service";

const prisma = new PrismaClient();
const initialCapital = "1000000.00";
const demoPrefix = "PHASE5_DEMO:";

async function main() {
  const momentum = await portfolioForStrategy("Momentum 10", "Momentum 10 Synthetic Portfolio");
  const early = await portfolioForStrategy("Early Superstars", "Early Superstars Synthetic Portfolio");

  await prisma.trade.deleteMany({
    where: {
      portfolioId: { in: [momentum.id, early.id] },
      notes: { startsWith: demoPrefix },
    },
  });

  const momentumRun = await runFor("Momentum 10", "2025-03-31");
  const earlyRun = await runFor("Early Superstars", "2025-12-31");
  await runCurrentStrategyVersion({
    client: prisma,
    strategyId: early.strategyId,
    runDate: new Date("2025-03-31T00:00:00.000Z"),
  });
  const earlyMarchRun = await runFor("Early Superstars", "2025-03-31");
  const momentumSelected = await selectedSnapshots(momentumRun.id);
  const earlySelected = await selectedSnapshots(earlyRun.id);
  const earlyMarchSelected = await selectedSnapshots(earlyMarchRun.id);

  await buyFromSnapshot(momentum.id, momentumSelected[0], "2025-03-31", "10", "first Momentum 10 buy");
  await buyFromSnapshot(momentum.id, momentumSelected[0], "2025-04-07", "5", "second Momentum 10 buy, weighted-average demo");
  await buyFromSnapshot(momentum.id, momentumSelected[1], "2025-03-31", "8", "Momentum 10 selected candidate");
  await buyFromSnapshot(momentum.id, momentumSelected[2], "2025-03-31", "6", "Momentum 10 selected candidate");
  await sellManual(momentum.id, momentumSelected[0], "2025-06-30", "4", "partial manual sell");

  await buyFromSnapshot(early.id, earlySelected[0], "2025-12-31", "10", "Early Superstars selected candidate");
  await buyFromSnapshot(early.id, earlySelected[1], "2025-12-31", "12", "Early Superstars selected candidate");
  await buyFromSnapshot(early.id, earlySelected[2], "2025-12-31", "7", "Early Superstars selected candidate");
  await buyFromSnapshot(early.id, earlySelected[7], "2025-12-31", "9", "same company can exist in separate strategy portfolios");
  await buyFromSnapshot(early.id, earlyMarchSelected[0], "2025-03-31", "5", "older Early Superstars buy for Phase 2 review and emergency-stop demo", 1.35);

  const counts = await Promise.all([
    prisma.trade.count({ where: { portfolioId: momentum.id } }),
    prisma.trade.count({ where: { portfolioId: early.id } }),
  ]);
  console.log(`Seeded portfolios: ${momentum.name}, ${early.name}`);
  console.log(`Seeded demo trades: ${counts[0] + counts[1]}`);
}

async function portfolioForStrategy(strategyName: string, portfolioName: string) {
  const strategy = await prisma.strategy.findUniqueOrThrow({ where: { name: strategyName } });
  return prisma.portfolio.upsert({
    where: { strategyId_name: { strategyId: strategy.id, name: portfolioName } },
    update: {
      initialCapital,
      inceptionDate: new Date("2025-01-01T00:00:00.000Z"),
    },
    create: {
      strategyId: strategy.id,
      name: portfolioName,
      initialCapital,
      inceptionDate: new Date("2025-01-01T00:00:00.000Z"),
    },
  });
}

async function runFor(strategyName: string, runDate: string) {
  return prisma.strategyRun.findFirstOrThrow({
    where: {
      runDate: new Date(`${runDate}T00:00:00.000Z`),
      strategy: { name: strategyName },
    },
  });
}

async function selectedSnapshots(strategyRunId: string) {
  return prisma.strategyCandidateSnapshot.findMany({
    where: { strategyRunId, selected: true },
    orderBy: { rank: "asc" },
  });
}

async function buyFromSnapshot(
  portfolioId: string,
  snapshot: StrategyCandidateSnapshot | undefined,
  tradeDate: string,
  quantity: string,
  label: string,
  priceMultiplier = 1,
) {
  if (!snapshot) throw new Error(`Missing selected snapshot for ${label}.`);
  const price = await getPrice(snapshot.instrumentId, tradeDate);
  const tradePrice = price.close.mul(priceMultiplier).toFixed(4);
  await recordTrade(prisma, {
    portfolioId,
    companyId: snapshot.companyId,
    instrumentId: snapshot.instrumentId,
    strategyRunId: snapshot.strategyRunId,
    strategyCandidateSnapshotId: snapshot.id,
    side: "BUY",
    tradeDate: price.tradingDate,
    quantity,
    price: tradePrice,
    fees: "20.00",
    notes: `${demoPrefix} ${label}`,
  });
}

async function sellManual(
  portfolioId: string,
  snapshot: StrategyCandidateSnapshot | undefined,
  tradeDate: string,
  quantity: string,
  label: string,
) {
  if (!snapshot) throw new Error(`Missing selected snapshot for ${label}.`);
  const price = await getPrice(snapshot.instrumentId, tradeDate);
  await recordTrade(prisma, {
    portfolioId,
    companyId: snapshot.companyId,
    instrumentId: snapshot.instrumentId,
    side: "SELL",
    tradeDate: price.tradingDate,
    quantity,
    price: price.close.toFixed(4),
    fees: "20.00",
    notes: `${demoPrefix} ${label}`,
  });
}

async function getPrice(instrumentId: string, tradeDate: string) {
  const price = await getDefaultTradePrice(prisma, instrumentId, new Date(`${tradeDate}T00:00:00.000Z`));
  if (!price) throw new Error(`No price for ${instrumentId} on or after ${tradeDate}.`);
  return price;
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
