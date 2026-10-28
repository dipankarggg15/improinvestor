import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getWholeMarketSectorStatusSnapshot } from "@/lib/sectors/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getWholeMarketSectorStatusSnapshot(prisma);

  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
