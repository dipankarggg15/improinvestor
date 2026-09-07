import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { reconstructPositionEpisodes, type EpisodeTrade, type ReviewSnapshotReference } from "@/lib/exits/episodes";

const baseTrade = {
  portfolioId: "portfolio-1",
  companyId: "company-1",
  instrumentId: "instrument-1",
  fees: "10",
  strategyRunId: null,
  strategyCandidateSnapshotId: null,
  strategyReviewPositionSnapshotId: null,
};
const strategyIdByPortfolioId = new Map([["portfolio-1", "strategy-1"]]);

describe("reconstructPositionEpisodes", () => {
  it("keeps partial sells open and closes only when quantity reaches zero", () => {
    const episodes = reconstructPositionEpisodes({
      strategyIdByPortfolioId,
      trades: [
        trade("buy-1", "BUY", "2025-01-01", "10", "100"),
        trade("buy-2", "BUY", "2025-01-10", "5", "120"),
        trade("sell-1", "SELL", "2025-02-01", "4", "130"),
        trade("sell-2", "SELL", "2025-03-01", "11", "150"),
      ],
    });

    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.status).toBe("CLOSED");
    expect(episodes[0]?.trades.map((item) => item.id)).toEqual(["buy-1", "buy-2", "sell-1", "sell-2"]);
    expect(episodes[0]?.exitSnapshot?.finalSellTradeId).toBe("sell-2");
    expect(episodes[0]?.exitSnapshot?.quantityClosedByFinalTrade.toString()).toBe("11");
  });

  it("opens a new episode after a full closure and later buy", () => {
    const episodes = reconstructPositionEpisodes({
      strategyIdByPortfolioId,
      trades: [
        trade("buy-1", "BUY", "2025-01-01", "5", "100"),
        trade("sell-1", "SELL", "2025-02-01", "5", "110"),
        trade("buy-2", "BUY", "2025-03-01", "3", "90"),
      ],
    });

    expect(episodes).toHaveLength(2);
    expect(episodes.map((episode) => episode.status)).toEqual(["CLOSED", "OPEN"]);
    expect(episodes[1]?.firstBuyTradeId).toBe("buy-2");
  });

  it("assigns strategy version from the first buy and keeps it for the continuous episode", () => {
    const episodes = reconstructPositionEpisodes({
      strategyIdByPortfolioId,
      trades: [
        { ...trade("buy-1", "BUY", "2025-01-01", "5", "100"), strategyVersionId: "version-1" },
        { ...trade("buy-2", "BUY", "2025-01-10", "3", "120"), strategyVersionId: "version-2" },
        trade("sell-1", "SELL", "2025-02-01", "4", "130"),
      ],
    });

    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.status).toBe("OPEN");
    expect(episodes[0]?.strategyVersionId).toBe("version-1");
    expect(episodes[0]?.entrySnapshot).toMatchObject({ strategyVersionId: "version-1" });
  });

  it("keeps later episodes independently attributable after full closure", () => {
    const episodes = reconstructPositionEpisodes({
      strategyIdByPortfolioId,
      trades: [
        { ...trade("buy-1", "BUY", "2025-01-01", "5", "100"), strategyVersionId: "version-1" },
        trade("sell-1", "SELL", "2025-02-01", "5", "110"),
        { ...trade("buy-2", "BUY", "2025-03-01", "3", "90"), strategyVersionId: "version-2" },
      ],
    });

    expect(episodes.map((episode) => episode.strategyVersionId)).toEqual(["version-1", "version-2"]);
  });

  it("preserves review recommendation evidence separately from execution", () => {
    const reviewSnapshotsById = new Map<string, ReviewSnapshotReference>([
      [
        "review-snapshot-1",
        {
          id: "review-snapshot-1",
          reviewDate: day("2025-02-01"),
          priceAtReview: new Prisma.Decimal("125"),
          reasonCodes: ["SELL_CORE_QUALIFICATION_FAILED"],
          strategyVersionId: "version-1",
        },
      ],
    ]);
    const episodes = reconstructPositionEpisodes({
      strategyIdByPortfolioId,
      reviewSnapshotsById,
      trades: [
        trade("buy-1", "BUY", "2025-01-01", "5", "100"),
        {
          ...trade("sell-1", "SELL", "2025-02-05", "5", "118"),
          strategyReviewPositionSnapshotId: "review-snapshot-1",
        },
      ],
    });

    expect(episodes[0]?.exitSnapshot?.exitSource).toBe("REVIEW_RECOMMENDATION");
    expect(episodes[0]?.exitSnapshot?.recommendationDate).toEqual(day("2025-02-01"));
    expect(episodes[0]?.exitSnapshot?.recommendationPrice?.toString()).toBe("125");
    expect(episodes[0]?.exitSnapshot?.executionDelayDays).toBe(4);
    expect(episodes[0]?.exitSnapshot?.recommendationReasons).toEqual(["SELL_CORE_QUALIFICATION_FAILED"]);
  });

  it("marks unlinked exits as manual and rejects oversells", () => {
    const manual = reconstructPositionEpisodes({
      strategyIdByPortfolioId,
      trades: [trade("buy-1", "BUY", "2025-01-01", "5", "100"), trade("sell-1", "SELL", "2025-02-01", "5", "110")],
    });
    expect(manual[0]?.exitSnapshot?.exitSource).toBe("MANUAL");

    expect(() =>
      reconstructPositionEpisodes({
        strategyIdByPortfolioId,
        trades: [trade("buy-1", "BUY", "2025-01-01", "5", "100"), trade("sell-1", "SELL", "2025-02-01", "6", "110")],
      }),
    ).toThrow("SELL quantity exceeds");
  });
});

function trade(id: string, side: "BUY" | "SELL", tradeDate: string, quantity: string, price: string): EpisodeTrade {
  return {
    ...baseTrade,
    id,
    side,
    tradeDate: day(tradeDate),
    quantity,
    price,
  };
}

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
