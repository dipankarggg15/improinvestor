import { describe, expect, it } from "vitest";

import { isOwnerEmail } from "@/lib/auth/policy";

describe("isOwnerEmail", () => {
  it("accepts only the configured owner email", () => {
    expect(isOwnerEmail("owner@example.com", "owner@example.com")).toBe(true);
    expect(isOwnerEmail("OWNER@example.com", "owner@example.com")).toBe(true);
    expect(isOwnerEmail("other@example.com", "owner@example.com")).toBe(false);
  });

  it("rejects missing emails and missing owner configuration", () => {
    expect(isOwnerEmail(null, "owner@example.com")).toBe(false);
    expect(isOwnerEmail("owner@example.com", "")).toBe(false);
  });
});
