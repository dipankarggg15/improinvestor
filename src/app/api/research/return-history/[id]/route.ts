import { NextResponse } from "next/server";

import { HistoricalExperimentRepository } from "@/lib/research/historical-experiment";

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id } = await params;
  const repository = new HistoricalExperimentRepository();
  const result = await repository.getSavedExperiment(id);

  if (!result) {
    return NextResponse.json({ ok: false, error: "Saved return not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, result });
}
