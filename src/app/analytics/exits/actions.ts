"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { updateMissingPostExitObservations } from "@/lib/exits/service";

export async function updatePostExitObservationsAction() {
  await updateMissingPostExitObservations(prisma);
  revalidatePath("/analytics/exits");
}
