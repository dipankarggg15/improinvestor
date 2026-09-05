export type StandardMetricDateTargets = {
  readonly return1W: Date;
  readonly return1M: Date;
  readonly return3M: Date;
  readonly return6M: Date;
  readonly return1Y: Date;
};

export function getStandardMetricDateTargets(runDate: Date): StandardMetricDateTargets {
  return {
    return1W: addUtcDays(runDate, -7),
    return1M: addUtcMonths(runDate, -1),
    return3M: addUtcMonths(runDate, -3),
    return6M: addUtcMonths(runDate, -6),
    return1Y: addUtcYears(runDate, -1),
  };
}

export function getLiquidityStartDate(
  runDate: Date,
  lookback:
    | { readonly type: "calendarMonths"; readonly months: number }
    | { readonly type: "tradingSessions"; readonly sessions: number },
) {
  if (lookback.type === "calendarMonths") {
    return addUtcMonths(runDate, -lookback.months);
  }

  return addUtcDays(runDate, -(lookback.sessions + 7));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addUtcYears(date: Date, years: number) {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}
