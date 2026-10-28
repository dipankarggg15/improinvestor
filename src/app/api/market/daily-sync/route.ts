import { NextResponse } from "next/server";

import { requireOwner } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { ensureDailyMarketDataSync } from "@/lib/market-data/daily-sync";

export const dynamic = "force-dynamic";
// Vercel Hobby deployments allow a maximum function duration of 300 seconds.
// The desktop app is not subject to this hosted-function limit.
export const maxDuration = 300;

export async function POST() {
  await requireOwner();
  const status = await ensureDailyMarketDataSync(prisma);
  return NextResponse.json(status, { status: status.pending ? 202 : 200 });
}
