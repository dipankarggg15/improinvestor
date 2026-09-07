"use server";

import { redirect } from "next/navigation";

import { requireOwner } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { assignOpenEpisodeToStrategyVersion } from "@/lib/strategies/live-holdings";
import { createNextStrategyVersion, runCurrentStrategyVersion } from "@/lib/strategies/run-service";

export async function runStrategyAction(formData: FormData) {
  await requireOwner();

  const strategyId = String(formData.get("strategyId") ?? "");
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

export async function cloneStrategyVersionAction(formData: FormData) {
  await requireOwner();

  const strategyId = String(formData.get("strategyId") ?? "");
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

export async function assignOpenEpisodeStrategyVersionAction(formData: FormData) {
  await requireOwner();

  const strategyId = String(formData.get("strategyId") ?? "");
  const episodeId = String(formData.get("episodeId") ?? "");
  const strategyVersionId = String(formData.get("strategyVersionId") ?? "");
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
