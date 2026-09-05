"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { rebuildPositionEpisodes, updateMissingPostExitObservations } from "@/lib/exits/service";
import { recordTrade } from "@/lib/portfolio/service";

export async function recordTradeAction(formData: FormData) {
  const portfolioId = String(formData.get("portfolioId") ?? "");
  const companyId = String(formData.get("companyId") ?? "");
  const instrumentId = String(formData.get("instrumentId") ?? "");
  const strategyRunId = nullableString(formData.get("strategyRunId"));
  const strategyCandidateSnapshotId = nullableString(formData.get("strategyCandidateSnapshotId"));
  const strategyReviewPositionSnapshotId = nullableString(formData.get("strategyReviewPositionSnapshotId"));
  const side = String(formData.get("side") ?? "BUY");
  const tradeDateValue = String(formData.get("tradeDate") ?? "");

  if (side !== "BUY" && side !== "SELL") throw new Error("Invalid trade side.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDateValue)) throw new Error("Trade date is required.");

  const trade = await recordTrade(prisma, {
    portfolioId,
    companyId,
    instrumentId,
    strategyRunId,
    strategyCandidateSnapshotId,
    strategyReviewPositionSnapshotId,
    side,
    tradeDate: new Date(`${tradeDateValue}T00:00:00.000Z`),
    quantity: String(formData.get("quantity") ?? ""),
    price: String(formData.get("price") ?? ""),
    fees: String(formData.get("fees") ?? "0"),
    notes: nullableString(formData.get("notes")),
  });
  await rebuildPositionEpisodes(prisma);
  await updateMissingPostExitObservations(prisma);

  redirect(`/portfolio/${portfolioId}/trades/${trade.id}`);
}

function nullableString(value: FormDataEntryValue | null) {
  const stringValue = String(value ?? "").trim();
  return stringValue.length > 0 ? stringValue : null;
}
