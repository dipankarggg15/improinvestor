import { Prisma, type PrismaClient } from "@prisma/client";

import { counterfactualOverrideSchema, type CounterfactualOverrides } from "@/lib/counterfactuals/config";
import { timeAsync } from "@/lib/logging/timing";
import {
  counterfactualEngineVersion,
  simulateCounterfactual,
  type CounterfactualMarketData,
  type CounterfactualSimulationResult,
} from "@/lib/counterfactuals/simulator";

export async function createAndRunCounterfactualExperiment(input: {
  readonly client: PrismaClient;
  readonly name: string;
  readonly description: string;
  readonly baseStrategyId: string;
  readonly baseStrategyVersionId: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly initialCapital: string;
  readonly variants: readonly {
    readonly name: string;
    readonly isControl?: boolean;
    readonly parameterOverrides: CounterfactualOverrides;
  }[];
}) {
  const version = await input.client.strategyVersion.findUniqueOrThrow({
    where: { id: input.baseStrategyVersionId },
    include: { strategy: true },
  });
  if (version.strategyId !== input.baseStrategyId) {
    throw new Error("Base strategy version does not belong to the selected strategy.");
  }
  if (input.variants.filter((variant) => variant.isControl).length !== 1) {
    throw new Error("Exactly one control variant is required.");
  }
  if (input.variants.length > 20) {
    throw new Error("Counterfactual experiments are limited to 20 variants.");
  }

  const marketData = await loadCounterfactualMarketData(input.client, input.startDate, input.endDate);
  const simulated = input.variants.map((variant) => ({
    variant,
    result: simulateCounterfactual({
      strategyName: version.strategy.name,
      baseConfig: version.config,
      parameterOverrides: variant.parameterOverrides,
      startDate: input.startDate,
      endDate: input.endDate,
      initialCapital: input.initialCapital,
      marketData,
    }),
  }));

  return input.client.$transaction(async (tx) => {
    const experiment = await tx.counterfactualExperiment.create({
      data: {
        name: input.name,
        description: input.description,
        baseStrategyId: input.baseStrategyId,
        baseStrategyVersionId: input.baseStrategyVersionId,
        startDate: input.startDate,
        endDate: input.endDate,
        initialCapital: input.initialCapital,
        status: "COMPLETED",
      },
    });

    for (const item of simulated) {
      const variant = await tx.counterfactualVariant.create({
        data: {
          experimentId: experiment.id,
          name: item.variant.name,
          isControl: item.variant.isControl ?? false,
          parameterOverrides: item.variant.parameterOverrides as Prisma.InputJsonValue,
          effectiveConfig: item.result.effectiveConfig as unknown as Prisma.InputJsonValue,
        },
      });
      await persistCounterfactualRun(tx, experiment.id, variant.id, item.result);
    }

    return tx.counterfactualExperiment.findUniqueOrThrow({
      where: { id: experiment.id },
      include: { variants: { include: { runs: true } } },
    });
  }, { timeout: 90_000 });
}

export async function seedCounterfactualExperiment(input: {
  readonly client: PrismaClient;
  readonly name: string;
  readonly description: string;
  readonly strategyName: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly initialCapital: string;
  readonly variants: readonly {
    readonly name: string;
    readonly isControl?: boolean;
    readonly parameterOverrides: CounterfactualOverrides;
  }[];
}) {
  const strategy = await input.client.strategy.findUniqueOrThrow({
    where: { name: input.strategyName },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });
  const version = strategy.versions[0];
  if (!version) throw new Error(`No strategy version exists for ${input.strategyName}.`);
  await input.client.counterfactualExperiment.deleteMany({
    where: { name: input.name, baseStrategyId: strategy.id },
  });
  return createAndRunCounterfactualExperiment({
    client: input.client,
    name: input.name,
    description: input.description,
    baseStrategyId: strategy.id,
    baseStrategyVersionId: version.id,
    startDate: input.startDate,
    endDate: input.endDate,
    initialCapital: input.initialCapital,
    variants: input.variants,
  });
}

export async function listCounterfactualExperiments(client: PrismaClient) {
  return timeAsync("counterfactuals.listExperiments", () => client.counterfactualExperiment.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      initialCapital: true,
      status: true,
      baseStrategy: { select: { name: true } },
      baseStrategyVersion: { select: { versionNumber: true } },
      variants: { select: { id: true }, orderBy: { createdAt: "asc" } },
    },
  }), 1_000);
}

export async function getCounterfactualExperimentOverview(client: PrismaClient, id: string) {
  return timeAsync("counterfactuals.getExperimentOverview", () => client.counterfactualExperiment.findUnique({
    where: { id },
    include: {
      baseStrategy: true,
      baseStrategyVersion: true,
      variants: {
        orderBy: [{ isControl: "desc" }, { createdAt: "asc" }],
        include: {
          runs: {
            select: {
              id: true,
              metrics: true,
              dailyEquity: { orderBy: { date: "asc" } },
              decisions: {
                take: 300,
                include: { company: true, instrument: true },
                orderBy: [{ decisionDate: "asc" }, { createdAt: "asc" }],
              },
            },
          },
        },
      },
    },
  }), 1_000);
}

export async function getCounterfactualVariantDetail(client: PrismaClient, experimentId: string, variantId: string) {
  return timeAsync("counterfactuals.getVariantDetail", async () => {
  const experiment = await client.counterfactualExperiment.findUnique({
    where: { id: experimentId },
    include: {
      baseStrategy: true,
      baseStrategyVersion: true,
      variants: {
        where: { id: variantId },
        include: {
          runs: {
            include: {
              trades: { include: { company: true, instrument: true }, orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }] },
              positionEpisodes: { include: { company: true, instrument: true }, orderBy: [{ openedAt: "asc" }] },
            },
          },
        },
      },
    },
  });
  const variant = experiment?.variants[0] ?? null;
  return experiment && variant ? { experiment, variant, run: variant.runs[0] ?? null } : null;
  }, 1_000);
}

export async function getCounterfactualExperiment(client: PrismaClient, id: string) {
  return client.counterfactualExperiment.findUnique({
    where: { id },
    include: {
      baseStrategy: true,
      baseStrategyVersion: true,
      variants: {
        orderBy: [{ isControl: "desc" }, { createdAt: "asc" }],
        include: {
          runs: {
            include: {
              trades: { include: { company: true, instrument: true }, orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }] },
              positionEpisodes: { include: { company: true, instrument: true }, orderBy: [{ openedAt: "asc" }] },
              dailyEquity: { orderBy: { date: "asc" } },
              decisions: { include: { company: true, instrument: true }, orderBy: [{ decisionDate: "asc" }, { createdAt: "asc" }] },
            },
          },
        },
      },
    },
  });
}

export async function loadCounterfactualMarketData(client: PrismaClient, startDate: Date, endDate: Date): Promise<CounterfactualMarketData> {
  const companies = await client.company.findMany({
    select: {
      id: true,
      name: true,
      isin: true,
      instruments: {
        where: { active: true },
        select: { id: true, exchange: true, symbol: true },
      },
    },
  });
  const candidates = companies.flatMap((company) => {
    const instrument = company.instruments.find((item) => item.exchange === "NSE") ?? company.instruments.find((item) => item.exchange === "BSE");
    return instrument ? [{
      companyId: company.id,
      companyName: company.name,
      isin: company.isin,
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      exchange: instrument.exchange,
    }] : [];
  });
  const earliest = new Date(startDate);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - 1);
  const [prices, fundamentals] = await Promise.all([
    client.dailyPrice.findMany({
      where: {
        instrumentId: { in: candidates.map((candidate) => candidate.instrumentId) },
        tradingDate: { gte: earliest, lte: endDate },
      },
      orderBy: [{ instrumentId: "asc" }, { tradingDate: "asc" }],
      select: { instrumentId: true, tradingDate: true, open: true, low: true, close: true, volume: true },
    }),
    client.companyFundamentals.findMany({
      where: {
        companyId: { in: candidates.map((candidate) => candidate.companyId) },
        asOfDate: { lte: endDate },
      },
      orderBy: [{ companyId: "asc" }, { asOfDate: "asc" }],
      select: { companyId: true, asOfDate: true, marketCap: true, debtToEquity: true },
    }),
  ]);
  return {
    candidates,
    prices: prices.map((price) => ({
      instrumentId: price.instrumentId,
      tradingDate: price.tradingDate,
      open: price.open.toNumber(),
      low: price.low.toNumber(),
      close: price.close.toNumber(),
      volume: Number(price.volume),
    })),
    fundamentals: fundamentals.map((fundamental) => ({
      companyId: fundamental.companyId,
      asOfDate: fundamental.asOfDate,
      marketCap: fundamental.marketCap?.toNumber() ?? null,
      debtToEquity: fundamental.debtToEquity?.toNumber() ?? null,
    })),
  };
}

async function persistCounterfactualRun(
  tx: Prisma.TransactionClient,
  experimentId: string,
  variantId: string,
  result: CounterfactualSimulationResult,
) {
  const run = await tx.counterfactualRun.create({
    data: {
      experimentId,
      variantId,
      status: "COMPLETED",
      completedAt: new Date(),
      engineVersion: counterfactualEngineVersion,
      assumptions: result.assumptions,
      metrics: result.metrics,
    },
  });
  const episodeIds = new Map<string, string>();
  for (const episode of result.episodes) {
    const created = await tx.counterfactualPositionEpisode.create({
      data: {
        runId: run.id,
        companyId: episode.companyId,
        instrumentId: episode.instrumentId,
        openedAt: episode.openedAt,
        closedAt: episode.closedAt,
        status: episode.status,
        quantityPurchased: episode.quantityPurchased,
        quantitySold: episode.quantitySold,
        averageCost: episode.averageCost,
        realizedPnl: episode.realizedPnl,
        realizedReturnPercent: episode.realizedReturnPercent,
        entryRank: episode.entryRank,
        exitReason: episode.exitReason,
        entrySnapshot: episode.entrySnapshot,
        exitSnapshot: episode.exitSnapshot ?? Prisma.JsonNull,
      },
    });
    episodeIds.set(episode.clientId, created.id);
  }
  await tx.counterfactualTrade.createMany({
    data: result.trades.map((trade) => ({
      runId: run.id,
      episodeId: episodeIds.get(trade.episodeClientId) ?? null,
      companyId: trade.companyId,
      instrumentId: trade.instrumentId,
      side: trade.side,
      tradeDate: trade.tradeDate,
      quantity: trade.quantity,
      price: trade.price,
      fees: trade.fees,
      grossValue: trade.grossValue,
      decisionSource: trade.decisionSource,
      decisionReason: trade.decisionReason,
      decisionSnapshot: trade.decisionSnapshot,
    })),
  });
  await tx.counterfactualDailyEquity.createMany({
    data: result.equityCurve.map((point) => ({
      runId: run.id,
      date: point.date,
      cash: point.cash,
      investedValue: point.investedValue,
      totalEquity: point.totalEquity,
      cumulativeReturnPercent: point.cumulativeReturnPercent,
      investedPercent: point.investedPercent,
      cashPercent: point.cashPercent,
      openPositionCount: point.openPositionCount,
      drawdownPercent: point.drawdownPercent,
    })),
  });
  await tx.counterfactualDecisionSnapshot.createMany({
    data: result.decisions.map((decision) => ({
      runId: run.id,
      decisionDate: decision.decisionDate,
      companyId: decision.companyId,
      instrumentId: decision.instrumentId,
      action: decision.action,
      reason: decision.reason,
      rank: decision.rank,
      metric: decision.metric,
      metricValue: decision.metricValue,
      threshold: decision.threshold,
      comparisonUniverseSize: decision.comparisonUniverseSize,
      sourceDates: decision.sourceDates,
      metadata: decision.metadata,
    })),
  });
  return run;
}

export function validateCounterfactualOverrides(value: unknown) {
  return counterfactualOverrideSchema.parse(value);
}
