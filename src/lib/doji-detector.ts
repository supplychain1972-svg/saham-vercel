export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DojiSignal {
  type: "DOJI_BULLISH" | "DOJI_BEARISH";
  ticker: string;
  date: string;
  dojiHigh: number;
  dojiLow: number;
  dojiBody: number;
  dojiRange: number;
  confirmationClose: number;
  confirmationVolume: number;
  strength: "weak" | "medium" | "strong";
  timeframe: "daily" | "intraday";
}

function isDoji(bar: Bar, bodyPctThreshold = 10): boolean {
  const body = Math.abs(bar.close - bar.open);
  const range = bar.high - bar.low;
  if (range === 0) return false;
  const bodyPct = (body / range) * 100;
  return bodyPct <= bodyPctThreshold;
}

export function detectDojiConfirmation(
  bars: Bar[],
  bodyPctThreshold = 10,
  timeframe: "daily" | "intraday" = "daily"
): DojiSignal | null {
  if (bars.length < 3) return null;

  const n = bars.length;
  const doji = bars[n - 2];
  const confirmation = bars[n - 1];

  if (!isDoji(doji, bodyPctThreshold)) return null;

  const dojiHigh = doji.high;
  const dojiLow = doji.low;
  const dojiBody = Math.abs(doji.close - doji.open);
  const dojiRange = doji.high - doji.low;

  // Bullish: candle terakhir close di atas high Doji
  if (confirmation.close > dojiHigh) {
    if (confirmation.close <= confirmation.open) return null;
    const breakoutPct = ((confirmation.close - dojiHigh) / dojiHigh) * 100;
    const volRatio = doji.volume > 0 ? confirmation.volume / doji.volume : 0;
    let strength: "weak" | "medium" | "strong" = "weak";
    if (breakoutPct > 1 && volRatio > 1.5) strength = "strong";
    else if (breakoutPct > 0.5 || volRatio > 1.2) strength = "medium";

    return {
      type: "DOJI_BULLISH",
      ticker: "",
      date: confirmation.date,
      dojiHigh, dojiLow, dojiBody, dojiRange,
      confirmationClose: confirmation.close,
      confirmationVolume: confirmation.volume,
      strength,
      timeframe,
    };
  }

  // Bearish: candle terakhir close di bawah low Doji
  if (confirmation.close < dojiLow) {
    if (confirmation.close >= confirmation.open) return null;
    const breakdownPct = ((dojiLow - confirmation.close) / dojiLow) * 100;
    const volRatio = doji.volume > 0 ? confirmation.volume / doji.volume : 0;
    let strength: "weak" | "medium" | "strong" = "weak";
    if (breakdownPct > 1 && volRatio > 1.5) strength = "strong";
    else if (breakdownPct > 0.5 || volRatio > 1.2) strength = "medium";

    return {
      type: "DOJI_BEARISH",
      ticker: "",
      date: confirmation.date,
      dojiHigh, dojiLow, dojiBody, dojiRange,
      confirmationClose: confirmation.close,
      confirmationVolume: confirmation.volume,
      strength,
      timeframe,
    };
  }

  return null;
}