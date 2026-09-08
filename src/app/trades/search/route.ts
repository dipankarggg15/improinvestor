import { NextResponse } from "next/server";

import { requireOwner } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { decimal } from "@/lib/portfolio/accounting";
import { normalizeStockSearchText, rankStockSearchCandidates } from "@/lib/stocks/fuzzy-search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireOwner();

  const url = new URL(request.url);
  const side = url.searchParams.get("side") === "SELL" ? "SELL" : "BUY";
  const query = url.searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) return NextResponse.json({ results: [] });

  const results = side === "SELL"
    ? await searchOpenHoldings(query)
    : await searchEligibleInstruments(query);

  return NextResponse.json({ results });
}

async function searchEligibleInstruments(query: string) {
  const normalizedQuery = normalizeStockSearchText(query);
  if (normalizedQuery.length < 2) return [];
  const instruments = await prisma.instrument.findMany({
    where: { active: true, marketDataSource: "SYNTHETIC" },
    orderBy: [{ company: { name: "asc" } }, { exchange: "desc" }, { symbol: "asc" }],
    select: {
      id: true,
      companyId: true,
      exchange: true,
      symbol: true,
      company: { select: { name: true } },
    },
  });
  const byCompany = new Map<string, typeof instruments>();

  for (const instrument of instruments) {
    byCompany.set(instrument.companyId, [...(byCompany.get(instrument.companyId) ?? []), instrument]);
  }

  const canonical = [...byCompany.values()]
    .map((companyInstruments) => (
      companyInstruments.find((instrument) => instrument.exchange === "NSE")
      ?? companyInstruments.find((instrument) => instrument.exchange === "BSE")
      ?? companyInstruments[0]
    ))
    .filter((instrument): instrument is NonNullable<typeof instrument> => Boolean(instrument));

  return rankStockSearchCandidates(
    query,
    canonical.map((instrument) => ({
      companyId: instrument.companyId,
      instrumentId: instrument.id,
      companyName: instrument.company.name,
      symbol: instrument.symbol,
      exchange: instrument.exchange,
    })),
    20,
  )
    .map((instrument) => ({
      key: `${instrument.companyId}:${instrument.instrumentId}`,
      portfolioId: null,
      companyId: instrument.companyId,
      instrumentId: instrument.instrumentId,
      companyName: instrument.companyName,
      symbol: instrument.symbol,
      exchange: instrument.exchange,
    }));
}

async function searchOpenHoldings(query: string) {
  const normalizedQuery = normalizeStockSearchText(query);
  if (normalizedQuery.length < 2) return [];
  const episodes = await prisma.positionEpisode.findMany({
    where: { status: "OPEN" },
    orderBy: [{ openedAt: "asc" }, { createdAt: "asc" }],
    select: {
      portfolioId: true,
      companyId: true,
      instrumentId: true,
      company: { select: { name: true } },
      instrument: { select: { symbol: true, exchange: true } },
      strategyVersion: {
        select: {
          versionNumber: true,
          strategy: { select: { name: true } },
        },
      },
      trades: { select: { side: true, quantity: true } },
    },
  });

  const holdings = episodes
    .map((episode) => {
      const quantity = episode.trades.reduce(
        (sum, trade) => trade.side === "BUY" ? sum.plus(trade.quantity) : sum.minus(trade.quantity),
        decimal(0),
      );

      return {
        key: `${episode.portfolioId}:${episode.companyId}:${episode.instrumentId}`,
        portfolioId: episode.portfolioId,
        companyId: episode.companyId,
        instrumentId: episode.instrumentId,
        companyName: episode.company.name,
        symbol: episode.instrument.symbol,
        exchange: episode.instrument.exchange,
        availableQuantity: quantity.toString(),
        strategyLabel: episode.strategyVersion
          ? `${episode.strategyVersion.strategy.name} V${episode.strategyVersion.versionNumber}`
          : "Unassigned",
      };
    })
    .filter((episode) => decimal(episode.availableQuantity).gt(0));

  return rankStockSearchCandidates(query, holdings, 20);
}
