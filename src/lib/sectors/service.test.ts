import { describe, expect, it } from "vitest";

import { analyzeSectorCandidates, parseSectorUniverse, sectorSlug } from "@/lib/sectors/service";
import type { SwingPrice } from "@/lib/swing-trading/service";

describe("sector analysis", () => {
  it("ranks broad outperformance above a weak sector", () => {
    const benchmark = prices(100, 0.001);
    const result = analyzeSectorCandidates([
      candidate("Strong A", "STRONGA", "Capital Goods", prices(100, 0.004)),
      candidate("Strong B", "STRONGB", "Capital Goods", prices(90, 0.0035)),
      candidate("Weak A", "WEAKA", "Media", prices(100, -0.001)),
      candidate("Weak B", "WEAKB", "Media", prices(110, -0.0015)),
    ], benchmark);

    expect(result.sectors[0]?.name).toBe("Capital Goods");
    expect(result.sectors[0]?.state).toBe("LEADING");
    expect(result.sectors[0]?.breadth50).toBe(100);
    expect(result.sectors[0]?.relative1M).toBeGreaterThan(0);
    expect(result.sectors.at(-1)?.state).toBe("LAGGING");
  });

  it("does not let the NIFTY 50 reference change sector score or status", () => {
    const candidates = [
      candidate("Alpha A", "ALPHAA", "Industrials", prices(100, 0.002)),
      candidate("Alpha B", "ALPHAB", "Industrials", prices(90, 0.0015)),
    ];
    const weakBenchmark = analyzeSectorCandidates(candidates, prices(100, -0.01)).sectors[0]!;
    const strongBenchmark = analyzeSectorCandidates(candidates, prices(100, 0.01)).sectors[0]!;

    expect(strongBenchmark.state).toBe(weakBenchmark.state);
    expect(strongBenchmark.score).toBe(weakBenchmark.score);
    expect(strongBenchmark.relative1M).not.toBe(weakBenchmark.relative1M);
  });

  it("creates stable route slugs", () => {
    expect(sectorSlug("Oil Gas & Consumable Fuels")).toMatch(/^oil-gas-and-consumable-fuels-[a-z0-9]+$/);
    expect(sectorSlug("IT - Software")).not.toBe(sectorSlug("IT-Software"));
  });

  it("defaults unknown universe values to the whole market", () => {
    expect(parseSectorUniverse("nifty500")).toBe("nifty500");
    expect(parseSectorUniverse("market")).toBe("market");
    expect(parseSectorUniverse("unknown")).toBe("market");
  });
});

function candidate(company: string, symbol: string, sector: string, history: readonly SwingPrice[]) {
  return { company, symbol, sector, instrumentId: symbol, prices: history };
}

function prices(start: number, dailyReturn: number): SwingPrice[] {
  let close = start;
  return Array.from({ length: 270 }, (_, index) => {
    const open = close;
    close *= 1 + dailyReturn;
    return {
      tradingDate: new Date(Date.UTC(2025, 0, 1 + index)),
      open,
      high: Math.max(open, close) * 1.01,
      low: Math.min(open, close) * 0.99,
      close,
      volume: 1_000_000,
    };
  });
}
