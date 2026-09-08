import { NextResponse } from "next/server";

import { HistoricalExperimentRepository } from "@/lib/research/historical-experiment";

export async function GET() {
  const repository = new HistoricalExperimentRepository();
  const result = await repository.getSavedExperiments();

  return NextResponse.json({ ok: true, result });
}
