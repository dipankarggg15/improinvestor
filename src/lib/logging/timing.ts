import "server-only";

export async function timeAsync<T>(name: string, operation: () => Promise<T>, thresholdMs = 1_000) {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= thresholdMs) {
      console.warn("Slow operation", { name, durationMs });
    }
  }
}
