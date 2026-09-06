import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { getStrategyEvidence, type StrategyEvidenceProfile } from "@/lib/analytics/evidence";

type QueryEvent = {
  readonly query: string;
  readonly params: string;
  readonly duration: number;
  readonly target: string;
};

const client = new PrismaClient({
  log: [{ emit: "event", level: "query" }],
});

const queries: QueryEvent[] = [];
client.$on("query", (event) => {
  queries.push(event);
});

function createProfile(): StrategyEvidenceProfile {
  return {
    invocations: 0,
    dailyPriceRows: 0,
    instrumentIds: 0,
    dateRange: { startDate: null, endDate: null },
    equityCalculationMs: 0,
    timings: [],
  };
}

function summarizeQueries() {
  const grouped = new Map<string, { count: number; duration: number }>();
  for (const query of queries) {
    const key = query.query.replace(/\s+/g, " ").trim().slice(0, 180);
    const existing = grouped.get(key) ?? { count: 0, duration: 0 };
    existing.count += 1;
    existing.duration += query.duration;
    grouped.set(key, existing);
  }

  return [...grouped.entries()]
    .map(([query, stats]) => ({ query, ...stats }))
    .sort((left, right) => right.duration - left.duration)
    .slice(0, 10);
}

async function main() {
  const startedAt = performance.now();
  const profile = createProfile();
  await getStrategyEvidence(client, { profile });
  const totalMs = performance.now() - startedAt;
  const dbTimeMs = queries.reduce((sum, query) => sum + query.duration, 0);
  const serviceTimings = [...profile.timings]
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 5);

  console.log(JSON.stringify({
    totalMs: Math.round(totalMs),
    queryCount: queries.length,
    dbTimeMs: Math.round(dbTimeMs),
    getStrategyEvidence: {
      invocations: profile.invocations,
      durationMs: Math.round(totalMs),
      dailyPriceRows: profile.dailyPriceRows,
      instrumentsFetched: profile.instrumentIds,
      dateRange: {
        startDate: profile.dateRange.startDate?.toISOString().slice(0, 10) ?? null,
        endDate: profile.dateRange.endDate?.toISOString().slice(0, 10) ?? null,
      },
      equityCalculationMs: Math.round(profile.equityCalculationMs),
    },
    topServices: serviceTimings.map((timing) => ({
      name: timing.name,
      durationMs: Math.round(timing.durationMs),
      rows: timing.rows,
    })),
    topQueries: summarizeQueries(),
  }, null, 2));
}

main()
  .finally(async () => {
    await client.$disconnect();
  });
