import type { Bar } from "./doji-detector";

export interface Fundamental {
  ticker: string;
  per: number;
  pbv: number;
  roe: number;
  der: number;
  marketCap: number;
}

export interface SentimentResult {
  skor: number;
  label: string;
  beritaTerkait: any[];
}

export interface SignalResult {
  ticker: string;
  sinyal: "BELI" | "JUAL" | "HOLD";
  skor: number;
  rsi: number;
  macdHist: number;
  bbPosition: string;
  stochK: number;
  adx: number;
  volumeRatio: number;
  harga: number;
}

// ==================== INDIKATOR TEKNIKAL ====================

function calcSMA(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    out.push(sum / period);
  }
  return out;
}

function calcEMA(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      prev = sum / period;
    } else {
      prev = values[i] * k + (prev as number) * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

function calcRSI(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i < period) { out.push(null); continue; }
    if (i === period) {
      let g = 0, l = 0;
      for (let j = 1; j <= period; j++) {
        const d = closes[j] - closes[j - 1];
        if (d >= 0) g += d; else l -= d;
      }
      avgGain = g / period;
      avgLoss = l / period;
    } else {
      const d = closes[i] - closes[i - 1];
      const g = d > 0 ? d : 0;
      const l = d < 0 ? -d : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push(100 - 100 / (1 + rs));
  }
  return out;
}

function calcMACD(closes: number[]): { macd: number | null; signal: number | null; hist: number | null } {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] != null && ema26[i] != null) {
      macdLine.push((ema12[i] as number) - (ema26[i] as number));
    } else {
      macdLine.push(null);
    }
  }
  const validMacd = macdLine.filter(v => v != null) as number[];
  const signalLine = calcEMA(validMacd, 9);
  const offset = macdLine.length - signalLine.length;
  const n = macdLine.length - 1;
  const macd = macdLine[n];
  const signal = signalLine[n - offset] ?? null;
  const hist = macd != null && signal != null ? macd - signal : null;
  return { macd, signal, hist };
}

function calcADX(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const smooth = (arr: number[]) => {
    let sum = 0;
    for (let i = 0; i < period; i++) sum += arr[i];
    const out = [sum];
    for (let i = period; i < arr.length; i++) {
      sum = sum - sum / period + arr[i];
      out.push(sum);
    }
    return out;
  };
  const atr = smooth(tr);
  const plusDI = smooth(plusDM).map((v, i) => (v / (atr[i] || 1)) * 100);
  const minusDI = smooth(minusDM).map((v, i) => (v / (atr[i] || 1)) * 100);
  const dx = plusDI.map((p, i) => {
    const m = minusDI[i] || 0;
    return p + m === 0 ? 0 : (Math.abs(p - m) / (p + m)) * 100;
  });
  let adx = 0;
  for (let i = 0; i < period; i++) adx += dx[i];
  adx /= period;
  for (let i = period; i < dx.length; i++) {
    adx = (adx * (period - 1) + dx[i]) / period;
  }
  return adx;
}

function calcStochastic(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (closes.length < period) return null;
  const n = closes.length;
  const recentHighs = highs.slice(n - period);
  const recentLows = lows.slice(n - period);
  const hh = Math.max(...recentHighs);
  const ll = Math.min(...recentLows);
  if (hh === ll) return 50;
  return ((closes[n - 1] - ll) / (hh - ll)) * 100;
}

function calcBollinger(closes: number[], period = 20): { upper: number; lower: number; position: string } {
  if (closes.length < period) return { upper: 0, lower: 0, position: "unknown" };
  const recent = closes.slice(-period);
  const sma = recent.reduce((a, b) => a + b, 0) / period;
  const variance = recent.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = sma + 2 * std;
  const lower = sma - 2 * std;
  const price = closes[closes.length - 1];
  let position = "middle";
  if (price > upper) position = "upper";
  else if (price < lower) position = "lower";
  return { upper, lower, position };
}

// ==================== HITUNG SINYAL ====================

export function hitungSinyal(
  bars: Bar[],
  fundamental: Fundamental | undefined,
  news: any[],
  marketSentiment: SentimentResult
): SignalResult | null {
  if (bars.length < 50) return null;

  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);
  const n = closes.length;
  const harga = closes[n - 1];

  const rsiArr = calcRSI(closes, 14);
  const rsi = rsiArr[n - 1] ?? 50;

  const macd = calcMACD(closes);
  const macdHist = macd.hist ?? 0;

  const bb = calcBollinger(closes, 20);
  const stochK = calcStochastic(highs, lows, closes, 14) ?? 50;
  const adx = calcADX(highs, lows, closes, 14) ?? 0;

  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = avgVol > 0 ? volumes[n - 1] / avgVol : 1;

  const ema8 = calcEMA(closes, 8);
  const ema21 = calcEMA(closes, 21);
  const ma20 = calcSMA(closes, 20);
  const ma50 = calcSMA(closes, 50);

  const ema8Last = ema8[n - 1];
  const ema21Last = ema21[n - 1];
  const ma20Last = ma20[n - 1];
  const ma50Last = ma50[n - 1];

  let skor = 0;

  // RSI
  if (rsi < 30) skor += 2;
  else if (rsi < 40) skor += 1;
  else if (rsi > 70) skor -= 2;
  else if (rsi > 60) skor -= 1;

  // MACD
  if (macdHist > 0) skor += 1;
  else if (macdHist < 0) skor -= 1;

  // EMA alignment
  if (ema8Last && ema21Last) {
    if (ema8Last > ema21Last) skor += 1;
    else skor -= 1;
  }

  // MA alignment
  if (ma20Last && ma50Last) {
    if (ma20Last > ma50Last && harga > ma20Last) skor += 1;
    else if (ma20Last < ma50Last && harga < ma20Last) skor -= 1;
  }

  // Bollinger
  if (bb.position === "lower") skor += 1;
  else if (bb.position === "upper") skor -= 1;

  // Volume confirmation
  if (volumeRatio > 1.5) skor += (skor > 0 ? 1 : -1);

  // ADX trend strength
  if (adx > 25) skor += (skor > 0 ? 1 : -1);

  // Stochastic
  if (stochK < 20) skor += 1;
  else if (stochK > 80) skor -= 1;

  // Sentimen pasar
  skor += Math.round(marketSentiment.skor / 2);

  let sinyal: "BELI" | "JUAL" | "HOLD" = "HOLD";
  if (skor >= 4) sinyal = "BELI";
  else if (skor <= -4) sinyal = "JUAL";

  return {
    ticker: "",
    sinyal,
    skor,
    rsi,
    macdHist,
    bbPosition: bb.position,
    stochK,
    adx,
    volumeRatio,
    harga,
  };
}