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

  const runDateValue = String(formData.get("runDate") ?? "");

  if (!strategyId || !/^\d{4}-\d{2}-\d{2}$/.test(runDateValue)) {
    throw new Error("Strategy and run date are required.");
  }

  const run = await runCurrentStrategyVersion({
    strategyId,
    runDate: new Date(`${runDateValue}T00:00:00.000Z`),
  });

  redirect(`/strategies/${strategyId}/runs/${run.id}`);
}

export async function runEarlySuperstarsHistoricalAction(strategyId: string, formData: FormData) {
  await requireOwner();

  const requestedStartDate = parseHistoricalRunDate(formData.get("startDate"), "Start Date");
  const requestedEndDate = parseHistoricalRunDate(formData.get("endDate"), "End Date");

  if (!strategyId) {
    throw new Error("Strategy is required.");
  }

  const run = await runEarlySuperstarsHistorical({
    strategyId,
    requestedStartDate,
    requestedEndDate,
    client: prisma,
  });

  redirect(`/strategies/${strategyId}/historical-runs/${run.id}`);
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
