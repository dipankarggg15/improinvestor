import type { ProviderDailyCandle, ProviderExchange, ProviderInstrument } from "@/lib/market-data/types";

export const syntheticMarketSeed = 20260103;

export const syntheticMarketRegimes = [
  { name: "Normal mixed market", startDate: "2023-01-02", endDate: "2023-09-29", drift: 0.0002 },
  { name: "Broad bullish period", startDate: "2023-10-02", endDate: "2024-07-31", drift: 0.0011 },
  { name: "Market correction", startDate: "2024-08-01", endDate: "2025-02-28", drift: -0.0012 },
  { name: "Recovery", startDate: "2025-03-03", endDate: "2025-12-31", drift: 0.0008 },
] as const;

export const syntheticBehaviourProfiles = [
  "steady_compounder",
  "sideways",
  "gradual_decliner",
  "high_volatility",
  "momentum_runner",
  "momentum_then_crash",
  "breakout_rally",
  "deep_correction_recovery",
  "short_lived_spike",
  "long_duration_winner",
  "severe_loser",
] as const;

export type SyntheticBehaviourProfile = (typeof syntheticBehaviourProfiles)[number];

export type SyntheticCompany = {
  readonly name: string;
  readonly symbol: string;
  readonly isin: string;
  readonly sector: string;
  readonly marketCap: number;
  readonly debtToEquity: number;
  readonly behaviourProfile: SyntheticBehaviourProfile;
  readonly instruments: ProviderInstrument[];
};

export type SyntheticFundamentalSnapshot = {
  readonly isin: string;
  readonly asOfDate: Date;
  readonly marketCap: string;
  readonly debtToEquity: string;
};

export type SyntheticMarket = {
  readonly seed: number;
  readonly companies: SyntheticCompany[];
  readonly candles: ProviderDailyCandle[];
  readonly fundamentals: SyntheticFundamentalSnapshot[];
  readonly regimes: typeof syntheticMarketRegimes;
};

type GeneratedCompanyShape = Omit<SyntheticCompany, "instruments">;

const sectors = [
  "Automobiles",
  "Capital Goods",
  "Chemicals",
  "Consumer Durables",
  "Consumer Staples",
  "Financial Services",
  "Healthcare",
  "Information Technology",
  "Metals",
  "Power",
  "Specialty Retail",
  "Telecom Services",
];

const namePrefixes = [
  "Aarav",
  "Ambar",
  "Arka",
  "Avanti",
  "Banyan",
  "Cedar",
  "Dhruva",
  "Ekatra",
  "Fable",
  "Gaia",
  "Harit",
  "Indra",
  "Jivika",
  "Kaveri",
  "Lumen",
  "Meru",
  "Nava",
  "Ojas",
  "Prava",
  "Qubit",
  "Rivaan",
  "Saffron",
  "Tarang",
  "Udaan",
  "Veda",
  "Willow",
  "Yatra",
  "Zenith",
];

const nameSuffixes = [
  "Mobility",
  "Foods",
  "Microfinance",
  "Power",
  "Textiles",
  "Ceramics",
  "Appliances",
  "Biotech",
  "Logistics",
  "Infotech",
  "Industries",
  "Components",
  "Retail",
  "Motors",
  "Pharma",
];

export function generateSyntheticMarket(options: {
  readonly companyCount?: number;
  readonly seed?: number;
  readonly startDate?: string;
  readonly endDate?: string;
} = {}): SyntheticMarket {
  const companyCount = options.companyCount ?? 300;
  const seed = options.seed ?? syntheticMarketSeed;
  const startDate = options.startDate ?? "2023-01-02";
  const endDate = options.endDate ?? "2025-12-31";
  const random = createRandom(seed);
  const tradingDays = getWeekdayTradingDays(startDate, endDate);
  const companies = Array.from({ length: companyCount }, (_, index) => {
    const company = generateCompany(index, random);
    return {
      ...company,
      instruments: generateInstruments(company, index),
    };
  });
  const candles: ProviderDailyCandle[] = [];
  const fundamentals: SyntheticFundamentalSnapshot[] = [];

  for (let index = 0; index < companies.length; index += 1) {
    const company = companies[index];
    const closeSeries = generateCloseSeries(company, index, tradingDays, random);

    for (const instrument of company.instruments) {
      candles.push(...generateInstrumentCandles(instrument, closeSeries, tradingDays, company.marketCap, random));
    }

    fundamentals.push(...generateFundamentals(company, closeSeries, tradingDays));
  }

  return {
    seed,
    companies,
    candles,
    fundamentals,
    regimes: syntheticMarketRegimes,
  };
}

export function getWeekdayTradingDays(startDate: string, endDate: string): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function generateCompany(index: number, random: () => number): GeneratedCompanyShape {
  const prefix = namePrefixes[index % namePrefixes.length];
  const suffix = nameSuffixes[Math.floor(index / namePrefixes.length) % nameSuffixes.length];
  const sector = sectors[index % sectors.length];
  const profile = syntheticBehaviourProfiles[index % syntheticBehaviourProfiles.length];
  const marketCap = marketCapForIndex(index, random);
  const debtToEquity = debtToEquityForIndex(index, random);
  const symbol = `${prefix.slice(0, 3)}${suffix.slice(0, 2)}${String(index + 1).padStart(3, "0")}`.toUpperCase();

  return {
    name: `${prefix} ${suffix} ${String(index + 1).padStart(3, "0")} Limited`,
    symbol,
    isin: `INSYN${String(index + 1).padStart(7, "0")}`,
    sector,
    marketCap,
    debtToEquity,
    behaviourProfile: profile,
  };
}

function generateInstruments(company: GeneratedCompanyShape, index: number): ProviderInstrument[] {
  const listingType = index % 20;
  const exchanges: ProviderExchange[] = listingType < 2 ? ["BSE"] : listingType < 5 ? ["NSE", "BSE"] : ["NSE"];

  return exchanges.map((exchange) => ({
    exchange,
    symbol: exchange === "NSE" ? company.symbol : String(700000 + index),
    instrumentKey: `${exchange}_EQ|${company.isin}`,
    name: company.name,
    isin: company.isin,
    sector: company.sector,
    active: true,
  }));
}

function marketCapForIndex(index: number, random: () => number): number {
  const bucket = index % 10;
  if (bucket < 3) return randomBetween(random, 500, 2_000) * 10_000_000;
  if (bucket < 6) return randomBetween(random, 2_000, 10_000) * 10_000_000;
  if (bucket < 9) return randomBetween(random, 10_000, 50_000) * 10_000_000;
  return randomBetween(random, 50_000, 180_000) * 10_000_000;
}

function debtToEquityForIndex(index: number, random: () => number): number {
  if (index % 9 === 0) return randomBetween(random, 2.05, 4.2);
  if (index % 4 === 0) return randomBetween(random, 0.8, 1.9);
  return randomBetween(random, 0.02, 0.75);
}

function generateCloseSeries(
  company: SyntheticCompany,
  index: number,
  tradingDays: Date[],
  random: () => number,
): number[] {
  const closes: number[] = [];
  let close = randomBetween(random, 35, 1_400);
  const volatility = volatilityForProfile(company.behaviourProfile);
  const profileDrift = driftForProfile(company.behaviourProfile);

  for (let dayIndex = 0; dayIndex < tradingDays.length; dayIndex += 1) {
    const regime = regimeForDate(tradingDays[dayIndex]);
    const shock = randomBetween(random, -volatility, volatility);
    const eventReturn = eventReturnForProfile(company.behaviourProfile, dayIndex, tradingDays.length, index);
    close = Math.max(5, close * (1 + regime.drift + profileDrift + shock + eventReturn));
    closes.push(round(close, 2));
  }

  return closes;
}

function generateInstrumentCandles(
  instrument: ProviderInstrument,
  closeSeries: number[],
  tradingDays: Date[],
  marketCap: number,
  random: () => number,
): ProviderDailyCandle[] {
  const liquidityFactor = marketCap < 20_000_000_000 ? randomBetween(random, 0.05, 0.35) : randomBetween(random, 0.45, 2.4);
  let previousClose = closeSeries[0];

  return closeSeries.map((close, index) => {
    const open = index === 0 ? close * (1 + randomBetween(random, -0.01, 0.01)) : previousClose * (1 + randomBetween(random, -0.018, 0.018));
    const high = Math.max(open, close) * (1 + randomBetween(random, 0.001, 0.03));
    const low = Math.min(open, close) * (1 - randomBetween(random, 0.001, 0.03));
    const volume = Math.max(1_000, Math.round((marketCap / close / 252) * liquidityFactor * randomBetween(random, 0.65, 1.45)));
    previousClose = close;

    return {
      instrumentKey: instrument.instrumentKey,
      tradingDate: tradingDays[index],
      open: round(open, 2).toFixed(2),
      high: round(high, 2).toFixed(2),
      low: round(low, 2).toFixed(2),
      close: close.toFixed(2),
      volume: BigInt(volume),
    };
  });
}

function generateFundamentals(
  company: SyntheticCompany,
  closeSeries: number[],
  tradingDays: Date[],
): SyntheticFundamentalSnapshot[] {
  const snapshots: SyntheticFundamentalSnapshot[] = [];

  for (let index = 0; index < tradingDays.length; index += 63) {
    const priceRatio = closeSeries[index] / closeSeries[0];
    const debtDrift = 1 + Math.sin(index / 120) * 0.08;
    snapshots.push({
      isin: company.isin,
      asOfDate: tradingDays[index],
      marketCap: round(company.marketCap * priceRatio, 2).toFixed(2),
      debtToEquity: round(company.debtToEquity * debtDrift, 4).toFixed(4),
    });
  }

  return snapshots;
}

function driftForProfile(profile: SyntheticBehaviourProfile): number {
  switch (profile) {
    case "steady_compounder":
      return 0.00055;
    case "gradual_decliner":
      return -0.00055;
    case "momentum_runner":
      return 0.00095;
    case "long_duration_winner":
      return 0.00125;
    case "severe_loser":
      return -0.00115;
    case "sideways":
      return -0.00005;
    default:
      return 0.00015;
  }
}

function volatilityForProfile(profile: SyntheticBehaviourProfile): number {
  switch (profile) {
    case "high_volatility":
    case "momentum_then_crash":
    case "short_lived_spike":
      return 0.032;
    case "severe_loser":
    case "deep_correction_recovery":
      return 0.024;
    default:
      return 0.014;
  }
}

function eventReturnForProfile(
  profile: SyntheticBehaviourProfile,
  dayIndex: number,
  totalDays: number,
  stockIndex: number,
): number {
  const quarter = Math.floor(totalDays / 4);
  const offset = stockIndex % 35;

  if (profile === "momentum_runner" && dayIndex > quarter + offset && dayIndex < quarter + offset + 65) return 0.0065;
  if (profile === "momentum_then_crash" && dayIndex > quarter && dayIndex < quarter + 70) return 0.006;
  if (profile === "momentum_then_crash" && dayIndex > quarter + 95 && dayIndex < quarter + 145) return -0.011;
  if (profile === "breakout_rally" && dayIndex > totalDays * 0.58 + offset && dayIndex < totalDays * 0.58 + offset + 45) return 0.009;
  if (profile === "deep_correction_recovery" && dayIndex > totalDays * 0.45 && dayIndex < totalDays * 0.45 + 55) return -0.008;
  if (profile === "deep_correction_recovery" && dayIndex > totalDays * 0.62 && dayIndex < totalDays * 0.62 + 85) return 0.0055;
  if (profile === "short_lived_spike" && dayIndex > totalDays * 0.72 + offset && dayIndex < totalDays * 0.72 + offset + 18) return 0.018;
  if (profile === "short_lived_spike" && dayIndex > totalDays * 0.72 + offset + 19 && dayIndex < totalDays * 0.72 + offset + 42) return -0.013;
  return 0;
}

function regimeForDate(date: Date) {
  const iso = date.toISOString().slice(0, 10);
  return syntheticMarketRegimes.find((regime) => iso >= regime.startDate && iso <= regime.endDate) ?? syntheticMarketRegimes[0];
}

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomBetween(random: () => number, min: number, max: number) {
  return min + (max - min) * random();
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
