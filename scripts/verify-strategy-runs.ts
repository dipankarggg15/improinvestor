import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { runCurrentStrategyVersion } from "../src/lib/strategies/run-service";

const prisma = new PrismaClient();
const verificationRuns = [
  { strategyName: "Momentum 10", runDate: new Date("2025-03-31T00:00:00.000Z") },
  { strategyName: "Early Superstars", runDate: new Date("2025-12-31T00:00:00.000Z") },
];

async function main() {
  for (const { strategyName, runDate } of verificationRuns) {
    const strategy = await prisma.strategy.findUniqueOrThrow({
      where: { name: strategyName },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    const run = await runCurrentStrategyVersion({
      strategyId: strategy.id,
      runDate,
      client: prisma,
    });
    const storedRun = await prisma.strategyRun.findUniqueOrThrow({
      where: { id: run.id },
      include: {
        strategyVersion: true,
        candidates: {
          where: { qualified: true },
          orderBy: [{ rank: "asc" }],
          include: { company: true, instrument: true },
        },
      },
    });
    const selected = storedRun.candidates.filter((candidate) => candidate.selected);
    const nonSelectedQualified = storedRun.candidates.filter((candidate) => !candidate.selected);

    console.log(`\n${strategy.name}`);
    console.log(`Run ID: ${storedRun.id}`);
    console.log(`Run date: ${storedRun.runDate.toISOString().slice(0, 10)}`);
    console.log(`Version: V${storedRun.strategyVersion.versionNumber}`);
    console.log(`Evaluated: ${storedRun.evaluatedCount}`);
    console.log(`Eligible: ${storedRun.eligibleCount}`);
    console.log(`Selected: ${storedRun.selectedCount}`);
    console.log(`Non-selected qualifiers stored: ${nonSelectedQualified.length}`);
    console.log("Top selected:");

    for (const candidate of selected.slice(0, 10)) {
      console.log(
        `${candidate.rank}. ${candidate.company.name} (${candidate.instrument.symbol}, ${candidate.instrument.exchange}) - ${candidate.rankingMetric} ${candidate.rankingMetricValue?.toNumber().toFixed(2)}%`,
      );
    }

    console.log("Manual checks:");
    for (const candidate of selected.slice(0, 3)) {
      const rankingMetric = candidate.rankingMetric;
      const metricDates = candidate.metricTradingDates as Record<string, { startDate: string; endDate: string } | undefined>;
      const dates = rankingMetric ? metricDates[rankingMetric] : undefined;
      const recomputed = dates
        ? await recomputeReturn(candidate.instrumentId, dates.startDate, dates.endDate)
        : null;
      const fundamentals = await prisma.companyFundamentals.findFirst({
        where: {
          companyId: candidate.companyId,
          asOfDate: { lte: storedRun.runDate },
        },
        orderBy: { asOfDate: "desc" },
      });

      console.log(
        `${candidate.company.name}: snapshot ${rankingMetric ?? "ranking"}=${candidate.rankingMetricValue?.toNumber().toFixed(4)}%, recomputed=${recomputed?.toFixed(4) ?? "n/a"}%, fundamentals ${fundamentals?.asOfDate.toISOString().slice(0, 10) ?? "missing"}`,
      );
    }
  }
}

async function recomputeReturn(instrumentId: string, startDate: string, endDate: string) {
  const [start, end] = await Promise.all([
    prisma.dailyPrice.findUnique({
      where: {
        instrumentId_tradingDate: {
          instrumentId,
          tradingDate: new Date(`${startDate}T00:00:00.000Z`),
        },
      },
    }),
    prisma.dailyPrice.findUnique({
      where: {
        instrumentId_tradingDate: {
          instrumentId,
          tradingDate: new Date(`${endDate}T00:00:00.000Z`),
        },
      },
    }),
  ]);

  if (!start || !end) {
    return null;
  }

  return ((end.close.toNumber() / start.close.toNumber()) - 1) * 100;
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
