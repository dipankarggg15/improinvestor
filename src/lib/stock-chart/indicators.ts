export type PriceBar = {
  readonly time: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
};

export type ChartInterval = "1D" | "1W" | "1M";

export type IndicatorPoint = { readonly time: string; readonly value: number };

export function aggregatePriceBars(candles: readonly PriceBar[], interval: ChartInterval): PriceBar[] {
  if (interval === "1D") return [...candles];
  const groups = new Map<string, PriceBar[]>();
  for (const candle of candles) {
    const key = interval === "1M" ? candle.time.slice(0, 7) : weekKey(candle.time);
    const group = groups.get(key);
    if (group) group.push(candle);
    else groups.set(key, [candle]);
  }
  return [...groups.values()].map((group) => ({
    time: group.at(-1)!.time,
    open: group[0].open,
    high: Math.max(...group.map((candle) => candle.high)),
    low: Math.min(...group.map((candle) => candle.low)),
    close: group.at(-1)!.close,
    volume: group.reduce((sum, candle) => sum + candle.volume, 0),
  }));
}

export function simpleMovingAverage(candles: readonly PriceBar[], period: number): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  let rolling = 0;
  candles.forEach((candle, index) => {
    rolling += candle.close;
    if (index >= period) rolling -= candles[index - period].close;
    if (index >= period - 1) result.push({ time: candle.time, value: rolling / period });
  });
  return result;
}

export function exponentialMovingAverage(candles: readonly PriceBar[], period: number): IndicatorPoint[] {
  if (candles.length < period) return [];
  const multiplier = 2 / (period + 1);
  let value = candles.slice(0, period).reduce((sum, candle) => sum + candle.close, 0) / period;
  const result: IndicatorPoint[] = [{ time: candles[period - 1].time, value }];
  for (let index = period; index < candles.length; index += 1) {
    value = (candles[index].close - value) * multiplier + value;
    result.push({ time: candles[index].time, value });
  }
  return result;
}

export function relativeStrengthIndex(candles: readonly PriceBar[], period = 14): IndicatorPoint[] {
  if (candles.length <= period) return [];
  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    averageGain += Math.max(change, 0);
    averageLoss += Math.max(-change, 0);
  }
  averageGain /= period;
  averageLoss /= period;
  const result = [{ time: candles[period].time, value: rsiValue(averageGain, averageLoss) }];
  for (let index = period + 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    averageGain = ((averageGain * (period - 1)) + Math.max(change, 0)) / period;
    averageLoss = ((averageLoss * (period - 1)) + Math.max(-change, 0)) / period;
    result.push({ time: candles[index].time, value: rsiValue(averageGain, averageLoss) });
  }
  return result;
}

export function averageTrueRange(candles: readonly PriceBar[], period = 14): IndicatorPoint[] {
  if (candles.length <= period) return [];
  const ranges = candles.slice(1).map((candle, index) => Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - candles[index].close),
    Math.abs(candle.low - candles[index].close),
  ));
  let value = ranges.slice(0, period).reduce((sum, range) => sum + range, 0) / period;
  const result = [{ time: candles[period].time, value }];
  for (let index = period; index < ranges.length; index += 1) {
    value = ((value * (period - 1)) + ranges[index]) / period;
    result.push({ time: candles[index + 1].time, value });
  }
  return result;
}

export function movingAverageConvergenceDivergence(candles: readonly PriceBar[]) {
  const fast = exponentialMovingAverage(candles, 12);
  const slow = exponentialMovingAverage(candles, 26);
  const fastByTime = new Map(fast.map((point) => [point.time, point.value]));
  const macd = slow.flatMap((point) => {
    const fastValue = fastByTime.get(point.time);
    return fastValue === undefined ? [] : [{ time: point.time, value: fastValue - point.value }];
  });
  const signal = emaForPoints(macd, 9);
  const signalByTime = new Map(signal.map((point) => [point.time, point.value]));
  const histogram = macd.flatMap((point) => {
    const signalValue = signalByTime.get(point.time);
    return signalValue === undefined ? [] : [{ time: point.time, value: point.value - signalValue }];
  });
  return { macd, signal, histogram };
}

function emaForPoints(points: readonly IndicatorPoint[], period: number): IndicatorPoint[] {
  if (points.length < period) return [];
  const multiplier = 2 / (period + 1);
  let value = points.slice(0, period).reduce((sum, point) => sum + point.value, 0) / period;
  const result: IndicatorPoint[] = [{ time: points[period - 1].time, value }];
  for (let index = period; index < points.length; index += 1) {
    value = (points[index].value - value) * multiplier + value;
    result.push({ time: points[index].time, value });
  }
  return result;
}

function rsiValue(averageGain: number, averageLoss: number) {
  if (averageLoss === 0) return 100;
  if (averageGain === 0) return 0;
  return 100 - (100 / (1 + averageGain / averageLoss));
}

function weekKey(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}
