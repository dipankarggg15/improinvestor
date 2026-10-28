import { describe, expect, it } from "vitest";

import { distanceFromSupport, watchlistProximityStatus } from "@/lib/watchlists/proximity";

describe("watchlist proximity", () => {
  it("classifies live prices against a saved support zone", () => {
    expect(watchlistProximityStatus(99, 100, 105, 1)).toBe("BROKEN");
    expect(watchlistProximityStatus(103, 100, 105, 1)).toBe("IN_SUPPORT");
    expect(watchlistProximityStatus(106, 100, 105, 1)).toBe("APPROACHING");
    expect(watchlistProximityStatus(108, 100, 105, 1)).toBe("MONITORING");
  });

  it("keeps stocks without a valid support zone in monitoring", () => {
    expect(watchlistProximityStatus(100, null, null, 1)).toBe("MONITORING");
    expect(watchlistProximityStatus(100, 105, 100, 1)).toBe("MONITORING");
  });

  it("reports signed distance from the upper edge of support", () => {
    expect(distanceFromSupport(110, 100)).toBe(10);
    expect(distanceFromSupport(95, 100)).toBe(-5);
    expect(distanceFromSupport(95, null)).toBeNull();
  });
});
