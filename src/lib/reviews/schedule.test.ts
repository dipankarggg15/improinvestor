import { describe, expect, it } from "vitest";

import { earlySuperstarsPhase, holdingAgeDays, momentum10Schedule } from "@/lib/reviews/schedule";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("review scheduling", () => {
  it("treats first buy date as day 1 and switches Early Superstars to Phase 2 on day 91", () => {
    expect(holdingAgeDays(date("2025-01-01"), date("2025-03-30"))).toBe(89);
    expect(holdingAgeDays(date("2025-01-01"), date("2025-03-31"))).toBe(90);
    expect(holdingAgeDays(date("2025-01-01"), date("2025-04-01"))).toBe(91);
    expect(holdingAgeDays(date("2025-01-01"), date("2025-04-02"))).toBe(92);
    expect(earlySuperstarsPhase(date("2025-01-01"), date("2025-03-31"))).toBe("PHASE_1");
    expect(earlySuperstarsPhase(date("2025-01-01"), date("2025-04-01"))).toBe("PHASE_2");
  });

  it("sets Momentum first review one calendar month after first buy and then 14-day cadence", () => {
    const first = momentum10Schedule(date("2025-01-10"), date("2025-01-20"));
    const later = momentum10Schedule(date("2025-01-10"), date("2025-02-25"));

    expect(first.gracePeriodEnd.toISOString().slice(0, 10)).toBe("2025-02-10");
    expect(first.nextScheduledReviewDate.toISOString().slice(0, 10)).toBe("2025-02-10");
    expect(later.nextScheduledReviewDate.toISOString().slice(0, 10)).toBe("2025-03-10");
  });
});
