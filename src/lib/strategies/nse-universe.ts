export const NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX = "NSE_EQ|INE";

const nonOrdinaryEquityPatterns = [
  /\bETF\b/,
  /\bBEES\b/,
  /\bINDEX\b/,
  /\bNIFTY\b/,
  /\bSENSEX\b/,
  /\bLIQUID\b/,
  /\bGILT\b/,
  /\bGSEC\b/,
  /\bSDL\b/,
  /\bBOND\b/,
  /\bDEBT\b/,
  /\bTREASURY\b/,
  /\bTBILL\b/,
  /\bPREF(?:ERENCE)?\b/,
  /\bINVIT\b/,
  /\bREIT\b/,
];

export function isEligibleNseOrdinaryEquityInstrument(input: {
  readonly instrumentKey: string;
  readonly companyName: string;
  readonly symbol: string;
}) {
  if (!input.instrumentKey.startsWith(NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX)) return false;

  const text = `${input.companyName} ${input.symbol}`.toUpperCase();
  return !nonOrdinaryEquityPatterns.some((pattern) => pattern.test(text));
}
