export type WatchlistProximityStatus = "IN_SUPPORT" | "APPROACHING" | "BROKEN" | "MONITORING";

export function watchlistProximityStatus(
  price: number,
  supportLow: number | null,
  supportHigh: number | null,
  alertDistancePercent: number,
): WatchlistProximityStatus {
  if (!supportLow || !supportHigh || supportLow <= 0 || supportHigh < supportLow) return "MONITORING";
  if (price < supportLow) return "BROKEN";
  if (price <= supportHigh) return "IN_SUPPORT";
  if (price <= supportHigh * (1 + alertDistancePercent / 100)) return "APPROACHING";
  return "MONITORING";
}

export function distanceFromSupport(price: number, supportHigh: number | null) {
  return supportHigh && supportHigh > 0 ? ((price - supportHigh) / supportHigh) * 100 : null;
}
