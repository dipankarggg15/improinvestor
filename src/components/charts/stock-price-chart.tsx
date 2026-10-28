"use client";

import {
  BarSeries, CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries, LineStyle, PriceScaleMode,
  type IChartApi, type ISeriesApi, type SeriesType, type Time,
} from "lightweight-charts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  aggregatePriceBars, averageTrueRange, exponentialMovingAverage, movingAverageConvergenceDivergence,
  relativeStrengthIndex, simpleMovingAverage, type ChartInterval, type IndicatorPoint, type PriceBar,
} from "@/lib/stock-chart/indicators";
import { useLiveQuotes } from "@/lib/market-data/use-live-quotes";
import {
  intradayIntervals, mergeLiveQuoteIntoIntradayBars, type IntradayInterval, upstoxIntervalParts,
} from "@/lib/stock-chart/intraday";
import { mergeLiveQuoteIntoDailyCandles } from "@/lib/stock-chart/live-candle";
import type { StockChartCandle } from "@/lib/stock-chart/service";

type ChartOverlay = { readonly supportLow: number; readonly supportHigh: number; readonly entryTrigger: number; readonly stopPrice: number; readonly targetPrice: number | null };
type ChartRange = "1M" | "3M" | "6M" | "YTD" | "1Y" | "2Y" | "5Y" | "ALL" | "CUSTOM";
type ChartStyle = "CANDLES" | "BARS" | "LINE";
type ChartTimeframe = IntradayInterval | ChartInterval;
type IndicatorKey = "volume" | "sma20" | "sma50" | "sma100" | "sma200" | "ema9" | "ema20" | "ema50" | "rsi14" | "macd" | "atr14" | "swing" | "highLow52Week";
type IndicatorSettings = Record<IndicatorKey, boolean>;

const ranges: ChartRange[] = ["1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y", "ALL"];
const intervals: ChartTimeframe[] = [...intradayIntervals, "1D", "1W", "1M"];
const preferencesKey = "improinvestor.chart.indicators.v1";
const defaultIndicators: IndicatorSettings = {
  volume: true, sma20: false, sma50: true, sma100: false, sma200: true, ema9: false, ema20: false,
  ema50: false, rsi14: false, macd: false, atr14: false, swing: true, highLow52Week: false,
};
const indicatorOptions: Array<{ key: IndicatorKey; label: string }> = [
  { key: "volume", label: "Volume" }, { key: "sma20", label: "SMA 20" },
  { key: "sma50", label: "SMA 50" }, { key: "sma100", label: "SMA 100" },
  { key: "sma200", label: "SMA 200" }, { key: "ema9", label: "EMA 9" },
  { key: "ema20", label: "EMA 20" }, { key: "ema50", label: "EMA 50" },
  { key: "rsi14", label: "RSI 14" }, { key: "macd", label: "MACD" },
  { key: "atr14", label: "ATR 14" }, { key: "swing", label: "Swing levels" },
  { key: "highLow52Week", label: "52-week high / low" },
];

export function StockPriceChart({ candles, initialEndDate, initialStartDate, instrumentKey, liveEnabled = true, overlay, symbol, valuePrefix = "₹" }: {
  readonly candles: readonly StockChartCandle[];
  readonly initialStartDate?: string;
  readonly initialEndDate?: string;
  readonly instrumentKey: string;
  readonly liveEnabled?: boolean;
  readonly overlay: ChartOverlay | null;
  readonly symbol: string;
  readonly valuePrefix?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const barSeriesRef = useRef<ISeriesApi<"Bar"> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const hasInitialManualRange = Boolean(initialStartDate && initialEndDate);
  const [range, setRange] = useState<ChartRange>(hasInitialManualRange ? "CUSTOM" : "1Y");
  const [startDate, setStartDate] = useState(initialStartDate ?? "");
  const [endDate, setEndDate] = useState(initialEndDate ?? "");
  const [dateError, setDateError] = useState<string | null>(null);
  const [interval, setInterval] = useState<ChartTimeframe>("1D");
  const [style, setStyle] = useState<ChartStyle>("CANDLES");
  const [logarithmic, setLogarithmic] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [indicators, setIndicators] = useState<IndicatorSettings>(defaultIndicators);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [hovered, setHovered] = useState<PriceBar | null>(null);
  const [intradayCandles, setIntradayCandles] = useState<PriceBar[]>([]);
  const [intradayStatus, setIntradayStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const intradayCache = useRef(new Map<IntradayInterval, PriceBar[]>());
  const intradayRequest = useRef(0);
  const liveFeed = useLiveQuotes(liveEnabled ? [instrumentKey] : []);
  const isIntraday = isIntradayInterval(interval);
  const liveCandles = useMemo(
    () => mergeLiveQuoteIntoDailyCandles(candles, liveEnabled ? liveFeed.quotes[instrumentKey] : undefined),
    [candles, instrumentKey, liveEnabled, liveFeed.quotes],
  );

  const intervalCandles = useMemo(
    () => isIntraday ? intradayCandles : aggregatePriceBars(candles, interval as ChartInterval),
    [candles, interval, intradayCandles, isIntraday],
  );
  const visibleCandles = useMemo(
    () => isIntraday ? intervalCandles : range === "CUSTOM" ? filterCustomDateRange(intervalCandles, initialStartDate, initialEndDate) : filterRange(intervalCandles, range),
    [initialEndDate, initialStartDate, intervalCandles, isIntraday, range],
  );
  const panelCount = Number(indicators.rsi14) + Number(indicators.macd) + Number(indicators.atr14);
  const chartHeight = isFullscreen ? Math.max(420, windowHeight() - 190) : 560 + panelCount * 110;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(preferencesKey);
        if (saved) setIndicators({ ...defaultIndicators, ...JSON.parse(saved) as Partial<IndicatorSettings> });
      } catch {
        // Ignore malformed or unavailable browser storage and keep safe defaults.
      }
      setPreferencesReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (preferencesReady) window.localStorage.setItem(preferencesKey, JSON.stringify(indicators));
  }, [indicators, preferencesReady]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!containerRef.current || visibleCandles.length === 0) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: chartHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#52606d", attributionLogo: false,
        panes: { separatorColor: "#d9dee5", separatorHoverColor: "#9ca3af", enableResize: true },
      },
      grid: { vertLines: { color: "#eef1f4" }, horzLines: { color: "#eef1f4" } },
      rightPriceScale: {
        borderColor: "#d9dee5", scaleMargins: { top: 0.08, bottom: indicators.volume ? 0.25 : 0.08 },
        mode: logarithmic ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      },
      timeScale: { borderColor: "#d9dee5", timeVisible: isIntraday, secondsVisible: false, rightOffset: 4 },
      crosshair: { vertLine: { color: "#64748b" }, horzLine: { color: "#64748b" } },
    });
    chartRef.current = chart;

    if (style === "LINE") {
      const series = chart.addSeries(LineSeries, { color: "#166534", lineWidth: 2, title: symbol });
      lineSeriesRef.current = series;
      series.setData(visibleCandles.map((candle) => ({ time: toChartTime(candle.time), value: candle.close })));
      addReferenceLines(series, overlay, indicators, candles);
    } else if (style === "BARS") {
      const series = chart.addSeries(BarSeries, { upColor: "#15803d", downColor: "#dc2626", thinBars: false });
      barSeriesRef.current = series;
      series.setData(visibleCandles.map(toOhlcPoint));
      addReferenceLines(series, overlay, indicators, candles);
    } else {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#15803d", downColor: "#dc2626", wickUpColor: "#15803d", wickDownColor: "#dc2626", borderVisible: false,
      });
      candleSeriesRef.current = series;
      series.setData(visibleCandles.map(toOhlcPoint));
      addReferenceLines(series, overlay, indicators, candles);
    }

    if (indicators.volume) addVolume(chart, visibleCandles);
    addConfiguredAverages(chart, intervalCandles, visibleCandles[0].time, indicators, interval);

    let paneIndex = 1;
    if (indicators.rsi14) {
      const rsi = chart.addSeries(LineSeries, { color: "#9333ea", lineWidth: 2, title: "RSI 14", priceLineVisible: false }, paneIndex);
      rsi.priceScale().applyOptions({ mode: PriceScaleMode.Normal, autoScale: true });
      rsi.setData(filterPoints(relativeStrengthIndex(intervalCandles), visibleCandles[0].time));
      rsi.createPriceLine({ price: 70, color: "#dc2626", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "70" });
      rsi.createPriceLine({ price: 30, color: "#15803d", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "30" });
      paneIndex += 1;
    }
    if (indicators.macd) {
      const values = movingAverageConvergenceDivergence(intervalCandles);
      const macd = chart.addSeries(LineSeries, { color: "#2563eb", lineWidth: 2, title: "MACD", priceLineVisible: false }, paneIndex);
      const signal = chart.addSeries(LineSeries, { color: "#f97316", lineWidth: 2, title: "Signal", priceLineVisible: false }, paneIndex);
      const histogram = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneIndex);
      macd.priceScale().applyOptions({ mode: PriceScaleMode.Normal, autoScale: true });
      macd.setData(filterPoints(values.macd, visibleCandles[0].time));
      signal.setData(filterPoints(values.signal, visibleCandles[0].time));
      histogram.setData(filterPoints(values.histogram, visibleCandles[0].time).map((point) => ({ ...point, color: point.value >= 0 ? "rgba(21,128,61,0.5)" : "rgba(220,38,38,0.5)" })));
      paneIndex += 1;
    }
    if (indicators.atr14) {
      const atr = chart.addSeries(LineSeries, { color: "#b45309", lineWidth: 2, title: "ATR 14", priceLineVisible: false }, paneIndex);
      atr.priceScale().applyOptions({ mode: PriceScaleMode.Normal, autoScale: true });
      atr.setData(filterPoints(averageTrueRange(intervalCandles), visibleCandles[0].time));
    }
    chart.panes().slice(1).forEach((pane) => pane.setHeight(110));

    const candleByTime = new Map(visibleCandles.map((candle) => [candle.time, candle]));
    chart.subscribeCrosshairMove((parameter) => {
      if (!parameter.time) return setHovered(null);
      setHovered(candleByTime.get(timeKey(parameter.time)) ?? visibleCandles.at(-1) ?? null);
    });
    setHovered(null);
    chart.timeScale().fitContent();

    return () => {
      chartRef.current = null;
      lineSeriesRef.current = null;
      barSeriesRef.current = null;
      candleSeriesRef.current = null;
      chart.remove();
    };
  }, [candles, chartHeight, indicators, interval, intervalCandles, isIntraday, logarithmic, overlay, style, symbol, visibleCandles]);

  const liveIntervalCandle = useMemo(() => {
    if (isIntraday) {
      const quote = liveEnabled ? liveFeed.quotes[instrumentKey] : undefined;
      return mergeLiveQuoteIntoIntradayBars(intradayCandles, quote, upstoxIntervalParts(interval as IntradayInterval).seconds).at(-1) ?? null;
    }
    return aggregatePriceBars(liveCandles, interval as ChartInterval).at(-1) ?? null;
  }, [instrumentKey, interval, intradayCandles, isIntraday, liveCandles, liveEnabled, liveFeed.quotes]);
  const periodPerformance = useMemo(() => {
    if (isIntraday) {
      const current = liveFeed.quotes[instrumentKey]?.lastPrice ?? liveIntervalCandle?.close ?? intradayCandles.at(-1)?.close;
      const baseline = liveFeed.quotes[instrumentKey]?.previousClose ?? intradayCandles[0]?.open;
      return calculatePerformance("Today", baseline, current, intradayCandles[0]?.time, liveIntervalCandle?.time);
    }
    const periodCandles = range === "CUSTOM"
      ? filterCustomDateRange(liveCandles, initialStartDate, initialEndDate)
      : filterRange(liveCandles, range);
    return calculatePerformance(
      range === "CUSTOM" ? "Custom period" : rangeLabel(range),
      periodCandles[0]?.close,
      periodCandles.at(-1)?.close,
      periodCandles[0]?.time,
      periodCandles.at(-1)?.time,
    );
  }, [initialEndDate, initialStartDate, instrumentKey, intradayCandles, isIntraday, liveCandles, liveFeed.quotes, liveIntervalCandle, range]);
  useEffect(() => {
    if (!liveEnabled || !liveFeed.quotes[instrumentKey] || !liveIntervalCandle) return;
    if (style === "LINE") lineSeriesRef.current?.update({ time: toChartTime(liveIntervalCandle.time), value: liveIntervalCandle.close });
    else if (style === "BARS") barSeriesRef.current?.update(toOhlcPoint(liveIntervalCandle));
    else candleSeriesRef.current?.update(toOhlcPoint(liveIntervalCandle));
  }, [instrumentKey, liveEnabled, liveFeed.quotes, liveIntervalCandle, style]);

  const displayed = hovered ?? (liveEnabled ? liveIntervalCandle : null) ?? visibleCandles.at(-1) ?? null;
  const displayedStoredCandle = displayed && !isIntraday
    ? candles.find((candle) => candle.time === displayed.time)
    : undefined;
  const displayedIsCloseOnly = Boolean(
    displayed && !isIntraday && (
      displayedStoredCandle?.ohlcComplete === false ||
      (liveEnabled && liveFeed.quotes[instrumentKey] && displayed.time === liveIntervalCandle?.time)
    ),
  );
  const earliestDate = candles[0]?.time;
  const latestDate = candles.at(-1)?.time;

  async function selectInterval(value: string) {
    const next = value as ChartTimeframe;
    intradayRequest.current += 1;
    const requestId = intradayRequest.current;
    setInterval(next);
    if (!isIntradayInterval(next)) {
      setIntradayStatus("idle");
      return;
    }
    const cached = intradayCache.current.get(next);
    if (cached) {
      setIntradayCandles(cached);
      setIntradayStatus("ready");
      return;
    }
    setIntradayStatus("loading");
    try {
      const query = new URLSearchParams({ instrumentKey, interval: next });
      const response = await fetch(`/api/market/intraday-candles?${query.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { readonly bars?: PriceBar[]; readonly error?: string };
      if (!response.ok || !payload.bars) throw new Error(payload.error ?? "Intraday candles are unavailable.");
      intradayCache.current.set(next, payload.bars);
      if (requestId === intradayRequest.current) {
        setIntradayCandles(payload.bars);
        setIntradayStatus("ready");
      }
    } catch {
      if (requestId === intradayRequest.current) setIntradayStatus("error");
    }
  }

  function applyManualRange() {
    if (!isDateKey(startDate) || !isDateKey(endDate)) {
      setDateError("Choose both a valid start date and end date.");
      return;
    }
    if (startDate > endDate) {
      setDateError("Start date must be on or before end date.");
      return;
    }
    setDateError(null);
    setRange("CUSTOM");
    const next = new URLSearchParams(searchParams.toString());
    next.set("startDate", startDate);
    next.set("endDate", endDate);
    next.delete("date");
    router.replace(`${pathname}?${next.toString()}`);
  }

  function clearManualRange() {
    setStartDate("");
    setEndDate("");
    setDateError(null);
    setRange("1Y");
    const next = new URLSearchParams(searchParams.toString());
    next.delete("startDate");
    next.delete("endDate");
    next.delete("date");
    router.replace(next.size > 0 ? `${pathname}?${next.toString()}` : pathname);
  }

  return (
    <div className="bg-white p-1" ref={wrapperRef}>
      <div className="mb-3 space-y-3">
        {periodPerformance ? (
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--muted)]">{periodPerformance.label} gain / loss</p>
              <p className={`mt-1 text-xl font-semibold ${periodPerformance.change >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {periodPerformance.change >= 0 ? "+" : "−"}{formatValue(Math.abs(periodPerformance.change), valuePrefix)}
                <span className="ml-2 text-sm">({periodPerformance.percent >= 0 ? "+" : ""}{periodPerformance.percent.toFixed(2)}%)</span>
              </p>
            </div>
            <p className="text-xs text-[var(--muted)]">
              {formatValue(periodPerformance.startPrice, valuePrefix)} → {formatValue(periodPerformance.endPrice, valuePrefix)}
              {periodPerformance.startTime && periodPerformance.endTime ? <span className="ml-2">· {formatBarTime(periodPerformance.startTime)} to {formatBarTime(periodPerformance.endTime)}</span> : null}
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {isIntraday ? <span className="rounded-md border border-[var(--accent)] bg-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-white">TODAY</span> : ranges.map((option) => <ControlButton active={range === option} key={option} label={option} onClick={() => setRange(option)} />)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelectControl ariaLabel="Candle interval" onChange={(value) => void selectInterval(value)} value={interval} values={intervals} />
            <SelectControl ariaLabel="Chart style" onChange={(value) => setStyle(value as ChartStyle)} value={style} values={["CANDLES", "BARS", "LINE"]} />
            <ControlButton active={logarithmic} label={logarithmic ? "Log" : "Linear"} onClick={() => setLogarithmic((value) => !value)} />
            <ControlButton label="Reset" onClick={() => chartRef.current?.timeScale().fitContent()} />
            <ControlButton label="Image" onClick={() => downloadChart(chartRef.current, symbol)} />
            <ControlButton label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"} onClick={() => toggleFullscreen(wrapperRef.current)} />
          </div>
        </div>
        {!isIntraday ? <div className="flex flex-wrap items-end gap-2 rounded-md border border-[var(--border)] bg-[var(--panel-soft)] p-3">
          <label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
            From
            <input aria-label="Chart start date" className="h-9 rounded-md border border-[var(--border)] bg-white px-2 text-sm text-[var(--foreground)]" max={endDate || latestDate} min={earliestDate} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
            To
            <input aria-label="Chart end date" className="h-9 rounded-md border border-[var(--border)] bg-white px-2 text-sm text-[var(--foreground)]" min={startDate || earliestDate} onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} />
          </label>
          <button className="h-9 rounded-md bg-[var(--accent)] px-4 text-xs font-semibold text-white" onClick={applyManualRange} type="button">Apply dates</button>
          <button className="h-9 rounded-md border border-[var(--border)] bg-white px-4 text-xs font-semibold" onClick={clearManualRange} type="button">Clear</button>
          {range === "CUSTOM" && initialStartDate && initialEndDate ? <span className="pb-2 text-xs text-[var(--muted)]">Showing {initialStartDate} to {initialEndDate}</span> : null}
          {dateError ? <span className="w-full text-xs font-medium text-red-700">{dateError}</span> : null}
        </div> : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium">Indicators</summary>
            <div className="absolute left-0 z-20 mt-2 grid w-64 grid-cols-2 gap-2 rounded-md border border-[var(--border)] bg-white p-3 shadow-lg">
              {indicatorOptions.map((option) => (
                <label className="flex items-center gap-2 text-xs" key={option.key}>
                  <input checked={indicators[option.key]} onChange={() => setIndicators((current) => ({ ...current, [option.key]: !current[option.key] }))} type="checkbox" />
                  {option.label}
                </label>
              ))}
            </div>
          </details>
          <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
            {liveEnabled ? <Legend color={liveFeed.status === "live" ? "#15803d" : "#d97706"} label={liveFeed.status === "live" ? "LIVE · 1s updates" : "Live feed connecting"} /> : null}
            {isIntraday ? <Legend color={intradayStatus === "error" ? "#dc2626" : "#2563eb"} label={intradayStatus === "loading" ? `Loading ${interval} candles` : intradayStatus === "error" ? "Intraday history unavailable" : `${interval} intraday`} /> : null}
            {indicators.sma50 ? <Legend color="#2563eb" label={`SMA 50 (${interval})`} /> : null}
            {indicators.sma200 ? <Legend color="#7c3aed" label={`SMA 200 (${interval})`} /> : null}
            {overlay && indicators.swing ? <Legend color="#d97706" label="Support zone" /> : null}
          </div>
        </div>
        {displayed ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-[var(--panel-soft)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
            <span className="font-sans font-semibold text-[var(--foreground)]">{formatBarTime(displayed.time)}</span>
            {displayedIsCloseOnly ? (
              <><span>C {formatNumber(displayed.close)}</span><span className="font-sans">Live OHLC and volume pending</span></>
            ) : (
              <><span>O {formatNumber(displayed.open)}</span><span>H {formatNumber(displayed.high)}</span><span>L {formatNumber(displayed.low)}</span><span>C {formatNumber(displayed.close)}</span><span>Vol {displayed.volume.toLocaleString("en-IN")}</span></>
            )}
          </div>
        ) : null}
      </div>
      {visibleCandles.length > 0
        ? <div ref={containerRef} style={{ height: chartHeight }} />
        : <div className="grid min-h-64 place-items-center rounded-md border border-dashed border-[var(--border)] bg-[var(--panel-soft)] p-6 text-center text-sm text-[var(--muted)]">{intradayStatus === "loading" ? `Loading ${interval} intraday candles…` : intradayStatus === "error" ? "Upstox intraday candles are temporarily unavailable." : "No stored candles exist inside this date range."}</div>}
      <p className="mt-2 text-right text-xs text-[var(--muted)]">Charting by <a className="underline" href="https://www.tradingview.com/" rel="noreferrer" target="_blank">TradingView</a></p>
    </div>
  );
}

function addConfiguredAverages(chart: IChartApi, candles: readonly PriceBar[], firstVisibleTime: string, settings: IndicatorSettings, interval: string) {
  const averages: Array<{ enabled: boolean; points: IndicatorPoint[]; color: string; title: string }> = [
    { enabled: settings.sma20, points: simpleMovingAverage(candles, 20), color: "#0891b2", title: `SMA 20 (${interval})` },
    { enabled: settings.sma50, points: simpleMovingAverage(candles, 50), color: "#2563eb", title: `SMA 50 (${interval})` },
    { enabled: settings.sma100, points: simpleMovingAverage(candles, 100), color: "#4f46e5", title: `SMA 100 (${interval})` },
    { enabled: settings.sma200, points: simpleMovingAverage(candles, 200), color: "#7c3aed", title: `SMA 200 (${interval})` },
    { enabled: settings.ema9, points: exponentialMovingAverage(candles, 9), color: "#0f766e", title: `EMA 9 (${interval})` },
    { enabled: settings.ema20, points: exponentialMovingAverage(candles, 20), color: "#ca8a04", title: `EMA 20 (${interval})` },
    { enabled: settings.ema50, points: exponentialMovingAverage(candles, 50), color: "#ea580c", title: `EMA 50 (${interval})` },
  ];
  for (const average of averages) {
    if (!average.enabled) continue;
    const series = chart.addSeries(LineSeries, { color: average.color, lineWidth: 2, title: average.title, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });
    series.setData(filterPoints(average.points, firstVisibleTime));
  }
}

function addVolume(chart: IChartApi, candles: readonly PriceBar[]) {
  const series = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false });
  series.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
  series.setData(candles.map((candle) => ({ time: toChartTime(candle.time), value: candle.volume, color: candle.close >= candle.open ? "rgba(21,128,61,0.3)" : "rgba(220,38,38,0.3)" })));
}

function addReferenceLines<T extends SeriesType>(series: ISeriesApi<T>, overlay: ChartOverlay | null, settings: IndicatorSettings, dailyCandles: readonly PriceBar[]) {
  if (overlay && settings.swing) {
    series.createPriceLine({ price: overlay.supportHigh, color: "#d97706", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Support high" });
    series.createPriceLine({ price: overlay.supportLow, color: "#d97706", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Support low" });
    series.createPriceLine({ price: overlay.entryTrigger, color: "#0284c7", lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "Trigger" });
    series.createPriceLine({ price: overlay.stopPrice, color: "#dc2626", lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "Stop" });
    if (overlay.targetPrice) series.createPriceLine({ price: overlay.targetPrice, color: "#15803d", lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "Target" });
  }
  if (settings.highLow52Week && dailyCandles.length > 0) {
    const year = dailyCandles.slice(-252);
    series.createPriceLine({ price: Math.max(...year.map((candle) => candle.high)), color: "#15803d", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "52W high" });
    series.createPriceLine({ price: Math.min(...year.map((candle) => candle.low)), color: "#dc2626", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "52W low" });
  }
}

function filterRange(candles: readonly PriceBar[], range: ChartRange) {
  if (range === "ALL" || range === "CUSTOM" || candles.length === 0) return [...candles];
  const end = new Date(`${candles.at(-1)!.time}T00:00:00.000Z`);
  const start = new Date(end);
  if (range === "YTD") start.setUTCMonth(0, 1);
  else if (range.endsWith("M")) start.setUTCMonth(start.getUTCMonth() - Number.parseInt(range, 10));
  else start.setUTCFullYear(start.getUTCFullYear() - Number.parseInt(range, 10));
  const startKey = start.toISOString().slice(0, 10);
  return candles.filter((candle) => candle.time >= startKey);
}

export function filterCustomDateRange(candles: readonly PriceBar[], startDate?: string, endDate?: string) {
  if (!isDateKey(startDate) || !isDateKey(endDate) || startDate > endDate) return [...candles];
  return candles.filter((candle) => candle.time >= startDate && candle.time <= endDate);
}

function isDateKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)));
}

function filterPoints(points: readonly IndicatorPoint[], firstVisibleTime: string) {
  return points.filter((point) => point.time >= firstVisibleTime).map((point) => ({ time: toChartTime(point.time), value: point.value }));
}

function toOhlcPoint(candle: PriceBar) { return { time: toChartTime(candle.time), open: candle.open, high: candle.high, low: candle.low, close: candle.close }; }
function toChartTime(value: string) { return /^\d{10}$/.test(value) ? Number(value) as Time : value as Time; }
function timeKey(time: Time) {
  if (typeof time === "string") return time;
  if (typeof time === "number") return String(time);
  return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
}

function isIntradayInterval(value: ChartTimeframe): value is IntradayInterval {
  return intradayIntervals.includes(value as IntradayInterval);
}

function calculatePerformance(
  label: string,
  startPrice: number | undefined,
  endPrice: number | undefined,
  startTime?: string,
  endTime?: string,
) {
  if (startPrice === undefined || endPrice === undefined || !Number.isFinite(startPrice) || !Number.isFinite(endPrice) || startPrice <= 0) return null;
  const change = endPrice - startPrice;
  return { label, startPrice, endPrice, change, percent: (change / startPrice) * 100, startTime, endTime };
}

function rangeLabel(range: ChartRange) {
  if (range === "YTD") return "Year to date";
  if (range === "ALL") return "All-time";
  if (range === "CUSTOM") return "Custom period";
  const unit = range.endsWith("M") ? "month" : "year";
  const count = Number.parseInt(range, 10);
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

function formatBarTime(value: string) {
  if (!/^\d{10}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(Number(value) * 1_000));
}

function formatValue(value: number, prefix: string) { return `${prefix}${formatNumber(value)}`; }

function ControlButton({ active = false, label, onClick }: { readonly active?: boolean; readonly label: string; readonly onClick: () => void }) {
  return <button className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] bg-white text-[var(--muted)] hover:bg-[var(--panel-soft)]"}`} onClick={onClick} type="button">{label}</button>;
}
function SelectControl({ ariaLabel, onChange, value, values }: { readonly ariaLabel: string; readonly onChange: (value: string) => void; readonly value: string; readonly values: readonly string[] }) {
  return <select aria-label={ariaLabel} className="h-8 rounded-md border border-[var(--border)] bg-white px-2 text-xs font-medium" onChange={(event) => onChange(event.target.value)} value={value}>{values.map((option) => <option key={option}>{option}</option>)}</select>;
}
function Legend({ color, label }: { readonly color: string; readonly label: string }) { return <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ backgroundColor: color }} />{label}</span>; }

function downloadChart(chart: IChartApi | null, symbol: string) {
  if (!chart) return;
  chart.takeScreenshot(true).toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${symbol}-chart.png`;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
function toggleFullscreen(element: HTMLDivElement | null) {
  if (!element) return;
  if (document.fullscreenElement) void document.exitFullscreen();
  else void element.requestFullscreen();
}
function formatNumber(value: number) { return value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }); }
function windowHeight() { return typeof window === "undefined" ? 760 : window.innerHeight; }
