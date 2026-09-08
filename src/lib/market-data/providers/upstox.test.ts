import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { createUpstoxMarketDataProviderCore } from "@/lib/market-data/providers/upstox-core";

describe("createUpstoxMarketDataProvider", () => {
  it("filters the Upstox instrument masters to NSE and BSE cash equities", async () => {
    const requests: string[] = [];
    const provider = createUpstoxMarketDataProviderCore({
      fetch: async (input) => {
        requests.push(String(input));
        return gzipJsonResponse(String(input).includes("BSE")
          ? [
              {
                segment: "BSE_EQ",
                instrument_type: "A",
                instrument_key: "BSE_EQ|INE002A01018",
                isin: "INE002A01018",
                trading_symbol: "500325",
                name: "Reliance Industries Limited",
                exchange: "BSE",
              },
            ]
          : [
              {
                segment: "NSE_EQ",
                instrument_type: "EQ",
                instrument_key: "NSE_EQ|INE002A01018",
                isin: "INE002A01018",
                trading_symbol: "RELIANCE",
                name: "Reliance Industries Limited",
                exchange: "NSE",
              },
              {
                segment: "NSE_FO",
                instrument_type: "FUT",
                instrument_key: "NSE_FO|12345",
                isin: "INE002A01018",
                trading_symbol: "RELIANCE",
                name: "Reliance Industries Limited",
                exchange: "NSE",
              },
            ]);
      },
      instrumentMasterUrls: ["https://assets.example.test/NSE.json.gz", "https://assets.example.test/BSE.json.gz"],
      token: "test-token",
    });

    await expect(provider.fetchInstruments()).resolves.toEqual([
      {
        exchange: "NSE",
        symbol: "RELIANCE",
        tradingSymbol: "RELIANCE",
        instrumentKey: "NSE_EQ|INE002A01018",
        name: "Reliance Industries Limited",
        isin: "INE002A01018",
        segment: "NSE_EQ",
        instrumentType: "EQ",
        active: true,
      },
      {
        exchange: "BSE",
        symbol: "500325",
        tradingSymbol: "500325",
        instrumentKey: "BSE_EQ|INE002A01018",
        name: "Reliance Industries Limited",
        isin: "INE002A01018",
        segment: "BSE_EQ",
        instrumentType: "A",
        active: true,
      },
    ]);
    expect(requests).toEqual(["https://assets.example.test/NSE.json.gz", "https://assets.example.test/BSE.json.gz"]);
  });

  it("normalizes Upstox daily historical candles", async () => {
    const requests: string[] = [];
    const headers: Record<string, string>[] = [];
    const provider = createUpstoxMarketDataProviderCore({
      apiBaseUrl: "https://api.example.test/v3",
      fetch: async (input, init) => {
        requests.push(String(input));
        headers.push(init?.headers as Record<string, string>);
        return jsonResponse({
          data: {
            candles: [
              ["2026-09-05T00:00:00+05:30", 1400.5, 1425.2, 1395, 1410.75, 123456],
              ["2026-09-04T00:00:00+05:30", 1380, 1412, 1376.4, 1401.1, 98765],
            ],
          },
        });
      },
      token: "secret-token",
    });

    const candles = await provider.fetchHistoricalDailyCandles({
      instrumentKey: "NSE_EQ|INE002A01018",
      startDate: new Date("2026-09-01T00:00:00Z"),
      endDate: new Date("2026-09-05T00:00:00Z"),
    });

    expect(requests).toEqual([
      "https://api.example.test/v3/historical-candle/NSE_EQ%7CINE002A01018/days/1/2026-09-05/2026-09-01",
    ]);
    expect(headers[0]?.Authorization).toBe("Bearer secret-token");
    expect(candles.map((candle) => ({
      instrumentKey: candle.instrumentKey,
      date: candle.tradingDate.toISOString().slice(0, 10),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume.toString(),
    }))).toEqual([
      {
        instrumentKey: "NSE_EQ|INE002A01018",
        date: "2026-09-04",
        open: "1380",
        high: "1412",
        low: "1376.4",
        close: "1401.1",
        volume: "98765",
      },
      {
        instrumentKey: "NSE_EQ|INE002A01018",
        date: "2026-09-05",
        open: "1400.5",
        high: "1425.2",
        low: "1395",
        close: "1410.75",
        volume: "123456",
      },
    ]);
  });

  it("normalizes Upstox current quotes separately from EOD candles", async () => {
    const provider = createUpstoxMarketDataProviderCore({
      apiBaseUrl: "https://api.example.test/v3",
      fetch: async () => jsonResponse({
        data: {
          "NSE_EQ:RELIANCE": {
            last_price: 1420.25,
            last_trade_time: "2026-09-08T15:29:59+05:30",
            volume: 456789,
            ohlc: { close: 1410.75 },
          },
        },
      }),
      token: "secret-token",
    });

    await expect(provider.fetchCurrentQuote({ instrumentKey: "NSE_EQ|INE002A01018" })).resolves.toEqual({
      instrumentKey: "NSE_EQ|INE002A01018",
      lastPrice: "1420.25",
      lastTradedAt: new Date("2026-09-08T15:29:59+05:30"),
      previousClose: "1410.75",
      volume: BigInt(456789),
    });
  });

  it("reports missing token before authenticated Upstox requests", async () => {
    const provider = createUpstoxMarketDataProviderCore({
      fetch: async () => jsonResponse({ data: { candles: [] } }),
      token: "",
    });

    await expect(provider.fetchHistoricalDailyCandles({
      instrumentKey: "NSE_EQ|INE002A01018",
      startDate: new Date("2026-09-01T00:00:00Z"),
      endDate: new Date("2026-09-05T00:00:00Z"),
    })).rejects.toThrow("Missing UPSTOX_ANALYTICS_TOKEN.");
  });

  it("maps Upstox authentication and rate-limit failures without exposing secrets", async () => {
    const authProvider = createUpstoxMarketDataProviderCore({
      fetch: async () => new Response(null, { status: 401 }),
      token: "secret-token",
    });
    const rateLimitProvider = createUpstoxMarketDataProviderCore({
      fetch: async () => new Response(null, { status: 429 }),
      token: "secret-token",
    });

    await expect(authProvider.fetchCurrentQuote({ instrumentKey: "NSE_EQ|INE002A01018" })).rejects.toThrow("Upstox authentication failed.");
    await expect(rateLimitProvider.fetchCurrentQuote({ instrumentKey: "NSE_EQ|INE002A01018" })).rejects.toThrow("Upstox rate limit exceeded.");
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function gzipJsonResponse(body: unknown) {
  return new Response(gzipSync(JSON.stringify(body)), {
    headers: { "content-type": "application/json", "content-encoding": "gzip" },
    status: 200,
  });
}
