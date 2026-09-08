import { NextResponse } from "next/server";

import {
  HistoricalExperimentRepository,
  parseManualPosition,
} from "@/lib/research/historical-experiment";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const repository = new HistoricalExperimentRepository();
    const result = await repository.addPositionToTemporaryExperiment(parseManualPosition(body));

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to add position.",
    }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const positionId = typeof body.positionId === "string" ? body.positionId : "";
    const repository = new HistoricalExperimentRepository();
    const result = await repository.removeTemporaryPosition(positionId);

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to remove position.",
    }, { status: 400 });
  }
}
