import "dotenv/config";

import { PrismaClient, type Prisma } from "@prisma/client";

import {
  nseParentMomentumSurvivorsV1Config,
  nseParentMomentumSurvivorsV2Config,
  nseParentMomentumSurvivorsV3Config,
  nseMomentumStrengthV2Config,
  nseMomentumLossProtectionV1Config,
  nseMomentumLossProtectionV2Config,
  nseMomentumLossProtectionV3Config,
  nseMomentumLossProtectionV4Config,
  nseMomentumLossProtectionV5Config,
  nseMomentumLossProtectionV6Config,
  nseMomentumLossProtectionV7Config,
  nseMomentumSixTwelveV3Config,
  nseMomentumSixTwelveV4Config,
  nseMomentumTwoPhaseV1Config,
  nseMomentumTwoPhaseV2Config,
  nseMomentumTwoPhaseV3Config,
  nseMomentumV1Config,
  nseMomentumWinnersV1Config,
  nseMomentumWinnersV7Config,
  nseMomentumWinnersV8Config,
  nseMomentumWinnersV9Config,
  nseMomentumWinnersV10Config,
  nseMomentumWinnersV11Config,
} from "../src/lib/strategies/config";
import { assertStrategyVersionConfigEditable } from "../src/lib/strategies/versioning";
import { nseMomentumVersionMetadata } from "../src/lib/strategies/version-presentation";

const prisma = new PrismaClient();

async function main() {
  if (process.argv.includes("--nse-momentum-labels-only")) {
    await syncNseMomentumVersionMetadata();
    return;
  }
  if (process.argv.includes("--nse-momentum-two-phase-only")) {
    await seedNseMomentumTwoPhase();
    return;
  }
  if (process.argv.includes("--nse-momentum-loss-protection-only")) {
    await seedNseMomentumLossProtection();
    return;
  }
  if (process.argv.includes("--six-twelve-ine-universe-only")) {
    await seedSixTwelveIneUniverseVersions();
    await syncNseMomentumVersionMetadata();
    return;
  }
  if (process.argv.includes("--nse-momentum-winners-v10-only")) {
    await seedNseMomentumWinnersV10();
    return;
  }
  if (process.argv.includes("--nse-momentum-winners-v9-only")) {
    await seedNseMomentumWinnersV9();
    return;
  }
  if (process.argv.includes("--nse-momentum-winners-v8-only")) {
    await seedNseMomentumWinnersV8();
    return;
  }
  if (process.argv.includes("--nse-momentum-winners-v7-only")) {
    await seedNseMomentumWinnersV7();
    return;
  }
  if (process.argv.includes("--nse-momentum-v3-only")) {
    await seedNseMomentumV3();
    await syncNseMomentumVersionMetadata();
    return;
  }
  if (process.argv.includes("--survivors-only")) {
    await seedParentSurvivors();
    return;
  }
  await seedParentSurvivors();
  await retireObsoleteMomentumStrategy();
  await seedStrategy({
    name: "NSE Momentum",
    description:
      "Ranks NSE stocks by volatility-adjusted 1-month and 3-month momentum z-scores, buys the Top 20, and keeps monthly holdings that remain inside the Top 50.",
    config: nseMomentumV1Config,
    label: nseMomentumVersionMetadata[1].label,
    notes: nseMomentumVersionMetadata[1].notes,
  });
  await seedStrategyVersion({
    strategyName: "NSE Momentum",
    versionNumber: 2,
    config: nseMomentumStrengthV2Config,
    label: nseMomentumVersionMetadata[2].label,
    notes: nseMomentumVersionMetadata[2].notes,
  });
  await seedNseMomentumV3();
  await seedNseMomentumV4();
  await syncNseMomentumVersionMetadata();
  await seedNseMomentumLossProtection();
  await seedNseMomentumTwoPhase();
  await seedStrategy({
    name: "NSE Momentum Winners",
    description:
      "NSE Momentum variant that reinvests 100% of monthly exit proceeds into held winners that remain inside the Top 50 and are up at least 50%.",
    config: nseMomentumWinnersV1Config,
    label: "V1 NSE Momentum Winners",
    notes: "NSE Momentum Winners V1 uses original NSE Momentum ranking and allocates 100% of monthly exit proceeds to qualified held winners before replacements.",
  });
  await seedNseMomentumWinnersV7();
  await seedNseMomentumWinnersV8();
  await seedNseMomentumWinnersV9();
  await seedNseMomentumWinnersV10();
  await seedNseMomentumWinnersV11();
}

async function seedNseMomentumTwoPhase() {
  await seedStrategy({
    name: "NSE Momentum Two-Phase Allocation",
    description: "Latest NSE Momentum Top 25 / hold Top 50 strategy with total capital deployed through two equal time-separated tranches.",
    config: nseMomentumTwoPhaseV1Config,
    label: "V1 50% Now / 50% After One Year",
    notes: "Copies the latest NSE Momentum 6M/12M volatility-adjusted ranking, Top 25 entry, Top 50 retention, monthly review, INE ordinary-equity universe, 5% new-position cap, cash redeployment, and upper-circuit protection rules. The first independent sleeve receives 50% of total capital on the initial trading date. The remaining 50% stays in cash and starts a second independent sleeve exactly 12 months after the first sleeve's actual entry date, using the next available NSE trading day. Combined CAGR is measured from the first deployment against the full original capital.",
  });
  await seedStrategyVersion({
    strategyName: "NSE Momentum Two-Phase Allocation",
    versionNumber: 2,
    config: nseMomentumTwoPhaseV2Config,
    label: "V2 50% Now / 50% After Six Months",
    notes: "Identical to V1 except the second independent 50% sleeve starts exactly six months after the first sleeve's actual entry date, using the next available NSE trading day. The 6M/12M volatility-adjusted ranking, Top 25 entry, Top 50 retention, monthly review, INE ordinary-equity universe, 5% new-position cap, cash redeployment, and upper-circuit protection rules are unchanged.",
  });
  await seedStrategyVersion({
    strategyName: "NSE Momentum Two-Phase Allocation",
    versionNumber: 3,
    config: nseMomentumTwoPhaseV3Config,
    label: "V3 1M + 3M Volatility Z-Score / Six-Month Tranches",
    notes: "Identical to V2 except both independent sleeves rank eligible NSE INE ordinary equities by the average of volatility-adjusted 1M and 3M cross-sectional z-scores. The 50% immediate and 50% after six months deployment, Top 25 entry, Top 50 retention, monthly review, 5% new-position cap, cash redeployment, and upper-circuit protection rules are unchanged.",
  });
}

async function seedNseMomentumLossProtection() {
  await seedStrategy({
    name: "NSE Momentum Loss Protection",
    description: "NSE Momentum 6M/12M Top 25 strategy with selectable portfolio drawdown protection or a 200-day NSE market-breadth regime.",
    config: nseMomentumLossProtectionV1Config,
    label: "V1 20% Peak Drawdown / Next January",
    notes: "Uses the latest NSE Momentum INE ordinary-equity, 6M/12M volatility-adjusted ranking, Top 25 entry, Top 50 retention, monthly review, 5% new-position cap, cash redeployment, and upper-circuit protection rules. When closing portfolio value falls 20% from its highest close since entry or re-entry, sell all holdings and stay in cash until the first NSE trading day on or after January 1 of the following year.",
  });
  await seedStrategyVersion({
    strategyName: "NSE Momentum Loss Protection",
    versionNumber: 2,
    config: nseMomentumLossProtectionV2Config,
    label: "V2 20% Peak Drawdown / 3-Month Cooldown",
    notes: "Identical to V1 except re-entry occurs on the first NSE trading day after a three-month cash cooldown. The protection peak resets after re-entry.",
  });
  await seedStrategyVersion({
    strategyName: "NSE Momentum Loss Protection",
    versionNumber: 3,
    config: nseMomentumLossProtectionV3Config,
    label: "V3 20% Peak Drawdown / 200-Day Recovery",
    notes: "Identical to V1 except the strategy waits at least one month, then re-enters when at least 50% of eligible NSE INE ordinary equities close at or above their own 200-session moving averages. This market-breadth signal avoids relying on an incomplete local NIFTY index history. The protection peak resets after re-entry.",
  });
  await seedStrategyVersion({
    strategyName: "NSE Momentum Loss Protection",
    versionNumber: 4,
    config: nseMomentumLossProtectionV4Config,
    label: "V4 50% NSE Breadth / 200-Day Market Regime",
    notes: "Uses the same NSE Momentum Top 25 entry, Top 50 retention, monthly review, INE ordinary-equity universe, 5% new-position cap, cash redeployment, and upper-circuit protection rules. There is no peak-drawdown trigger. Hold the portfolio only while at least 50% of eligible NSE ordinary equities close at or above their own 200-session moving averages; otherwise sell all, remain in cash, and re-enter the current Top 25 as soon as breadth returns to 50% or higher.",
  });
  await seedStrategyVersion({
    strategyName: "NSE Momentum Loss Protection",
    versionNumber: 5,
    config: nseMomentumLossProtectionV5Config,
    label: "V5 20% Peak Drawdown / 50% Defensive Sale / 200-Day Recovery",
    notes: "Uses the same NSE Momentum Top 25 entry, Top 50 retention, monthly review, INE ordinary-equity universe, 5% new-position cap, cash redeployment, and upper-circuit protection rules. At a 20% decline from the portfolio peak, sell 50% of every holding proportionally and keep those proceeds in cash while the remaining half stays invested. After at least one month, redeploy the reserved proceeds into the retained holdings when at least 50% of eligible NSE ordinary equities are at or above their own 200-session moving averages. Upper-circuit-blocked restoration buys are retried on later eligible trading days.",
  });
  await seedStrategyVersion({
    strategyName: "NSE Momentum Loss Protection",
    versionNumber: 6,
    config: nseMomentumLossProtectionV6Config,
    label: "V6 One-Time 25% Initial Loss / 5-Day 200-Day Recovery",
    notes: "Invests 100% immediately using the latest NSE Momentum rules. If total portfolio equity falls 25% below original starting capital, liquidate all holdings once and remain in cash. Re-enter the current Top 25 with all remaining capital only after at least 50% of eligible NSE INE ordinary equities close at or above their own 200-session moving averages for five consecutive trading sessions. After that re-entry, permanently disable loss protection and continue normal NSE Momentum rules.",
  });
  await seedStrategyVersion({
    strategyName: "NSE Momentum Loss Protection",
    versionNumber: 7,
    config: nseMomentumLossProtectionV7Config,
    label: "V7 One-Time 25% Initial Loss / 6-Month Cash / 5-Day 200-Day Recovery",
    notes: "Identical to V6 except a triggered portfolio must remain fully in cash for at least six calendar months from the one-time liquidation date. After that hard cooldown, re-enter the current Top 25 with all remaining capital only when at least 50% of eligible NSE INE ordinary equities close at or above their own 200-session moving averages for five consecutive trading sessions. Protection remains permanently disabled after re-entry.",
  });
}

async function seedNseMomentumV3() {
  await prisma.$transaction(async (tx) => {
    const strategy = await tx.strategy.findUniqueOrThrow({
      where: { name: "NSE Momentum" },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
    });
    const config = JSON.parse(JSON.stringify(nseMomentumSixTwelveV3Config));
    const existing = strategy.versions.find((version) => version.versionNumber === 3);
    if (existing) {
      const { isDeepStrictEqual } = await import("node:util");
      if (!isDeepStrictEqual(existing.config, config)) throw new Error("NSE Momentum V3 already exists with a different config; refusing to overwrite it.");
      console.log("NSE Momentum V3 already exists; unchanged.");
      return;
    }
    if (strategy.versions[0]?.versionNumber !== 2) throw new Error("Expected NSE Momentum V2 as the current version.");
    const version = await tx.strategyVersion.create({
      data: {
        strategyId: strategy.id,
        versionNumber: 3,
        label: nseMomentumVersionMetadata[3].label,
        effectiveFrom: new Date("2023-01-02T00:00:00.000Z"),
        config,
        notes: nseMomentumVersionMetadata[3].notes,
      },
    });
    console.log(`Created NSE Momentum V${version.versionNumber}: ${version.id}`);
  });
}

async function seedNseMomentumV4() {
  await seedStrategyVersion({
    strategyName: "NSE Momentum",
    versionNumber: 4,
    config: nseMomentumSixTwelveV4Config,
    label: nseMomentumVersionMetadata[4].label,
    notes: nseMomentumVersionMetadata[4].notes,
  });
}

async function syncNseMomentumVersionMetadata() {
  const strategy = await prisma.strategy.findUnique({
    where: { name: "NSE Momentum" },
    select: { id: true },
  });
  if (!strategy) throw new Error("NSE Momentum must be seeded before its version metadata can be synchronized.");

  for (const [versionNumberText, metadata] of Object.entries(nseMomentumVersionMetadata)) {
    const versionNumber = Number(versionNumberText);
    const result = await prisma.strategyVersion.updateMany({
      where: { strategyId: strategy.id, versionNumber },
      data: { label: metadata.label, notes: metadata.notes },
    });
    if (result.count > 0) console.log(`Updated NSE Momentum V${versionNumber} metadata: ${metadata.label}`);
  }
}

async function seedNseMomentumWinnersV7() {
  await prisma.$transaction(async (tx) => {
    const strategy = await tx.strategy.findUniqueOrThrow({
      where: { name: "NSE Momentum Winners" },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
    });
    const config = JSON.parse(JSON.stringify(nseMomentumWinnersV7Config));
    const { isDeepStrictEqual } = await import("node:util");
    const existing = strategy.versions.find((version) => version.versionNumber === 7);
    if (existing) {
      if (!isDeepStrictEqual(existing.config, config)) throw new Error("NSE Momentum Winners V7 differs; refusing to overwrite it.");
      console.log("NSE Momentum Winners V7 already exists; unchanged.");
      return;
    }
    const latest = strategy.versions[0];
    if (!latest || ![1, 6].includes(latest.versionNumber)) throw new Error("Expected NSE Momentum Winners V6 or the freshly seeded base version.");
    const saved = latest.config as { nseMomentum?: { winnerReinvestment?: unknown } };
    if (!isDeepStrictEqual(saved.nseMomentum?.winnerReinvestment, config.nseMomentum.winnerReinvestment)) {
      throw new Error("Saved winner allocation differs; refusing to change the existing winner rule.");
    }
    const version = await tx.strategyVersion.create({
      data: {
        strategyId: strategy.id,
        versionNumber: 7,
        label: "V7 6M + 12M Top 25 / Hold Top 50 Winners",
        effectiveFrom: latest.effectiveFrom,
        config,
        notes: "NSE Momentum V3 rules plus the unchanged Winners V6 allocation: both entry and monthly review rank by 50% z6M + 50% z12M, maximum 25 holdings, new entries rank <=25, retain rank <=50. Allocate 100% of exit proceeds equally to retained winners up >=50% from weighted-average cost, with no top-up weight cap. If no winners qualify, proceeds fund replacements. Residual available cash can fund Top 25 replacements, capped at 5% per new position. Same execution and upper-circuit handling; no 1M/3M strength filters. Earlier versions unchanged.",
      },
    });
    console.log(`Created NSE Momentum Winners V7: ${version.id}`);
  });
}

async function seedNseMomentumWinnersV8() {
  await seedStrategyVersion({
    strategyName: "NSE Momentum Winners",
    versionNumber: 8,
    config: nseMomentumWinnersV8Config,
    label: "V8 6M + 12M Top 25 / Hold Top 50 Winners 50/50",
    notes: "Identical to V7 except 50% of monthly exit proceeds funds qualifying winner top-ups and the remaining 50% funds Top 25 replacement stocks. Winner qualification remains gain >=50% and rank <=50. If no winners qualify, all exit proceeds are available for replacements. Residual cash handling, 5% cap on new positions, uncapped winner top-ups, 6M/12M ranking, monthly reviews, maximum 25 holdings, and execution rules are unchanged. V7 is preserved because it already has a saved backtest.",
  });
}

async function seedNseMomentumWinnersV9() {
  await seedStrategyVersion({
    strategyName: "NSE Momentum Winners",
    versionNumber: 9,
    config: nseMomentumWinnersV9Config,
    label: "V9 6M + 12M Top 25 / Hold Top 50 Winners 30/70",
    notes: "Identical to V8 except 30% of monthly exit proceeds funds qualifying winner top-ups and the remaining 70% funds Top 25 replacement stocks. Winner qualification remains gain >=50% and rank <=50. If no winners qualify, all exit proceeds are available for replacements. Residual cash handling, 5% cap on new positions, uncapped winner top-ups, 6M/12M ranking, monthly reviews, maximum 25 holdings, and execution rules are unchanged. V8 and its saved backtests are preserved.",
  });
}

async function seedNseMomentumWinnersV10() {
  await seedStrategyVersion({
    strategyName: "NSE Momentum Winners",
    versionNumber: 10,
    config: nseMomentumWinnersV10Config,
    label: "V10 6M + 12M Top 25 / Hold Top 50 Winners 20/80",
    notes: "Identical to V9 except 20% of monthly exit proceeds funds qualifying winner top-ups and the remaining 80% funds Top 25 replacement stocks. Winner qualification remains gain >=50% and rank <=50. If no winners qualify, all exit proceeds are available for replacements. Residual cash handling, 5% cap on new positions, uncapped winner top-ups, 6M/12M ranking, monthly reviews, maximum 25 holdings, and execution rules are unchanged. V9 and its saved backtests are preserved.",
  });
}

async function seedNseMomentumWinnersV11() {
  await seedStrategyVersion({
    strategyName: "NSE Momentum Winners",
    versionNumber: 11,
    config: nseMomentumWinnersV11Config,
    label: "V11 6M + 12M Winners 20/80 - INE Equities",
    notes: "Identical to V10 except the backtest universe is restricted to active NSE instruments whose keys begin NSE_EQ|INE, with identifiable non-ordinary-equity names excluded. The 6M/12M z-score ranking, Top 25 entry, Top 50 retention, monthly review, winner qualification, 20/80 allocation, and execution rules are unchanged. Earlier versions and saved runs remain reproducible.",
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

async function seedParentSurvivors() {
  await seedStrategy({
    name: "NSE Parent Momentum Top 25 Monthly Rebalance",
    description: "Monthly Top 25 survivor rebalancing across eligible NSE INE ordinary equities, with selectable 1M/3M, 3M/6M, or 6M/12M volatility-adjusted momentum and likely upper-circuit buy protection.",
    config: nseParentMomentumSurvivorsV1Config,
    label: "V1 1M + 3M Monthly Rebalance",
    notes: "Ranks NSE INE ordinary equities by 1M/3M volatility-adjusted momentum. Reviews monthly, retains existing Top 25 holdings unchanged, sells departures, splits available cash among new entrants, and skips likely upper-circuit buys.",
  });
  await seedStrategyVersion({
    strategyName: "NSE Parent Momentum Top 25 Monthly Rebalance",
    versionNumber: 2,
    config: nseParentMomentumSurvivorsV2Config,
    label: "V2 3M + 6M Monthly Rebalance",
    notes: "Identical to V1 except momentum uses 3M/6M volatility-adjusted returns. INE ordinary-equity protection, monthly Top 25 survivor handling, and likely upper-circuit buy skipping remain enabled.",
  });
  await seedStrategyVersion({
    strategyName: "NSE Parent Momentum Top 25 Monthly Rebalance",
    versionNumber: 3,
    config: nseParentMomentumSurvivorsV3Config,
    label: "V3 6M + 12M Monthly Rebalance",
    notes: "Identical to V2 except momentum uses 6M/12M volatility-adjusted returns. INE ordinary-equity protection, monthly Top 25 survivor handling, and likely upper-circuit buy skipping remain enabled.",
  });
}

async function seedSixTwelveIneUniverseVersions() {
  await seedNseMomentumV4();
  await seedNseMomentumWinnersV11();
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

async function seedStrategyVersion(input: {
  readonly strategyName: string;
  readonly versionNumber: number;
  readonly config: unknown;
  readonly label: string;
  readonly notes: string;
}) {
  const strategy = await prisma.strategy.findUnique({
    where: { name: input.strategyName },
    select: { id: true },
  });
  if (!strategy) throw new Error(`Strategy ${input.strategyName} must be seeded before version ${input.versionNumber}.`);

  const existing = await prisma.strategyVersion.findUnique({
    where: {
      strategyId_versionNumber: {
        strategyId: strategy.id,
        versionNumber: input.versionNumber,
      },
    },
    include: {
      runs: { take: 1 },
      historicalRuns: { take: 1 },
    },
  });

  if (!existing) {
    await prisma.strategyVersion.create({
      data: {
        strategyId: strategy.id,
        versionNumber: input.versionNumber,
        label: input.label,
        effectiveFrom: new Date("2023-01-02T00:00:00.000Z"),
        notes: input.notes,
        config: input.config as Prisma.InputJsonValue,
      },
    });
    return;
  }

  if (existing.runs.length === 0 && existing.historicalRuns.length === 0) {
    assertStrategyVersionConfigEditable(existing.runs.length + existing.historicalRuns.length);
    await prisma.strategyVersion.update({
      where: { id: existing.id },
      data: {
        label: input.label,
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
