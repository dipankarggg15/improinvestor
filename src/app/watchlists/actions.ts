"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwner } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";

export async function createWatchlistAction(formData: FormData) {
  await requireOwner();
  const name = requiredText(formData, "name", 80);
  const description = optionalText(formData, "description", 300);
  const watchlist = await prisma.watchlist.create({ data: { name, description } });
  redirect(`/watchlists/${watchlist.id}`);
}

export async function updateWatchlistAction(watchlistId: string, formData: FormData) {
  await requireOwner();
  const name = requiredText(formData, "name", 80);
  const description = optionalText(formData, "description", 300);
  await prisma.watchlist.update({ where: { id: watchlistId }, data: { name, description } });
  revalidatePath("/watchlists");
  revalidatePath(`/watchlists/${watchlistId}`);
}

export async function deleteWatchlistAction(watchlistId: string) {
  await requireOwner();
  await prisma.watchlist.delete({ where: { id: watchlistId } });
  redirect("/watchlists");
}

export async function addStockToWatchlistAction(
  exchange: "NSE" | "BSE",
  symbol: string,
  source: string,
  formData: FormData,
) {
  await requireOwner();
  const watchlistId = requiredText(formData, "watchlistId", 100);
  const instrument = await prisma.instrument.findUnique({
    where: { exchange_symbol: { exchange, symbol: symbol.toUpperCase() } },
    select: { id: true, companyId: true },
  });
  if (!instrument) throw new Error("Stock was not found.");

  const detectedSupportLow = optionalPositiveNumber(formData.get("supportLow"));
  const detectedSupportHigh = optionalPositiveNumber(formData.get("supportHigh"));
  const detectedAtValue = String(formData.get("detectedAt") ?? "");
  const detectedAt = /^\d{4}-\d{2}-\d{2}$/.test(detectedAtValue)
    ? new Date(`${detectedAtValue}T00:00:00.000Z`)
    : null;

  await prisma.watchlistItem.upsert({
    where: { watchlistId_instrumentId: { watchlistId, instrumentId: instrument.id } },
    create: {
      watchlistId,
      instrumentId: instrument.id,
      companyId: instrument.companyId,
      source,
      detectedSupportLow,
      detectedSupportHigh,
      detectedAt,
    },
    update: {
      state: "WATCHING",
      source,
      detectedSupportLow: detectedSupportLow ?? undefined,
      detectedSupportHigh: detectedSupportHigh ?? undefined,
      detectedAt: detectedAt ?? undefined,
    },
  });
  revalidatePath("/watchlists");
  revalidatePath(`/watchlists/${watchlistId}`);
}

export async function updateWatchlistItemAction(watchlistId: string, itemId: string, formData: FormData) {
  await requireOwner();
  const manualSupportLow = optionalPositiveNumber(formData.get("manualSupportLow"));
  const manualSupportHigh = optionalPositiveNumber(formData.get("manualSupportHigh"));
  if ((manualSupportLow === null) !== (manualSupportHigh === null)) {
    throw new Error("Enter both edges of the manual support zone, or leave both blank.");
  }
  if (manualSupportLow !== null && manualSupportHigh !== null && manualSupportHigh < manualSupportLow) {
    throw new Error("Support high must be greater than or equal to support low.");
  }
  const alertDistancePercent = boundedNumber(formData.get("alertDistancePercent"), 0.1, 20, 1);
  const stateValue = String(formData.get("state") ?? "WATCHING");
  const state = stateValue === "BOUGHT" || stateValue === "ARCHIVED" ? stateValue : "WATCHING";
  const notes = optionalText(formData, "notes", 1000);

  const result = await prisma.watchlistItem.updateMany({
    where: { id: itemId, watchlistId },
    data: {
      manualSupportLow,
      manualSupportHigh,
      alertDistancePercent,
      state,
      notes,
      lastReviewedAt: new Date(),
    },
  });
  if (result.count === 0) throw new Error("Watchlist stock was not found.");
  revalidatePath(`/watchlists/${watchlistId}`);
}

export async function removeWatchlistItemAction(watchlistId: string, itemId: string) {
  await requireOwner();
  await prisma.watchlistItem.deleteMany({ where: { id: itemId, watchlistId } });
  revalidatePath("/watchlists");
  revalidatePath(`/watchlists/${watchlistId}`);
}

function requiredText(formData: FormData, key: string, maximumLength: number) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required.`);
  return value.slice(0, maximumLength);
}

function optionalText(formData: FormData, key: string, maximumLength: number) {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value.slice(0, maximumLength) : null;
}

function optionalPositiveNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Support prices must be positive numbers.");
  return parsed;
}

function boundedNumber(value: FormDataEntryValue | null, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(String(value ?? ""));
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}
