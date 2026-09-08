import { NextResponse } from "next/server";

import {
  HistoricalExperimentRepository,
  parseManualPositions,
} from "@/lib/research/historical-experiment";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name : "";
    const repository = new HistoricalExperimentRepository();
    const result = await repository.saveTemporaryExperiment({
      name,
      positions: parseManualPositions(body.positions),
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save return.",
    }, { status: 400 });
  }
}
