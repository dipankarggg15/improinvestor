import "dotenv/config";

import { createUpstoxMarketDataProviderCore } from "@/lib/market-data/providers/upstox-core";

const validationSymbol = "RELIANCE";

async function main() {
  const provider = createUpstoxMarketDataProviderCore({
    token: process.env.UPSTOX_ANALYTICS_TOKEN,
  });
  const instruments = await provider.fetchInstruments();
  const instrument = instruments.find((item) => item.symbol === validationSymbol);

  if (!instrument) {
    throw new Error(`Could not resolve ${validationSymbol} from Upstox NSE_EQ instrument master.`);
  }

  const endDate = previousDay(new Date());
  const startDate = addDays(endDate, -45);
  const candles = await provider.fetchHistoricalDailyCandles({
    instrumentKey: instrument.instrumentKey,
    startDate,
    endDate,
  });

  if (candles.length === 0) {
    throw new Error(`Upstox returned no daily candles for ${validationSymbol}.`);
  }

  const latestCandle = candles[candles.length - 1];
  if (!latestCandle) {
    throw new Error(`Upstox returned no latest candle for ${validationSymbol}.`);
  }

  const quote = await provider.fetchCurrentQuote({ instrumentKey: instrument.instrumentKey });

  console.log(JSON.stringify({
    provider: provider.name,
    instrument: validationSymbol,
    instrumentKey: instrument.instrumentKey,
    historicalCandlesReceived: candles.length,
    latestHistoricalCandleDate: latestCandle.tradingDate.toISOString().slice(0, 10),
    latestHistoricalClose: latestCandle.close,
    currentQuote: {
      lastPrice: quote.lastPrice,
      lastTradedAt: quote.lastTradedAt?.toISOString() ?? null,
      previousClose: quote.previousClose,
      volume: quote.volume?.toString() ?? null,
    },
  }, null, 2));
}

function previousDay(date: Date) {
  return addDays(date, -1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown Upstox validation failure.";
  console.error(message);
  process.exit(1);
});
