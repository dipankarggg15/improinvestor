import { getProcessResultCache } from "@/lib/cache/process-result-cache";
import type { ProviderIndexInstrument } from "@/lib/market-data/types";

export type IndexConstituent = {
  readonly companyName: string;
  readonly industry: string | null;
  readonly symbol: string;
  readonly series: string | null;
  readonly isin: string | null;
  readonly weightPercent: number | null;
};

export type IndexConstituentResult =
  | { readonly status: "available"; readonly sourceUrl: string; readonly stocks: readonly IndexConstituent[] }
  | { readonly status: "not-applicable" | "unavailable"; readonly message: string; readonly stocks: readonly [] };

const cache = getProcessResultCache<IndexConstituentResult>("nse-index-constituents-v1", 64);
const base = "https://www.niftyindices.com/IndexConstituent/";
const archiveBase = "https://nsearchives.nseindia.com/content/indices/";

// NSE Indices publishes one current-membership CSV per equity index. Upstox's
// instrument master uses shortened display names, so resolution is name-based.
const files = new Map(Object.entries({
  "Nifty 50": `${archiveBase}ind_nifty50list.csv`,
  "Nifty Next 50": `${archiveBase}ind_niftynext50list.csv`,
  "Nifty 100": `${archiveBase}ind_nifty100list.csv`,
  "Nifty 200": `${archiveBase}ind_nifty200list.csv`,
  "Nifty 500": `${archiveBase}ind_nifty500list.csv`,
  "Nifty Total Market": `${archiveBase}ind_niftytotalmarket_list.csv`,
  "Nifty Midcap 150": `${archiveBase}ind_niftymidcap150list.csv`,
  "Nifty Midcap 100": `${archiveBase}ind_niftymidcap100list.csv`,
  "Nifty Midcap 50": `${archiveBase}ind_niftymidcap50list.csv`,
  "Nifty Midcap Select": `${archiveBase}ind_niftymidcapselect_list.csv`,
  "Nifty Smallcap 250": `${archiveBase}ind_niftysmallcap250list.csv`,
  "Nifty Smallcap 100": `${archiveBase}ind_niftysmallcap100list.csv`,
  "Nifty Smallcap 50": `${archiveBase}ind_niftysmallcap50list.csv`,
  "Nifty Smallcap 500": `${base}ind_niftysmallcap500_list.csv`,
  "Nifty Microcap 250": `${archiveBase}ind_niftymicrocap250_list.csv`,
  "Nifty LargeMidcap 250": `${archiveBase}ind_niftylargemidcap250list.csv`,
  "Nifty MidSmallcap 400": `${archiveBase}ind_niftymidsmallcap400list.csv`,
  "Nifty India FPI 150": `${base}ind_niftyIndiaFPI150_list.csv`,
  "Nifty Auto": `${base}ind_niftyautolist.csv`,
  "Nifty Bank": `${base}ind_niftybanklist.csv`,
  "Nifty Chemicals": `${base}ind_niftyChemicals_list.csv`,
  "Nifty Cement": `${base}ind_niftycement_list.csv`,
  "Nifty Financial Services": `${base}ind_niftyfinancelist.csv`,
  "Nifty Financial Services Ex-Bank": `${base}ind_niftyfinancialservicesexbank_list.csv`,
  "Nifty FMCG": `${base}ind_niftyfmcglist.csv`,
  "Nifty Healthcare": `${base}ind_niftyhealthcarelist.csv`,
  "Nifty IT": `${base}ind_niftyitlist.csv`,
  "Nifty Media": `${base}ind_niftymedialist.csv`,
  "Nifty Metal": `${base}ind_niftymetallist.csv`,
  "Nifty Pharma": `${base}ind_niftypharmalist.csv`,
  "Nifty Private Bank": `${base}ind_nifty_privatebanklist.csv`,
  "Nifty PSU Bank": `${base}ind_niftypsubanklist.csv`,
  "Nifty Realty": `${base}ind_niftyrealtylist.csv`,
  "Nifty Consumer Durables": `${base}ind_niftyconsumerdurableslist.csv`,
  "Nifty Oil and Gas": `${base}ind_niftyoilgaslist.csv`,
  "Nifty500 Healthcare": `${base}ind_nifty500Healthcare_list.csv`,
  "Nifty MidSmall Financial Services": `${base}ind_niftymidsmallfinancailservice_list.csv`,
  "Nifty MidSmall Healthcare": `${base}ind_niftymidsmallhealthcare_list.csv`,
  "Nifty MidSmall IT and Telecom": `${base}ind_niftymidsmallitAndtelecom_list.csv`,
  "Nifty Capital Markets": `${base}ind_niftyCapitalMarkets_list.csv`,
  "Nifty Commodities": `${base}ind_niftycommoditieslist.csv`,
  "Nifty Conglomerate 50": `${base}ind_niftyConglomerate50_list.csv`,
  "Nifty Core Housing": `${base}ind_niftyCoreHousing_list.csv`,
  "Nifty CPSE": `${base}ind_niftycpselist.csv`,
  "Nifty EV and New Age Automotive": `${base}ind_niftyEv_NewAgeAutomotive_list.csv`,
  "Nifty Energy": `${base}ind_niftyenergylist.csv`,
  "Nifty Housing": `${base}ind_niftyhousing_list.csv`,
  "Nifty India Consumption": `${base}ind_niftyconsumptionlist.csv`,
  "Nifty India Defence": `${base}ind_niftyindiadefence_list.csv`,
  "Nifty India Digital": `${base}ind_niftyindiadigital_list.csv`,
  "Nifty India Infrastructure and Logistics": `${base}ind_niftyIndiaInfrastructure_Logistics_list.csv`,
  "Nifty India Internet": `${base}ind_niftyIndiaInternet_list.csv`,
  "Nifty India Manufacturing": `${base}ind_niftyindiamanufacturing_list.csv`,
  "Nifty India New Age Consumption": `${base}ind_niftyIndiaNewAgeConsumption_list.csv`,
  "Nifty India Railways PSU": `${base}ind_niftyIndiaRailwaysPSU_list.csv`,
  "Nifty India Tourism": `${base}ind_niftyindiatourism_list.csv`,
  "Nifty Infrastructure": `${base}ind_niftyinfralist.csv`,
  "Nifty IPO": `${base}ind_niftyIPO_list.csv`,
  "Nifty Midcap Liquid 15": `${base}ind_Nifty_Midcap_Liquid15.csv`,
  "Nifty MNC": `${base}ind_niftymnclist.csv`,
  "Nifty Mobility": `${base}ind_niftymobility_list.csv`,
  "Nifty PSE": `${base}ind_niftypselist.csv`,
  "Nifty REITs and InvITs": `${base}ind_niftyREITs_InvITs_list.csv`,
  "Nifty Rural": `${base}ind_niftyRural_list.csv`,
  "Nifty Non-Cyclical Consumer": `${base}ind_niftynon-cyclicalconsumer_list.csv`,
  "Nifty Services Sector": `${base}ind_niftyservicelist.csv`,
  "Nifty100 Liquid 15": `${base}ind_Nifty100_Liquid15.csv`,
  "Nifty SME Emerge": `${base}ind_niftysmelist.csv`,
  "Nifty Waves": `${base}ind_niftyWaves_list.csv`,
  "Nifty India Select 5 Corporate Groups MAATR": `${base}ind_niftyIndiaSelect5CorporateGroupsMAATR_list.csv`,
  "Nifty100 Equal Weight": `${base}ind_nifty100list.csv`,
  "Nifty100 Low Volatility 30": `${base}ind_Nifty100LowVolatility30list.csv`,
  "Nifty200 Momentum 30": `${base}ind_nifty200Momentum30_list.csv`,
  "Nifty200 Alpha 30": `${base}ind_nifty200alpha30_list.csv`,
  "Nifty100 Alpha 30": `${base}ind_nifty100Alpha30list.csv`,
  "Nifty Dividend Opportunities 50": `${base}ind_niftydivopp50list.csv`,
  "Nifty Growth Sectors 15": `${base}ind_NiftyGrowth_Sectors15_Index.csv`,
  "Nifty High Beta 50": `${base}nifty_High_Beta50_Index.csv`,
  "Nifty Low Volatility 50": `${base}nifty_low_Volatility50_Index.csv`,
  "Nifty Top 10 Equal Weight": `${base}ind_niftytop10EqualWeight_list.csv`,
  "Nifty Top 15 Equal Weight": `${base}ind_niftytop15EqualWeight_list.csv`,
  "Nifty Top 20 Equal Weight": `${base}ind_niftyTop20EqualWeight_list.csv`,
  "Nifty100 Quality 30": `${base}ind_nifty100Quality30list.csv`,
  "Nifty Midcap150 Momentum 50": `${base}ind_niftymidcap150momentum50_list.csv`,
  "Nifty Midcap150 Quality 50": `${base}ind_niftymidcap150quality50list.csv`,
  "Nifty Alpha 50": `${base}ind_nifty_Alpha_Index.csv`,
  "Nifty50 Equal Weight": `${base}ind_Nifty50EqualWeight.csv`,
  "Nifty50 Value 20": `${base}ind_Nifty50_Value20.csv`,
  "Nifty200 Value 30": `${base}ind_nifty200Value30_list.csv`,
  "Nifty500 Flexicap Quality 30": `${base}ind_nifty500FlexicapQuality30_list.csv`,
  "Nifty500 Value 50": `${base}ind_nifty500Value50_list.csv`,
  "Nifty500 Equal Weight": `${base}ind_nifty500EqualWeight_list.csv`,
  "Nifty500 Low Volatility 50": `${base}ind_nifty500LowVolatility50_list.csv`,
  "Nifty500 Momentum 50": `${base}ind_nifty500Momentum50_list.csv`,
  "Nifty500 Quality 50": `${base}ind_nifty500Quality50_list.csv`,
  "Nifty500 Multifactor MQVLv 50": `${base}ind_nifty500MultifactorMQVLv50_list.csv`,
  "Nifty200 Quality 30": `${base}ind_nifty200Quality30_list.csv`,
  "Nifty MidSmallcap400 Momentum Quality 100": `${base}ind_niftyMidSmallcap400MomentumQuality100_list.csv`,
  "Nifty Smallcap250 Quality 50": `${base}ind_niftySmallcap250_Quality50_list.csv`,
  "Nifty Smallcap250 Momentum Quality 100": `${base}ind_niftySmallcap250MomentumQuality100_list.csv`,
  "Nifty Total Market Momentum Quality 50": `${base}ind_niftyTotalMarketMomentumQuality50_list.csv`,
}).map(([name, url]) => [normalizeIndexName(name), url]));

const aliases = new Map(Object.entries({
  "NIFTY CONSR DURBL": "Nifty Consumer Durables",
  "Nifty Capital Mkt": "Nifty Capital Markets",
  "Nifty Consumption": "Nifty India Consumption",
  "Nifty Div Opps 50": "Nifty Dividend Opportunities 50",
  "Nifty EV": "Nifty EV and New Age Automotive",
  "Nifty Fin Service": "Nifty Financial Services",
  "Nifty FinSerExBnk": "Nifty Financial Services Ex-Bank",
  "Nifty FinSrv25 50": "Nifty Financial Services 25/50",
  "Nifty FPI 150": "Nifty India FPI 150",
  "Nifty GrowSect 15": "Nifty Growth Sectors 15",
  "NIFTY HEALTHCARE": "Nifty Healthcare",
  "Nifty Ind Defence": "Nifty India Defence",
  "Nifty Ind Tourism": "Nifty India Tourism",
  "NIFTY IND DIGITAL": "Nifty India Digital",
  "NIFTY INDIA MFG": "Nifty India Manufacturing",
  "Nifty Infra": "Nifty Infrastructure",
  "Nifty InfraLog": "Nifty India Infrastructure and Logistics",
  "Nifty Internet": "Nifty India Internet",
  "NIFTY LARGEMID250": "Nifty LargeMidcap 250",
  "Nifty Low Vol 50": "Nifty Low Volatility 50",
  "NIFTY M150 QLTY50": "Nifty Midcap150 Quality 50",
  "NIFTY MID SELECT": "Nifty Midcap Select",
  "Nifty Mid Liq 15": "Nifty Midcap Liquid 15",
  "NIFTY MIDSML 400": "Nifty MidSmallcap 400",
  "Nifty MidSml Hlth": "Nifty MidSmall Healthcare",
  "Nifty MS Fin Serv": "Nifty MidSmall Financial Services",
  "Nifty MS IT Telcm": "Nifty MidSmall IT and Telecom",
  "Nifty New Consump": "Nifty India New Age Consumption",
  "Nifty NonCyc Cons": "Nifty Non-Cyclical Consumer",
  "NIFTY OIL AND GAS": "Nifty Oil and Gas",
  "Nifty Pvt Bank": "Nifty Private Bank",
  "Nifty RailwaysPSU": "Nifty India Railways PSU",
  "Nifty Serv Sector": "Nifty Services Sector",
  "Nifty Sml250 Q50": "Nifty Smallcap250 Quality 50",
  "NiftySml250MQ 100": "Nifty Smallcap250 Momentum Quality 100",
  "NIFTY SMLCAP 100": "Nifty Smallcap 100",
  "NIFTY SMLCAP 250": "Nifty Smallcap 250",
  "NIFTY SMLCAP 50": "Nifty Smallcap 50",
  "NIFTY TOTAL MKT": "Nifty Total Market",
  "Nifty100 Liq 15": "Nifty100 Liquid 15",
  "NIFTY100 LowVol30": "Nifty100 Low Volatility 30",
  "NIFTY100 Qualty30": "Nifty100 Quality 30",
  "Nifty200Momentm30": "Nifty200 Momentum 30",
  "NIFTY200 QUALTY30": "Nifty200 Quality 30",
  "NIFTY50 EQL Wgt": "Nifty50 Equal Weight",
  "Nifty500 EW": "Nifty500 Equal Weight",
  "Nifty500 Flexicap": "Nifty500 Flexicap Quality 30",
  "Nifty500 LowVol50": "Nifty500 Low Volatility 50",
  "Nifty500 MQVLv50": "Nifty500 Multifactor MQVLv 50",
  "Nifty500 Qlty50": "Nifty500 Quality 50",
  "Nifty500Momentm50": "Nifty500 Momentum 50",
  "NiftyM150Momntm50": "Nifty Midcap150 Momentum 50",
  "NiftyMS400 MQ 100": "Nifty MidSmallcap400 Momentum Quality 100",
  "Nifty TMMQ 50": "Nifty Total Market Momentum Quality 50",
  "Nifty Corp MAATR": "Nifty India Select 5 Corporate Groups MAATR",
  "Nifty Top 10 EW": "Nifty Top 10 Equal Weight",
  "Nifty Top 15 EW": "Nifty Top 15 Equal Weight",
  "Nifty Top 20 EW": "Nifty Top 20 Equal Weight",
  "NIFTY100 EQL Wgt": "Nifty100 Equal Weight",
  "Nifty500 Health": "Nifty500 Healthcare",
  "NiftyConglomerate": "Nifty Conglomerate 50",
}).map(([name, canonical]) => [normalizeIndexName(name), normalizeIndexName(canonical)]));

export async function getCachedIndexConstituents(index: ProviderIndexInstrument): Promise<IndexConstituentResult> {
  const key = index.instrumentKey;
  return (await cache.getOrCreate(key, () => fetchIndexConstituents(index))).value;
}

export async function fetchIndexConstituents(index: ProviderIndexInstrument, fetcher: typeof fetch = fetch): Promise<IndexConstituentResult> {
  if (index.exchange !== "NSE") {
    return { status: "not-applicable", message: "This global index does not publish NSE stock constituents.", stocks: [] };
  }
  if (isNonEquityIndex(index.name)) {
    return { status: "not-applicable", message: "This is a volatility, fixed-income, or derived index and does not directly contain a stock basket.", stocks: [] };
  }
  const sourceUrl = resolveIndexConstituentUrl(index.name);
  if (!sourceUrl) {
    return { status: "unavailable", message: "NSE Indices does not currently expose a public constituent CSV for this equity index.", stocks: [] };
  }

  try {
    const response = await fetcher(sourceUrl, {
      headers: { Accept: "text/csv,*/*", Referer: "https://www.niftyindices.com/", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const stocks = parseIndexConstituentCsv(await response.text());
    if (stocks.length === 0) throw new Error("empty constituent list");
    return { status: "available", sourceUrl, stocks };
  } catch {
    return { status: "unavailable", message: "The official NSE constituent list is temporarily unavailable. Try this index again shortly.", stocks: [] };
  }
}

export function resolveIndexConstituentUrl(name: string) {
  const normalized = normalizeIndexName(name);
  return files.get(aliases.get(normalized) ?? normalized) ?? null;
}

export function parseIndexConstituentCsv(csv: string): IndexConstituent[] {
  const rows = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/).map(parseCsvRow);
  const header = rows.shift()?.map((value) => value.trim().toLocaleLowerCase("en-IN")) ?? [];
  const column = (...names: string[]) => names.map((name) => header.indexOf(name)).find((index) => index >= 0) ?? -1;
  const indexes = {
    company: column("company name", "company"),
    industry: column("industry", "sector"),
    symbol: column("symbol", "ticker"),
    series: column("series"),
    isin: column("isin code", "isin"),
    weight: column("weightage", "weight (%)", "weight"),
  };
  if (indexes.company < 0 || indexes.symbol < 0) return [];

  return rows.flatMap((row) => {
    const companyName = row[indexes.company]?.trim() ?? "";
    const symbol = row[indexes.symbol]?.trim().toUpperCase() ?? "";
    if (!companyName || !symbol || symbol === "NIFTY 50") return [];
    const rawWeight = indexes.weight >= 0 ? Number(row[indexes.weight]?.replace("%", "")) : NaN;
    return [{
      companyName,
      industry: indexes.industry >= 0 ? row[indexes.industry]?.trim() || null : null,
      symbol,
      series: indexes.series >= 0 ? row[indexes.series]?.trim() || null : null,
      isin: indexes.isin >= 0 ? row[indexes.isin]?.replace(/\s+/g, "").toUpperCase() || null : null,
      weightPercent: Number.isFinite(rawWeight) ? rawWeight : null,
    }];
  });
}

function normalizeIndexName(name: string) {
  return name.toLocaleLowerCase("en-IN").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function isNonEquityIndex(name: string) {
  return /bharatbond|\b(vix|g-?sec|bond|div(?:idend)?\s*point|\bpr\b|\btr\b|inverse|\binv\b|leverage|\blev\b|usd)\b/i.test(name);
}

function parseCsvRow(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(current);
      current = "";
    } else current += character;
  }
  values.push(current);
  return values;
}
