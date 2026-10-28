import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CountRow = {
  synthetic_companies: bigint;
  synthetic_instruments: bigint;
  synthetic_daily_prices: bigint;
  synthetic_fundamentals: bigint;
  real_companies: bigint;
  real_instruments: bigint;
  real_daily_prices: bigint;
  real_fundamentals: bigint;
  synthetic_trades: bigint;
  synthetic_portfolios: bigint;
  strategy_runs_with_synthetic_candidates: bigint;
  historical_runs_with_synthetic_positions: bigint;
  reviews_with_synthetic_snapshots: bigint;
  return_experiments_with_synthetic_positions: bigint;
  counterfactual_experiments: bigint;
  mock_data_syncs: bigint;
};

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to delete dummy data while NODE_ENV=production.");
  }

  const before = await loadCounts();

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      delete from "CounterfactualExperiment";
    `);

    await tx.$executeRawUnsafe(`
      delete from "ReturnExperimentPosition" rep
      using "Company" c, "Instrument" i
      where rep."companyId" = c.id
        and rep."instrumentId" = i.id
        and (c."marketDataSource" = 'SYNTHETIC' or i."marketDataSource" = 'SYNTHETIC');
    `);

    await tx.$executeRawUnsafe(`
      delete from "ReturnExperiment" re
      where not exists (
        select 1 from "ReturnExperimentPosition" rep where rep."experimentId" = re.id
      );
    `);

    await tx.$executeRawUnsafe(`
      delete from "Trade" t
      using "Company" c, "Instrument" i
      where t."companyId" = c.id
        and t."instrumentId" = i.id
        and (c."marketDataSource" = 'SYNTHETIC' or i."marketDataSource" = 'SYNTHETIC');
    `);

    await tx.$executeRawUnsafe(`
      delete from "PositionEpisode" pe
      using "Company" c, "Instrument" i
      where pe."companyId" = c.id
        and pe."instrumentId" = i.id
        and (c."marketDataSource" = 'SYNTHETIC' or i."marketDataSource" = 'SYNTHETIC');
    `);

    await tx.$executeRawUnsafe(`
      delete from "StrategyReview" sr
      where exists (
        select 1
        from "StrategyReviewPositionSnapshot" snap
        join "Company" c on c.id = snap."companyId"
        join "Instrument" i on i.id = snap."instrumentId"
        where snap."reviewId" = sr.id
          and (c."marketDataSource" = 'SYNTHETIC' or i."marketDataSource" = 'SYNTHETIC')
      );
    `);

    await tx.$executeRawUnsafe(`
      delete from "Portfolio" p
      where p.name ilike '%synthetic%'
        and not exists (select 1 from "Trade" t where t."portfolioId" = p.id)
        and not exists (select 1 from "StrategyReview" sr where sr."portfolioId" = p.id)
        and not exists (select 1 from "PositionEpisode" pe where pe."portfolioId" = p.id);
    `);

    await tx.$executeRawUnsafe(`
      delete from "HistoricalStrategyRun" hsr
      where exists (
        select 1
        from "HistoricalStrategyPosition" hsp
        join "Company" c on c.id = hsp."companyId"
        join "Instrument" i on i.id = hsp."instrumentId"
        where hsp."runId" = hsr.id
          and (c."marketDataSource" = 'SYNTHETIC' or i."marketDataSource" = 'SYNTHETIC')
      );
    `);

    await tx.$executeRawUnsafe(`
      delete from "StrategyRun" sr
      where exists (
        select 1
        from "StrategyCandidateSnapshot" snap
        join "Company" c on c.id = snap."companyId"
        join "Instrument" i on i.id = snap."instrumentId"
        where snap."strategyRunId" = sr.id
          and (c."marketDataSource" = 'SYNTHETIC' or i."marketDataSource" = 'SYNTHETIC')
      );
    `);

    await tx.$executeRawUnsafe(`
      delete from "DataSync"
      where provider = 'mock'
         or "dataType" = 'synthetic_market';
    `);

    await tx.$executeRawUnsafe(`
      delete from "DailyPrice" dp
      using "Instrument" i
      where dp."instrumentId" = i.id
        and (dp."marketDataSource" = 'SYNTHETIC' or i."marketDataSource" = 'SYNTHETIC');
    `);

    await tx.$executeRawUnsafe(`
      delete from "CompanyFundamentals" cf
      using "Company" c
      where cf."companyId" = c.id
        and (cf."marketDataSource" = 'SYNTHETIC' or c."marketDataSource" = 'SYNTHETIC');
    `);

    await tx.$executeRawUnsafe(`
      delete from "Instrument"
      where "marketDataSource" = 'SYNTHETIC'
         or "companyId" in (select id from "Company" where "marketDataSource" = 'SYNTHETIC');
    `);

    await tx.$executeRawUnsafe(`
      delete from "Company"
      where "marketDataSource" = 'SYNTHETIC';
    `);
  }, { timeout: 120_000 });

  const after = await loadCounts();

  console.log(JSON.stringify({
    before: stringifyBigInts(before),
    after: stringifyBigInts(after),
  }, null, 2));
}

async function loadCounts() {
  const [counts] = await prisma.$queryRaw<CountRow[]>`
    select
      (select count(*) from "Company" where "marketDataSource" = 'SYNTHETIC')::bigint as synthetic_companies,
      (select count(*) from "Instrument" where "marketDataSource" = 'SYNTHETIC')::bigint as synthetic_instruments,
      (select count(*) from "DailyPrice" where "marketDataSource" = 'SYNTHETIC')::bigint as synthetic_daily_prices,
      (select count(*) from "CompanyFundamentals" where "marketDataSource" = 'SYNTHETIC')::bigint as synthetic_fundamentals,
      (select count(*) from "Company" where "marketDataSource" = 'UPSTOX_REAL')::bigint as real_companies,
      (select count(*) from "Instrument" where "marketDataSource" = 'UPSTOX_REAL')::bigint as real_instruments,
      (select count(*) from "DailyPrice" where "marketDataSource" = 'UPSTOX_REAL')::bigint as real_daily_prices,
      (select count(*) from "CompanyFundamentals" where "marketDataSource" = 'UPSTOX_REAL')::bigint as real_fundamentals,
      (
        select count(*)
        from "Trade" t
        join "Company" c on c.id = t."companyId"
        join "Instrument" i on i.id = t."instrumentId"
        where c."marketDataSource" = 'SYNTHETIC' or i."marketDataSource" = 'SYNTHETIC'
      )::bigint as synthetic_trades,
      (select count(*) from "Portfolio" where name ilike '%synthetic%')::bigint as synthetic_portfolios,
      (
        select count(distinct sr.id)
        from "StrategyRun" sr
        join "StrategyCandidateSnapshot" snap on snap."strategyRunId" = sr.id
        join "Company" c on c.id = snap."companyId"
        join "Instrument" i on i.id = snap."instrumentId"
        where c."marketDataSource" = 'SYNTHETIC' or i."marketDataSource" = 'SYNTHETIC'
      )::bigint as strategy_runs_with_synthetic_candidates,
      (
        select count(distinct hsr.id)
        from "HistoricalStrategyRun" hsr
        join "HistoricalStrategyPosition" hsp on hsp."runId" = hsr.id
        join "Company" c on c.id = hsp."companyId"
        join "Instrument" i on i.id = hsp."instrumentId"
        where c."marketDataSource" = 'SYNTHETIC' or i."marketDataSource" = 'SYNTHETIC'
      )::bigint as historical_runs_with_synthetic_positions,
      (
        select count(distinct sr.id)
        from "StrategyReview" sr
        join "StrategyReviewPositionSnapshot" snap on snap."reviewId" = sr.id
        join "Company" c on c.id = snap."companyId"
        join "Instrument" i on i.id = snap."instrumentId"
        where c."marketDataSource" = 'SYNTHETIC' or i."marketDataSource" = 'SYNTHETIC'
      )::bigint as reviews_with_synthetic_snapshots,
      (
        select count(distinct re.id)
        from "ReturnExperiment" re
        join "ReturnExperimentPosition" rep on rep."experimentId" = re.id
        join "Company" c on c.id = rep."companyId"
        join "Instrument" i on i.id = rep."instrumentId"
        where c."marketDataSource" = 'SYNTHETIC' or i."marketDataSource" = 'SYNTHETIC'
      )::bigint as return_experiments_with_synthetic_positions,
      (select count(*) from "CounterfactualExperiment")::bigint as counterfactual_experiments,
      (select count(*) from "DataSync" where provider = 'mock' or "dataType" = 'synthetic_market')::bigint as mock_data_syncs
  `;
  return counts;
}

function stringifyBigInts(input: CountRow | undefined) {
  if (!input) return null;
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      typeof value === "bigint" ? value.toString() : value,
    ]),
  );
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
