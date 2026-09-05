import { describe, expect, it } from "vitest";

import { calculatePathStats, calculatePostExitObservation } from "@/lib/exits/observations";
import { targetDateForHorizon } from "@/lib/exits/horizons";

describe("post-exit observations", () => {
  it("uses the first available trading close on or after the horizon target", () => {
    const observation = calculatePostExitObservation({
      horizon: "ONE_WEEK",
      exitDate: day("2025-01-03"),
      exitReferencePrice: "100",
      asOfDate: day("2025-01-31"),
      pricesAfterExit: [
        { tradingDate: day("2025-01-09"), close: "105" },
        { tradingDate: day("2025-01-13"), close: "112" },
      ],
    });

    expect(targetDateForHorizon(day("2025-01-03"), "ONE_WEEK")).toEqual(day("2025-01-10"));
    expect(observation.status).toBe("COMPLETED");
    expect(observation.actualPriceDate).toEqual(day("2025-01-13"));
    expect(observation.returnSinceExit?.toFixed(4)).toBe("12.0000");
  });

  it("marks future horizons pending and exhausted datasets unavailable", () => {
    expect(
      calculatePostExitObservation({
        horizon: "ONE_MONTH",
        exitDate: day("2025-01-03"),
        exitReferencePrice: "100",
        asOfDate: day("2025-01-20"),
        pricesAfterExit: [],
      }).status,
    ).toBe("PENDING");

    expect(
      calculatePostExitObservation({
        horizon: "ONE_MONTH",
        exitDate: day("2025-01-03"),
        exitReferencePrice: "100",
        asOfDate: day("2025-03-01"),
        pricesAfterExit: [{ tradingDate: day("2025-01-15"), close: "103" }],
      }).status,
    ).toBe("DATA_NOT_AVAILABLE");
  });

  it("calculates path stats without using prices beyond the requested window", () => {
    const stats = calculatePathStats({
      horizon: "ONE_MONTH",
      exitDate: day("2025-01-01"),
      exitReferencePrice: "100",
      pricesAfterExit: [
        { tradingDate: day("2025-01-10"), close: "90" },
        { tradingDate: day("2025-01-20"), close: "125" },
        { tradingDate: day("2025-02-10"), close: "150" },
      ],
    });

    expect(stats.maximumPrice).toBe("125.0000");
    expect(stats.minimumPrice).toBe("90.0000");
    expect(stats.maximumGainPercent).toBe("25.0000");
    expect(stats.maximumDeclinePercent).toBe("-10.0000");
    expect(stats.complete).toBe(false);
  });
});

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
