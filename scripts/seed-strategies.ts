import "dotenv/config";

import { PrismaClient, type Prisma } from "@prisma/client";

import { earlySuperstarsV1Config, momentum10V1Config } from "../src/lib/strategies/config";
import { assertStrategyVersionConfigEditable } from "../src/lib/strategies/versioning";

const prisma = new PrismaClient();

async function main() {
  await seedStrategy({
    name: "Momentum 10",
    description:
      "Selects up to 10 high 3-month momentum stocks, ranked by lower 1-month return first.",
    config: momentum10V1Config,
    notes: "Initial Momentum 10 V1 synthetic-market strategy.",
  });
  await seedStrategy({
    name: "Early Superstars",
    description:
      "Finds stocks with strong 1-week momentum before 1-month and 3-month returns become overheated.",
    config: earlySuperstarsV1Config,
    notes: "Initial Early Superstars V1 synthetic-market strategy.",
  });
}

async function seedStrategy(input: {
  readonly name: string;
  readonly description: string;
  readonly config: unknown;
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
      runs: {
        take: 1,
      },
    },
  });

  if (!existingV1) {
    await prisma.strategyVersion.create({
      data: {
        strategyId: strategy.id,
        versionNumber: 1,
        label: "V1",
        effectiveFrom: new Date("2023-01-02T00:00:00.000Z"),
        notes: input.notes,
        config: input.config as Prisma.InputJsonValue,
      },
    });
    return;
  }

  if (existingV1.runs.length === 0) {
    assertStrategyVersionConfigEditable(existingV1.runs.length);
    await prisma.strategyVersion.update({
      where: {
        id: existingV1.id,
      },
      data: {
        label: "V1",
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
