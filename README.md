# ImproInvestor

ImproInvestor is a private, single-owner Indian-equities research workspace. It combines stored Upstox market history, momentum discovery, immutable strategy versions, automated historical simulations, counterfactual research, a manual trade ledger, portfolio valuation, and exit analytics.

The application is a research and record-keeping tool. It does not place broker orders or automatically turn strategy signals into trades.

## Product Areas

- **Discover**: current or historical NSE momentum rankings, multi-touch support-zone swing setups, interactive charts for every stored instrument, a custom historical screener, and saved return studies.
- **Strategies**: immutable strategy versions, historical simulations, stored assumptions, positions, event logs, and equity history.
- **Counterfactual Lab**: parameter experiments against the isolated synthetic development dataset.
- **Portfolio**: manually recorded BUY/SELL trades, open and closed positions, reviews, and performance analytics.
- **Market data**: Upstox instrument and EOD candle ingestion with explicit `UPSTOX_REAL` source labels.

Historical simulation results currently use stored, unadjusted daily prices. Each run records its assumptions and limitations, including missing corporate actions, possible survivorship bias, execution-price assumptions, and excluded trading costs or taxes. Treat results as research evidence, not expected future returns.

## Stack

- Next.js App Router, React, TypeScript, and Tailwind CSS
- PostgreSQL and Prisma ORM
- Supabase Auth with a single-owner email allowlist
- Vitest and ESLint

## Local Setup

Install dependencies and copy the environment template:

```bash
npm install
cp .env.example .env
```

Required database variables:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@TRANSACTION-POOLER-HOST:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://USER:PASSWORD@DIRECT-HOST:5432/postgres"
```

Required authentication variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
OWNER_EMAIL=
```

Real-market ingestion uses:

```bash
UPSTOX_ANALYTICS_TOKEN=
```

`LOCAL_AUTH_BYPASS=true` may be used only in non-production local development. Never expose a Supabase service-role key through a `NEXT_PUBLIC_*` variable, and never commit `.env` files.

Generate Prisma Client, apply migrations, seed strategy definitions, and start the app:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run seed:strategies
npm run dev
```

The local app normally runs at [http://localhost:3000](http://localhost:3000).

## Market Data

Import or incrementally update stored Upstox instruments and daily candles with:

```bash
npm run sync:upstox
```

Enrich every stored Upstox company with the sector returned by the Upstox Company Profile API. Existing sectors are cached, so normal runs request only companies that still need classification:

```bash
npm run sync:sectors
```

Use `npm run sync:sectors -- --refresh=true` for an occasional full refresh. The older Nifty 500-only fallback remains available as `npm run sync:sectors:nifty500`.

Validate the imported real-market dataset with:

```bash
npm run validate:real-market
```

The project still contains a deterministic synthetic dataset for isolated development and legacy counterfactual tests. Rebuilding it is destructive to synthetic rows and is guarded against production use:

```bash
npm run seed:market
```

Do not mix synthetic and real records in a production database. Use `npm run cleanup:dummy-data` when completing a real-data migration, after reviewing that script's scope.

## Strategy Research

Active strategies are seeded with:

```bash
npm run seed:strategies
```

Strategy versions are immutable once used. Historical simulations store the exact version, requested and effective dates, portfolio statistics, position history, decision events, daily equity, assumptions, and limitations used for the result.

A strategy signal is not an executed trade. Trades enter the portfolio ledger only after a user records them explicitly.

## Portfolio Accounting

- BUY cash impact is `quantity × price + fees`.
- SELL cash impact is `quantity × price - fees`.
- BUY fees are included in weighted-average acquisition cost.
- SELL fees reduce realized proceeds.
- Positions are derived from the immutable trade ledger.
- Short selling, overselling, leverage, and negative cash are rejected.
- Review recommendations never create trades automatically.

## Verification

Run the normal local quality checks before committing:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Additional data and strategy checks are available through:

```bash
npm run verify:market
npm run verify:strategies
npm run validate:upstox
npm run validate:upstox-sample
```

## Privacy and Deployment

Protected pages and APIs require a Supabase user whose email matches `OWNER_EMAIL`. Durable Server Actions also apply the shared owner guard before writing data. Vercel Deployment Protection can provide an additional outer layer, but it should not replace application authentication.
