import "dotenv/config";

import { PrismaClient, type StrategyReviewPositionSnapshot } from "@prisma/client";

import { rebuildPositionEpisodes, updateMissingPostExitObservations } from "../src/lib/exits/service";
import { getDefaultTradePrice, recordTrade } from "../src/lib/portfolio/service";

const prisma = new PrismaClient();
const demoPrefix = "PHASE7_DEMO:";

async function main() {
  const [momentum, early] = await Promise.all([
    prisma.portfolio.findFirstOrThrow({ where: { name: "Momentum 10 Price Only Synthetic Portfolio" } }),
    prisma.portfolio.findFirstOrThrow({ where: { name: "Early Superstars Synthetic Portfolio" } }),
  ]);

  await prisma.trade.deleteMany({
    where: {
      portfolioId: { in: [momentum.id, early.id] },
      notes: { startsWith: demoPrefix },
    },
  });
  await rebuildPositionEpisodes(prisma);

  const momentumSells = await sellRecommendations(momentum.id);
  const earlySells = await sellRecommendations(early.id);

  await sellFromReview(momentum.id, requireSnapshot(momentumSells[0], "Momentum delayed final sell"), "2025-08-01", "11", "delayed final closure after earlier partial sell");
  await sellManual(momentum.id, requireSnapshot(momentumSells[2], "Momentum manual all-horizon exit"), "2025-05-15", "6", "manual full closure with all observation horizons");
  await buyAgain(momentum.id, requireSnapshot(momentumSells[2], "Momentum re-entry"), "2025-09-01", "3", "new episode after full closure");
  await sellFromReview(early.id, requireSnapshot(earlySells[0], "Early review-linked exit"), "2025-07-21", "5", "review-linked delayed full closure");
  await sellManual(early.id, await earlyRecentOpenSnapshot(early.id, 0), "2025-12-31", "10", "recent manual full closure with future horizons unavailable");
  await sellManual(early.id, await earlyRecentOpenSnapshot(early.id, 1), "2025-12-31", "4", "recent partial sell that leaves the episode open");

  const rebuild = await rebuildPositionEpisodes(prisma);
  const observations = await updateMissingPostExitObservations(prisma);
  const [closedEpisodes, openEpisodes, postExitObservations] = await Promise.all([
    prisma.positionEpisode.count({ where: { status: "CLOSED" } }),
    prisma.positionEpisode.count({ where: { status: "OPEN" } }),
    prisma.postExitObservation.count(),
  ]);

  console.log(`Seeded Phase 7 exit demo trades with prefix ${demoPrefix}`);
  console.log(`Rebuilt episodes: total=${rebuild.episodesCreated}, open=${rebuild.openEpisodes}, closed=${rebuild.closedEpisodes}`);
  console.log(`Stored counts: openEpisodes=${openEpisodes}, closedEpisodes=${closedEpisodes}, postExitObservations=${postExitObservations}`);
  console.log(`Observation update: scanned=${observations.episodesScanned}, created=${observations.observationsCreated}`);
}

async function sellRecommendations(portfolioId: string) {
  return prisma.strategyReviewPositionSnapshot.findMany({
    where: {
      recommendation: "SELL",
      review: { portfolioId },
    },
    include: {
      company: true,
      instrument: true,
      review: true,
    },
    orderBy: [{ createdAt: "asc" }],
  });
}

async function sellFromReview(
  portfolioId: string,
  snapshot: TradeReference,
  requestedDate: string,
  quantity: string,
  label: string,
) {
  const price = await getPrice(snapshot.instrumentId, requestedDate);
  await recordTrade(prisma, {
    portfolioId,
    companyId: snapshot.companyId,
    instrumentId: snapshot.instrumentId,
    strategyReviewPositionSnapshotId: snapshot.id,
    side: "SELL",
    tradeDate: price.tradingDate,
    quantity,
    price: price.close.toFixed(4),
    fees: "20.00",
    notes: `${demoPrefix} ${label}`,
  });
}

async function sellManual(
  portfolioId: string,
  snapshot: TradeReference,
  requestedDate: string,
  quantity: string,
  label: string,
) {
  const price = await getPrice(snapshot.instrumentId, requestedDate);
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

async function buyAgain(
  portfolioId: string,
  snapshot: TradeReference,
  requestedDate: string,
  quantity: string,
  label: string,
) {
  const price = await getPrice(snapshot.instrumentId, requestedDate);
  await recordTrade(prisma, {
    portfolioId,
    companyId: snapshot.companyId,
    instrumentId: snapshot.instrumentId,
    side: "BUY",
    tradeDate: price.tradingDate,
    quantity,
    price: price.close.toFixed(4),
    fees: "20.00",
    notes: `${demoPrefix} ${label}`,
  });
}

async function earlyRecentOpenSnapshot(portfolioId: string, skip: number) {
  const trade = await prisma.trade.findFirstOrThrow({
    where: {
      portfolioId,
      side: "BUY",
      tradeDate: new Date("2025-12-31T00:00:00.000Z"),
    },
    skip,
    orderBy: { createdAt: "asc" },
  });
  return {
    id: "",
    reviewId: "",
    companyId: trade.companyId,
    instrumentId: trade.instrumentId,
    quantity: trade.quantity,
  };
}

async function getPrice(instrumentId: string, requestedDate: string) {
  const price = await getDefaultTradePrice(prisma, instrumentId, new Date(`${requestedDate}T00:00:00.000Z`));
  if (!price) throw new Error(`No synthetic price for ${instrumentId} on or after ${requestedDate}.`);
  return price;
}

function requireSnapshot<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`Missing snapshot for ${label}.`);
  return value;
}

type TradeReference = Pick<
  StrategyReviewPositionSnapshot,
  "id" | "companyId" | "instrumentId" | "quantity"
>;

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
