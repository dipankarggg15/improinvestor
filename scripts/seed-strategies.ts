import "dotenv/config";

import { PrismaClient, type Prisma } from "@prisma/client";

import { earlySuperstars1WEntryConfig, earlySuperstars2WEntryConfig, momentum10V1Config } from "../src/lib/strategies/config";
import { assertStrategyVersionConfigEditable } from "../src/lib/strategies/versioning";

const prisma = new PrismaClient();

async function main() {
  await retireObsoleteMomentumStrategy();
  await seedStrategy({
    name: "Momentum 10 - Price Only",
    description:
      "Selects up to 10 high 3-month momentum stocks using price and volume data only, ranked by lower 1-month return first.",
    config: momentum10V1Config,
    label: "V1 Price Only",
    notes: "Momentum 10 V1 price-only strategy without fundamentals filters.",
  });
  await seedStrategy({
    name: "Early Superstars",
    description:
      "Finds stocks with strong 2-week momentum before 1-month and 3-month returns become overheated.",
    config: earlySuperstars2WEntryConfig,
    label: "V1-2W Entry",
    notes: "Early Superstars V1 2W-entry historical strategy.",
  });
  await seedStrategy({
    name: "Early Superstars - 1W Entry",
    description:
      "Finds stocks with strong 1-week momentum before 1-month and 3-month returns become overheated.",
    config: earlySuperstars1WEntryConfig,
    label: "V1-1W Entry",
    notes: "Early Superstars V1 1W-entry historical strategy.",
  });
}

async function retireObsoleteMomentumStrategy() {
  const [obsolete, oldMomentum10] = await Promise.all([
    prisma.strategy.findUnique({ where: { name: "Momentum" } }),
    prisma.strategy.findUnique({ where: { name: "Momentum 10" } }),
  ]);

  await Promise.all([obsolete, oldMomentum10].filter((strategy): strategy is NonNullable<typeof strategy> => Boolean(strategy)).map((strategy) =>
    prisma.strategy.update({
      where: { id: strategy.id },
      data: { status: "ARCHIVED" },
    }),
  ));
}

async function seedStrategy(input: {
  readonly name: string;
  readonly description: string;
  readonly config: unknown;
  readonly label?: string;
  readonly notes: string;
}) {
  const strategy = await prisma.strategy.upsert({
    where: { name: input.name },
    update: {
      description: input.description,
      status: "ACTIVE",
    },
    create: {
      name: input.name,
      description: input.description,
      status: "ACTIVE",
    },
  });
  const existingV1 = await prisma.strategyVersion.findUnique({
    where: {
      strategyId_versionNumber: {
        strategyId: strategy.id,
        versionNumber: 1,
      },
    },
    include: {
      runs: { take: 1 },
      historicalRuns: { take: 1 },
    },
  });

  if (!existingV1) {
    await prisma.strategyVersion.create({
      data: {
        strategyId: strategy.id,
        versionNumber: 1,
        label: input.label ?? "V1",
        effectiveFrom: new Date("2023-01-02T00:00:00.000Z"),
        notes: input.notes,
        config: input.config as Prisma.InputJsonValue,
      },
    });
    return;
  }

  if (existingV1.runs.length === 0 && existingV1.historicalRuns.length === 0) {
    assertStrategyVersionConfigEditable(existingV1.runs.length + existingV1.historicalRuns.length);
    await prisma.strategyVersion.update({
      where: {
        id: existingV1.id,
      },
      data: {
        label: input.label ?? "V1",
        notes: input.notes,
        config: input.config as Prisma.InputJsonValue,
      },
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
