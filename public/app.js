// === Service Worker ===
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    reg.update();
    setInterval(() => reg.update(), 60000);
  }).catch(console.error);
}

const rupiah = (n) => "Rp" + Number(n).toLocaleString("id-ID");

function fmtJamWib(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return "-";
  const wib = new Date(d.getTime() + 7 * 3600 * 1000);
  const hh = String(wib.getUTCHours()).padStart(2, "0");
  const mm = String(wib.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} WIB`;
}
const $ = (s) => document.querySelector(s);

async function api(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

const barsCache = new Map();
function cacheBars(ticker, bars, signal, screener) {
  barsCache.set(ticker, { bars, signal, screener });
}
let quotesCache = {};

const NAMA_EMITEN = {
  BBCA: "Bank Central Asia Tbk.", BBRI: "Bank Rakyat Indonesia (Persero) Tbk.",
  BMRI: "Bank Mandiri (Persero) Tbk.", BBNI: "Bank Negara Indonesia (Persero) Tbk.",
  BRIS: "Bank Syariah Indonesia Tbk.", TLKM: "Telkom Indonesia (Persero) Tbk.",
  ASII: "Astra International Tbk.", UNVR: "Unilever Indonesia Tbk.",
  ICBP: "Indofood CBP Sukses Makmur Tbk.", INDF: "Indofood Sukses Makmur Tbk.",
  KLBF: "Kalbe Farma Tbk.", SIDO: "Sido Muncul Tbk.", KAEF: "Kimia Farma Tbk.",
  MIKA: "Mitra Keluarga Karyasehat Tbk.", HEAL: "Medikaloka Hermina Tbk.",
  ANTM: "Aneka Tambang Tbk.", INCO: "Vale Indonesia Tbk.", PTBA: "Bukit Asam Tbk.",
  ADRO: "Adaro Energy Indonesia Tbk.", ITMG: "Indo Tambangraya Megah Tbk.",
  PGAS: "Perusahaan Gas Negara Tbk.", MEDC: "Medco Energi Internasional Tbk.",
  AKRA: "AKR Corporindo Tbk.", SMGR: "Semen Indonesia (Persero) Tbk.",
  INTP: "Indocement Tunggal Prakarsa Tbk.", JPFA: "Japfa Comfeed Indonesia Tbk.",
  CPIN: "Charoen Pokphand Indonesia Tbk.", GOTO: "GoTo Gojek Tokopedia Tbk.",
  BUKA: "Bukalapak.com Tbk.", EMTK: "Elang Mahkota Teknologi Tbk.",
  EXCL: "XL Axiata Tbk.", ISAT: "Indosat Ooredoo Hutchison Tbk.",
  TOWR: "Sarana Menara Nusantara Tbk.", TBIG: "Tower Bersama Infrastructure Tbk.",
  MTEL: "Dayamitra Telekomunikasi Tbk.", ARTO: "Bank Jago Tbk.",
  BBTN: "Bank Tabungan Negara (Persero) Tbk.", BNGA: "Bank CIMB Niaga Tbk.",
  NISP: "Bank OCBC NISP Tbk.", MDKA: "Merdeka Copper Gold Tbk.",
  TINS: "Timah Tbk.", SMRA: "Summarecon Agung Tbk.", BSDE: "Bumi Serpong Damai Tbk.",
  CTRA: "Ciputra Development Tbk.", PWON: "Pakuwon Jati Tbk.",
  ACES: "Ace Hardware Indonesia Tbk.", MAPI: "Mitra Adiperkasa Tbk.",
  AMRT: "Sumber Alfaria Trijaya Tbk.", HMSP: "HM Sampoerna Tbk.",
  GGRM: "Gudang Garam Tbk.", MYOR: "Mayora Indah Tbk.", TSPC: "Tempo Scan Pacific Tbk.",
  SILO: "Siloam International Hospitals Tbk.", MPPA: "Matahari Putra Prima Tbk.",
  SRTG: "Sariguna Primatirta Tbk.", BFIN: "BFI Finance Indonesia Tbk.",
  ADMF: "Adira Dinamika Multi Finance Tbk.", PNLF: "Panin Financial Tbk.",
};

function warnaLogo(ticker) {
  const palette = {
    perbankan: ["BBCA", "BBRI", "BMRI", "BBNI", "BRIS", "BBTN", "BNGA", "NISP", "ARTO"],
    energi: ["PTBA", "ADRO", "ITMG", "PGAS", "MEDC", "AKRA"],
    barang: ["UNVR", "ICBP", "INDF", "MYOR", "HMSP", "GGRM", "TSPC", "SIDO", "KLBF", "KAEF", "MIKA", "HEAL"],
    teknologi: ["GOTO", "BUKA", "EMTK"],
    telekomunikasi: ["TLKM", "EXCL", "ISAT", "TOWR", "TBIG", "MTEL"],
    material: ["ANTM", "INCO", "MDKA", "TINS", "SMGR", "INTP"],
  };
  const warna = { perbankan: "#3b82f6", energi: "#f59e0b", barang: "#8b5cf6", teknologi: "#ef4444", telekomunikasi: "#06b6d4", material: "#84cc16" };
  for (const [sektor, list] of Object.entries(palette)) {
    if (list.includes(ticker)) return warna[sektor];
  }
  return "#64748b";
}

function getRsiStatus(rsi) {
  if (rsi == null || isNaN(rsi)) return { label: "Netral", class: "rsi-neutral", color: "#8899b3" };
  if (rsi < 30) return { label: "Oversold", class: "rsi-oversold", color: "#10b981" };
  if (rsi > 70) return { label: "Overbought", class: "rsi-overbought", color: "#ef4444" };
  return { label: "Netral", class: "rsi-neutral", color: "#8899b3" };
}

// ============================================================
// LOAD QUOTES
// ============================================================
async function loadQuotes() {
  try {
    const data = await api("/api/quotes");
    const serverQuotes = data.quotes || {};
    const saved = localStorage.getItem("lastQuotes");
    const localQuotes = saved ? JSON.parse(saved) : {};
    quotesCache = { ...localQuotes, ...serverQuotes };
    if (Object.keys(serverQuotes).length > 0) {
      localStorage.setItem("lastQuotes", JSON.stringify(quotesCache));
    }
    updateLiveIndicator(data.updatedAt);
    updateAllPrices();
  } catch (e) {
    console.error("loadQuotes error", e);
    const saved = localStorage.getItem("lastQuotes");
    if (saved) {
      quotesCache = JSON.parse(saved);
      updateAllPrices();
    }
  }
}

function updateLiveIndicator(updatedAt) {
  const el = $("#live-status");
  if (!el) return;
  if (!updatedAt) {
    const now = new Date();
    const wibHour = (now.getUTCHours() + 7) % 24;
    const day = now.getUTCDay();
    if (day === 0 || day === 6) el.textContent = "Akhir pekan — market tutup";
    else if (wibHour < 9) el.textContent = "Market belum buka — update 09:00 WIB";
    else if (wibHour >= 16) el.textContent = "Market sudah tutup — update besok 09:00 WIB";
    else el.textContent = "Memuat harga terbaru…";
    return;
  }
  const d = new Date(updatedAt);
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  let text;
  if (diffSec < 60) text = "Live • baru saja";
  else if (diffSec < 3600) text = `Live • ${Math.floor(diffSec / 60)} menit lalu`;
  else if (diffSec < 86400) text = `Live • ${Math.floor(diffSec / 3600)} jam lalu`;
  else text = `Update: ${d.toLocaleDateString("id-ID")}`;
  el.textContent = text;
}

function updateAllPrices() {
  document.querySelectorAll(".universe-card").forEach((card) => {
    const ticker = card.dataset.ticker;
    const q = quotesCache[ticker];
    if (!q) return;
    const hargaEl = card.querySelector(".uni-harga-val");
    const changeEl = card.querySelector(".uni-harga-change");
    if (hargaEl) hargaEl.textContent = Number(q.price).toLocaleString("id-ID");
    if (changeEl) {
      const arah = q.changePct > 0.05 ? "up" : q.changePct < -0.05 ? "down" : "flat";
      const arrow = arah === "up" ? "▲" : arah === "down" ? "▼" : "";
      const sign = q.changePct > 0 ? "+" : "";
      changeEl.className = `uni-harga-change ${arah}`;
      changeEl.textContent = `${arrow} ${sign}${Math.round(q.change)} (${sign}${q.changePct.toFixed(2)}%)`;
    }
  });
  document.querySelectorAll(".item").forEach((item) => {
    const ticker = item.dataset.ticker;
    const q = quotesCache[ticker];
    if (!q) return;
    const hargaEl = item.querySelector(".item-harga");
    if (hargaEl) hargaEl.textContent = rupiah(q.price);
  });
}

// ============================================================
// LOAD PREDICTIONS
// ============================================================
async function loadPredictions(silent = false) {
  const listBeli = $("#list-beli");
  const listJual = $("#list-jual");
  if (!silent) {
    listBeli.innerHTML = '<div class="loading">Memuat…</div>';
    listJual.innerHTML = '<div class="loading">Memuat…</div>';
  }
  try {
    const data = await api("/api/predictions?limit=100");
    const beli = (data.items || []).filter((i) => i.sinyal === "BELI");
    const jual = (data.items || []).filter((i) => i.sinyal === "JUAL");
    $("#stats").innerHTML = `
      <div class="stat"><div class="label">Tanggal</div><div class="value">${data.date || "-"}</div><div class="label" style="margin-top:2px;text-transform:none;">update ${fmtJamWib(data.updatedAt)}</div></div>
      <div class="stat"><div class="label">Beli</div><div class="value" style="color:var(--up)">${beli.length}</div></div>
      <div class="stat"><div class="label">Jual</div><div class="value" style="color:var(--down)">${jual.length}</div></div>
    `;
    const sentimenEl = $("#market-sentimen");
    if (sentimenEl && data.sentimenPasar) {
      const warna = data.sentimenPasar === "Positif" ? "var(--up)" : data.sentimenPasar === "Negatif" ? "var(--down)" : "var(--muted)";
      const emoji = data.sentimenPasar === "Positif" ? "📈" : data.sentimenPasar === "Negatif" ? "📉" : "➖";
      sentimenEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-top:12px;padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;">
          <span style="font-size:20px;">${emoji}</span>
          <div>
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;">Sentimen Pasar Hari Ini</div>
            <div style="font-size:14px;font-weight:700;color:${warna};">${data.sentimenPasar} (${data.sentimenPasarSkor > 0 ? "+" : ""}${data.sentimenPasarSkor || 0})</div>
          </div>
        </div>
      `;
    }
    renderList("#list-beli", beli, "beli");
    renderList("#list-jual", jual, "jual");
    updateAllPrices();
    checkNewSignals(data.date, [...beli, ...jual]);
  } catch (e) {
    console.error("loadPredictions error", e);
    if (silent) return;
    listBeli.innerHTML = `<div class="empty">Gagal memuat: ${e.message}</div>`;
    listJual.innerHTML = `<div class="empty">-</div>`;
  }
}

function renderList(sel, items, tipe) {
  const el = $(sel);
  if (!items.length) {
    el.innerHTML = `<div class="empty">Tidak ada sinyal ${tipe} hari ini.</div>`;
    return;
  }
  el.innerHTML = items.map((i) => {
    const q = quotesCache[i.ticker];
    const harga = q ? q.price : i.harga;
    const rsi = i.rsi != null ? Number(i.rsi) : null;
    const rsiInfo = getRsiStatus(rsi);

    return `
      <div class="item" data-ticker="${i.ticker}">
        <div class="item-left">
          <div class="item-ticker">${i.ticker}</div>
          <div class="item-meta">
            <span class="rsi-badge ${rsiInfo.class}">RSI ${rsi != null ? rsi.toFixed(1) : "-"} • ${rsiInfo.label}</span>
          </div>
          <div class="item-meta">
            ADX ${i.adx?.toFixed(1) ?? "-"} • Vol×${i.volume_ratio?.toFixed(1) ?? "-"}
          </div>
        </div>
        <div class="item-right">
          <div class="item-harga">${rupiah(harga)}</div>
          <span class="skor ${tipe}">${i.skor > 0 ? "+" : ""}${i.skor}</span>
        </div>
      </div>
    `;
  }).join("");
  el.querySelectorAll(".item").forEach((node) => node.addEventListener("click", () => showDetail(node.dataset.ticker)));
}

function checkNewSignals(date, items) {
  if (!date || !items.length) return;
  const key = `lastSeen:${date}`;
  const lastSeenRaw = localStorage.getItem(key);
  const lastSeen = lastSeenRaw ? JSON.parse(lastSeenRaw) : [];
  const newSignals = items.filter((i) => !lastSeen.some((s) => s.ticker === i.ticker && s.sinyal === i.sinyal));
  if (newSignals.length > 0 && lastSeenRaw) showSignalPopup(date, newSignals);
  localStorage.setItem(key, JSON.stringify(items.map((i) => ({ ticker: i.ticker, sinyal: i.sinyal }))));
}

function showSignalPopup(date, signals) {
  const dlg = $("#popup-signal");
  if (!dlg) return;
  $("#popup-title").textContent = `🔔 ${signals.length} Sinyal Baru!`;
  $("#popup-body").innerHTML = signals.slice(0, 5).map((s) => {
    const emoji = s.sinyal === "BELI" ? "🟢" : "🔴";
    const q = quotesCache[s.ticker];
    const harga = q ? q.price : s.harga;
    return `
      <div class="popup-row" data-ticker="${s.ticker}">
        <span>${emoji} <b>${s.ticker}</b> — ${s.sinyal}</span>
        <span class="popup-harga">${rupiah(harga)} (${s.skor > 0 ? "+" : ""}${s.skor})</span>
      </div>
    `;
  }).join("");
  $("#popup-body").querySelectorAll(".popup-row").forEach((row) =>
    row.addEventListener("click", () => { dlg.close(); showDetail(row.dataset.ticker); })
  );
  dlg.showModal();
}

// ============================================================
// LOAD UNIVERSE
// ============================================================
async function loadUniverse(silent = false) {
  const el = $("#universe");
  if (!silent) el.innerHTML = '<div class="loading">Memuat grafik…</div>';
  try {
    const { items, lastBarDate } = await api("/api/screener-with-bars");
    if (!items || !items.length) {
      el.innerHTML = `<div class="empty">Belum ada data screening.</div>`;
      return;
    }
    const countEl = $("#universe-count");
    if (countEl) countEl.textContent = `(${items.length} saham${lastBarDate ? " • candle " + lastBarDate : ""})`;
    el.innerHTML = items.map((item) => renderUniverseCard(item)).join("");
    el.querySelectorAll(".universe-card").forEach((node) => node.addEventListener("click", () => showDetail(node.dataset.ticker)));
    updateAllPrices();
  } catch (e) {
    console.error(e);
    if (silent) return;
    el.innerHTML = `<div class="empty">Gagal memuat universe: ${e.message}</div>`;
  }
}

function renderUniverseCard(item) {
  const bars = item.bars || [];
  const lastBar = bars[bars.length - 1];
  const q = quotesCache[item.ticker];
  const harga = q ? q.price : (lastBar?.close ?? 0);
  let perubahanPct = 0;
  let perubahanAbs = 0;
  if (q) { perubahanPct = q.changePct; perubahanAbs = q.change; }
  else if (bars.length > 1) {
    const prevBar = bars[bars.length - 2];
    perubahanAbs = lastBar.close - prevBar.close;
    perubahanPct = prevBar.close > 0 ? (perubahanAbs / prevBar.close) * 100 : 0;
  }
  let arah = "flat";
  if (perubahanPct > 0.05) arah = "up";
  else if (perubahanPct < -0.05) arah = "down";
  const nama = NAMA_EMITEN[item.ticker] || item.ticker;
  const warna = warnaLogo(item.ticker);
  const sinyal = item.signal?.sinyal || "HOLD";
  const badgeClass = sinyal === "BELI" ? "badge-beli" : sinyal === "JUAL" ? "badge-jual" : "badge-hold";
  const arrow = arah === "up" ? "▲" : arah === "down" ? "▼" : "";
  const sign = perubahanPct > 0 ? "+" : "";

  const rsi = item.signal?.rsi != null ? Number(item.signal.rsi) : null;
  const rsiInfo = getRsiStatus(rsi);

  cacheBars(item.ticker, bars, item.signal);
  return `
    <div class="universe-card" data-ticker="${item.ticker}">
      <div class="uni-logo" style="background:${warna};">${item.ticker.slice(0, 2)}</div>
      <div class="uni-info">
        <div class="uni-top">
          <span class="uni-ticker">${item.ticker}</span>
          <span class="badge ${badgeClass}">${sinyal}</span>
        </div>
        <div class="uni-nama">${nama}</div>
        <div class="uni-rsi ${rsiInfo.class}">
          RSI ${rsi != null ? rsi.toFixed(1) : "-"} • ${rsiInfo.label}
        </div>
      </div>
      <div class="uni-chart">${renderSparkline(bars, arah)}</div>
      <div class="uni-harga">
        <div class="uni-harga-val">${harga.toLocaleString("id-ID")}</div>
        <div class="uni-harga-change ${arah}">${arrow} ${sign}${Math.round(perubahanAbs)} (${sign}${perubahanPct.toFixed(2)}%)</div>
      </div>
    </div>
  `;
}

function renderSparkline(bars, arah) {
  if (!bars || bars.length < 5) return `<div class="sparkline-empty">—</div>`;
  const closes = bars.map((b) => b.close);
  const w = 110, h = 40, padX = 2, padY = 4;
  const min = Math.min(...closes), max = Math.max(...closes);
  const range = max - min || 1;
  const stepX = (w - padX * 2) / Math.max(closes.length - 1, 1);
  const points = closes.map((v, i) => {
    const x = padX + i * stepX;
    const y = h - padY - ((v - min) / range) * (h - padY * 2);
    return [x, y];
  });
  const linePath = points.map((p, i) => i === 0 ? `M ${p[0].toFixed(1)} ${p[1].toFixed(1)}` : `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const warna = arah === "up" ? "#10b981" : arah === "down" ? "#ef4444" : "#8899b3";
  const firstY = points[0][1];
  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="sparkline">
      <line x1="0" y1="${firstY.toFixed(1)}" x2="${w}" y2="${firstY.toFixed(1)}" stroke="#64748b" stroke-width="0.8" stroke-dasharray="2,3" opacity="0.5" />
      <path d="${linePath}" fill="none" stroke="${warna}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

// ============================================================
// INDIKATOR
// ============================================================
function calcSMA(values, period) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    out.push(sum / period);
  }
  return out;
}

function calcEMA(values, period) {
  const out = [];
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      prev = sum / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

function calcRSI(closes, period = 14) {
  const out = [];
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

// ============================================================
// CHART MA / EMA / RSI
// ============================================================
function renderTechChart(bars) {
  if (!bars || bars.length < 30) return '<div class="tech-chart-empty">Data belum cukup.</div>';
  const data = bars.slice(-90);
  const closes = data.map(b => b.close);
  const n = closes.length;
  const allCloses = bars.map(b => b.close);
  const ma20 = calcSMA(allCloses, 20).slice(-n);
  const ma50 = calcSMA(allCloses, 50).slice(-n);
  const ma100 = calcSMA(allCloses, 100).slice(-n);
  const w = 480, h = 240, padL = 44, padR = 10, padT = 12, padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const allValues = [];
  for (const v of closes) if (v != null && !isNaN(v)) allValues.push(v);
  for (const v of ma20) if (v != null && !isNaN(v)) allValues.push(v);
  for (const v of ma50) if (v != null && !isNaN(v)) allValues.push(v);
  for (const v of ma100) if (v != null && !isNaN(v)) allValues.push(v);
  const min = Math.min(...allValues), max = Math.max(...allValues);
  const range = max - min || 1;
  const stepX = innerW / Math.max(n - 1, 1);
  const toX = (i) => padL + i * stepX;
  const toY = (v) => padT + innerH - ((v - min) / range) * innerH;
  const pricePath = closes.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(" ");
  const buildMaPath = (ma) => {
    let path = "", started = false;
    for (let i = 0; i < ma.length; i++) {
      if (ma[i] == null || isNaN(ma[i])) continue;
      path += `${started ? "L" : "M"} ${toX(i).toFixed(1)} ${toY(ma[i]).toFixed(1)} `;
      started = true;
    }
    return path;
  };
  const ma20Path = buildMaPath(ma20);
  const ma50Path = buildMaPath(ma50);
  const ma100Path = buildMaPath(ma100);
  let gridY = "", labelsY = "";
  for (let i = 0; i <= 4; i++) {
    const y = padT + (innerH / 4) * i;
    const val = max - (range / 4) * i;
    gridY += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="#243049" stroke-width="0.5" />`;
    labelsY += `<text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#8899b3">${Math.round(val).toLocaleString("id-ID")}</text>`;
  }
  let labelsX = "";
  for (let i = 0; i <= 4; i++) {
    const idx = Math.floor(((n - 1) * i) / 4);
    const x = toX(idx);
    const date = data[idx]?.date?.slice(5) || "";
    labelsX += `<text x="${x.toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="9" fill="#8899b3">${date}</text>`;
  }
  const ma20Last = ma20[n - 1], ma50Last = ma50[n - 1], ma100Last = ma100[n - 1];
  const hargaNow = closes[n - 1];
  let trendLabel = "Sideways", trendClass = "trend-flat";
  if (ma20Last && ma50Last && ma100Last) {
    if (ma20Last > ma50Last && ma50Last > ma100Last) { trendLabel = "Bullish"; trendClass = "trend-up"; }
    else if (ma20Last < ma50Last && ma50Last < ma100Last) { trendLabel = "Bearish"; trendClass = "trend-down"; }
  }
  const fmt = (v) => (v == null || isNaN(v) ? "-" : Math.round(v).toLocaleString("id-ID"));
  return `
    <div class="tech-chart-wrap">
      <div class="tech-chart-header">
        <div class="tech-chart-title">📈 Chart MA (90 hari)</div>
        <div class="tech-chart-trend ${trendClass}">${trendLabel}</div>
      </div>
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" class="tech-chart-svg">
        ${gridY}${labelsY}${labelsX}
        <path d="${pricePath}" fill="none" stroke="#e6edf6" stroke-width="1.3" opacity="0.85" />
        ${ma20Path ? `<path d="${ma20Path}" fill="none" stroke="#fbbf24" stroke-width="1.6" />` : ""}
        ${ma50Path ? `<path d="${ma50Path}" fill="none" stroke="#3b82f6" stroke-width="1.6" />` : ""}
        ${ma100Path ? `<path d="${ma100Path}" fill="none" stroke="#a855f7" stroke-width="1.6" />` : ""}
      </svg>
      <div class="tech-chart-ma-grid">
        <div class="ma-cell"><div class="ma-label" style="color:#fbbf24;">MA20</div><div class="ma-value">${fmt(ma20Last)}</div></div>
        <div class="ma-cell"><div class="ma-label" style="color:#3b82f6;">MA50</div><div class="ma-value">${fmt(ma50Last)}</div></div>
        <div class="ma-cell"><div class="ma-label" style="color:#a855f7;">MA100</div><div class="ma-value">${fmt(ma100Last)}</div></div>
        <div class="ma-cell"><div class="ma-label" style="color:#8899b3;">Harga</div><div class="ma-value">${fmt(hargaNow)}</div></div>
      </div>
    </div>
  `;
}

function renderTechChartEMA(bars) {
  if (!bars || bars.length < 30) return '<div class="tech-chart-empty">Data belum cukup.</div>';
  const data = bars.slice(-125);
  const closes = data.map(b => b.close);
  const n = closes.length;
  const allCloses = bars.map(b => b.close);
  const ema8 = calcEMA(allCloses, 8).slice(-n);
  const ema21 = calcEMA(allCloses, 21).slice(-n);
  const ema125 = calcEMA(allCloses, 125).slice(-n);
  const w = 480, h = 240, padL = 44, padR = 10, padT = 12, padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const allValues = [];
  for (const v of closes) if (v != null && !isNaN(v)) allValues.push(v);
  for (const v of ema8) if (v != null && !isNaN(v)) allValues.push(v);
  for (const v of ema21) if (v != null && !isNaN(v)) allValues.push(v);
  for (const v of ema125) if (v != null && !isNaN(v)) allValues.push(v);
  const min = Math.min(...allValues), max = Math.max(...allValues);
  const range = max - min || 1;
  const stepX = innerW / Math.max(n - 1, 1);
  const toX = (i) => padL + i * stepX;
  const toY = (v) => padT + innerH - ((v - min) / range) * innerH;
  const pricePath = closes.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(" ");
  const buildPath = (arr) => {
    let path = "", started = false;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] == null || isNaN(arr[i])) continue;
      path += `${started ? "L" : "M"} ${toX(i).toFixed(1)} ${toY(arr[i]).toFixed(1)} `;
      started = true;
    }
    return path;
  };
  const ema8Path = buildPath(ema8);
  const ema21Path = buildPath(ema21);
  const ema125Path = buildPath(ema125);
  let gridY = "", labelsY = "";
  for (let i = 0; i <= 4; i++) {
    const y = padT + (innerH / 4) * i;
    const val = max - (range / 4) * i;
    gridY += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="#243049" stroke-width="0.5" />`;
    labelsY += `<text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#8899b3">${Math.round(val).toLocaleString("id-ID")}</text>`;
  }
  let labelsX = "";
  for (let i = 0; i <= 4; i++) {
    const idx = Math.floor(((n - 1) * i) / 4);
    const x = toX(idx);
    const date = data[idx]?.date?.slice(5) || "";
    labelsX += `<text x="${x.toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="9" fill="#8899b3">${date}</text>`;
  }
  const e8Last = ema8[n - 1], e21Last = ema21[n - 1], e125Last = ema125[n - 1];
  const hargaNow = closes[n - 1];
  let trendLabel = "Sideways", trendClass = "trend-flat";
  if (e8Last && e21Last && e125Last) {
    if (e8Last > e21Last && e21Last > e125Last) { trendLabel = "Bullish"; trendClass = "trend-up"; }
    else if (e8Last < e21Last && e21Last < e125Last) { trendLabel = "Bearish"; trendClass = "trend-down"; }
  }
  const fmt = (v) => (v == null || isNaN(v) ? "-" : Math.round(v).toLocaleString("id-ID"));
  return `
    <div class="tech-chart-wrap">
      <div class="tech-chart-header">
        <div class="tech-chart-title">⚡ Chart EMA (8,21,125)</div>
        <div class="tech-chart-trend ${trendClass}">${trendLabel}</div>
      </div>
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" class="tech-chart-svg">
        ${gridY}${labelsY}${labelsX}
        <path d="${pricePath}" fill="none" stroke="#e6edf6" stroke-width="1.2" opacity="0.7" />
        ${ema8Path ? `<path d="${ema8Path}" fill="none" stroke="#f97316" stroke-width="1.8" />` : ""}
        ${ema21Path ? `<path d="${ema21Path}" fill="none" stroke="#06b6d4" stroke-width="1.8" />` : ""}
        ${ema125Path ? `<path d="${ema125Path}" fill="none" stroke="#ec4899" stroke-width="2" />` : ""}
      </svg>
      <div class="tech-chart-ma-grid">
        <div class="ma-cell"><div class="ma-label" style="color:#f97316;">EMA8</div><div class="ma-value">${fmt(e8Last)}</div></div>
        <div class="ma-cell"><div class="ma-label" style="color:#06b6d4;">EMA21</div><div class="ma-value">${fmt(e21Last)}</div></div>
        <div class="ma-cell"><div class="ma-label" style="color:#ec4899;">EMA125</div><div class="ma-value">${fmt(e125Last)}</div></div>
        <div class="ma-cell"><div class="ma-label" style="color:#8899b3;">Harga</div><div class="ma-value">${fmt(hargaNow)}</div></div>
      </div>
    </div>
  `;
}

function renderRSIChart(bars) {
  if (!bars || bars.length < 30) return '<div class="tech-chart-empty">Data belum cukup.</div>';
  const data = bars.slice(-90);
  const closes = data.map(b => b.close);
  const n = closes.length;
  const rsiArr = calcRSI(bars.map(b => b.close), 14).slice(-n);
  const w = 480, h = 140, padL = 44, padR = 10, padT = 12, padB = 24;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const stepX = innerW / Math.max(n - 1, 1);
  const toX = (i) => padL + i * stepX;
  const toY = (v) => padT + innerH - (v / 100) * innerH;
  let rsiPath = "", started = false;
  for (let i = 0; i < rsiArr.length; i++) {
    if (rsiArr[i] == null || isNaN(rsiArr[i])) continue;
    rsiPath += `${started ? "L" : "M"} ${toX(i).toFixed(1)} ${toY(rsiArr[i]).toFixed(1)} `;
    started = true;
  }
  const y70 = toY(70).toFixed(1);
  const y50 = toY(50).toFixed(1);
  const y30 = toY(30).toFixed(1);
  const rsiLast = rsiArr[n - 1];
  const status = getRsiStatus(rsiLast);
  const fmt = (v) => (v == null || isNaN(v) ? "-" : v.toFixed(2));
  return `
    <div class="tech-chart-wrap">
      <div class="tech-chart-header">
        <div class="tech-chart-title">📉 RSI (14)</div>
        <div class="tech-chart-trend ${status.class}">${status.label}</div>
      </div>
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" class="tech-chart-svg">
        <line x1="${padL}" y1="${y70}" x2="${w - padR}" y2="${y70}" stroke="#ef4444" stroke-width="0.8" stroke-dasharray="4,3" opacity="0.6" />
        <line x1="${padL}" y1="${y50}" x2="${w - padR}" y2="${y50}" stroke="#8899b3" stroke-width="0.8" stroke-dasharray="4,3" opacity="0.4" />
        <line x1="${padL}" y1="${y30}" x2="${w - padR}" y2="${y30}" stroke="#10b981" stroke-width="0.8" stroke-dasharray="4,3" opacity="0.6" />
        ${rsiPath ? `<path d="${rsiPath}" fill="none" stroke="${status.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />` : ""}
      </svg>
      <div class="tech-chart-ma-grid" style="grid-template-columns: repeat(3, 1fr);">
        <div class="ma-cell"><div class="ma-label" style="color:${status.color};">RSI</div><div class="ma-value">${fmt(rsiLast)}</div></div>
        <div class="ma-cell"><div class="ma-label" style="color:#ef4444;">Overbought</div><div class="ma-value">&gt; 70</div></div>
        <div class="ma-cell"><div class="ma-label" style="color:#10b981;">Oversold</div><div class="ma-value">&lt; 30</div></div>
      </div>
    </div>
  `;
}

function renderTradeSummary(bars) {
  if (!bars || bars.length < 50) return "";
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const n = closes.length;
  const harga = closes[n - 1];
  const ma20 = calcSMA(closes, 20);
  const ma50 = calcSMA(closes, 50);
  const ema8 = calcEMA(closes, 8);
  const ema21 = calcEMA(closes, 21);
  const ma20Last = ma20[n - 1];
  const ma50Last = ma50[n - 1];
  const ema8Last = ema8[n - 1];
  const ema21Last = ema21[n - 1];
  const recent20High = Math.max(...highs.slice(-20));
  const recent20Low = Math.min(...lows.slice(-20));
  const recent60High = Math.max(...highs.slice(-60));
  const recent60Low = Math.min(...lows.slice(-60));
  let sumTR = 0;
  for (let i = n - 14; i < n; i++) {
    if (i <= 0) continue;
    sumTR += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  const atr = sumTR / 14;
  const atrPct = (atr / harga) * 100;
  let score = 0;
  const reasons = [];
  if (ma20Last && harga > ma20Last) { score += 1; reasons.push("Harga di atas MA20"); }
  else if (ma20Last && harga < ma20Last) { score -= 1; reasons.push("Harga di bawah MA20"); }
  if (ema8Last && ema21Last) {
    if (ema8Last > ema21Last) { score += 1; reasons.push("EMA8 > EMA21"); }
    else { score -= 1; reasons.push("EMA8 < EMA21"); }
  }
  const rangePosisi = ((harga - recent60Low) / (recent60High - recent60Low)) * 100;
  if (rangePosisi < 25) { score += 1; reasons.push("Dekat support"); }
  else if (rangePosisi > 75) { score -= 1; reasons.push("Dekat resistance"); }
  let verdict, verdictClass;
  if (score >= 2) { verdict = "BELI"; verdictClass = "verdict-buy"; }
  else if (score <= -2) { verdict = "JUAL"; verdictClass = "verdict-sell"; }
  else { verdict = "TUNGGU"; verdictClass = "verdict-wait"; }
  const fmt = (v) => Math.round(v).toLocaleString("id-ID");
  return `
    <div class="trade-summary">
      <div class="trade-verdict ${verdictClass}">
        <div class="verdict-label">Kesimpulan: ${verdict}</div>
        <div class="verdict-score">${score > 0 ? "+" : ""}${score}</div>
      </div>
      <div class="trade-grid">
        <div class="trade-cell"><div class="trade-cell-label">Entry</div><div class="trade-cell-value">Rp ${fmt(harga)}</div></div>
        <div class="trade-cell"><div class="trade-cell-label">ATR</div><div class="trade-cell-value">Rp ${fmt(atr)}</div></div>
      </div>
      <div class="reasons-list">${reasons.map(r => `<div>• ${r}</div>`).join("")}</div>
    </div>
  `;
}

// ============================================================
// LOAD DOJI
// ============================================================
async function loadDoji(silent = false) {
  const listBull = $("#list-doji-bullish");
  const listBear = $("#list-doji-bearish");
  const statsEl = $("#doji-stats");
  if (!listBull || !listBear) return;
  if (!silent) {
    listBull.innerHTML = '<div class="loading">Memuat…</div>';
    listBear.innerHTML = '<div class="loading">Memuat…</div>';
  }
  try {
    const data = await api("/api/doji");
    const items = data.items || [];
    const bullish = items.filter((i) => i.type === "DOJI_BULLISH");
    const bearish = items.filter((i) => i.type === "DOJI_BEARISH");
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat"><div class="label">Total</div><div class="value">${items.length}</div></div>
        <div class="stat"><div class="label">Bullish</div><div class="value" style="color:var(--up)">${bullish.length}</div></div>
        <div class="stat"><div class="label">Bearish</div><div class="value" style="color:var(--down)">${bearish.length}</div></div>
      `;
    }
    renderDojiList("#list-doji-bullish", bullish, "bullish");
    renderDojiList("#list-doji-bearish", bearish, "bearish");
  } catch (e) {
    console.error("loadDoji error:", e);
    if (silent) return;
    listBull.innerHTML = `<div class="empty">Gagal memuat: ${e.message}</div>`;
    listBear.innerHTML = `<div class="empty">-</div>`;
  }
}

function renderDojiList(sel, items, arah) {
  const el = $(sel);
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<div class="empty">Tidak ada sinyal Doji ${arah} hari ini.</div>`;
    return;
  }
  el.innerHTML = items.map((i) => {
    const q = quotesCache[i.ticker];
    const harga = q ? q.price : i.harga;
    const strengthBadge = i.strength === "strong" ? '<span class="badge badge-kuat">KUAT</span>' : i.strength === "medium" ? '<span class="badge badge-sedang">SEDANG</span>' : '<span class="badge badge-lemah">LEMAH</span>';
    const changeClass = i.changePct > 0 ? "up" : i.changePct < 0 ? "down" : "flat";
    const sign = i.changePct > 0 ? "+" : "";
    return `
      <div class="item doji-item" data-ticker="${i.ticker}">
        <div class="item-left">
          <div class="item-ticker">${i.ticker} ${strengthBadge}</div>
          <div class="item-meta">${i.date} • Rp${Math.round(i.dojiLow)}-Rp${Math.round(i.dojiHigh)}</div>
          <div class="item-meta"><span class="${changeClass}">${sign}${i.changePct.toFixed(2)}%</span></div>
        </div>
        <div class="item-right">
          <div class="item-harga">${rupiah(harga)}</div>
          <span class="doji-type ${arah}">${arah === "bullish" ? "NAIK" : "TURUN"}</span>
        </div>
      </div>
    `;
  }).join("");
  el.querySelectorAll(".item").forEach((node) => node.addEventListener("click", () => showDetail(node.dataset.ticker)));
}

// ============================================================
// DETAIL MODAL
// ============================================================
async function showDetail(ticker) {
  const dlg = $("#detail");
  $("#d-ticker").textContent = ticker;
  const cached = barsCache.get(ticker);
  const hasCache = cached && cached.bars && cached.bars.length > 0;
  if (hasCache) {
    renderDetailFromCache(ticker, cached.bars, cached.signal, cached.screener);
    if (!dlg.open) dlg.showModal();
  } else {
    $("#d-body").innerHTML = `<div class="loading">Memuat…</div>`;
    if (!dlg.open) dlg.showModal();
  }
  try {
    const d = await api(`/api/stocks/${ticker}`);
    cacheBars(ticker, d.bars || [], d.signal, d.screener);
    const still = $("#d-ticker").textContent === ticker && dlg.open;
    if (still) renderDetailFromCache(ticker, d.bars || [], d.signal, d.screener);
  } catch (e) {
    if (!hasCache) $("#d-body").innerHTML = `<div class="empty">Gagal memuat detail.</div>`;
  }
}

function renderDetailFromCache(ticker, bars, signal, screener) {
  const s = signal;
  const last = bars?.[bars.length - 1];
  const q = quotesCache[ticker];
  const hargaReal = q ? q.price : last?.close;
  window.__currentBars = bars || [];
  const activeChart = window.__chartMode || "ma";
  const chartHtml = activeChart === "ema" ? renderTechChartEMA(bars) : renderTechChart(bars);
  const rsiHtml = renderRSIChart(bars);
  const summaryHtml = renderTradeSummary(bars);
  const rows = [
    ["Harga terkini", hargaReal ? rupiah(hargaReal) : "-"],
    ["Perubahan", q ? (q.changePct > 0 ? "+" : "") + q.changePct.toFixed(2) + "%" : "-"],
    ["Tanggal", last?.date ?? "-"],
    ["Sinyal", s?.sinyal ?? "-"],
    ["Skor", s?.skor != null ? (s.skor > 0 ? "+" + s.skor : String(s.skor)) : "-"],
    ["RSI (14)", s?.rsi != null ? Number(s.rsi).toFixed(2) : "-"],
    ["MACD Histogram", s?.macd_hist != null ? Number(s.macd_hist).toFixed(2) : "-"],
    ["ADX", s?.adx != null ? Number(s.adx).toFixed(2) : "-"],
    ["Volume rasio", s?.volume_ratio != null ? Number(s.volume_ratio).toFixed(2) + "×" : "-"],
  ];
  const tableHtml = rows.map(([label, value]) => `
    <div class="detail-row"><div class="detail-label">${label}</div><div class="detail-value">${value}</div></div>
  `).join("");
  $("#d-body").innerHTML = `
    <div class="chart-toggle">
      <button class="chart-tab ${activeChart === "ma" ? "active" : ""}" data-chart="ma">📊 MA 20/50/100</button>
      <button class="chart-tab ${activeChart === "ema" ? "active" : ""}" data-chart="ema">⚡ EMA 8/21/125</button>
    </div>
    <div id="chart-container">${chartHtml}</div>
    ${rsiHtml}
    ${summaryHtml}
    <details class="detail-stats" ${s ? "" : "hidden"} open>
      <summary>📋 Detail Indikator</summary>
      <div class="detail-table">${tableHtml}</div>
    </details>
  `;
  document.querySelectorAll(".chart-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.chart;
      window.__chartMode = mode;
      const container = $("#chart-container");
      if (container) {
        container.innerHTML = mode === "ema" ? renderTechChartEMA(window.__currentBars) : renderTechChart(window.__currentBars);
      }
      document.querySelectorAll(".chart-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
    });
  });
}

// ============================================================
// WEB PUSH (untuk PWA di browser)
// ============================================================
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function subscribePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    alert("Browser tidak mendukung push. Gunakan Chrome terbaru.");
    return;
  }
  if (Notification.permission === "denied") {
    alert("Notifikasi diblokir sebelumnya.\n\nAktifkan di pengaturan browser.");
    return;
  }
  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { alert("Izin notifikasi tidak diberikan."); return; }
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { publicKey } = await api("/api/push/key");
      if (!publicKey) { alert("Server tidak mengirim VAPID key."); return; }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    $("#btn-notif").textContent = "✅ Notifikasi Aktif";
    $("#btn-notif").classList.add("active");
    alert("✅ Notifikasi diaktifkan!");
  } catch (e) {
    console.error("[push] Gagal:", e);
    alert("Gagal: " + e.message);
  }
}

async function syncPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
  } catch (e) {}
}

// ============================================================
// FCM — untuk APK Android (notif saat app tertutup sekalipun)
// ============================================================
async function initFcmPush() {
  const PushNotifications = window.Capacitor?.Plugins?.PushNotifications;
  if (!PushNotifications) {
    console.warn("[fcm] plugin tidak tersedia");
    return;
  }

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") {
    console.warn("[fcm] izin ditolak");
    return;
  }

  // Listener HARUS dipasang SEBELUM register()
  await PushNotifications.addListener("registration", async (t) => {
    console.log("[fcm] token:", t.value.slice(0, 30) + "...");
    try {
      const res = await fetch("/api/push/subscribe-fcm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fcmToken: t.value }),
      });
      if (res.ok) console.log("[fcm] token tersimpan di server ✅");
      else console.error("[fcm] server tolak:", res.status);
    } catch (e) {
      console.error("[fcm] gagal kirim token:", e);
    }
  });

  await PushNotifications.addListener("registrationError", (err) => {
    console.error("[fcm] registrationError:", err);
  });

  await PushNotifications.addListener("pushNotificationReceived", (n) => {
    console.log("[fcm] notif diterima (foreground):", n);
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const ticker = action.notification?.data?.ticker;
    const url = action.notification?.data?.url;
    if (ticker) window.location.href = `/saham/${ticker}`;
    else if (url) window.location.href = url;
  });

  await PushNotifications.register();
  console.log("[fcm] register() dipanggil");
}

// ============================================================
// LOCAL NOTIFICATION POLLING — fallback untuk APK
// ============================================================
const POLL_INTERVAL_MS = 15 * 60 * 1000;
const NOTIF_LAST_SEEN_KEY = "notif:lastSeen:v1";

function getLastSeen() {
  try {
    const raw = localStorage.getItem(NOTIF_LAST_SEEN_KEY);
    return raw ? JSON.parse(raw) : { signals: [], dojis: [] };
  } catch (e) { return { signals: [], dojis: [] }; }
}

function setLastSeen(obj) {
  try { localStorage.setItem(NOTIF_LAST_SEEN_KEY, JSON.stringify(obj)); } catch (e) {}
}

function signalKey(s) { return `${s.ticker}|${s.sinyal}|${s.date || ""}`; }
function dojiKey(d) { return `${d.ticker}|${d.type}|${d.date || ""}`; }

async function ensureLocalNotifPermission() {
  const LocalNotifications = window.Capacitor?.Plugins?.LocalNotifications;
  if (!LocalNotifications) return false;
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display === "prompt" || perm.display === "prompt-with-rationale") {
      perm = await LocalNotifications.requestPermissions();
    }
    return perm.display === "granted";
  } catch (e) { return false; }
}

async function showLocalNotif(title, body, ticker, type) {
  const LocalNotifications = window.Capacitor?.Plugins?.LocalNotifications;
  if (!LocalNotifications) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Date.now() % 2147483647),
        title, body,
        iconColor: "#3b82f6",
        sound: null,
        extra: { ticker, type },
      }],
    });
  } catch (e) { console.error("[notif] jadwal gagal:", e); }
}

async function pollAndNotify(silent = true) {
  const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform?.());
  if (!isCapacitor) return;
  const granted = await ensureLocalNotifPermission();
  if (!granted) return;

  let predData, dojiData;
  try {
    [predData, dojiData] = await Promise.all([
      fetch("/api/predictions?limit=100", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/doji", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
  } catch (e) { return; }

  const lastSeen = getLastSeen();
  const signals = (predData?.items || []).filter(i => i.sinyal === "BELI" || i.sinyal === "JUAL");
  const dojis = (dojiData?.items || []) || [];
  const seenSignals = new Set(lastSeen.signals || []);
  const seenDojis = new Set(lastSeen.dojis || []);
  const newSignals = signals.filter(s => !seenSignals.has(signalKey(s)));
  const newDojis = dojis.filter(d => !seenDojis.has(dojiKey(d)));

  for (const s of newSignals) {
    const emoji = s.sinyal === "BELI" ? "🟢" : "🔴";
    const harga = s.harga ? ` • Rp${Number(s.harga).toLocaleString("id-ID")}` : "";
    await showLocalNotif(`${emoji} ${s.ticker} — ${s.sinyal}`, `Skor ${s.skor > 0 ? "+" : ""}${s.skor}${harga}`, s.ticker, "signal");
    await new Promise(r => setTimeout(r, 600));
  }
  for (const d of newDojis) {
    const emoji = d.type === "DOJI_BULLISH" ? "🟢" : "🔴";
    const arah = d.type === "DOJI_BULLISH" ? "NAIK" : "TURUN";
    const strength = d.strength === "strong" ? "KUAT" : d.strength === "medium" ? "SEDANG" : "LEMAH";
    const harga = d.harga ? ` • Rp${Number(d.harga).toLocaleString("id-ID")}` : "";
    await showLocalNotif(`${emoji} Doji ${arah} — ${d.ticker}`, `Kekuatan: ${strength}${harga}`, d.ticker, "doji");
    await new Promise(r => setTimeout(r, 600));
  }

  setLastSeen({
    signals: [...(lastSeen.signals || []), ...newSignals.map(signalKey)].slice(-500),
    dojis: [...(lastSeen.dojis || []), ...newDojis.map(dojiKey)].slice(-500),
  });
}

async function setupLocalNotifClickListener() {
  const LocalNotifications = window.Capacitor?.Plugins?.LocalNotifications;
  if (!LocalNotifications) return;
  try {
    await LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
      const ticker = action.notification?.extra?.ticker;
      if (ticker) window.location.href = `/saham/${ticker}`;
    });
  } catch (e) {}
}

// ============================================================
// AI ANALYST
// ============================================================
let aiHistory = [];

function loadAIHistory() {
  try {
    const saved = localStorage.getItem("aiHistory");
    if (saved) {
      aiHistory = JSON.parse(saved);
      const chat = $("#ai-chat");
      if (chat && aiHistory.length > 0) {
        chat.innerHTML = "";
        const recent = aiHistory.slice(-10);
        for (const h of recent) {
          if (h.role === "user") appendAIMessage("user", h.content, false);
          else if (h.role === "assistant") appendAIMessage("bot", h.content, false);
        }
      }
    }
  } catch (e) {}
}

function saveAIHistory() {
  try { localStorage.setItem("aiHistory", JSON.stringify(aiHistory.slice(-20))); } catch (e) {}
}

function appendAIMessage(role, text, save = true) {
  const chat = $("#ai-chat");
  if (!chat) return;
  const div = document.createElement("div");
  div.className = `ai-message ai-${role}`;
  const bubble = document.createElement("div");
  bubble.className = "ai-bubble";
  if (role === "bot") {
    let html = text
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<i>$1</i>")
      .replace(/^### (.+)$/gm, "<b>$1</b>")
      .replace(/^## (.+)$/gm, "<b>$1</b>")
      .replace(/^# (.+)$/gm, "<b>$1</b>")
      .replace(/^- (.+)$/gm, "• $1")
      .replace(/^\d+\. (.+)$/gm, "• $1")
      .replace(/\n/g, "<br>");
    bubble.innerHTML = html;
  } else {
    bubble.textContent = text;
  }
  div.appendChild(bubble);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  if (save) {
    aiHistory.push({ role: role === "bot" ? "assistant" : "user", content: text });
    saveAIHistory();
  }
}

function appendAILoading() {
  const chat = $("#ai-chat");
  const div = document.createElement("div");
  div.className = "ai-message ai-bot";
  div.id = "ai-loading";
  div.innerHTML = `<div class="ai-bubble ai-loading-bubble"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span></div>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function removeAILoading() {
  const el = $("#ai-loading");
  if (el) el.remove();
}

function renderFollowups(suggestions) {
  const container = $("#ai-followups");
  if (!container) return;
  if (!suggestions || suggestions.length === 0) { container.innerHTML = ""; return; }
  container.innerHTML = suggestions.map((s) => `<button class="ai-chip followup" data-q="${s.replace(/"/g, "&quot;")}">💡 ${s}</button>`).join("");
  container.querySelectorAll(".followup").forEach((chip) => {
    chip.addEventListener("click", () => { const q = chip.dataset.q; if (q) sendAIMessage(q); });
  });
}

async function sendAIMessage(question) {
  if (!question || !question.trim()) return;
  const input = $("#ai-input");
  const sendBtn = $("#ai-send");
  appendAIMessage("user", question);
  if (input) input.value = "";
  if (sendBtn) sendBtn.disabled = true;
  renderFollowups([]);
  appendAILoading();
  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: question, history: aiHistory.slice(-6) }),
    });
    removeAILoading();
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const reply = data.reply || "Maaf, saya tidak bisa menjawab saat ini.";
    appendAIMessage("bot", reply);
    if (data.followups?.length) renderFollowups(data.followups);
  } catch (e) {
    removeAILoading();
    appendAIMessage("bot", `❌ Maaf, terjadi error: ${e.message}.`, false);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ============================================================
// TABS
// ============================================================
function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      const content = document.getElementById(`tab-${target}`);
      if (content) content.classList.add("active");
      if (target === "ai") {
        setTimeout(() => $("#ai-input")?.focus(), 100);
      } else if (target === "doji") {
        loadDoji().catch((e) => console.error("loadDoji:", e));
      }
    });
  });
}

// ============================================================
// BOOT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  const btnNotif = $("#btn-notif");

  const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform?.());

  if (isCapacitor) {
    // === APK: pakai FCM (notif background & tertutup) + polling lokal (fallback) ===
    if (btnNotif) btnNotif.style.display = "none";

    // 1. FCM — notif saat app tertutup
    try {
      await initFcmPush();
    } catch (e) {
      console.error("[fcm] init gagal:", e);
    }

    // 2. Polling lokal — fallback saat app terbuka/background
    await ensureLocalNotifPermission();
    await setupLocalNotifClickListener();
    setTimeout(() => pollAndNotify(true).catch(() => {}), 3000);
    setInterval(() => pollAndNotify(true).catch(() => {}), POLL_INTERVAL_MS);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) setTimeout(() => pollAndNotify(true).catch(() => {}), 2000);
    });
  } else {
    // === PWA: pakai Web Push ===
    try {
      if ("serviceWorker" in navigator && "PushManager" in window && Notification.permission === "granted") {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub && btnNotif) {
          btnNotif.textContent = "✅ Notifikasi Aktif";
          btnNotif.classList.add("active");
        }
      }
    } catch (e) {}
    syncPushSubscription();
    if (btnNotif) btnNotif.addEventListener("click", subscribePush);
  }

  $("#d-close")?.addEventListener("click", () => $("#detail").close());
  $("#popup-close")?.addEventListener("click", () => $("#popup-signal").close());

  setupTabs();

  const aiInput = $("#ai-input");
  const aiSend = $("#ai-send");
  if (aiSend) aiSend.addEventListener("click", () => sendAIMessage(aiInput.value));
  if (aiInput) {
    aiInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendAIMessage(aiInput.value);
      }
    });
  }

  $("#ai-clear")?.addEventListener("click", () => {
    if (!confirm("Hapus semua riwayat chat dengan Pak Hartono?")) return;
    aiHistory = [];
    localStorage.removeItem("aiHistory");
    const chat = $("#ai-chat");
    if (chat) chat.innerHTML = "";
    renderFollowups([]);
  });

  loadAIHistory();

  loadQuotes()
    .then(() => {
      loadPredictions().catch(() => {});
      loadUniverse().catch(() => {});
      loadDoji().catch(() => {});
    })
    .catch(() => {
      loadPredictions().catch(() => {});
      loadUniverse().catch(() => {});
      loadDoji().catch(() => {});
    });

  const refreshAll = () => {
    loadQuotes().catch(() => {}).finally(() => {
      loadPredictions(true).catch(() => {});
      loadUniverse(true).catch(() => {});
      loadDoji(true).catch(() => {});
    });
  };
  setInterval(() => loadQuotes().catch(() => {}), 60000);
  setInterval(() => loadPredictions(true).catch(() => {}), 60000);
  setInterval(() => loadUniverse(true).catch(() => {}), 120000);
  setInterval(() => loadDoji(true).catch(() => {}), 120000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshAll();
  });
  window.addEventListener("online", refreshAll);
});

// Daftarkan Web Push untuk Chrome PWA
async function subscribeWebPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission === "granted") return;

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const res = await fetch("/api/push/key");
      const { publicKey } = await res.json();
      const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
      const base64 = (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
      const raw = atob(base64);
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: out });
    }
    
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    console.log("[push] Web Push tersimpan.");
  } catch (e) { console.error("[push] Gagal:", e); }
}

// Panggil saat aplikasi pertama dibuka
document.addEventListener("DOMContentLoaded", () => {
  if (Notification.permission === "default") {
    Notification.requestPermission().then(perm => {
      if (perm === "granted") subscribeWebPush();
    });
  } else if (Notification.permission === "granted") {
    subscribeWebPush();
  }
});