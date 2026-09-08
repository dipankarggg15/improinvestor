import { NextResponse } from "next/server";

import {
  HistoricalExperimentRepository,
  parseFilterSortKey,
  parseHistoricalDate,
  parseOptionalNumber,
  parsePositiveCrores,
  parseSortDirection,
} from "@/lib/research/historical-experiment";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const repository = new HistoricalExperimentRepository();
    const result = await repository.runFilter({
      startDate: parseHistoricalDate(body.startDate, "2026-04-03"),
      endDate: parseHistoricalDate(body.endDate, "2026-09-07"),
      minAverageTradedValue: parsePositiveCrores(body.minAverageTradedValueCr, 5),
      minReturnPercent: parseOptionalNumber(body.minReturnPercent),
      maxReturnPercent: parseOptionalNumber(body.maxReturnPercent),
      sortBy: parseFilterSortKey(body.sortBy),
      sortDirection: parseSortDirection(body.sortDirection),
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to run historical filter.",
    }, { status: 400 });
  }
}
