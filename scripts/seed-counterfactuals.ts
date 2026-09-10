import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { seedCounterfactualExperiment } from "../src/lib/counterfactuals/service";

const prisma = new PrismaClient();
const startDate = new Date("2025-03-31T00:00:00.000Z");
const endDate = new Date("2025-12-31T00:00:00.000Z");
const initialCapital = "1000000.00";

async function main() {
  const experiments = [
    await seedCounterfactualExperiment({
      client: prisma,
      name: "Momentum 10 Holding Rank Threshold",
      description: "Compare the Momentum 10 holding-rank exit threshold under identical simulated execution assumptions.",
      strategyName: "Momentum 10 - Price Only",
      startDate,
      endDate,
      initialCapital,
      variants: [
        { name: "CONTROL Top30", isControl: true, parameterOverrides: {} },
        { name: "Top20", parameterOverrides: { momentum: { holdingRankThreshold: 20 } } },
        { name: "Top40", parameterOverrides: { momentum: { holdingRankThreshold: 40 } } },
        { name: "Top50", parameterOverrides: { momentum: { holdingRankThreshold: 50 } } },
      ],
    }),
    await seedCounterfactualExperiment({
      client: prisma,
      name: "Early Superstars Phase 2 Rank",
      description: "Compare Early Superstars Phase 2 purchase-date return rank thresholds.",
      strategyName: "Early Superstars",
      startDate,
      endDate,
      initialCapital,
      variants: [
        { name: "CONTROL Top30", isControl: true, parameterOverrides: {} },
        { name: "Top20", parameterOverrides: { earlySuperstars: { phase2RankThreshold: 20 } } },
        { name: "Top40", parameterOverrides: { earlySuperstars: { phase2RankThreshold: 40 } } },
        { name: "Top50", parameterOverrides: { earlySuperstars: { phase2RankThreshold: 50 } } },
      ],
    }),
    await seedCounterfactualExperiment({
      client: prisma,
      name: "Early Superstars Emergency Stop",
      description: "Compare Early Superstars fixed acquisition-cost emergency stop thresholds.",
      strategyName: "Early Superstars",
      startDate,
      endDate,
      initialCapital,
      variants: [
        { name: "-10%", parameterOverrides: { earlySuperstars: { emergencyStopPercent: -10 } } },
        { name: "CONTROL -15%", isControl: true, parameterOverrides: {} },
        { name: "-20%", parameterOverrides: { earlySuperstars: { emergencyStopPercent: -20 } } },
        { name: "-25%", parameterOverrides: { earlySuperstars: { emergencyStopPercent: -25 } } },
      ],
    }),
  ];

  const [variantCount, runCount, tradeCount, episodeCount, equityCount] = await Promise.all([
    prisma.counterfactualVariant.count(),
    prisma.counterfactualRun.count(),
    prisma.counterfactualTrade.count(),
    prisma.counterfactualPositionEpisode.count(),
    prisma.counterfactualDailyEquity.count(),
  ]);

  console.log(`Seeded counterfactual experiments: ${experiments.length}`);
  console.log(`Counterfactual variants=${variantCount}, runs=${runCount}, trades=${tradeCount}, episodes=${episodeCount}, dailyEquity=${equityCount}`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
