import { describe, expect, it, vi } from "vitest";

import { ProcessResultCache } from "@/lib/cache/process-result-cache";

describe("ProcessResultCache", () => {
  it("reuses a completed calculation for the same key", async () => {
    const cache = new ProcessResultCache<number>(2);
    const calculate = vi.fn(async () => 42);

    const first = await cache.getOrCreate("same-inputs", calculate);
    const second = await cache.getOrCreate("same-inputs", calculate);

    expect(first.reused).toBe(false);
    expect(second).toEqual({ ...first, reused: true });
    expect(calculate).toHaveBeenCalledTimes(1);
  });

  it("shares an in-flight calculation between simultaneous requests", async () => {
    const cache = new ProcessResultCache<number>(2);
    const calculate = vi.fn(async () => 7);

    const [first, second] = await Promise.all([
      cache.getOrCreate("same-inputs", calculate),
      cache.getOrCreate("same-inputs", calculate),
    ]);

    expect(first.value).toBe(7);
    expect(second.value).toBe(7);
    expect(second.reused).toBe(true);
    expect(calculate).toHaveBeenCalledTimes(1);
  });

  it("does not retain failed calculations", async () => {
    const cache = new ProcessResultCache<number>(2);
    const calculate = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(9);

    await expect(cache.getOrCreate("retryable", calculate)).rejects.toThrow("temporary failure");
    await expect(cache.getOrCreate("retryable", calculate)).resolves.toMatchObject({ value: 9, reused: false });
    expect(calculate).toHaveBeenCalledTimes(2);
  });
});
