"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { updateMissingPostExitObservations } from "@/lib/exits/service";

export async function updatePostExitObservationsAction() {
  await requireOwner();

  await updateMissingPostExitObservations(prisma);
  revalidatePath("/analytics/exits");
}
