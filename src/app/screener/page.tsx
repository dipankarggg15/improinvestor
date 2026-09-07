import {
  isStockResearchSortKey,
  StockResearchTable,
  type StockResearchRow,
  type StockResearchSortKey,
} from "@/components/research/stock-research-table";
import {
  defaultScreenerFilters,
  runCustomReturnScreener,
  type ScreenerExclusionReason,
  type ScreenerResult,
  type ScreenerSortDirection,
  type ScreenerSortKey,
} from "@/lib/research/screener";
import { PrismaScreenerRepository } from "@/lib/research/prisma-screener-repository";
import { logSafeError } from "@/lib/logging/safe-error";

export const dynamic = "force-dynamic";

const crore = 10_000_000;
const defaultStartDate = "2025-03-03";
const defaultEndDate = "2025-12-31";

type ScreenerPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ScreenerPage({ searchParams }: ScreenerPageProps) {
  const params = await searchParams;
  const formValues = parseFormValues(params);
  const hasRun = getParam(params, "run") === "1";
  const sortBy = parseSortKey(getParam(params, "sortBy"));
  const sortDirection = parseSortDirection(getParam(params, "sortDirection"), sortBy);
  const validationError = validateDateRange(formValues.startDate, formValues.endDate);
  let result: ScreenerResult | null = null;

  if (hasRun && !validationError) {
    try {
      result = await runCustomReturnScreener(new PrismaScreenerRepository(), {
        startDate: toUtcDate(formValues.startDate),
        endDate: toUtcDate(formValues.endDate),
        filters: {
          minMarketCap: formValues.minMarketCapCr * crore,
          maxDebtToEquity: formValues.maxDebtToEquity,
          minAverageTradedValue: formValues.minAverageTradedValueCr * crore,
        },
        sortBy,
        sortDirection,
      });
    } catch (error) {
      logSafeError("Custom Return Screener failed", error);
      result = {
        ok: false,
        error:
          "Unable to run the screener. Check the development server logs for the sanitized database error, then verify DATABASE_URL, schema migrations, and seed data.",
        rows: [],
        exclusions: [],
      };
    }
  }

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl">
        <div className="mb-6 flex flex-col gap-2">
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="text-3xl font-semibold text-[var(--foreground)]">Custom Return Screener</h1>
          <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Uses fictional development seed data only. This is not real Indian-market data and
            should not be used for investment decisions.
          </p>
        </div>

        <form
          action="/screener"
          className="grid gap-4 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm md:grid-cols-2 xl:grid-cols-6"
        >
          <input name="run" type="hidden" value="1" />
          <Field label="Start Date" name="startDate" type="date" value={formValues.startDate} />
          <Field label="End Date" name="endDate" type="date" value={formValues.endDate} />
          <Field
            label="Minimum Market Cap"
            min="0"
            name="minMarketCapCr"
            step="1"
            suffix="Cr"
            type="number"
            value={String(formValues.minMarketCapCr)}
          />
          <Field
            label="Maximum Debt/Equity"
            min="0"
            name="maxDebtToEquity"
            step="0.01"
            type="number"
            value={String(formValues.maxDebtToEquity)}
          />
          <Field
            label="Minimum Avg Traded Value"
            min="0"
            name="minAverageTradedValueCr"
            step="0.1"
            suffix="Cr/day"
            type="number"
            value={String(formValues.minAverageTradedValueCr)}
          />
          <div className="flex items-end">
            <button
              className="h-11 w-full rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
              type="submit"
            >
              Run Screener
            </button>
          </div>
        </form>

        {validationError ? <StatusMessage tone="error">{validationError}</StatusMessage> : null}

        {!hasRun ? (
          <StatusMessage>
            Choose a date range and run the screener. Defaults are set to the fictional seed window.
          </StatusMessage>
        ) : null}

        {result ? (
          result.ok ? (
            <Results
              params={params}
              result={result}
              sortBy={sortBy}
              sortDirection={sortDirection}
            />
          ) : (
            <StatusMessage tone="error">{result.error}</StatusMessage>
          )
        ) : null}
      </div>
    </section>
  );
}

function Results({
  params,
  result,
  sortBy,
  sortDirection,
}: {
  readonly params: Record<string, string | string[] | undefined>;
  readonly result: Extract<ScreenerResult, { ok: true }>;
  readonly sortBy: ScreenerSortKey;
  readonly sortDirection: ScreenerSortDirection;
}) {
  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          {result.rows.length === 0
            ? "No matching stocks."
            : `${result.rows.length} matching stock${result.rows.length === 1 ? "" : "s"}.`}
        </p>
        {result.exclusions.length > 0 ? (
          <p className="text-sm text-[var(--muted)]">
            {result.exclusions.length} excluded for missing data or filters.
          </p>
        ) : null}
      </div>

      <StockResearchTable
        basePath="/screener"
        currentDirection={sortDirection}
        currentSort={toStockResearchSortKey(sortBy)}
        params={params}
        rows={result.rows.map(toStockResearchRow)}
      />

      {result.exclusions.length > 0 ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Excluded development records</h2>
          <ul className="mt-3 grid gap-2 text-sm text-[var(--muted)] md:grid-cols-2">
            {result.exclusions.map((exclusion) => (
              <li key={`${exclusion.companyId}-${exclusion.exchange}`}>
                {exclusion.companyName} ({exclusion.exchange}:{exclusion.symbol}) -{" "}
                {formatExclusionReason(exclusion.reason)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  name,
  suffix,
  type,
  value,
  min,
  step,
}: {
  readonly label: string;
  readonly name: string;
  readonly suffix?: string;
  readonly type: "date" | "number";
  readonly value: string;
  readonly min?: string;
  readonly step?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-[var(--foreground)]">
      <span>{label}</span>
      <span className="flex h-11 items-center rounded-md border border-[var(--border)] bg-white px-3 focus-within:border-[var(--accent)]">
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          defaultValue={value}
          min={min}
          name={name}
          step={step}
          type={type}
        />
        {suffix ? <span className="ml-2 text-xs text-[var(--muted)]">{suffix}</span> : null}
      </span>
    </label>
  );
}

function StatusMessage({
  children,
  tone = "info",
}: {
  readonly children: string;
  readonly tone?: "info" | "error";
}) {
  return (
    <div
      className={`mt-6 rounded-md border px-4 py-3 text-sm ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-[var(--border)] bg-[var(--panel)] text-[var(--muted)]"
      }`}
    >
      {children}
    </div>
  );
}

function parseFormValues(params: Record<string, string | string[] | undefined>) {
  return {
    startDate: getParam(params, "startDate") ?? defaultStartDate,
    endDate: getParam(params, "endDate") ?? defaultEndDate,
    minMarketCapCr: parsePositiveNumber(
      getParam(params, "minMarketCapCr"),
      defaultScreenerFilters.minMarketCap / crore,
    ),
    maxDebtToEquity: parsePositiveNumber(
      getParam(params, "maxDebtToEquity"),
      defaultScreenerFilters.maxDebtToEquity,
    ),
    minAverageTradedValueCr: parsePositiveNumber(
      getParam(params, "minAverageTradedValueCr"),
      defaultScreenerFilters.minAverageTradedValue / crore,
    ),
  };
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

function parsePositiveNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function validateDateRange(startDate: string, endDate: string) {
  if (!isValidDateInput(startDate) || !isValidDateInput(endDate)) {
    return "Enter valid start and end dates.";
  }

  if (toUtcDate(endDate) < toUtcDate(startDate)) {
    return "End date must be on or after start date.";
  }

  return null;
}

function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUtcDate(value).getTime());
}

function toUtcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseSortKey(value: string | undefined): ScreenerSortKey {
  return fromStockResearchSortKey(value) ?? "rank";
}

function parseSortDirection(value: string | undefined, sortBy: ScreenerSortKey): ScreenerSortDirection {
  if (value === "asc" || value === "desc") return value;
  return sortBy === "rank" || sortBy === "company" ? "asc" : "desc";
}

function formatExclusionReason(reason: ScreenerExclusionReason) {
  switch (reason) {
    case "missing_prices":
      return "missing or insufficient price data";
    case "missing_fundamentals":
      return "missing fundamentals";
    case "market_cap_below_minimum":
      return "market cap below minimum";
    case "debt_to_equity_above_maximum":
      return "debt/equity above maximum";
    case "liquidity_below_minimum":
      return "average traded value below minimum";
  }
}

function toStockResearchRow(row: Extract<ScreenerResult, { ok: true }>["rows"][number]): StockResearchRow {
  return {
    id: row.instrumentId,
    rank: row.rank,
    stockName: row.companyName,
    stockDetail: `${row.exchange}:${row.symbol}`,
    price: row.currentPrice,
    returnPercent: row.returnPercent,
    oneWeekReturnPercent: row.oneWeekReturnPercent,
    oneMonthReturnPercent: row.oneMonthReturnPercent,
    threeMonthReturnPercent: row.threeMonthReturnPercent,
    marketCap: row.marketCap,
    debtToEquity: row.debtToEquity,
    averageTradedValue: row.averageTradedValue,
    peRatio: row.peRatio,
  };
}

function toStockResearchSortKey(sortBy: ScreenerSortKey): StockResearchSortKey {
  if (sortBy === "company") return "stock";
  if (sortBy === "currentPrice") return "price";
  if (sortBy === "returnPercent") return "return";
  if (sortBy === "oneWeekReturnPercent") return "oneWeekReturn";
  if (sortBy === "oneMonthReturnPercent") return "oneMonthReturn";
  if (sortBy === "threeMonthReturnPercent") return "threeMonthReturn";
  if (sortBy === "symbol" || sortBy === "exchange") return "stock";
  return sortBy;
}

function fromStockResearchSortKey(value: string | undefined): ScreenerSortKey | null {
  if (!isStockResearchSortKey(value)) return null;
  if (value === "stock") return "company";
  if (value === "price") return "currentPrice";
  if (value === "return") return "returnPercent";
  if (value === "oneWeekReturn") return "oneWeekReturnPercent";
  if (value === "oneMonthReturn") return "oneMonthReturnPercent";
  if (value === "threeMonthReturn") return "threeMonthReturnPercent";
  return value;
}
