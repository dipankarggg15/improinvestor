import { describe, expect, it, vi } from "vitest";

import { fetchUpstoxCompanyProfile, parseUpstoxCompanyProfile } from "@/lib/sectors/upstox-profile";

describe("Upstox company profiles", () => {
  it("parses the documented sector response", () => {
    expect(parseUpstoxCompanyProfile({
      status: "success",
      data: { company_profile: "A listed company.", sector: "Refineries" },
    })).toEqual({ companyProfile: "A listed company.", sector: "Refineries" });
  });

  it("rejects a successful response without a sector", () => {
    expect(() => parseUpstoxCompanyProfile({ status: "success", data: {} })).toThrow(/sector/);
  });

  it("requests the profile by encoded ISIN with authentication", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      status: "success", data: { company_profile: "Profile", sector: "Banks" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(fetchUpstoxCompanyProfile({
      isin: "INE002A01018", token: "secret", fetch: fetcher as typeof fetch, baseUrl: "https://example.test/fundamentals",
    })).resolves.toEqual({ companyProfile: "Profile", sector: "Banks" });
    expect(fetcher).toHaveBeenCalledWith("https://example.test/fundamentals/INE002A01018/profile", {
      headers: { Accept: "application/json", Authorization: "Bearer secret" },
    });
  });
});
