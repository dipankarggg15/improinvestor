import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const actionFiles = [
  "src/app/strategies/actions.ts",
  "src/app/reviews/actions.ts",
  "src/app/portfolio/actions.ts",
  "src/app/analytics/exits/actions.ts",
  "src/app/research/counterfactuals/actions.ts",
] as const;

describe("Server Action authorization guards", () => {
  it("keeps every mutation action file behind requireOwner", () => {
    for (const file of actionFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toContain("requireOwner");
      expect(source).toMatch(/await requireOwner\(\)/);
    }
  });
});
