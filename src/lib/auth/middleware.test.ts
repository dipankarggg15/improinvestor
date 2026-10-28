import { describe, expect, it } from "vitest";

import { isProtectedPath } from "@/lib/auth/policy";

describe("isProtectedPath", () => {
  it("protects the private application routes and descendants", () => {
    expect(isProtectedPath("/")).toBe(true);
    expect(isProtectedPath("/portfolio")).toBe(true);
    expect(isProtectedPath("/portfolio/example")).toBe(true);
    expect(isProtectedPath("/trades/search")).toBe(true);
    expect(isProtectedPath("/finding-momentum")).toBe(true);
    expect(isProtectedPath("/swing-setups")).toBe(true);
    expect(isProtectedPath("/watchlists/example")).toBe(true);
    expect(isProtectedPath("/charts/NSE/RELIANCE")).toBe(true);
    expect(isProtectedPath("/strategies/example/runs/run")).toBe(true);
    expect(isProtectedPath("/analytics/exits")).toBe(true);
    expect(isProtectedPath("/research/counterfactuals")).toBe(true);
  });

  it("leaves authentication and recovery routes public", () => {
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/forgot-password")).toBe(false);
    expect(isProtectedPath("/reset-password")).toBe(false);
    expect(isProtectedPath("/auth/callback")).toBe(false);
  });
});
