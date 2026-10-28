"use client";

import { useEffect, useMemo, useState } from "react";

export type BrowserLiveQuote = {
  readonly instrumentKey: string;
  readonly lastPrice: number;
  readonly previousClose: number | null;
  readonly lastTradedAt: string | null;
  readonly receivedAt?: string;
};

export type BrowserLiveStatus = "connecting" | "live" | "fallback";

export function useLiveQuotes(instrumentKeys: readonly string[]) {
  const normalizedKeys = useMemo(() => [...new Set(instrumentKeys)].sort(), [instrumentKeys]);
  const keySignature = normalizedKeys.join("\n");
  const [quotes, setQuotes] = useState<Record<string, BrowserLiveQuote>>({});
  const [status, setStatus] = useState<BrowserLiveStatus>("connecting");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!keySignature) return;
    const keys = keySignature.split("\n");
    const query = new URLSearchParams(keys.map((instrumentKey) => ["instrumentKey", instrumentKey]));
    const source = new EventSource(`/api/market/live-quotes?${query.toString()}`);
    const onQuotes = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          readonly fetchedAt?: string;
          readonly status?: string;
          readonly quotes?: BrowserLiveQuote[];
        };
        if (payload.quotes?.length) {
          setQuotes((current) => ({ ...current, ...Object.fromEntries(payload.quotes!.map((quote) => [quote.instrumentKey, quote])) }));
          setUpdatedAt(payload.fetchedAt ?? new Date().toISOString());
        }
        setStatus(payload.status === "live" ? "live" : "connecting");
      } catch {
        setStatus("fallback");
      }
    };
    source.addEventListener("quotes", onQuotes as EventListener);
    source.onerror = () => setStatus("fallback");
    return () => {
      source.removeEventListener("quotes", onQuotes as EventListener);
      source.close();
    };
  }, [keySignature]);

  return { quotes, status: keySignature ? status : "fallback" as const, updatedAt };
}
