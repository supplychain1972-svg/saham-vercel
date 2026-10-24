import { getDb } from "./db.js";
import { sendNotification } from "./notifier.js";
import { fetchQuotes, dedupeUniverse, DEFAULT_UNIVERSE } from "./lib/data-source.js";
import { hitungSinyal } from "./lib/scoring.js";
import { detectDojiConfirmation } from "./lib/doji-detector.js";
import type { Bar } from "./lib/doji-detector.js";

// ============================================================
// RUN CRON (Dipanggil setiap 1 menit via QStash)
// ============================================================
export async function runCron() {
  const db = getDb();
  const universe = dedupeUniverse(DEFAULT_UNIVERSE);
  const today = new Date().toISOString().slice(0, 10);

  console.log(`[cron] START at ${new Date().toISOString()}`);

  // 1. Ambil harga terbaru dari idx-finance (batch)
  const quotes = await fetchQuotes(universe);
  const quotesCount = Object.keys(quotes).length;
  console.log(`[cron] Fetched ${quotesCount} quotes from idx-finance`);

  if (quotesCount === 0) {
    console.log("[cron] No quotes available, skip");
    return;
  }

  let notified = 0;
  let checked = 0;

  for (const ticker of universe) {
    const q = quotes[ticker];
    if (!q) continue;

    try {
      // 2. Ambil data historis dari PostgreSQL (100 bar terakhir)
      const { rows } = await db.query<Bar>(
        `SELECT date, open, high, low, close, volume 
         FROM ohlcv 
         WHERE ticker = $1 
         ORDER BY date DESC 
         LIMIT 100`,
        [ticker]
      );

      const bars = rows.reverse();
      if (bars.length < 50) continue;

      checked++;

      // 3. Update bar terakhir dengan harga hari ini (real-time dari idx-finance)
      const lastBar = bars[bars.length - 1];
      if (lastBar.date === today) {
        lastBar.close = q.price;
        lastBar.high = Math.max(lastBar.high, q.price);
        lastBar.low = Math.min(lastBar.low, q.price);
      } else {
        // Belum ada bar hari ini, tambahkan sebagai bar baru
        bars.push({
          date: today,
          open: q.price,
          high: q.price,
          low: q.price,
          close: q.price,
          volume: 0,
        });
      }

      // 4. Hitung sinyal
      const sig = hitungSinyal(
        bars,
        undefined,
        [],
        { skor: 0, label: "Netral", beritaTerkait: [] }
      );
      if (!sig) continue;

      let shouldNotify = false;
      let tipe = "";

      // ============================================================
      // FILTER KETAT:
      // 1. BELI dengan skor >= +4
      // 2. JUAL dengan skor <= -4
      // 3. Doji Bullish (Naik) - apapun strength-nya
      // ============================================================

      // Filter 1: Sinyal BELI/JUAL kuat
      if (sig.sinyal === "BELI" && sig.skor >= 4) {
        shouldNotify = true;
        tipe = "BELI";
      } else if (sig.sinyal === "JUAL" && sig.skor <= -4) {
        shouldNotify = true;
        tipe = "JUAL";
      }

      // Filter 2: Doji Naik (Bullish)
      const doji = detectDojiConfirmation(bars, 10, "daily");
      if (doji && doji.type === "DOJI_BULLISH") {
        shouldNotify = true;
        tipe = "DOJI_NAIK";
      }

      if (!shouldNotify) continue;

      // 5. Cek apakah notif sudah dikirim hari ini (anti-spam)
      const { rows: logRows } = await db.query(
        `SELECT id FROM notif_log 
         WHERE ticker = $1 AND tipe = $2 
         AND DATE(terkirim_pada) = CURRENT_DATE`,
        [ticker, tipe]
      );

      if (logRows.length > 0) continue;

      // 6. Simpan ke predictions (untuk ditampilkan di UI)
      await db.query(
        `INSERT INTO predictions (ticker, date, skor, sinyal, harga)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (ticker, date) DO UPDATE SET
         skor = EXCLUDED.skor, sinyal = EXCLUDED.sinyal, harga = EXCLUDED.harga`,
        [ticker, today, sig.skor, sig.sinyal, q.price]
      );

      // 7. Kirim notifikasi
      const emoji = tipe === "BELI" ? "🟢" : tipe === "JUAL" ? "🔴" : "🕯️";
      const labelTipe = tipe === "DOJI_NAIK" ? "DOJI NAIK" : tipe;
      const title = `${emoji} ${ticker} — ${labelTipe}`;
      const body = `Harga: Rp${q.price.toLocaleString("id-ID")} | Skor: ${sig.skor > 0 ? "+" : ""}${sig.skor}`;

      await sendNotification(title, body, ticker);

      // 8. Log ke notif_log
      await db.query(
        `INSERT INTO notif_log (ticker, tipe) VALUES ($1, $2)`,
        [ticker, tipe]
      );

      notified++;
      console.log(`[notif] ${ticker} ${tipe} — Skor ${sig.skor} — Rp${q.price}`);
    } catch (e: any) {
      console.error(`[cron] Error ${ticker}:`, e.message);
    }
  }

  console.log(
    `[cron] END — Checked: ${checked}, Notified: ${notified}, Duration: ${Date.now() % 1000}ms`
  );
}

// ============================================================
// SYNC HISTORICAL DATA (Jalankan sekali setelah deploy)
// Mengambil data historis 6 bulan dari Yahoo Finance
// ============================================================
export async function syncHistoricalData() {
  const db = getDb();
  const universe = dedupeUniverse(DEFAULT_UNIVERSE);

  console.log(`[sync] START — ${universe.length} tickers`);

  let totalBars = 0;
  let successCount = 0;
  let failCount = 0;

  for (const ticker of universe) {
    try {
      // Ambil data historis 6 bulan dari Yahoo Finance
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.JK?range=6mo&interval=1d`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SahamEdge/1.0)" },
      });

      if (!res.ok) {
        console.error(`[sync] ${ticker}: HTTP ${res.status}`);
        failCount++;
        continue;
      }

      const json: any = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) {
        failCount++;
        continue;
      }

      const timestamps = result.timestamp || [];
      const q = result.indicators?.quote?.[0];
      if (!q) {
        failCount++;
        continue;
      }

      let tickerBars = 0;
      for (let i = 0; i < timestamps.length; i++) {
        const o = q.open?.[i];
        const h = q.high?.[i];
        const l = q.low?.[i];
        const c = q.close?.[i];
        const v = q.volume?.[i];

        if (o == null || h == null || l == null || c == null) continue;
        if (!(c > 0)) continue;

        const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);

        await db.query(
          `INSERT INTO ohlcv (ticker, date, open, high, low, close, volume)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (ticker, date) DO UPDATE SET
           open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
           close = EXCLUDED.close, volume = EXCLUDED.volume`,
          [ticker, date, o, h, l, c, v || 0]
        );

        tickerBars++;
        totalBars++;
      }

      successCount++;
      console.log(`[sync] ${ticker}: ${tickerBars} bars`);

      // Delay kecil agar tidak kena rate limit Yahoo
      await new Promise((r) => setTimeout(r, 200));
    } catch (e: any) {
      console.error(`[sync] ${ticker} error:`, e.message);
      failCount++;
    }
  }

  console.log(
    `[sync] END — Success: ${successCount}, Fail: ${failCount}, Total bars: ${totalBars}`
  );

  return {
    success: successCount,
    fail: failCount,
    totalBars,
  };
}