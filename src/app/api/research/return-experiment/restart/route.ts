import { NextResponse } from "next/server";

import { HistoricalExperimentRepository } from "@/lib/research/historical-experiment";

export async function POST() {
  const repository = new HistoricalExperimentRepository();
  await repository.restartTemporaryExperiment();

  return NextResponse.json({ ok: true, result: null });
}
