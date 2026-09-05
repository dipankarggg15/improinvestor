import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const service = readFileSync(join(process.cwd(), "src/lib/portfolio/service.ts"), "utf8");

describe("portfolio persistence schema", () => {
  it("stores portfolio identity separately from immutable trades", () => {
    expect(schema).toContain("model Portfolio");
    expect(schema).toContain("model Trade");
    expect(schema).toContain("initialCapital Decimal");
    expect(schema).toContain("enum TradeSide");
  });

  it("links trades to strategy selections without making signals become positions", () => {
    expect(schema).toContain("strategyRunId               String?");
    expect(schema).toContain("strategyCandidateSnapshotId String?");
    expect(schema).toContain("strategyCandidateSnapshot   StrategyCandidateSnapshot?");
  });

  it("indexes portfolio ledger and strategy source lookups", () => {
    expect(schema).toContain("@@index([portfolioId, tradeDate])");
    expect(schema).toContain("@@index([strategyRunId])");
    expect(schema).toContain("@@index([strategyCandidateSnapshotId])");
  });
});

describe("portfolio service invariants", () => {
  it("guards cross-strategy and unselected-candidate linkage", () => {
    expect(service).toContain("Strategy run does not belong to the portfolio strategy.");
    expect(service).toContain("Strategy-sourced BUY must reference a selected candidate snapshot.");
    expect(service).toContain("Candidate snapshot does not match the selected company/instrument.");
  });
});
