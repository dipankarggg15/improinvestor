import { gunzipSync } from "node:zlib";

import type { MarketDataProvider, ProviderDailyCandle, ProviderIndexInstrument, ProviderInstrument, ProviderQuote } from "@/lib/market-data/types";

const upstoxApiBaseUrl = "https://api.upstox.com/v3";
const upstoxInstrumentMasterUrls = [
  "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz",
  "https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz",
];
const upstoxIndexInstrumentMasterUrls = [
  "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz",
  "https://assets.upstox.com/market-quote/instruments/exchange/global.json.gz",
];
const nseCashEquityTypes = new Set(["EQ", "BE", "SM", "ST", "BZ"]);
const bseCashEquityTypes = new Set(["A", "B", "E", "M", "MT", "P", "T", "X", "XT", "Z"]);

type UpstoxProviderOptions = {
  readonly token?: string;
  readonly fetch?: typeof fetch;
  readonly apiBaseUrl?: string;
  readonly instrumentMasterUrls?: readonly string[];
  readonly indexInstrumentMasterUrls?: readonly string[];
};

type UpstoxCandleResponse = {
  readonly data?: {
    readonly candles?: unknown;
  };
};

type UpstoxQuoteResponse = {
  readonly data?: Record<string, unknown>;
};

type UpstoxOhlcResponse = {
  readonly data?: Record<string, unknown>;
};

export function createUpstoxMarketDataProviderCore(options: UpstoxProviderOptions): MarketDataProvider {
  const token = options.token;
  const fetcher = options.fetch ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? upstoxApiBaseUrl;
  const instrumentMasterUrls = options.instrumentMasterUrls ?? upstoxInstrumentMasterUrls;
  const indexInstrumentMasterUrls = options.indexInstrumentMasterUrls ?? upstoxIndexInstrumentMasterUrls;

  async function fetchCurrentQuotes(instrumentKeys: readonly string[]) {
    assertToken(token);
    if (instrumentKeys.length === 0) return [];
    if (instrumentKeys.length > 500) throw new Error("Upstox quote requests support at most 500 instruments.");
    const url = new URL(`${apiBaseUrl}/market-quote/quotes`);
    url.searchParams.set("instrument_key", instrumentKeys.join(","));
    const payload = await requestJson<UpstoxQuoteResponse>(fetcher, url, { compressed: false, token });
    const records = Object.values(payload.data ?? {}).filter(isRecord);
    return records.flatMap((record) => {
      const instrumentKey = valueAsString(record.instrument_token ?? record.instrument_key)
        ?? (instrumentKeys.length === 1 ? instrumentKeys[0] : null);
      return instrumentKey ? [parseQuote(instrumentKey, record)] : [];
    });
  }

  async function fetchPreviousDailyCandles(instrumentKeys: readonly string[], targetDate: Date) {
    assertToken(token);
    if (instrumentKeys.length === 0) return [];
    if (instrumentKeys.length > 500) throw new Error("Upstox OHLC requests support at most 500 instruments.");
    if (targetDate < indiaCalendarDate()) {
      const quotes = await fetchCurrentQuotes(instrumentKeys);
      return quotes.flatMap((quote) => quote.previousClose === null ? [] : [{
        instrumentKey: quote.instrumentKey,
        tradingDate: targetDate,
        open: quote.previousClose,
        high: quote.previousClose,
        low: quote.previousClose,
        close: quote.previousClose,
        volume: BigInt(0),
        closeOnly: true,
      }]);
    }
    const url = new URL(`${apiBaseUrl}/market-quote/ohlc`);
    url.searchParams.set("instrument_key", instrumentKeys.join(","));
    url.searchParams.set("interval", "1d");
    const payload = await requestJson<UpstoxOhlcResponse>(fetcher, url, { compressed: false, token });
    const records = Object.values(payload.data ?? {}).filter(isRecord);
    const completed = records.flatMap((record) => {
      const instrumentKey = valueAsString(record.instrument_token ?? record.instrument_key)
        ?? (instrumentKeys.length === 1 ? instrumentKeys[0] : null);
      const candidates = instrumentKey
        ? [record.prev_ohlc, record.live_ohlc]
            .map((ohlc) => parsePreviousDailyCandle(instrumentKey, ohlc))
            .filter((candle): candle is ProviderDailyCandle => candle !== null && candle.tradingDate <= targetDate)
            .sort((left, right) => right.tradingDate.getTime() - left.tradingDate.getTime())
        : [];
      const candle = candidates[0] ?? null;
      return candle ? [candle] : [];
    });
    const completedKeys = new Set(completed.map((candle) => candle.instrumentKey));
    const missingKeys = instrumentKeys.filter((instrumentKey) => !completedKeys.has(instrumentKey));
    if (missingKeys.length === 0) return completed;

    const quotes = await fetchCurrentQuotes(missingKeys);
    return completed.concat(quotes.flatMap((quote) => quote.previousClose === null ? [] : [{
      instrumentKey: quote.instrumentKey,
      tradingDate: targetDate,
      open: quote.previousClose,
      high: quote.previousClose,
      low: quote.previousClose,
      close: quote.previousClose,
      volume: BigInt(0),
      closeOnly: true,
    }]));
  }

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
    async fetchIndexInstruments() {
      const rawResponses = await Promise.all(
        indexInstrumentMasterUrls.map((url) => requestJson<unknown>(fetcher, url, { compressed: true, token: null })),
      );
      const indices: ProviderIndexInstrument[] = [];

      for (const raw of rawResponses) {
        if (!Array.isArray(raw)) throw new Error("Upstox index instrument master response was malformed.");
        indices.push(...raw.map(parseIndexInstrument).filter((instrument): instrument is ProviderIndexInstrument => instrument !== null));
      }

      return indices.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.name.localeCompare(right.name));
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
      const quote = (await fetchCurrentQuotes([input.instrumentKey]))[0];
      if (!quote) {
        throw new Error("Upstox quote response was empty.");
      }
      return quote;
    },
    async fetchCurrentQuotes(input) {
      return fetchCurrentQuotes(input.instrumentKeys);
    },
    async fetchPreviousDailyCandles(input) {
      return fetchPreviousDailyCandles(input.instrumentKeys, input.targetDate);
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
    const retryAfter = response.headers.get("retry-after");
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const retryAfterMs = Number.isFinite(seconds)
      ? Math.max(0, seconds * 1000)
      : retryAfter ? Math.max(0, Date.parse(retryAfter) - Date.now()) : 0;
    throw Object.assign(new Error("Upstox rate limit exceeded."), {
      retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : 0,
    });
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

function parseIndexInstrument(raw: unknown): ProviderIndexInstrument | null {
  if (!isRecord(raw)) return null;
  const segment = valueAsString(raw.segment);
  const exchange = valueAsString(raw.exchange);
  const name = valueAsString(raw.name);
  const tradingSymbol = valueAsString(raw.trading_symbol);
  const instrumentKey = valueAsString(raw.instrument_key);
  if (
    (segment !== "NSE_INDEX" && segment !== "GLOBAL_INDEX") ||
    (exchange !== "NSE" && exchange !== "GLOBAL") ||
    !name || !tradingSymbol || !instrumentKey
  ) return null;

  return {
    exchange,
    name,
    tradingSymbol,
    instrumentKey,
    segment,
    country: valueAsString(raw.country),
    latency: valueAsString(raw.latency),
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
  const normalizedHigh = Math.max(open, high, low, close);
  const normalizedLow = Math.min(open, high, low, close);

  return {
    instrumentKey,
    tradingDate,
    open: String(open),
    high: String(normalizedHigh),
    low: String(normalizedLow),
    close: String(close),
    volume: BigInt(Math.max(0, Math.trunc(Number(volume ?? 0)))),
  };
}

function parsePreviousDailyCandle(instrumentKey: string, raw: unknown): ProviderDailyCandle | null {
  if (!isRecord(raw)) return null;
  const open = numberLike(raw.open);
  const high = numberLike(raw.high);
  const low = numberLike(raw.low);
  const close = numberLike(raw.close);
  const timestamp = epochMilliseconds(raw.ts ?? raw.timestamp);
  if (open === null || high === null || low === null || close === null || timestamp === null) return null;

  const values = [Number(open), Number(high), Number(low), Number(close)];
  const tradingDate = indiaDateFromEpochMilliseconds(timestamp);
  const volumeNumber = Number(raw.volume ?? 0);
  return {
    instrumentKey,
    tradingDate,
    open,
    high: String(Math.max(...values)),
    low: String(Math.min(...values)),
    close,
    volume: BigInt(Number.isFinite(volumeNumber) ? Math.max(0, Math.trunc(volumeNumber)) : 0),
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
  const previousClose = numberLike(raw.prev_close_price ?? raw.previous_close ?? raw.previousClose ?? ohlc.close);
  const volume = raw.volume === undefined || raw.volume === null ? null : BigInt(Math.trunc(Number(raw.volume)));

  return {
    instrumentKey,
    lastPrice,
    lastTradedAt,
    previousClose,
    volume,
  };
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

function epochMilliseconds(input: unknown) {
  const value = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value < 10_000_000_000 ? value * 1000 : value;
}

function indiaDateFromEpochMilliseconds(timestamp: number) {
  const india = new Date(timestamp + 5.5 * 60 * 60 * 1000);
  return new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), india.getUTCDate()));
}

function indiaCalendarDate(now = new Date()) {
  const india = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), india.getUTCDate()));
}

function isFiniteNumber(input: unknown) {
  return typeof input === "number" && Number.isFinite(input);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
