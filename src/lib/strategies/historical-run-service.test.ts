import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { nseMomentumV1Config } from "@/lib/strategies/config";
import { createEarlySuperstarsHistoricalRun } from "@/lib/strategies/historical-run-service";

describe("historical run version selection", () => {
  it("creates the run with the explicitly selected version", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "strategy-1",
      name: "NSE Momentum",
      versions: [{ id: "version-1", config: nseMomentumV1Config }],
    });
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "run-1", ...data }));
    const client = {
      strategy: { findUnique },
      historicalStrategyRun: { create },
    } as unknown as PrismaClient;

    await createEarlySuperstarsHistoricalRun({
      client,
      strategyId: "strategy-1",
      strategyVersionId: "version-1",
      requestedStartDate: new Date("2024-01-01T00:00:00.000Z"),
      requestedEndDate: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "strategy-1" },
      include: { versions: { where: { id: "version-1" }, take: 1 } },
    }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ strategyId: "strategy-1", strategyVersionId: "version-1" }),
    }));
  });

  it("rejects a selected version that does not belong to the strategy", async () => {
    const client = {
      strategy: { findUnique: vi.fn().mockResolvedValue({ id: "strategy-1", name: "NSE Momentum", versions: [] }) },
    } as unknown as PrismaClient;

    await expect(createEarlySuperstarsHistoricalRun({
      client,
      strategyId: "strategy-1",
      strategyVersionId: "another-strategy-version",
      requestedStartDate: new Date("2024-01-01T00:00:00.000Z"),
      requestedEndDate: new Date("2025-01-01T00:00:00.000Z"),
    })).rejects.toThrow("Selected strategy version does not belong to this strategy.");
  });
});
