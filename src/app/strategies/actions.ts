"use server";

import { redirect } from "next/navigation";

import { requireOwner } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import {
  parseHistoricalRunDate,
  runEarlySuperstarsHistorical,
} from "@/lib/strategies/historical-run-service";
import { assignOpenEpisodeToStrategyVersion } from "@/lib/strategies/live-holdings";
import { createNextStrategyVersion, runCurrentStrategyVersion } from "@/lib/strategies/run-service";

export async function runStrategyAction(strategyId: string, formData: FormData) {
  await requireOwner();

  const startDateValue = String(formData.get("startDate") ?? formData.get("runDate") ?? "");
  const endDateValue = String(formData.get("endDate") ?? "");
  const strategyVersionId = requiredStrategyVersionId(formData);

  if (!strategyId || !/^\d{4}-\d{2}-\d{2}$/.test(startDateValue)) {
    throw new Error("Strategy and start date are required.");
  }

  if (endDateValue && !/^\d{4}-\d{2}-\d{2}$/.test(endDateValue)) {
    throw new Error("End date must be a valid date.");
  }

  if (endDateValue && endDateValue <= startDateValue) {
    throw new Error("End Date must be after Start Date.");
  }

  const run = await runCurrentStrategyVersion({
    strategyId,
    strategyVersionId,
    runDate: new Date(`${startDateValue}T00:00:00.000Z`),
  });

  const endDateQuery = endDateValue ? `?endDate=${encodeURIComponent(endDateValue)}` : "";
  redirect(`/strategies/${strategyId}/runs/${run.id}${endDateQuery}`);
}

export async function runEarlySuperstarsHistoricalAction(strategyId: string, formData: FormData) {
  await requireOwner();

  const requestedStartDate = parseHistoricalRunDate(formData.get("startDate"), "Start Date");
  const requestedEndDate = parseHistoricalRunDate(formData.get("endDate"), "End Date");
  const strategyVersionId = requiredStrategyVersionId(formData);

  if (!strategyId) {
    throw new Error("Strategy is required.");
  }

  const run = await runEarlySuperstarsHistorical({
    strategyId,
    strategyVersionId,
    requestedStartDate,
    requestedEndDate,
    client: prisma,
  });

  redirect(`/strategies/${strategyId}/historical-runs/${run.id}`);
}

function requiredStrategyVersionId(formData: FormData) {
  const value = formData.get("strategyVersionId");
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Strategy version is required.");
  }
  return value;
}

export async function cloneStrategyVersionAction(strategyId: string) {
  await requireOwner();

  const latest = await prisma.strategyVersion.findFirst({
    where: { strategyId },
    orderBy: { versionNumber: "desc" },
  });

  if (!latest) {
    throw new Error("No version exists to clone.");
  }

  await createNextStrategyVersion({
    strategyId,
    config: undefined,
    label: `V${latest.versionNumber + 1}`,
    effectiveFrom: new Date(),
    notes: "Copied from previous version. Edit support will be added in a later UI pass.",
  });

  redirect(`/strategies/${strategyId}`);
}

export async function assignOpenEpisodeStrategyVersionAction(
  strategyId: string,
  episodeId: string,
  strategyVersionId: string,
) {
  await requireOwner();

  if (!strategyId || !episodeId || !strategyVersionId) {
    throw new Error("Strategy, holding, and strategy version are required.");
  }

  await assignOpenEpisodeToStrategyVersion({
    client: prisma,
    episodeId,
    strategyVersionId,
  });

  redirect(`/strategies/${strategyId}`);
}

export async function deleteHistoricalStrategyRunAction(strategyId: string, runId: string) {
  await requireOwner();

  if (!strategyId || !runId) {
    throw new Error("Strategy and historical test are required.");
  }

  const run = await prisma.historicalStrategyRun.findFirst({
    where: { id: runId, strategyId },
    select: { id: true },
  });

  if (!run) {
    throw new Error("Historical test was not found for this strategy.");
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.historicalStrategyEvent.deleteMany({ where: { runId } });
      await tx.historicalStrategyDailyEquity.deleteMany({ where: { runId } });
      await tx.historicalStrategyPosition.deleteMany({ where: { runId } });
      await tx.historicalStrategyRun.delete({ where: { id: runId } });
    },
    { timeout: 120_000 },
  );

  redirect(`/strategies/${strategyId}`);
}

export async function deleteStrategyRunAction(strategyId: string, runId: string) {
  await requireOwner();

  if (!strategyId || !runId) {
    throw new Error("Strategy and test are required.");
  }

  await prisma.$transaction(async (tx) => {
    const run = await tx.strategyRun.findFirst({
      where: { id: runId, strategyId },
      select: { id: true },
    });

    if (!run) {
      throw new Error("Test was not found for this strategy.");
    }

    const [linkedTradeCount, linkedEpisodeCount] = await Promise.all([
      tx.trade.count({
        where: {
          OR: [
            { strategyRunId: runId },
            { strategyCandidateSnapshot: { strategyRunId: runId } },
          ],
        },
      }),
      tx.positionEpisode.count({ where: { originatingStrategyRunId: runId } }),
    ]);

    if (linkedTradeCount > 0 || linkedEpisodeCount > 0) {
      throw new Error("This test is linked to real portfolio history and cannot be deleted.");
    }

    await tx.strategyCandidateSnapshot.deleteMany({ where: { strategyRunId: runId } });
    await tx.strategyRun.delete({ where: { id: runId } });
  });

  redirect(`/strategies/${strategyId}`);
}
