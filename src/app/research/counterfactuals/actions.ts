"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { createAndRunCounterfactualExperiment } from "@/lib/counterfactuals/service";

export async function runCounterfactualExperimentAction(formData: FormData) {
  const strategyId = String(formData.get("strategyId") ?? "");
  const strategyVersionId = String(formData.get("strategyVersionId") ?? "");
  const parameter = String(formData.get("parameter") ?? "");
  const values = String(formData.get("values") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const startDate = parseDate(String(formData.get("startDate") ?? ""));
  const endDate = parseDate(String(formData.get("endDate") ?? ""));
  const initialCapital = String(formData.get("initialCapital") ?? "1000000");

  if (values.length === 0 || values.length > 20) throw new Error("Provide between 1 and 20 variant values.");
  const strategy = await prisma.strategy.findUniqueOrThrow({ where: { id: strategyId } });
  const variants = [
    { name: controlName(strategy.name, parameter), isControl: true, parameterOverrides: {} },
    ...values.map((value) => ({ name: `${labelFor(parameter)} ${value}`, parameterOverrides: overrideFor(parameter, Number(value)) })),
  ];
  const experiment = await createAndRunCounterfactualExperiment({
    client: prisma,
    name: `${strategy.name} ${labelFor(parameter)} Test`,
    description: `Controlled counterfactual sweep for ${labelFor(parameter)}.`,
    baseStrategyId: strategyId,
    baseStrategyVersionId: strategyVersionId,
    startDate,
    endDate,
    initialCapital,
    variants,
  });
  redirect(`/research/counterfactuals/${experiment.id}`);
}

function overrideFor(parameter: string, value: number) {
  if (!Number.isFinite(value)) throw new Error("Variant values must be numbers.");
  if (parameter === "momentum.holdingRankThreshold") return { momentum: { holdingRankThreshold: value } };
  if (parameter === "momentum.minReturn3M") return { entry: { minReturn3M: value } };
  if (parameter === "early.phase1RankThreshold") return { earlySuperstars: { phase1RankThreshold: value } };
  if (parameter === "early.phase2RankThreshold") return { earlySuperstars: { phase2RankThreshold: value } };
  if (parameter === "early.emergencyStopPercent") return { earlySuperstars: { emergencyStopPercent: value } };
  if (parameter === "early.phase1DurationDays") return { earlySuperstars: { phase1DurationDays: value } };
  throw new Error("Unsupported counterfactual parameter.");
}

function labelFor(parameter: string) {
  return parameter.split(".").at(-1) ?? parameter;
}

function controlName(strategyName: string, parameter: string) {
  if (strategyName === "Momentum 10" && parameter === "momentum.holdingRankThreshold") return "CONTROL Top30";
  if (strategyName === "Early Superstars" && parameter === "early.phase2RankThreshold") return "CONTROL Top30";
  if (strategyName === "Early Superstars" && parameter === "early.emergencyStopPercent") return "CONTROL -15%";
  return "CONTROL";
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("A valid date is required.");
  return new Date(`${value}T00:00:00.000Z`);
}
