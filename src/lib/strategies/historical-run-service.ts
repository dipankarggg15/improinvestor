import { Prisma, type PrismaClient } from "@prisma/client";
import { strategyConfigSchema } from "@/lib/strategies/config";
import { buildHistoricalRunReport, parseHistoricalRunReport } from "@/lib/strategies/historical-report";
import {
  isEligibleNseOrdinaryEquityInstrument,
  NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX,
} from "@/lib/strategies/nse-universe";

import {
  earlySuperstarsHistoricalRules,
  momentum10HistoricalRules,
  nseMomentumHistoricalRules,
  parentNseMomentumHistoricalRules,
  simulateMomentum10Historical,
  simulateNseMomentumHistorical,
  simulateParentNseMomentumHistorical,
  simulateEarlySuperstarsHistorical,
  type EarlySuperstarsRules,
  type HistoricalRunnerCandidate,
  type HistoricalRunnerPrice,
  type HistoricalStrategyRunResult,
} from "@/lib/strategies/historical-runner";

const realSource = "UPSTOX_REAL";
const priceLoadBatchSize = 500;
const priceLoadConcurrency = 1;
const maxPriceLoadAttempts = 3;

export async function runEarlySuperstarsHistorical(input: {
  readonly strategyId: string;
  readonly strategyVersionId?: string;
  readonly requestedStartDate: Date;
  readonly requestedEndDate: Date;
  readonly client: PrismaClient;
}) {
  const run = await createEarlySuperstarsHistoricalRun(input);
  return completeEarlySuperstarsHistoricalRun({ client: input.client, runId: run.id });
}

export async function createEarlySuperstarsHistoricalRun(input: {
  readonly strategyId: string;
  readonly strategyVersionId?: string;
  readonly requestedStartDate: Date;
  readonly requestedEndDate: Date;
  readonly client: PrismaClient;
}) {
  const { strategy, version } = await loadRunnableHistoricalStrategy(
    input.client,
    input.strategyId,
    input.strategyVersionId,
  );

  if (input.requestedEndDate <= input.requestedStartDate) {
    throw new Error("End Date must be after Start Date.");
  }

  return input.client.historicalStrategyRun.create({
    data: {
      strategyId: strategy.id,
      strategyVersionId: version.id,
      status: "RUNNING",
      requestedStartDate: input.requestedStartDate,
      requestedEndDate: input.requestedEndDate,
      initialCapital: decimal(initialCapitalForStrategy(strategy.name, version.config), 2),
      unavailableFilters: [],
      limitations: [],
      assumptions: [],
    },
  });
}

export async function completeEarlySuperstarsHistoricalRun(input: {
  readonly client: PrismaClient;
  readonly runId: string;
}) {
  const run = await input.client.historicalStrategyRun.findUnique({
    where: { id: input.runId },
    include: { strategy: true, strategyVersion: true },
  });

  if (!run) throw new Error("Historical strategy run not found.");
  if (run.status === "COMPLETED") return run;

  try {
    const isParentNseMomentum = isParentNseMomentumHistoricalStrategy(run.strategy.name, run.strategyVersion.config);
    const isNseMomentum = isNseMomentumHistoricalStrategy(run.strategy.name);
    const usesCorrectedNseUniverse = usesNseIneOrdinaryEquityUniverse(run.strategyVersion.config);
    const candidates = usesCorrectedNseUniverse
      ? await loadRealNseIneOrdinaryEquityCandidates(input.client)
      : isParentNseMomentum
      ? await loadRealNseOrdinaryEquityCandidates(input.client)
      : isNseMomentum
      ? await loadRealNseCandidates(input.client)
      : await loadRealCanonicalCandidates(input.client);
    const rules = isMomentum10HistoricalStrategy(run.strategy.name)
      ? null
      : isNseMomentum
        ? null
      : rulesForEarlySuperstarsVariant(run.strategy.name, run.strategyVersion.config);
    const earliestLoadDate = isParentNseMomentum
      ? addUtcMonths(run.requestedStartDate, -13)
      : rules
      ? addUtcDays(addUtcMonths(run.requestedStartDate, -3), -rules.entryMomentumDays)
      : isNseMomentum
        ? addUtcMonths(run.requestedStartDate, -13)
        : addUtcMonths(run.requestedStartDate, -3);
    const prices = await loadRealPrices(
      input.client,
      earliestLoadDate,
      run.requestedEndDate,
      candidates.map((candidate) => candidate.instrumentId),
    );

    const result = isParentNseMomentum
      ? simulateParentNseMomentumHistorical({
          requestedStartDate: run.requestedStartDate,
          requestedEndDate: run.requestedEndDate,
          candidates,
          prices,
          rules: rulesForParentNseMomentumVariant(run.strategyVersion.config),
        })
      : isNseMomentum
      ? simulateNseMomentumHistorical({
          requestedStartDate: run.requestedStartDate,
          requestedEndDate: run.requestedEndDate,
          candidates,
          prices,
          rules: rulesForNseMomentumVariant(run.strategy.name, run.strategyVersion.config),
        })
      : isMomentum10HistoricalStrategy(run.strategy.name)
      ? simulateMomentum10Historical({
          requestedStartDate: run.requestedStartDate,
          requestedEndDate: run.requestedEndDate,
          candidates,
          prices,
        })
      : simulateEarlySuperstarsHistorical({
          requestedStartDate: run.requestedStartDate,
          requestedEndDate: run.requestedEndDate,
          candidates,
          prices,
          rules: rules ?? undefined,
        });

    return persistHistoricalRun(input.client, {
      runId: run.id,
      result,
    });
  } catch (error) {
    await input.client.historicalStrategyRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown historical run failure.",
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

async function loadRunnableHistoricalStrategy(
  client: PrismaClient,
  strategyId: string,
  strategyVersionId?: string,
) {
  const strategy = await client.strategy.findUnique({
    where: { id: strategyId },
    include: {
      versions: strategyVersionId
        ? { where: { id: strategyVersionId }, take: 1 }
        : { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });

  if (!strategy) throw new Error("Strategy not found.");
  if (strategyVersionId && strategy.versions.length === 0) {
    throw new Error("Selected strategy version does not belong to this strategy.");
  }
  if (!isAutomatedHistoricalStrategy(strategy.name, strategy.versions[0]?.config)) {
    throw new Error("Automated historical runs are currently available only for Early Superstars, Momentum 10, and NSE Momentum variants.");
  }

  const version = strategy.versions[0];
  if (!version) throw new Error("No strategy version exists.");

  return { strategy, version };
}

export function isEarlySuperstarsHistoricalStrategy(name: string) {
  return name === "Early Superstars" || name.startsWith("Early Superstars ");
}

export function isMomentum10HistoricalStrategy(name: string) {
  return name === "Momentum 10 - Price Only";
}

export function isNseMomentumHistoricalStrategy(name: string) {
  return name === "NSE Momentum" || name.startsWith("NSE Momentum ");
}

export function isParentNseMomentumHistoricalStrategy(name: string, config?: unknown) {
  if (config && typeof config === "object" && "nseMomentum" in config) {
    const nseMomentum = (config as { readonly nseMomentum?: unknown }).nseMomentum;
    if (nseMomentum && typeof nseMomentum === "object" && "methodology" in nseMomentum) {
      return (nseMomentum as { readonly methodology?: unknown }).methodology === "parentStyleFullUniverse";
    }
  }

  return name === "NSE Parent Momentum Full Universe";
}

export function isAutomatedHistoricalStrategy(name: string, config?: unknown) {
  return isEarlySuperstarsHistoricalStrategy(name) ||
    isMomentum10HistoricalStrategy(name) ||
    isNseMomentumHistoricalStrategy(name) ||
    isParentNseMomentumHistoricalStrategy(name, config);
}

function initialCapitalForStrategy(name: string, config?: unknown) {
  return isParentNseMomentumHistoricalStrategy(name, config)
    ? parentNseMomentumHistoricalRules.initialCapital
    : isMomentum10HistoricalStrategy(name)
    ? momentum10HistoricalRules.initialCapital
    : isNseMomentumHistoricalStrategy(name)
      ? nseMomentumHistoricalRules.initialCapital
    : earlySuperstarsHistoricalRules.initialCapital;
}

export function rulesForEarlySuperstarsVariant(strategyName: string, config: unknown): EarlySuperstarsRules {
  const entryMomentumDays = entryMomentumDaysForEarlySuperstarsVariant(strategyName, config);
  return {
    ...earlySuperstarsHistoricalRules,
    entryMomentumDays,
    entryMomentumLabel: entryMomentumDays === 7 ? "1W" : "2W",
  };
}

export function entryMomentumDaysForEarlySuperstarsVariant(strategyName: string, config: unknown): 7 | 14 {
  if (config && typeof config === "object" && "earlySuperstars" in config) {
    const earlySuperstars = (config as { readonly earlySuperstars?: unknown }).earlySuperstars;
    if (earlySuperstars && typeof earlySuperstars === "object" && "entryMomentumDays" in earlySuperstars) {
      const entryMomentumDays = (earlySuperstars as { readonly entryMomentumDays?: unknown }).entryMomentumDays;
      if (entryMomentumDays === 7 || entryMomentumDays === 14) return entryMomentumDays;
    }
  }

  return strategyName.includes("1W Entry") ? 7 : 14;
}

export function entryMomentumLabelForEarlySuperstarsVariant(strategyName: string, config: unknown) {
  return entryMomentumDaysForEarlySuperstarsVariant(strategyName, config) === 7 ? "1W" : "2W";
}

export function rulesForNseMomentumVariant(strategyName: string, config: unknown) {
  const parsed = strategyConfigSchema.safeParse(config);
  const variant = parsed.success ? parsed.data : undefined;
  return {
    ...nseMomentumHistoricalRules,
    maxPositions: variant?.selection.maxPositions ?? nseMomentumHistoricalRules.maxPositions,
    momentumMonths: variant?.nseMomentum?.momentumMonths,
    maxEntryRank: variant?.nseMomentum?.maxEntryRank ?? null,
    skipTopRanks: nseMomentumSkipTopRanksForVariant(strategyName, config),
    rankingMode: nseMomentumRankingModeForVariant(strategyName, config),
    ...nseMomentumBuyStrengthForVariant(config),
    winnerReinvestment: nseMomentumWinnerReinvestmentForVariant(config),
    formerHoldingReentry: nseMomentumFormerHoldingReentryForVariant(config),
    lossProtection: nseMomentumLossProtectionForVariant(config),
    capitalDeployment: nseMomentumCapitalDeploymentForVariant(config),
    ...nseMomentumReviewExitForVariant(config),
  };
}

export function nseMomentumCapitalDeploymentForVariant(config: unknown) {
  const parsed = strategyConfigSchema.safeParse(config);
  const deployment = parsed.success ? parsed.data.nseMomentum?.capitalDeployment : undefined;
  if (!deployment?.enabled) return nseMomentumHistoricalRules.capitalDeployment;
  if (deployment.initialPercent + deployment.delayedPercent !== 100) {
    throw new Error("NSE Momentum capital deployment percentages must total 100%.");
  }
  return deployment;
}

export function nseMomentumLossProtectionForVariant(config: unknown) {
  const parsed = strategyConfigSchema.safeParse(config);
  const protection = parsed.success ? parsed.data.nseMomentum?.lossProtection : undefined;
  if (!protection?.enabled) return nseMomentumHistoricalRules.lossProtection;

  return {
    enabled: true,
    exitMode: protection.exitMode ?? nseMomentumHistoricalRules.lossProtection.exitMode,
    peakDrawdownPercent: protection.peakDrawdownPercent ?? nseMomentumHistoricalRules.lossProtection.peakDrawdownPercent,
    drawdownReference: protection.drawdownReference ?? nseMomentumHistoricalRules.lossProtection.drawdownReference,
    liquidationPercent: protection.liquidationPercent ?? nseMomentumHistoricalRules.lossProtection.liquidationPercent,
    maxTriggers: protection.maxTriggers ?? nseMomentumHistoricalRules.lossProtection.maxTriggers,
    reentryMode: protection.reentryMode,
    cooldownMonths: protection.cooldownMonths ?? nseMomentumHistoricalRules.lossProtection.cooldownMonths,
    recoveryLookbackSessions: protection.recoveryLookbackSessions ?? nseMomentumHistoricalRules.lossProtection.recoveryLookbackSessions,
    recoveryBreadthPercent: protection.recoveryBreadthPercent ?? nseMomentumHistoricalRules.lossProtection.recoveryBreadthPercent,
    recoveryConfirmationSessions: protection.recoveryConfirmationSessions ?? nseMomentumHistoricalRules.lossProtection.recoveryConfirmationSessions,
  };
}

export function rulesForParentNseMomentumVariant(config: unknown) {
  const portfolioManagement = config && typeof config === "object" && "nseMomentum" in config
    ? (config as { readonly nseMomentum?: { readonly parentPortfolioManagement?: unknown } }).nseMomentum?.parentPortfolioManagement
    : undefined;
  const configuredMaxPositions = config && typeof config === "object" && "selection" in config
    ? (config as { readonly selection?: { readonly maxPositions?: unknown } }).selection?.maxPositions
    : undefined;
  const configuredFrequency = config && typeof config === "object" && "nseMomentum" in config
    ? (config as { readonly nseMomentum?: { readonly rebalanceFrequencyMonths?: unknown } }).nseMomentum?.rebalanceFrequencyMonths
    : undefined;
  const configuredMomentumMonths = config && typeof config === "object" && "nseMomentum" in config
    ? (config as { readonly nseMomentum?: { readonly parentMomentumMonths?: unknown } }).nseMomentum?.parentMomentumMonths
    : undefined;
  const configuredUpperCircuitSkip = config && typeof config === "object" && "nseMomentum" in config
    ? (config as { readonly nseMomentum?: { readonly skipLikelyUpperCircuitBuys?: unknown } }).nseMomentum?.skipLikelyUpperCircuitBuys
    : undefined;
  const configuredUpperCircuitThreshold = config && typeof config === "object" && "nseMomentum" in config
    ? (config as { readonly nseMomentum?: { readonly likelyUpperCircuitMinGainPercent?: unknown } }).nseMomentum?.likelyUpperCircuitMinGainPercent
    : undefined;

  return {
    ...parentNseMomentumHistoricalRules,
    portfolioManagement: portfolioManagement === "retainSurvivors" ? "retainSurvivors" as const : "equalWeight" as const,
    maxPositions: typeof configuredMaxPositions === "number" && Number.isInteger(configuredMaxPositions) && configuredMaxPositions > 0
      ? configuredMaxPositions
      : parentNseMomentumHistoricalRules.maxPositions,
    momentumMonths: isValidParentMomentumMonths(configuredMomentumMonths)
      ? configuredMomentumMonths
      : parentNseMomentumHistoricalRules.momentumMonths,
    rebalanceFrequencyMonths: typeof configuredFrequency === "number" && Number.isInteger(configuredFrequency) && configuredFrequency > 0
      ? configuredFrequency
      : parentNseMomentumHistoricalRules.rebalanceFrequencyMonths,
    skipLikelyUpperCircuitBuys: configuredUpperCircuitSkip === true,
    likelyUpperCircuitMinGainPercent: typeof configuredUpperCircuitThreshold === "number" && configuredUpperCircuitThreshold > 0
      ? configuredUpperCircuitThreshold
      : parentNseMomentumHistoricalRules.likelyUpperCircuitMinGainPercent,
  };
}

function isValidParentMomentumMonths(value: unknown): value is readonly [number, number] {
  return Array.isArray(value) &&
    value.length === 2 &&
    value.every((item) => typeof item === "number" && Number.isInteger(item) && item > 0) &&
    value[0] < value[1];
}

export function nseMomentumRankingModeForVariant(strategyName: string, config: unknown) {
  if (config && typeof config === "object" && "nseMomentum" in config) {
    const nseMomentum = (config as { readonly nseMomentum?: unknown }).nseMomentum;
    if (nseMomentum && typeof nseMomentum === "object" && "rankingMode" in nseMomentum) {
      const rankingMode = (nseMomentum as { readonly rankingMode?: unknown }).rankingMode;
      if (rankingMode === "volatilityAdjusted" || rankingMode === "rawReturns" || rankingMode === "rawAverage") return rankingMode;
    }
  }

  return strategyName === "NSE Momentum Raw" ? "rawReturns" : nseMomentumHistoricalRules.rankingMode;
}

export function nseMomentumSkipTopRanksForVariant(strategyName: string, config: unknown) {
  if (config && typeof config === "object" && "nseMomentum" in config) {
    const nseMomentum = (config as { readonly nseMomentum?: unknown }).nseMomentum;
    if (nseMomentum && typeof nseMomentum === "object" && "skipTopRanks" in nseMomentum) {
      const skipTopRanks = (nseMomentum as { readonly skipTopRanks?: unknown }).skipTopRanks;
      if (typeof skipTopRanks === "number" && Number.isInteger(skipTopRanks) && skipTopRanks >= 0) {
        return skipTopRanks;
      }
    }
  }

  if (strategyName === "NSE Momentum After 10") return 10;
  if (strategyName === "NSE Momentum After 10 Winners") return 10;
  return 0;
}

export function nseMomentumWinnerReinvestmentForVariant(config: unknown) {
  if (config && typeof config === "object" && "nseMomentum" in config) {
    const nseMomentum = (config as { readonly nseMomentum?: unknown }).nseMomentum;
    if (nseMomentum && typeof nseMomentum === "object" && "winnerReinvestment" in nseMomentum) {
      const winnerReinvestment = (nseMomentum as { readonly winnerReinvestment?: unknown }).winnerReinvestment;
      if (winnerReinvestment && typeof winnerReinvestment === "object") {
        const value = winnerReinvestment as {
          readonly enabled?: unknown;
          readonly winnerReturnPercent?: unknown;
          readonly winnerBudgetPercent?: unknown;
        };
        if (
          typeof value.enabled === "boolean" &&
          typeof value.winnerReturnPercent === "number" &&
          typeof value.winnerBudgetPercent === "number"
        ) {
          return {
            enabled: value.enabled,
            winnerReturnPercent: value.winnerReturnPercent,
            winnerBudgetPercent: value.winnerBudgetPercent,
          };
        }
      }
    }
  }

  return nseMomentumHistoricalRules.winnerReinvestment;
}

export function nseMomentumFormerHoldingReentryForVariant(config: unknown) {
  if (config && typeof config === "object" && "nseMomentum" in config) {
    const nseMomentum = (config as { readonly nseMomentum?: unknown }).nseMomentum;
    if (nseMomentum && typeof nseMomentum === "object" && "formerHoldingReentry" in nseMomentum) {
      const formerHoldingReentry = (nseMomentum as { readonly formerHoldingReentry?: unknown }).formerHoldingReentry;
      if (formerHoldingReentry && typeof formerHoldingReentry === "object") {
        const value = formerHoldingReentry as {
          readonly enabled?: unknown;
          readonly maxRank?: unknown;
          readonly reentryBudgetPercentOfExitProceeds?: unknown;
        };
        if (
          typeof value.enabled === "boolean" &&
          typeof value.maxRank === "number" &&
          Number.isInteger(value.maxRank) &&
          value.maxRank > 0
        ) {
          return {
            enabled: value.enabled,
            maxRank: value.maxRank,
            reentryBudgetPercentOfExitProceeds: typeof value.reentryBudgetPercentOfExitProceeds === "number"
              ? value.reentryBudgetPercentOfExitProceeds
              : nseMomentumHistoricalRules.formerHoldingReentry.reentryBudgetPercentOfExitProceeds,
          };
        }
      }
    }
  }

  return nseMomentumHistoricalRules.formerHoldingReentry;
}

export function nseMomentumBuyStrengthForVariant(config: unknown) {
  if (config && typeof config === "object" && "nseMomentum" in config) {
    const nseMomentum = (config as { readonly nseMomentum?: unknown }).nseMomentum;
    if (nseMomentum && typeof nseMomentum === "object") {
      const value = nseMomentum as {
        readonly minBuyReturn1M?: unknown;
        readonly minBuyReturn3M?: unknown;
        readonly applyBuyStrengthFilterOnReview?: unknown;
        readonly maxNewPositionWeightPercent?: unknown;
        readonly useAvailableCashForReplacements?: unknown;
      };
      return {
        minBuyReturn1M: typeof value.minBuyReturn1M === "number" ? value.minBuyReturn1M : nseMomentumHistoricalRules.minBuyReturn1M,
        minBuyReturn3M: typeof value.minBuyReturn3M === "number" ? value.minBuyReturn3M : nseMomentumHistoricalRules.minBuyReturn3M,
        applyBuyStrengthFilterOnReview: typeof value.applyBuyStrengthFilterOnReview === "boolean"
          ? value.applyBuyStrengthFilterOnReview
          : nseMomentumHistoricalRules.applyBuyStrengthFilterOnReview,
        maxNewPositionWeightPercent: typeof value.maxNewPositionWeightPercent === "number"
          ? value.maxNewPositionWeightPercent
          : nseMomentumHistoricalRules.maxNewPositionWeightPercent,
        useAvailableCashForReplacements: typeof value.useAvailableCashForReplacements === "boolean"
          ? value.useAvailableCashForReplacements
          : nseMomentumHistoricalRules.useAvailableCashForReplacements,
      };
    }
  }

  return {
    minBuyReturn1M: nseMomentumHistoricalRules.minBuyReturn1M,
    minBuyReturn3M: nseMomentumHistoricalRules.minBuyReturn3M,
    applyBuyStrengthFilterOnReview: nseMomentumHistoricalRules.applyBuyStrengthFilterOnReview,
    maxNewPositionWeightPercent: nseMomentumHistoricalRules.maxNewPositionWeightPercent,
    useAvailableCashForReplacements: nseMomentumHistoricalRules.useAvailableCashForReplacements,
  };
}

export function nseMomentumReviewExitForVariant(config: unknown) {
  if (config && typeof config === "object" && "nseMomentum" in config) {
    const nseMomentum = (config as { readonly nseMomentum?: unknown }).nseMomentum;
    if (nseMomentum && typeof nseMomentum === "object") {
      const value = nseMomentum as {
        readonly holdingRankThreshold?: unknown;
        readonly reviewExitMode?: unknown;
        readonly minReviewReturn3M?: unknown;
      };
      return {
        holdingRankThreshold: typeof value.holdingRankThreshold === "number" && Number.isInteger(value.holdingRankThreshold) && value.holdingRankThreshold > 0
          ? value.holdingRankThreshold
          : nseMomentumHistoricalRules.holdingRankThreshold,
        reviewExitMode: value.reviewExitMode === "threeMonthReturnThreshold" || value.reviewExitMode === "rankThreshold"
          ? value.reviewExitMode
          : nseMomentumHistoricalRules.reviewExitMode,
        minReviewReturn3M: typeof value.minReviewReturn3M === "number"
          ? value.minReviewReturn3M
          : nseMomentumHistoricalRules.minReviewReturn3M,
      };
    }
  }

  return {
    holdingRankThreshold: nseMomentumHistoricalRules.holdingRankThreshold,
    reviewExitMode: nseMomentumHistoricalRules.reviewExitMode,
    minReviewReturn3M: nseMomentumHistoricalRules.minReviewReturn3M,
  };
}

export async function getHistoricalStrategyRun(input: {
  readonly client: PrismaClient;
  readonly strategyId: string;
  readonly runId: string;
}) {
  const run = await input.client.historicalStrategyRun.findFirst({
    where: { id: input.runId, strategyId: input.strategyId },
    include: {
      strategy: true,
      strategyVersion: true,
      positions: {
        include: {
          company: { select: { name: true, isin: true } },
          instrument: { select: { symbol: true, exchange: true } },
        },
        orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
      },
      events: { orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }] },
      dailyEquity: { orderBy: { date: "asc" } },
    },
  });

  if (!run) return null;

  const returnIfHeldToEndByPositionId = run.effectiveEndDate
    ? await loadReturnIfHeldToEndPercent({
        client: input.client,
        effectiveEndDate: run.effectiveEndDate,
        positions: run.positions.map((position) => ({
          id: position.id,
          instrumentId: position.instrumentId,
          entryDate: position.entryDate,
          entryPrice: position.entryPrice.toNumber(),
        })),
      })
    : new Map<string, number | null>();
  const report = parseHistoricalRunReport(run.reportMetrics) ?? (
    run.effectiveStartDate && run.effectiveEndDate
      ? buildHistoricalRunReport({
          effectiveStartDate: run.effectiveStartDate.toISOString().slice(0, 10),
          effectiveEndDate: run.effectiveEndDate.toISOString().slice(0, 10),
          initialCapital: run.initialCapital.toNumber(),
          positions: run.positions.map((position) => ({
            clientId: position.id,
            status: position.status === "CLOSED" ? "CLOSED" as const : "OPEN_AT_END" as const,
            entryDate: position.entryDate.toISOString().slice(0, 10),
            exitDate: position.exitDate?.toISOString().slice(0, 10) ?? null,
            exitPrice: position.exitPrice?.toNumber() ?? null,
            quantity: position.quantity.toNumber(),
          })),
          events: run.events.map((item) => ({
            positionClientId: item.positionId,
            eventType: item.eventType,
            details: item.details && typeof item.details === "object" && !Array.isArray(item.details)
              ? item.details as Record<string, unknown>
              : {},
          })),
          dailyEquity: run.dailyEquity.map((point) => ({
            date: point.date.toISOString().slice(0, 10),
            cash: point.cash.toNumber(),
            totalEquity: point.totalEquity.toNumber(),
            openPositionCount: point.openPositionCount,
          })),
        })
      : null
  );

  return {
    ...run,
    report,
    positions: run.positions.map((position) => ({
      ...position,
      returnIfHeldToEndPercent: returnIfHeldToEndByPositionId.get(position.id) ?? null,
    })),
  };
}

export function calculateReturnIfHeldToEndPercent(input: {
  readonly entryPrice: number;
  readonly endPrice: number | null;
}) {
  if (!input.endPrice || input.entryPrice <= 0) return null;
  return roundPercent(((input.endPrice / input.entryPrice) - 1) * 100);
}

export function annotateReturnIfHeldToEndPercent<TPosition extends {
  readonly id: string;
  readonly instrumentId: string;
  readonly entryDate: Date;
  readonly entryPrice: number;
}>(input: {
  readonly positions: readonly TPosition[];
  readonly prices: readonly {
    readonly instrumentId: string;
    readonly tradingDate: Date;
    readonly close: number;
  }[];
}) {
  const pricesByInstrument = new Map<string, { close: number; tradingDate: Date }[]>();
  for (const price of input.prices) {
    pricesByInstrument.set(price.instrumentId, [
      ...(pricesByInstrument.get(price.instrumentId) ?? []),
      price,
    ]);
  }
  for (const prices of pricesByInstrument.values()) {
    prices.sort((left, right) => right.tradingDate.getTime() - left.tradingDate.getTime());
  }

  return input.positions.map((position) => {
    const endPrice = pricesByInstrument
      .get(position.instrumentId)
      ?.find((price) => price.tradingDate >= position.entryDate)?.close ?? null;

    return {
      ...position,
      returnIfHeldToEndPercent: calculateReturnIfHeldToEndPercent({
        entryPrice: position.entryPrice,
        endPrice,
      }),
    };
  });
}

async function loadRealCanonicalCandidates(client: PrismaClient): Promise<HistoricalRunnerCandidate[]> {
  const companies = await client.company.findMany({
    where: { marketDataSource: realSource },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isin: true,
      instruments: {
        where: { active: true, marketDataSource: realSource },
        select: { id: true, exchange: true, symbol: true },
      },
    },
  });

  return companies
    .map((company) => {
      const instrument = company.instruments.find((item) => item.exchange === "NSE") ??
        company.instruments.find((item) => item.exchange === "BSE");
      return instrument
        ? {
            companyId: company.id,
            companyName: company.name,
            isin: company.isin,
            instrumentId: instrument.id,
            symbol: instrument.symbol,
            exchange: instrument.exchange,
            marketDataSource: realSource,
          } satisfies HistoricalRunnerCandidate
        : null;
    })
    .filter((candidate): candidate is HistoricalRunnerCandidate => candidate !== null);
}

async function loadRealNseCandidates(client: PrismaClient): Promise<HistoricalRunnerCandidate[]> {
  const companies = await client.company.findMany({
    where: { marketDataSource: realSource },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isin: true,
      instruments: {
        where: { active: true, marketDataSource: realSource, exchange: "NSE" },
        select: { id: true, exchange: true, symbol: true },
      },
    },
  });

  return companies
    .flatMap((company) => {
      const instrument = company.instruments[0];
      return instrument
        ? [{
            companyId: company.id,
            companyName: company.name,
            isin: company.isin,
            instrumentId: instrument.id,
            symbol: instrument.symbol,
            exchange: "NSE",
            marketDataSource: realSource,
          } satisfies HistoricalRunnerCandidate]
        : [];
    });
}

async function loadRealNseIneOrdinaryEquityCandidates(client: PrismaClient): Promise<HistoricalRunnerCandidate[]> {
  const companies = await client.company.findMany({
    where: {
      marketDataSource: realSource,
      instruments: {
        some: {
          active: true,
          marketDataSource: realSource,
          exchange: "NSE",
          instrumentKey: { startsWith: NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX },
        },
      },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isin: true,
      instruments: {
        where: {
          active: true,
          marketDataSource: realSource,
          exchange: "NSE",
          instrumentKey: { startsWith: NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX },
        },
        select: { id: true, exchange: true, symbol: true, instrumentKey: true },
        take: 1,
      },
    },
  });

  return companies.flatMap((company) => {
    const instrument = company.instruments[0];
    if (!instrument || !isEligibleNseOrdinaryEquityInstrument({
      instrumentKey: instrument.instrumentKey,
      companyName: company.name,
      symbol: instrument.symbol,
    })) return [];

    return [{
      companyId: company.id,
      companyName: company.name,
      isin: company.isin,
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      exchange: "NSE",
      marketDataSource: realSource,
    } satisfies HistoricalRunnerCandidate];
  });
}

async function loadRealNseOrdinaryEquityCandidates(client: PrismaClient): Promise<HistoricalRunnerCandidate[]> {
  const candidates = await loadRealNseCandidates(client);
  return candidates.filter(isLikelyOrdinaryNseEquityCandidate);
}

function isLikelyOrdinaryNseEquityCandidate(candidate: HistoricalRunnerCandidate) {
  const text = `${candidate.companyName} ${candidate.symbol}`.toUpperCase();
  const nonEquityPatterns = [
    /\bETF\b/,
    /\bBEES\b/,
    /\bINDEX\b/,
    /\bNIFTY\b/,
    /\bSENSEX\b/,
    /\bLIQUID\b/,
    /\bGILT\b/,
    /\bGSEC\b/,
    /\bSDL\b/,
    /\bBOND\b/,
    /\bDEBT\b/,
    /\bTREASURY\b/,
    /\bTBILL\b/,
    /\bPREF(?:ERENCE)?\b/,
    /\bINVIT\b/,
    /\bREIT\b/,
  ];
  return !nonEquityPatterns.some((pattern) => pattern.test(text));
}

export function usesNseIneOrdinaryEquityUniverse(config: unknown) {
  return strategyConfigSchema.parse(config).nseMomentum?.universeMode === "nseIneOrdinaryEquity";
}

async function loadRealPrices(
  client: PrismaClient,
  startDate: Date,
  endDate: Date,
  instrumentIds: readonly string[],
): Promise<HistoricalRunnerPrice[]> {
  if (instrumentIds.length === 0) return [];

  const batches = chunk(instrumentIds, priceLoadBatchSize);
  const priceBatches = await mapWithConcurrency(batches, priceLoadConcurrency, async (batchInstrumentIds) => {
    const batch = await loadDailyPriceBatch(client, {
      instrumentIds: batchInstrumentIds,
      startDate,
      endDate,
    });

    return batch.map((price) => ({
      instrumentId: price.instrumentId,
      tradingDate: price.tradingDate,
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: Number(price.volume),
      marketDataSource: price.marketDataSource as "UPSTOX_REAL",
    }));
  });

  return priceBatches.flat();
}

async function loadReturnIfHeldToEndPercent(input: {
  readonly client: PrismaClient;
  readonly effectiveEndDate: Date;
  readonly positions: readonly {
    readonly id: string;
    readonly instrumentId: string;
    readonly entryDate: Date;
    readonly entryPrice: number;
  }[];
}) {
  const instrumentIds = [...new Set(input.positions.map((position) => position.instrumentId))];
  const earliestEntryDate = input.positions
    .map((position) => position.entryDate)
    .sort((left, right) => left.getTime() - right.getTime())[0];

  if (!earliestEntryDate || instrumentIds.length === 0) return new Map<string, number | null>();

  const pricesForHeldReturn = await loadWithRetry(() => input.client.$queryRaw<{
    instrumentId: string;
    tradingDate: Date;
    close: number;
  }[]>`
    SELECT DISTINCT ON ("instrumentId")
      "instrumentId",
      "tradingDate",
      close::float8 AS close
    FROM "DailyPrice"
    WHERE "instrumentId" IN (${Prisma.join(instrumentIds)})
      AND "tradingDate" >= ${earliestEntryDate}
      AND "tradingDate" <= ${input.effectiveEndDate}
      AND "marketDataSource"::text = ${realSource}
    ORDER BY "instrumentId", "tradingDate" DESC
  `);

  return new Map(annotateReturnIfHeldToEndPercent({
    positions: input.positions,
    prices: pricesForHeldReturn,
  }).map((position) => [position.id, position.returnIfHeldToEndPercent]));
}

async function loadWithRetry<T>(load: () => Promise<T>) {
  for (let attempt = 1; attempt <= maxPriceLoadAttempts; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      if (attempt === maxPriceLoadAttempts || !isPrismaConnectionClosedError(error)) throw error;
      await delay(attempt * 500);
    }
  }

  throw new Error("Price load failed.");
}

async function loadDailyPriceBatch(
  client: PrismaClient,
  input: {
    readonly instrumentIds: readonly string[];
    readonly startDate: Date;
    readonly endDate: Date;
  },
) {
  return loadWithRetry(() => client.$queryRaw<{
    instrumentId: string;
    tradingDate: Date;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number;
    volume: number;
    marketDataSource: "UPSTOX_REAL";
  }[]>`
    SELECT
      "instrumentId",
      "tradingDate",
      open::float8 AS open,
      high::float8 AS high,
      low::float8 AS low,
      close::float8 AS close,
      volume::float8 AS volume,
      "marketDataSource"::text AS "marketDataSource"
    FROM "DailyPrice"
    WHERE "instrumentId" IN (${Prisma.join(input.instrumentIds)})
      AND "tradingDate" >= ${input.startDate}
      AND "tradingDate" <= ${input.endDate}
      AND "marketDataSource"::text = ${realSource}
    ORDER BY "instrumentId" ASC, "tradingDate" ASC
  `);
}

function isPrismaConnectionClosedError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P1017";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, TResult>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<TResult>,
) {
  const results: TResult[] = [];
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await mapper(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function persistHistoricalRun(
  client: PrismaClient,
  input: {
    readonly runId: string;
    readonly result: HistoricalStrategyRunResult;
  },
) {
  const result = input.result;
  return client.$transaction(async (tx) => {
    await tx.historicalStrategyDailyEquity.deleteMany({ where: { runId: input.runId } });
    await tx.historicalStrategyEvent.deleteMany({ where: { runId: input.runId } });
    await tx.historicalStrategyPosition.deleteMany({ where: { runId: input.runId } });

    const run = await tx.historicalStrategyRun.update({
      where: { id: input.runId },
      data: {
        status: "COMPLETED",
        effectiveStartDate: parseDate(result.effectiveStartDate),
        effectiveEndDate: parseDate(result.effectiveEndDate),
        initialCapital: decimal(result.initialCapital, 2),
        endingValue: decimal(result.endingValue, 2),
        totalReturnPercent: decimal(result.totalReturnPercent, 4),
        cagrPercent: nullableDecimal(result.cagrPercent, 4),
        maxDrawdownPercent: decimal(result.maxDrawdownPercent, 4),
        initialPositionCount: result.initialPositionCount,
        tradeCount: result.tradeCount,
        stopLossExitCount: result.stopLossExitCount,
        monthlyRankExitCount: result.monthlyRankExitCount,
        graduationCount: result.graduationCount,
        endingOpenPositionCount: result.endingOpenPositionCount,
        unavailableFilters: result.unavailableFilters,
        limitations: result.limitations,
        assumptions: result.assumptions,
        reportMetrics: result.report as unknown as Prisma.InputJsonValue,
        errorMessage: null,
        completedAt: new Date(),
      },
    });

    const positionIds = new Map<string, string>();
    for (const position of result.positions) {
      const created = await tx.historicalStrategyPosition.create({
        data: {
          runId: run.id,
          companyId: position.companyId,
          instrumentId: position.instrumentId,
          status: position.status,
          entryDate: parseDate(position.entryDate),
          entryPrice: decimal(position.entryPrice, 4),
          quantity: decimal(position.quantity, 6),
          allocation: decimal(position.allocation, 2),
          entryRank: position.entryRank,
          entryReturn1W: nullableDecimal(position.entryReturn1W, 4),
          stopTriggerDate: nullableDate(position.stopTriggerDate),
          stopTriggerPrice: nullableDecimal(position.stopTriggerPrice, 4),
          exitDate: nullableDate(position.exitDate),
          exitPrice: nullableDecimal(position.exitPrice, 4),
          exitReason: position.exitReason,
          realizedReturnPercent: nullableDecimal(position.realizedReturnPercent, 4),
          reviewHistory: position.reviewHistory as unknown as Prisma.InputJsonValue,
        },
      });
      positionIds.set(position.clientId, created.id);
    }

    await tx.historicalStrategyEvent.createMany({
      data: result.events.map((item) => ({
        runId: run.id,
        positionId: item.positionClientId ? positionIds.get(item.positionClientId) ?? null : null,
        companyId: item.companyId,
        instrumentId: item.instrumentId,
        eventDate: parseDate(item.eventDate),
        eventType: item.eventType,
        details: item.details as Prisma.InputJsonValue,
      })),
    });

    await tx.historicalStrategyDailyEquity.createMany({
      data: result.dailyEquity.map((point) => ({
        runId: run.id,
        date: parseDate(point.date),
        cash: decimal(point.cash, 2),
        investedValue: decimal(point.investedValue, 2),
        totalEquity: decimal(point.totalEquity, 2),
        cumulativeReturnPercent: decimal(point.cumulativeReturnPercent, 4),
        drawdownPercent: decimal(point.drawdownPercent, 4),
        openPositionCount: point.openPositionCount,
      })),
    });

    return run;
  }, { timeout: 120_000 });
}

export function parseHistoricalRunDate(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} is required.`);
  }
  return parseDate(value);
}

function nullableDate(value: string | null) {
  return value ? parseDate(value) : null;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function decimal(value: number, decimals: number) {
  return value.toFixed(decimals);
}

function nullableDecimal(value: number | null, decimals: number) {
  return value === null ? null : decimal(value, decimals);
}

function roundPercent(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function addUtcMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
