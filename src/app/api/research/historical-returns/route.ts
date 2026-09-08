import { NextResponse } from "next/server";

import {
  HistoricalExperimentRepository,
  parseManualPositions,
} from "@/lib/research/historical-experiment";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const repository = new HistoricalExperimentRepository();
    const result = await repository.calculateAndPersistTemporaryExperiment({
      positions: parseManualPositions(body.positions),
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to calculate historical returns.",
    }, { status: 400 });
  }
}
