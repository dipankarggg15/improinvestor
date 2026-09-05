import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { runPortfolioReview } from "../src/lib/reviews/service";

const prisma = new PrismaClient();

async function main() {
  const momentum = await prisma.portfolio.findFirstOrThrow({
    where: { name: "Momentum 10 Synthetic Portfolio" },
  });
  const early = await prisma.portfolio.findFirstOrThrow({
    where: { name: "Early Superstars Synthetic Portfolio" },
  });
  const sellTradesBefore = await prisma.trade.count({ where: { side: "SELL" } });
  await prisma.strategyReview.deleteMany({
    where: {
      portfolioId: { in: [momentum.id, early.id] },
      reviewDate: {
        in: [
          new Date("2025-04-15T00:00:00.000Z"),
          new Date("2025-07-15T00:00:00.000Z"),
          new Date("2026-01-30T00:00:00.000Z"),
          new Date("2026-04-15T00:00:00.000Z"),
        ],
      },
    },
  });

  const reviews = [
    await runPortfolioReview({
      client: prisma,
      portfolioId: momentum.id,
      reviewType: "SCHEDULED",
      reviewDate: new Date("2025-04-15T00:00:00.000Z"),
    }),
    await runPortfolioReview({
      client: prisma,
      portfolioId: momentum.id,
      reviewType: "SCHEDULED",
      reviewDate: new Date("2025-07-15T00:00:00.000Z"),
    }),
    await runPortfolioReview({
      client: prisma,
      portfolioId: early.id,
      reviewType: "SCHEDULED",
      reviewDate: new Date("2025-04-15T00:00:00.000Z"),
    }),
    await runPortfolioReview({
      client: prisma,
      portfolioId: early.id,
      reviewType: "SCHEDULED",
      reviewDate: new Date("2025-07-15T00:00:00.000Z"),
    }),
    await runPortfolioReview({
      client: prisma,
      portfolioId: early.id,
      reviewType: "EMERGENCY",
      reviewDate: new Date("2025-07-15T00:00:00.000Z"),
    }),
  ];
  const sellTradesAfter = await prisma.trade.count({ where: { side: "SELL" } });

  for (const review of reviews) {
    const stored = await prisma.strategyReview.findUniqueOrThrow({
      where: { id: review.id },
      include: {
        strategy: true,
        portfolio: true,
        snapshots: {
          orderBy: [{ recommendation: "desc" }, { rank: "asc" }],
          include: { company: true, instrument: true },
        },
      },
    });
    const sells = stored.snapshots.filter((snapshot) => snapshot.recommendation === "SELL");
    const holds = stored.snapshots.filter((snapshot) => snapshot.recommendation === "HOLD");
    console.log(
      `${stored.strategy.name}|${stored.reviewType}|${stored.reviewDate.toISOString().slice(0, 10)}|review=${stored.id}|snapshots=${stored.snapshots.length}|HOLD=${holds.length}|SELL=${sells.length}`,
    );
    for (const snapshot of stored.snapshots.slice(0, 4)) {
      console.log(
        `  ${snapshot.recommendation}|${snapshot.company.name}|${snapshot.instrument.symbol}|rank=${snapshot.rank ?? "-"}|reasons=${snapshot.reasonCodes.join(",")}`,
      );
    }
  }

  console.log(`SELL trades before reviews: ${sellTradesBefore}`);
  console.log(`SELL trades after reviews: ${sellTradesAfter}`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
