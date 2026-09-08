export type MarketDataProviderName = "mock" | "upstox";

export type ProviderExchange = "NSE" | "BSE";

export type ProviderInstrument = {
  readonly exchange: ProviderExchange;
  readonly symbol: string;
  readonly tradingSymbol: string;
  readonly instrumentKey: string;
  readonly name: string;
  readonly isin: string;
  readonly segment: string;
  readonly instrumentType: string;
  readonly sector?: string;
  readonly active: boolean;
};

export type ProviderDailyCandle = {
  readonly instrumentKey: string;
  readonly tradingDate: Date;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: bigint;
};

export type ProviderQuote = {
  readonly instrumentKey: string;
  readonly lastPrice: string;
  readonly lastTradedAt: Date | null;
  readonly previousClose: string | null;
  readonly volume: bigint | null;
};

export type MarketDataProvider = {
  readonly name: MarketDataProviderName;
  fetchInstruments(): Promise<ProviderInstrument[]>;
  fetchHistoricalDailyCandles(input: {
    readonly instrumentKey: string;
    readonly startDate: Date;
    readonly endDate: Date;
  }): Promise<ProviderDailyCandle[]>;
  fetchCurrentQuote(input: {
    readonly instrumentKey: string;
  }): Promise<ProviderQuote>;
};
