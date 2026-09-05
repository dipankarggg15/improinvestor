import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("Prisma market-data schema", () => {
  it("prevents duplicate daily candles for the same instrument and trading date", () => {
    expect(schema).toContain("@@unique([instrumentId, tradingDate])");
  });

  it("keeps exchange listings unique while allowing a company to have multiple instruments", () => {
    expect(schema).toContain("@@unique([exchange, symbol])");
    expect(schema).toContain("companyId     String");
    expect(schema).toContain("company       Company");
  });
});
