import "server-only";

import { randomUUID } from "node:crypto";

import { decodeUpstoxLtpcFeed } from "@/lib/market-data/upstox-live-codec";

const authorizeUrl = "https://api.upstox.com/v3/feed/market-data-feed/authorize";
const maximumLtpcSubscriptions = 5_000;

export type CachedLiveQuote = {
  readonly instrumentKey: string;
  readonly lastPrice: number;
  readonly previousClose: number | null;
  readonly lastTradedAt: string | null;
  readonly receivedAt: string;
};

export type LiveFeedStatus = "idle" | "connecting" | "live" | "reconnecting" | "unavailable";

type AuthorizationResponse = {
  readonly data?: { readonly authorized_redirect_uri?: string };
};

class UpstoxLiveQuoteHub {
  private readonly cache = new Map<string, CachedLiveQuote>();
  private readonly references = new Map<string, number>();
  private readonly subscribed = new Set<string>();
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private connecting = false;
  private status: LiveFeedStatus = "idle";

  retain(instrumentKeys: readonly string[]) {
    const uniqueKeys = [...new Set(instrumentKeys)].slice(0, maximumLtpcSubscriptions);
    const added: string[] = [];
    for (const key of uniqueKeys) {
      const count = this.references.get(key) ?? 0;
      this.references.set(key, count + 1);
      if (count === 0) added.push(key);
    }
    if (added.length > 0 && this.socket?.readyState === WebSocket.OPEN) this.send("sub", added);
    void this.ensureConnected();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const removed: string[] = [];
      for (const key of uniqueKeys) {
        const count = this.references.get(key) ?? 0;
        if (count <= 1) {
          this.references.delete(key);
          if (this.subscribed.has(key)) removed.push(key);
        } else {
          this.references.set(key, count - 1);
        }
      }
      if (removed.length > 0 && this.socket?.readyState === WebSocket.OPEN) this.send("unsub", removed);
    };
  }

  seed(quotes: readonly Omit<CachedLiveQuote, "receivedAt">[]) {
    const receivedAt = new Date().toISOString();
    for (const quote of quotes) this.cache.set(quote.instrumentKey, { ...quote, receivedAt });
  }

  snapshot(instrumentKeys: readonly string[]) {
    return instrumentKeys.flatMap((key) => {
      const quote = this.cache.get(key);
      return quote ? [quote] : [];
    });
  }

  getStatus() {
    return this.status;
  }

  private async ensureConnected() {
    if (this.references.size === 0 || this.connecting || this.socket?.readyState === WebSocket.OPEN) return;
    const token = process.env.UPSTOX_ANALYTICS_TOKEN;
    if (!token) {
      this.status = "unavailable";
      return;
    }

    this.connecting = true;
    this.status = this.reconnectAttempts === 0 ? "connecting" : "reconnecting";
    try {
      const response = await fetch(authorizeUrl, {
        cache: "no-store",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Upstox feed authorization failed with status ${response.status}.`);
      const payload = await response.json() as AuthorizationResponse;
      const redirectUrl = payload.data?.authorized_redirect_uri;
      if (!redirectUrl?.startsWith("wss://")) throw new Error("Upstox did not return a WebSocket URL.");
      this.openSocket(redirectUrl);
    } catch (error) {
      this.status = "unavailable";
      console.error("Upstox live feed connection failed:", error instanceof Error ? error.message : error);
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private openSocket(url: string) {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.status = "live";
      this.reconnectAttempts = 0;
      this.subscribed.clear();
      this.send("sub", [...this.references.keys()]);
    });
    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      void this.consumeMessage(event.data);
    });
    socket.addEventListener("error", () => {
      if (this.socket === socket) this.status = "unavailable";
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.subscribed.clear();
      this.status = this.references.size > 0 ? "reconnecting" : "idle";
      if (this.references.size > 0) this.scheduleReconnect();
    });
  }

  private async consumeMessage(data: unknown) {
    try {
      const bytes = data instanceof ArrayBuffer
        ? data
        : ArrayBuffer.isView(data)
          ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          : data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : null;
      if (!bytes) return;
      const receivedAt = new Date().toISOString();
      for (const quote of decodeUpstoxLtpcFeed(bytes)) {
        this.cache.set(quote.instrumentKey, {
          instrumentKey: quote.instrumentKey,
          lastPrice: quote.lastPrice,
          previousClose: quote.previousClose,
          lastTradedAt: quote.lastTradedAt?.toISOString() ?? null,
          receivedAt,
        });
      }
    } catch (error) {
      console.error("Upstox live feed message could not be decoded:", error instanceof Error ? error.message : error);
    }
  }

  private send(method: "sub" | "unsub", instrumentKeys: readonly string[]) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || instrumentKeys.length === 0) return;
    for (let offset = 0; offset < instrumentKeys.length; offset += maximumLtpcSubscriptions) {
      const keys = instrumentKeys.slice(offset, offset + maximumLtpcSubscriptions);
      this.socket.send(new TextEncoder().encode(JSON.stringify({
        guid: randomUUID(),
        method,
        data: { mode: "ltpc", instrumentKeys: keys },
      })));
      if (method === "sub") keys.forEach((key) => this.subscribed.add(key));
      else keys.forEach((key) => this.subscribed.delete(key));
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.references.size === 0) return;
    const delay = Math.min(30_000, 1_000 * (2 ** this.reconnectAttempts));
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnected();
    }, delay);
  }
}

const globalForLiveQuotes = globalThis as unknown as { upstoxLiveQuoteHub?: UpstoxLiveQuoteHub };

export function getUpstoxLiveQuoteHub() {
  if (!globalForLiveQuotes.upstoxLiveQuoteHub) globalForLiveQuotes.upstoxLiveQuoteHub = new UpstoxLiveQuoteHub();
  return globalForLiveQuotes.upstoxLiveQuoteHub;
}
