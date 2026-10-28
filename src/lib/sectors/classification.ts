import type { PrismaClient } from "@prisma/client";

export const nifty500ConstituentUrl = "https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv";

export type Nifty500Classification = {
  readonly companyName: string;
  readonly sector: string;
  readonly symbol: string;
  readonly series: string;
  readonly isin: string;
};

export function parseNifty500ClassificationCsv(csv: string): Nifty500Classification[] {
  const rows = csv.trim().split(/\r?\n/).map(parseCsvRow);
  const header = rows.shift()?.map((value) => value.trim()) ?? [];
  const indexes = {
    companyName: header.indexOf("Company Name"),
    sector: header.indexOf("Industry"),
    symbol: header.indexOf("Symbol"),
    series: header.indexOf("Series"),
    isin: header.indexOf("ISIN Code"),
  };
  if (Object.values(indexes).some((index) => index < 0)) {
    throw new Error("Nifty 500 classification CSV is missing required columns.");
  }

  return rows.flatMap((row) => {
    const item = {
      companyName: row[indexes.companyName]?.trim() ?? "",
      sector: row[indexes.sector]?.trim() ?? "",
      symbol: row[indexes.symbol]?.trim().toUpperCase() ?? "",
      series: row[indexes.series]?.trim().toUpperCase() ?? "",
      isin: row[indexes.isin]?.replace(/\s+/g, "").toUpperCase() ?? "",
    };
    return item.companyName && item.sector && item.symbol && /^INE[A-Z0-9]{9}$/.test(item.isin) ? [item] : [];
  });
}

export async function fetchNifty500Classifications(fetcher: typeof fetch = fetch) {
  const response = await fetcher(nifty500ConstituentUrl, {
    headers: {
      Accept: "text/csv,*/*",
      Referer: "https://www.niftyindices.com/indices/equity/broad-based-indices/NIFTY-500",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) throw new Error(`Nifty 500 classification download failed with status ${response.status}.`);
  return parseNifty500ClassificationCsv(await response.text());
}

export async function syncNifty500Classifications(client: PrismaClient, classifications: readonly Nifty500Classification[]) {
  const currentIsins = classifications.map((item) => item.isin);
  const removed = await client.company.updateMany({
    where: { nifty500Sector: { not: null }, isin: { notIn: currentIsins } },
    data: { nifty500Sector: null },
  });
  const stored = await client.company.findMany({
    where: { isin: { in: currentIsins } },
    select: { id: true, isin: true, nifty500Sector: true },
  });
  const byIsin = new Map(stored.map((company) => [company.isin, company]));
  let updated = 0;
  let unchanged = 0;
  let missing = 0;

  for (const item of classifications) {
    const company = byIsin.get(item.isin);
    if (!company) {
      missing += 1;
      continue;
    }
    if (company.nifty500Sector === item.sector) {
      unchanged += 1;
      continue;
    }
    await client.company.update({ where: { id: company.id }, data: { nifty500Sector: item.sector } });
    updated += 1;
  }

  return { downloaded: classifications.length, matched: stored.length, updated, unchanged, missing, removed: removed.count };
}

function parseCsvRow(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current);
  return values;
}
