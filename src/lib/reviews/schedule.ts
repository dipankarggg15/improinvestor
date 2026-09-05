export type ReviewSchedule = {
  readonly firstBuyDate: Date;
  readonly gracePeriodEnd: Date;
  readonly nextScheduledReviewDate: Date;
  readonly daysUntilOrOverdue: number;
};

export function holdingAgeDays(firstBuyDate: Date, reviewDate: Date) {
  return Math.floor((startOfDay(reviewDate).getTime() - startOfDay(firstBuyDate).getTime()) / 86_400_000) + 1;
}

export function earlySuperstarsPhase(firstBuyDate: Date, reviewDate: Date) {
  return holdingAgeDays(firstBuyDate, reviewDate) <= 90 ? "PHASE_1" : "PHASE_2";
}

export function momentum10Schedule(firstBuyDate: Date, asOfDate: Date): ReviewSchedule {
  const gracePeriodEnd = addCalendarMonths(firstBuyDate, 1);
  return scheduledFrom(firstBuyDate, asOfDate, gracePeriodEnd, 14);
}

export function earlySuperstarsSchedule(firstBuyDate: Date, asOfDate: Date): ReviewSchedule {
  const firstReview = addCalendarMonths(firstBuyDate, 1);
  let next = firstReview;
  while (next < startOfDay(asOfDate)) {
    next = addCalendarMonths(next, 1);
  }

  return {
    firstBuyDate,
    gracePeriodEnd: firstReview,
    nextScheduledReviewDate: next,
    daysUntilOrOverdue: daysBetween(startOfDay(asOfDate), next),
  };
}

function scheduledFrom(firstBuyDate: Date, asOfDate: Date, firstReview: Date, cadenceDays: number): ReviewSchedule {
  let next = firstReview;
  while (next < startOfDay(asOfDate)) {
    next = addDays(next, cadenceDays);
  }

  return {
    firstBuyDate,
    gracePeriodEnd: firstReview,
    nextScheduledReviewDate: next,
    daysUntilOrOverdue: daysBetween(startOfDay(asOfDate), next),
  };
}

export function addCalendarMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysBetween(left: Date, right: Date) {
  return Math.floor((right.getTime() - left.getTime()) / 86_400_000);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}
