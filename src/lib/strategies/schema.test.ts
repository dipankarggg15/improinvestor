import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("strategy persistence schema", () => {
  it("stores strategy identity separately from immutable versions", () => {
    expect(schema).toContain("model Strategy");
    expect(schema).toContain("model StrategyVersion");
    expect(schema).toContain("@@unique([strategyId, versionNumber])");
    expect(schema).toContain("config        Json");
  });

  it("prevents accidental duplicate strategy runs for the same version/date", () => {
    expect(schema).toContain("@@unique([strategyVersionId, runDate])");
  });

  it("persists candidate decision-time snapshots and failure reason codes", () => {
    expect(schema).toContain("model StrategyCandidateSnapshot");
    expect(schema).toContain("failureReasons");
    expect(schema).toContain("decisionMetrics        Json");
    expect(schema).toContain("@@unique([strategyRunId, companyId])");
  });
});
