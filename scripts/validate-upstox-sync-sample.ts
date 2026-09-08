import "dotenv/config";

import { createUpstoxMarketDataProviderCore } from "@/lib/market-data/providers/upstox-core";
import { canonicalizeUpstoxEquities, latestCompletedEodDate, marketHistoryStartDate } from "@/lib/market-data/upstox-sync";

const sampleSymbols = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "SBIN"];

async function main() {
  const provider = createUpstoxMarketDataProviderCore({
    token: process.env.UPSTOX_ANALYTICS_TOKEN,
  });
  const instruments = await provider.fetchInstruments();
  const companies = canonicalizeUpstoxEquities(instruments);
  const endDate = latestCompletedEodDate();
  const startDate = marketHistoryStartDate(endDate, 1);
  const samples = [];

  for (const symbol of sampleSymbols) {
    const company = companies.find((item) => item.canonicalInstrument.symbol === symbol);
    if (!company) {
      samples.push({ symbol, status: "missing" });
      continue;
    }

    const candles = await provider.fetchHistoricalDailyCandles({
      instrumentKey: company.canonicalInstrument.instrumentKey,
      startDate,
      endDate,
    });
    const latest = candles[candles.length - 1];
    samples.push({
      symbol,
      status: "ok",
      isin: company.isin,
      instrumentKey: company.canonicalInstrument.instrumentKey,
      listings: company.instruments.map((instrument) => instrument.exchange).sort(),
      candleCount: candles.length,
      firstDate: candles[0]?.tradingDate.toISOString().slice(0, 10) ?? null,
      latestDate: latest?.tradingDate.toISOString().slice(0, 10) ?? null,
      latestClose: latest?.close ?? null,
      sane: candles.every((candle) => (
        candle.tradingDate <= endDate &&
        Number(candle.open) >= 0 &&
        Number(candle.high) >= Number(candle.low) &&
        Number(candle.volume) >= 0
      )),
    });
  }

  console.log(JSON.stringify({
    mode: "read-only-validation",
    source: "UPSTOX_REAL",
    universeCounts: {
      nse: instruments.filter((instrument) => instrument.exchange === "NSE").length,
      bse: instruments.filter((instrument) => instrument.exchange === "BSE").length,
      canonicalCompanies: companies.length,
      dualListedCompanies: companies.filter((company) => (
        company.instruments.some((instrument) => instrument.exchange === "NSE") &&
        company.instruments.some((instrument) => instrument.exchange === "BSE")
      )).length,
      bseOnlyCompanies: companies.filter((company) => company.instruments.every((instrument) => instrument.exchange === "BSE")).length,
    },
    period: {
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
    },
    samples,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unknown Upstox sample validation failure.");
  process.exit(1);
});
