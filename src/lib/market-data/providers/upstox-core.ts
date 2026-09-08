import { gunzipSync } from "node:zlib";

import type { MarketDataProvider, ProviderDailyCandle, ProviderInstrument, ProviderQuote } from "@/lib/market-data/types";

const upstoxApiBaseUrl = "https://api.upstox.com/v3";
const upstoxInstrumentMasterUrls = [
  "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz",
  "https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz",
];
const nseCashEquityTypes = new Set(["EQ", "BE", "SM", "ST", "BZ"]);
const bseCashEquityTypes = new Set(["A", "B", "E", "M", "MT", "P", "T", "X", "XT", "Z"]);

type UpstoxProviderOptions = {
  readonly token?: string;
  readonly fetch?: typeof fetch;
  readonly apiBaseUrl?: string;
  readonly instrumentMasterUrls?: readonly string[];
};

type UpstoxInstrument = {
  readonly segment?: unknown;
  readonly instrument_type?: unknown;
  readonly instrument_key?: unknown;
  readonly isin?: unknown;
  readonly trading_symbol?: unknown;
  readonly name?: unknown;
  readonly exchange?: unknown;
};

type UpstoxCandleResponse = {
  readonly data?: {
    readonly candles?: unknown;
  };
};

type UpstoxQuoteResponse = {
  readonly data?: Record<string, unknown>;
};

export function createUpstoxMarketDataProviderCore(options: UpstoxProviderOptions): MarketDataProvider {
  const token = options.token;
  const fetcher = options.fetch ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? upstoxApiBaseUrl;
  const instrumentMasterUrls = options.instrumentMasterUrls ?? upstoxInstrumentMasterUrls;

  return {
    name: "upstox",
    async fetchInstruments() {
      const rawResponses = await Promise.all(
        instrumentMasterUrls.map((url) => requestJson<unknown>(fetcher, url, { compressed: true, token: null })),
      );
      const instruments: ProviderInstrument[] = [];

      for (const raw of rawResponses) {
        if (!Array.isArray(raw)) {
          throw new Error("Upstox instrument master response was malformed.");
        }

        instruments.push(
          ...raw
            .map(parseCashEquity)
            .filter((instrument): instrument is ProviderInstrument => instrument !== null),
        );
      }

      return instruments;
    },
    async fetchHistoricalDailyCandles(input) {
      assertToken(token);
      const url = `${apiBaseUrl}/historical-candle/${encodeURIComponent(input.instrumentKey)}/days/1/${formatDate(input.endDate)}/${formatDate(input.startDate)}`;
      const payload = await requestJson<UpstoxCandleResponse>(fetcher, url, { compressed: false, token });
      const candles = payload.data?.candles;
      if (!Array.isArray(candles)) {
        throw new Error("Upstox historical candle response was malformed.");
      }

      return candles.map((candle) => parseDailyCandle(input.instrumentKey, candle)).sort(
        (left, right) => left.tradingDate.getTime() - right.tradingDate.getTime(),
      );
    },
    async fetchCurrentQuote(input) {
      assertToken(token);
      const url = new URL(`${apiBaseUrl}/market-quote/quotes`);
      url.searchParams.set("instrument_key", input.instrumentKey);
      const payload = await requestJson<UpstoxQuoteResponse>(fetcher, url, { compressed: false, token });
      const quote = firstRecordValue(payload.data);
      if (!quote) {
        throw new Error("Upstox quote response was empty.");
      }

      return parseQuote(input.instrumentKey, quote);
    },
  };
}

function assertToken(token: string | undefined): asserts token is string {
  if (!token) {
    throw new Error("Missing UPSTOX_ANALYTICS_TOKEN.");
  }
}

async function requestJson<T>(
  fetcher: typeof fetch,
  input: string | URL,
  options: { readonly compressed: boolean; readonly token: string | null },
): Promise<T> {
  const response = await fetcher(input, {
    headers: options.token ? { Authorization: `Bearer ${options.token}`, Accept: "application/json" } : { Accept: "application/json" },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Upstox authentication failed.");
  }

  if (response.status === 429) {
    throw new Error("Upstox rate limit exceeded.");
  }

  if (!response.ok) {
    throw new Error(`Upstox request failed with status ${response.status}.`);
  }

  try {
    const text = options.compressed ? await readCompressedJsonText(response) : await response.text();
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Upstox response was not valid JSON.");
  }
}

async function readCompressedJsonText(response: Response) {
  const body = Buffer.from(await response.arrayBuffer());
  try {
    return gunzipSync(body).toString("utf8");
  } catch {
    return body.toString("utf8");
  }
}

function parseCashEquity(raw: unknown): ProviderInstrument | null {
  if (!isRecord(raw)) return null;

  const segment = valueAsString(raw.segment);
  const instrumentType = valueAsString(raw.instrument_type);
  const instrumentKey = valueAsString(raw.instrument_key);
  const isin = valueAsString(raw.isin);
  const tradingSymbol = valueAsString(raw.trading_symbol);
  const name = valueAsString(raw.name);
  const exchange = valueAsString(raw.exchange);
  const parsedExchange = exchange === "NSE" || exchange === "BSE" ? exchange : null;

  if (
    (segment !== "NSE_EQ" && segment !== "BSE_EQ") ||
    !instrumentType ||
    !isCashEquityType(segment, instrumentType) ||
    !instrumentKey ||
    !isin ||
    !tradingSymbol ||
    !name ||
    isExcludedNonEquityName(name) ||
    !parsedExchange
  ) {
    return null;
  }

  return {
    exchange: parsedExchange,
    symbol: tradingSymbol,
    tradingSymbol,
    instrumentKey,
    name,
    isin,
    segment,
    instrumentType: instrumentType,
    active: true,
  };
}

function isCashEquityType(segment: string | null, instrumentType: string | null) {
  if (!instrumentType) return false;
  if (segment === "NSE_EQ" && !nseCashEquityTypes.has(instrumentType)) return false;
  if (segment === "BSE_EQ" && !bseCashEquityTypes.has(instrumentType)) return false;
  return true;
}

function isExcludedNonEquityName(name: string) {
  return /\b(ETF|GILT|MUTUAL FUND|NCD|DEBENTURE|BOND|SDL|TREASURY BILL|T-BILL)\b/i.test(name);
}

function parseDailyCandle(instrumentKey: string, raw: unknown): ProviderDailyCandle {
  if (!Array.isArray(raw) || raw.length < 6) {
    throw new Error("Upstox historical candle row was malformed.");
  }

  const [timestamp, open, high, low, close, volume] = raw;
  const tradingDate = parseTradingDate(valueAsString(timestamp));
  if (!tradingDate || !isFiniteNumber(open) || !isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close)) {
    throw new Error("Upstox historical candle row contained invalid OHLC data.");
  }

  return {
    instrumentKey,
    tradingDate,
    open: String(open),
    high: String(high),
    low: String(low),
    close: String(close),
    volume: BigInt(Math.trunc(Number(volume ?? 0))),
  };
}

function parseQuote(instrumentKey: string, raw: unknown): ProviderQuote {
  if (!isRecord(raw)) {
    throw new Error("Upstox quote response was malformed.");
  }

  const lastPrice = numberLike(raw.last_price ?? raw.lastPrice ?? raw.ltp);
  if (lastPrice === null) {
    throw new Error("Upstox quote response was missing last price.");
  }

  const ohlc = isRecord(raw.ohlc) ? raw.ohlc : {};
  const lastTradedAt = parseDate(valueAsString(raw.last_trade_time ?? raw.lastTradedAt ?? raw.timestamp));
  const previousClose = numberLike(ohlc.close ?? raw.previous_close ?? raw.previousClose);
  const volume = raw.volume === undefined || raw.volume === null ? null : BigInt(Math.trunc(Number(raw.volume)));

  return {
    instrumentKey,
    lastPrice,
    lastTradedAt,
    previousClose,
    volume,
  };
}

function firstRecordValue(input: Record<string, unknown> | undefined) {
  if (!input) return null;
  return Object.values(input).find(isRecord) ?? null;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(input: string | null) {
  if (!input) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTradingDate(input: string | null) {
  const datePart = input?.slice(0, 10);
  if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  return new Date(`${datePart}T00:00:00.000Z`);
}

function valueAsString(input: unknown) {
  return typeof input === "string" ? input.trim() : null;
}

function numberLike(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input)) return String(input);
  if (typeof input === "string" && input.trim() && Number.isFinite(Number(input))) return input.trim();
  return null;
}

function isFiniteNumber(input: unknown) {
  return typeof input === "number" && Number.isFinite(input);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
