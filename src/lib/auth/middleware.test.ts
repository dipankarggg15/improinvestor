import { describe, expect, it } from "vitest";

import { isProtectedPath } from "@/lib/auth/policy";

describe("isProtectedPath", () => {
  it("protects the private application routes and descendants", () => {
    expect(isProtectedPath("/")).toBe(true);
    expect(isProtectedPath("/portfolio")).toBe(true);
    expect(isProtectedPath("/portfolio/example")).toBe(true);
    expect(isProtectedPath("/strategies/example/runs/run")).toBe(true);
    expect(isProtectedPath("/analytics/exits")).toBe(true);
    expect(isProtectedPath("/research/counterfactuals")).toBe(true);
  });

  it("leaves the login route public", () => {
    expect(isProtectedPath("/login")).toBe(false);
  });
});
