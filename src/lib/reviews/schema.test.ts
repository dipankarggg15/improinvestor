import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("review persistence schema", () => {
  it("stores immutable strategy reviews and per-position snapshots", () => {
    expect(schema).toContain("model StrategyReview");
    expect(schema).toContain("model StrategyReviewPositionSnapshot");
    expect(schema).toContain("comparisonUniverse          Json");
    expect(schema).toContain("filterResults               Json");
  });

  it("prevents accidental duplicate review runs", () => {
    expect(schema).toContain("@@unique([portfolioId, strategyVersionId, reviewDate, reviewType])");
  });

  it("supports structured recommendations, reasons, and trade linkage", () => {
    expect(schema).toContain("enum StrategyReviewRecommendation");
    expect(schema).toContain("enum StrategyReviewReason");
    expect(schema).toContain("strategyReviewPositionSnapshotId String?");
  });
});
