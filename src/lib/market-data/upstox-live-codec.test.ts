import { describe, expect, it } from "vitest";

import { decodeUpstoxLtpcFeed } from "@/lib/market-data/upstox-live-codec";

describe("decodeUpstoxLtpcFeed", () => {
  it("decodes LTPC prices from a V3 feed map", () => {
    const ltpc = concat(
      fieldDouble(1, 247.35),
      fieldVarint(2, BigInt("1761546600000")),
      fieldVarint(3, BigInt(25)),
      fieldDouble(4, 240.1),
    );
    const feed = fieldBytes(1, ltpc);
    const mapEntry = concat(fieldString(1, "NSE_EQ|INE002A01018"), fieldBytes(2, feed));
    const response = concat(fieldVarint(1, BigInt(1)), fieldBytes(2, mapEntry), fieldVarint(3, BigInt("1761546600100")));

    expect(decodeUpstoxLtpcFeed(response)).toEqual([{
      instrumentKey: "NSE_EQ|INE002A01018",
      lastPrice: 247.35,
      previousClose: 240.1,
      lastTradedAt: new Date(1_761_546_600_000),
    }]);
  });

  it("ignores market-status and unsupported feed messages", () => {
    expect(decodeUpstoxLtpcFeed(fieldVarint(1, BigInt(2)))).toEqual([]);
  });
});

function fieldVarint(field: number, value: bigint) {
  return concat(varint(BigInt(field << 3)), varint(value));
}

function fieldDouble(field: number, value: number) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, true);
  return concat(varint(BigInt((field << 3) | 1)), bytes);
}

function fieldBytes(field: number, value: Uint8Array) {
  return concat(varint(BigInt((field << 3) | 2)), varint(BigInt(value.length)), value);
}

function fieldString(field: number, value: string) {
  return fieldBytes(field, new TextEncoder().encode(value));
}

function varint(value: bigint) {
  const bytes: number[] = [];
  let remaining = value;
  do {
    const byte = Number(remaining & BigInt(0x7f));
    remaining >>= BigInt(7);
    bytes.push(remaining > BigInt(0) ? byte | 0x80 : byte);
  } while (remaining > BigInt(0));
  return Uint8Array.from(bytes);
}

function concat(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
