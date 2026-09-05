export const postExitHorizons = ["ONE_WEEK", "ONE_MONTH", "THREE_MONTHS", "SIX_MONTHS"] as const;
export type PostExitHorizonKey = (typeof postExitHorizons)[number];

export function targetDateForHorizon(exitDate: Date, horizon: PostExitHorizonKey) {
  const target = new Date(exitDate);
  target.setUTCHours(0, 0, 0, 0);

  if (horizon === "ONE_WEEK") {
    target.setUTCDate(target.getUTCDate() + 7);
  } else if (horizon === "ONE_MONTH") {
    target.setUTCMonth(target.getUTCMonth() + 1);
  } else if (horizon === "THREE_MONTHS") {
    target.setUTCMonth(target.getUTCMonth() + 3);
  } else {
    target.setUTCMonth(target.getUTCMonth() + 6);
  }

  return target;
}

export function horizonLabel(horizon: PostExitHorizonKey) {
  if (horizon === "ONE_WEEK") return "+1W";
  if (horizon === "ONE_MONTH") return "+1M";
  if (horizon === "THREE_MONTHS") return "+3M";
  return "+6M";
}
