import { NextResponse } from "next/server";

import { requireOwner } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { decimal } from "@/lib/portfolio/accounting";

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
  const instruments = await prisma.instrument.findMany({
    where: {
      active: true,
      OR: [
        { symbol: { contains: query, mode: "insensitive" } },
        { company: { name: { contains: query, mode: "insensitive" } } },
      ],
    },
    orderBy: [{ company: { name: "asc" } }, { exchange: "desc" }, { symbol: "asc" }],
    take: 50,
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

  return [...byCompany.values()]
    .map((companyInstruments) => (
      companyInstruments.find((instrument) => instrument.exchange === "NSE")
      ?? companyInstruments.find((instrument) => instrument.exchange === "BSE")
      ?? companyInstruments[0]
    ))
    .filter((instrument): instrument is NonNullable<typeof instrument> => Boolean(instrument))
    .slice(0, 20)
    .map((instrument) => ({
      key: `${instrument.companyId}:${instrument.id}`,
      portfolioId: null,
      companyId: instrument.companyId,
      instrumentId: instrument.id,
      companyName: instrument.company.name,
      symbol: instrument.symbol,
      exchange: instrument.exchange,
    }));
}

async function searchOpenHoldings(query: string) {
  const episodes = await prisma.positionEpisode.findMany({
    where: {
      status: "OPEN",
      OR: [
        { company: { name: { contains: query, mode: "insensitive" } } },
        { instrument: { symbol: { contains: query, mode: "insensitive" } } },
      ],
    },
    orderBy: [{ openedAt: "asc" }, { createdAt: "asc" }],
    take: 20,
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

  return episodes
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
}
