import { getQuotes } from 'idx-finance';

export const DEFAULT_UNIVERSE = [
  "BBCA","BBRI","BMRI","BBNI","TLKM","ASII","UNVR","ICBP","INDF","KLBF",
  "ANTM","INCO","PTBA","ADRO","ITMG","PGAS","MEDC","AKRA","SMGR","INTP",
  "JPFA","CPIN","GOTO","BUKA","EMTK","EXCL","ISAT","TOWR","TBIG","MTEL",
  "ARTO","BBTN","BNGA","NISP","MDKA","TINS","SMRA","BSDE","CTRA","PWON",
  "ACES","MAPI","AMRT","HMSP","GGRM","MYOR","TSPC","SILO","MPPA","SRTG",
  "BFIN","ADMF","PNLF"
];

export function dedupeUniverse(list: string[]) {
  return [...new Set(list)];
}

export async function fetchQuotes(tickers: string[]) {
  if (tickers.length === 0) return {};
  try {
    const quotes = await getQuotes(tickers);
    const result: Record<string, any> = {};
    for (const [ticker, data] of Object.entries(quotes)) {
      result[ticker] = {
        price: data.price,
        change: data.change,
        changePct: data.changePercent,
      };
    }
    return result;
  } catch (e) {
    console.error("idx-finance error:", e);
    return {};
  }
}