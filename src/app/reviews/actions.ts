"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { runPortfolioReview, type ReviewType } from "@/lib/reviews/service";

export async function runReviewAction(formData: FormData) {
  const portfolioId = String(formData.get("portfolioId") ?? "");
  const reviewTypeValue = String(formData.get("reviewType") ?? "SCHEDULED");
  const reviewDateValue = String(formData.get("reviewDate") ?? "");

  if (reviewTypeValue !== "SCHEDULED" && reviewTypeValue !== "EMERGENCY") {
    throw new Error("Invalid review type.");
  }
  if (!portfolioId || !/^\d{4}-\d{2}-\d{2}$/.test(reviewDateValue)) {
    throw new Error("Portfolio and review date are required.");
  }

  const review = await runPortfolioReview({
    client: prisma,
    portfolioId,
    reviewType: reviewTypeValue as ReviewType,
    reviewDate: new Date(`${reviewDateValue}T00:00:00.000Z`),
  });

  redirect(`/portfolio/${portfolioId}/reviews/${review.id}`);
}
