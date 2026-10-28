export type DecodedLiveQuote = {
  readonly instrumentKey: string;
  readonly lastPrice: number;
  readonly previousClose: number | null;
  readonly lastTradedAt: Date | null;
};

/**
 * Decode the LTPC subset of Upstox Market Data Feed V3 without pulling the
 * considerably larger protobuf runtime into the application. Unknown fields
 * are deliberately skipped so additions to the upstream schema remain safe.
 */
export function decodeUpstoxLtpcFeed(input: ArrayBuffer | Uint8Array): DecodedLiveQuote[] {
  const reader = new ProtobufReader(input instanceof Uint8Array ? input : new Uint8Array(input));
  const quotes: DecodedLiveQuote[] = [];

  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field !== 2 || wire !== 2) {
      reader.skip(wire);
      continue;
    }

    const entry = new ProtobufReader(reader.bytes());
    let instrumentKey: string | null = null;
    let quote: Omit<DecodedLiveQuote, "instrumentKey"> | null = null;
    while (!entry.done) {
      const entryTag = entry.tag();
      if (entryTag.field === 1 && entryTag.wire === 2) instrumentKey = entry.string();
      else if (entryTag.field === 2 && entryTag.wire === 2) quote = decodeFeed(entry.bytes());
      else entry.skip(entryTag.wire);
    }
    if (instrumentKey && quote && Number.isFinite(quote.lastPrice)) quotes.push({ instrumentKey, ...quote });
  }

  return quotes;
}

function decodeFeed(bytes: Uint8Array) {
  const reader = new ProtobufReader(bytes);
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1 && wire === 2) return decodeLtpc(reader.bytes());
    reader.skip(wire);
  }
  return null;
}

function decodeLtpc(bytes: Uint8Array): Omit<DecodedLiveQuote, "instrumentKey"> | null {
  const reader = new ProtobufReader(bytes);
  let lastPrice: number | null = null;
  let previousClose: number | null = null;
  let lastTradedAt: Date | null = null;

  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1 && wire === 1) lastPrice = reader.double();
    else if (field === 2 && wire === 0) {
      const milliseconds = Number(reader.varint());
      if (Number.isFinite(milliseconds) && milliseconds > 0) lastTradedAt = new Date(milliseconds);
    } else if (field === 4 && wire === 1) previousClose = reader.double();
    else reader.skip(wire);
  }

  return lastPrice === null ? null : { lastPrice, previousClose, lastTradedAt };
}

class ProtobufReader {
  private offset = 0;

  constructor(private readonly data: Uint8Array) {}

  get done() {
    return this.offset >= this.data.length;
  }

  tag() {
    const value = Number(this.varint());
    if (value === 0) throw new Error("Invalid protobuf tag.");
    return { field: value >>> 3, wire: value & 7 };
  }

  varint() {
    let result = BigInt(0);
    let shift = BigInt(0);
    for (let index = 0; index < 10; index += 1) {
      const byte = this.readByte();
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
      shift += BigInt(7);
    }
    throw new Error("Invalid protobuf varint.");
  }

  bytes() {
    const length = Number(this.varint());
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.data.length) {
      throw new Error("Invalid protobuf length.");
    }
    const value = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  string() {
    return new TextDecoder().decode(this.bytes());
  }

  double() {
    this.ensureAvailable(8);
    const value = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 8).getFloat64(0, true);
    this.offset += 8;
    return value;
  }

  skip(wire: number) {
    if (wire === 0) void this.varint();
    else if (wire === 1) this.advance(8);
    else if (wire === 2) void this.bytes();
    else if (wire === 5) this.advance(4);
    else throw new Error(`Unsupported protobuf wire type ${wire}.`);
  }

  private readByte() {
    this.ensureAvailable(1);
    return this.data[this.offset++];
  }

  private advance(length: number) {
    this.ensureAvailable(length);
    this.offset += length;
  }

  private ensureAvailable(length: number) {
    if (this.offset + length > this.data.length) throw new Error("Unexpected end of protobuf message.");
  }
}
