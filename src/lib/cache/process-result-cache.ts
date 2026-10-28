type CacheEntry<T> = {
  readonly createdAt: string;
  readonly value: Promise<T>;
};

export type CachedResult<T> = {
  readonly value: T;
  readonly calculatedAt: string;
  readonly reused: boolean;
};

type CacheRegistry = Map<string, ProcessResultCache<unknown>>;

const registryKey = Symbol.for("improinvestor.process-result-cache-registry");

export class ProcessResultCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(private readonly maximumEntries: number) {}

  async getOrCreate(key: string, calculate: () => Promise<T>): Promise<CachedResult<T>> {
    const existing = this.entries.get(key);
    if (existing) {
      // Refresh insertion order so frequently used scans remain in the bounded cache.
      this.entries.delete(key);
      this.entries.set(key, existing);
      return {
        value: await existing.value,
        calculatedAt: existing.createdAt,
        reused: true,
      };
    }

    const createdAt = new Date().toISOString();
    const value = calculate();
    const entry = { createdAt, value };
    this.entries.set(key, entry);
    this.trim();

    try {
      return { value: await value, calculatedAt: createdAt, reused: false };
    } catch (error) {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    }
  }

  private trim() {
    while (this.entries.size > this.maximumEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) return;
      this.entries.delete(oldestKey);
    }
  }
}

export function getProcessResultCache<T>(name: string, maximumEntries = 48): ProcessResultCache<T> {
  const globalWithCache = globalThis as typeof globalThis & { [registryKey]?: CacheRegistry };
  const registry = globalWithCache[registryKey] ?? new Map<string, ProcessResultCache<unknown>>();
  globalWithCache[registryKey] = registry;

  const existing = registry.get(name);
  if (existing) return existing as ProcessResultCache<T>;

  const cache = new ProcessResultCache<T>(maximumEntries);
  registry.set(name, cache as ProcessResultCache<unknown>);
  return cache;
}
