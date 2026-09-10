import { NextResponse, type NextRequest } from "next/server";

import { requireOwner } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import {
  parseHistoricalRunDate,
  runEarlySuperstarsHistorical,
} from "@/lib/strategies/historical-run-service";

export async function POST(
  request: NextRequest,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  await requireOwner();

  const { id } = await params;
  const formData = await request.formData();
  const run = await runEarlySuperstarsHistorical({
    strategyId: id,
    requestedStartDate: parseHistoricalRunDate(formData.get("startDate"), "Start Date"),
    requestedEndDate: parseHistoricalRunDate(formData.get("endDate"), "End Date"),
    client: prisma,
  });

  return NextResponse.redirect(new URL(`/strategies/${id}/historical-runs/${run.id}`, request.url), 303);
}
