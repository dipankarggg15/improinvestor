import type { PrismaClient } from "@prisma/client";

import { isEligibleNseOrdinaryEquityInstrument } from "@/lib/strategies/nse-universe";

const upstoxFundamentalsBaseUrl = "https://api.upstox.com/v2/fundamentals";
const dataType = "company_profile_sector";

export type UpstoxCompanyProfile = {
  readonly companyProfile: string | null;
  readonly sector: string;
};

export type UpstoxSectorSyncResult = {
  readonly total: number;
  readonly processed: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly failed: number;
  readonly failures: readonly { readonly isin: string; readonly company: string; readonly error: string }[];
};

export function parseUpstoxCompanyProfile(payload: unknown): UpstoxCompanyProfile {
  if (!isRecord(payload) || payload.status !== "success" || !isRecord(payload.data)) {
    throw new Error("Upstox company profile response was malformed.");
  }
  const sector = stringValue(payload.data.sector);
  if (!sector) throw new SectorUnavailableError();
  return {
    companyProfile: stringValue(payload.data.company_profile),
    sector,
  };
}

export async function fetchUpstoxCompanyProfile(input: {
  readonly isin: string;
  readonly token: string | undefined;
  readonly fetch?: typeof fetch;
  readonly baseUrl?: string;
}): Promise<UpstoxCompanyProfile> {
  if (!input.token) throw new Error("Missing UPSTOX_ANALYTICS_TOKEN.");
  const fetcher = input.fetch ?? fetch;
  const url = `${input.baseUrl ?? upstoxFundamentalsBaseUrl}/${encodeURIComponent(input.isin)}/profile`;
  const response = await fetcher(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${input.token}` },
  });
  if (response.status === 401 || response.status === 403) throw new Error("Upstox authentication failed.");
  if (response.status === 400 || response.status === 404 || response.status === 422) throw new SectorUnavailableError();
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw Object.assign(new Error("Upstox rate limit exceeded."), {
      retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1_000 : 0,
    });
  }
  if (!response.ok) throw new Error(`Upstox company profile request failed with status ${response.status}.`);
  return parseUpstoxCompanyProfile(await response.json());
}

export async function syncUpstoxCompanySectors(input: {
  readonly client: PrismaClient;
  readonly token: string | undefined;
  readonly fetch?: typeof fetch;
  readonly concurrency?: number;
  readonly limit?: number;
  readonly refresh?: boolean;
  readonly progressEvery?: number;
  readonly onProgress?: (progress: Pick<UpstoxSectorSyncResult, "processed" | "updated" | "unchanged" | "failed">) => void;
}): Promise<UpstoxSectorSyncResult> {
  if (!input.token) throw new Error("Missing UPSTOX_ANALYTICS_TOKEN.");
  const startedAt = new Date();
  await input.client.dataSync.updateMany({
    where: { provider: "upstox", dataType, status: "RUNNING" },
    data: {
      status: "FAILED",
      completedAt: startedAt,
      errorMessage: "Superseded by a resumed Upstox company-sector sync.",
    },
  });
  const where = {
    marketDataSource: "UPSTOX_REAL" as const,
    ...(input.refresh ? {} : { sector: null }),
  };
  const storedCompanies = await input.client.company.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true, isin: true, name: true, sector: true,
      instruments: {
        where: { active: true, marketDataSource: "UPSTOX_REAL" },
        select: { exchange: true, symbol: true, instrumentKey: true },
      },
    },
  });
  const companies = storedCompanies
    .sort((left, right) => ordinaryNsePriority(left) - ordinaryNsePriority(right) || left.name.localeCompare(right.name))
    .slice(0, input.limit);
  const job = await input.client.dataSync.create({
    data: {
      provider: "upstox",
      dataType,
      status: "RUNNING",
      metadata: { refresh: input.refresh ?? false, totalCompanies: companies.length },
    },
    select: { id: true },
  });
  let processed = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  const failures: Array<{ readonly isin: string; readonly company: string; readonly error: string }> = [];
  const progressEvery = Math.max(1, input.progressEvery ?? 25);

  try {
    await mapConcurrent(companies, Math.max(1, input.concurrency ?? 2), async (company) => {
      try {
        const profile = await withRetry(() => fetchUpstoxCompanyProfile({
          isin: company.isin,
          token: input.token,
          fetch: input.fetch,
        }));
        if (company.sector === profile.sector) {
          unchanged += 1;
        } else {
          await input.client.company.update({ where: { id: company.id }, data: { sector: profile.sector } });
          updated += 1;
        }
      } catch (error) {
        if (error instanceof SectorUnavailableError) {
          skipped += 1;
        } else {
          failures.push({
            isin: company.isin,
            company: company.name,
            error: error instanceof Error ? error.message : "Unknown Upstox company profile failure.",
          });
        }
      } finally {
        processed += 1;
        const progress = { processed, updated, unchanged, failed: failures.length };
        if (processed % progressEvery === 0 || processed === companies.length) {
          input.onProgress?.(progress);
          await input.client.dataSync.update({
            where: { id: job.id },
            data: {
              recordsProcessed: processed,
              recordsSucceeded: updated + unchanged,
              recordsFailed: failures.length,
              recordsSkipped: skipped,
              metadata: { refresh: input.refresh ?? false, totalCompanies: companies.length, failures: failures.slice(-25) },
            },
          });
        }
      }
    });

    const result = { total: companies.length, processed, updated, unchanged, skipped, failed: failures.length, failures };
    await input.client.dataSync.update({
      where: { id: job.id },
      data: {
        completedAt: new Date(),
        status: failures.length > 0 ? "FAILED" : "COMPLETED",
        recordsProcessed: processed,
        recordsSucceeded: updated + unchanged,
        recordsFailed: failures.length,
        recordsSkipped: skipped,
        errorMessage: failures.length > 0 ? `${failures.length} company profile(s) failed.` : null,
        metadata: { refresh: input.refresh ?? false, totalCompanies: companies.length, startedAt: startedAt.toISOString(), failures },
      },
    });
    return result;
  } catch (error) {
    await input.client.dataSync.update({
      where: { id: job.id },
      data: {
        completedAt: new Date(), status: "FAILED", recordsProcessed: processed,
        recordsSucceeded: updated + unchanged, recordsFailed: failures.length,
        recordsSkipped: skipped,
        errorMessage: error instanceof Error ? error.message : "Unknown Upstox sector sync failure.",
      },
    });
    throw error;
  }
}

async function withRetry<T>(operation: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error instanceof SectorUnavailableError) break;
      if (attempt === attempts || (error instanceof Error && /status 4\d\d/.test(error.message) && !error.message.includes("429"))) break;
      const retryAfterMs = error instanceof Error && "retryAfterMs" in error && typeof error.retryAfterMs === "number"
        ? error.retryAfterMs : 0;
      await delay(Math.max(retryAfterMs, Math.min(30_000, 500 * (2 ** (attempt - 1)))));
    }
  }
  throw lastError;
}

class SectorUnavailableError extends Error {
  constructor() {
    super("Upstox company profile did not include a sector.");
  }
}

async function mapConcurrent<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      if (item) await worker(item);
    }
  });
  await Promise.all(workers);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ordinaryNsePriority(company: {
  readonly name: string;
  readonly instruments: readonly { readonly exchange: string; readonly symbol: string; readonly instrumentKey: string }[];
}) {
  return company.instruments.some((instrument) => instrument.exchange === "NSE" && isEligibleNseOrdinaryEquityInstrument({
    instrumentKey: instrument.instrumentKey,
    companyName: company.name,
    symbol: instrument.symbol,
  })) ? 0 : 1;
}
