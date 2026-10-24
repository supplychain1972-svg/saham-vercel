import { Hono } from "hono";
import { cors } from "hono/cors";
import { Receiver } from "@upstash/qstash";
import { runCron, syncHistoricalData } from "../src/cron";
import { sendNotification } from "../src/notifier";
import { getDb } from "../src/db";
import { redis } from "../src/redis";

const app = new Hono();
app.use("/api/*", cors());

// ============================================================
// VERIFIKASI QSTASH (Anti-Spam)
// ============================================================
const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

async function verifyQStash(c: any) {
  const sig = c.req.header("Upstash-Signature") || "";
  const body = await c.req.text();
  try {
    return await receiver.verify({ signature: sig, body, url: c.req.url });
  } catch {
    return false;
  }
}

// ============================================================
// HEALTH CHECK
// ============================================================
app.get("/api/health", c => c.json({ 
  ok: true, 
  ts: Date.now(), 
  build: "vercel-idx-finance-v1",
  env: {
    hasDb: !!process.env.DATABASE_URL,
    hasRedis: !!process.env.UPSTASH_REDIS_URL,
    hasFcm: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    hasVapid: !!process.env.VAPID_PUBLIC,
  }
}));

// ============================================================
// CRON ENDPOINT (Dipanggil QStash tiap 1 menit)
// ============================================================
app.post("/api/cron/update", async c => {
  if (!(await verifyQStash(c))) return c.json({ error: "unauthorized" }, 401);
  try {
    await runCron();
    return c.json({ ok: true, ts: Date.now() });
  } catch (e: any) {
    console.error("[cron] error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ============================================================
// ADMIN: Sinkronisasi Data Historis (Jalankan sekali)
// ============================================================
app.get("/api/admin/sync-history", async c => {
  if (c.req.query("token") !== process.env.ADMIN_TOKEN) {
    return c.json({ error: "unauthorized" }, 401);
  }
  try {
    await syncHistoricalData();
    return c.json({ ok: true, message: "Historical data synced successfully" });
  } catch (e: any) {
    console.error("[sync] error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ============================================================
// ADMIN: Manual Run (untuk test)
// ============================================================
app.get("/api/admin/run", async c => {
  if (c.req.query("token") !== process.env.ADMIN_TOKEN) {
    return c.json({ error: "unauthorized" }, 401);
  }
  try {
    await runCron();
    return c.json({ ok: true, message: "Cron executed manually" });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ============================================================
// ADMIN: Test Notifikasi
// ============================================================
app.post("/api/admin/test-notif", async c => {
  if (c.req.query("token") !== process.env.ADMIN_TOKEN) {
    return c.json({ error: "unauthorized" }, 401);
  }
  try {
    await sendNotification(
      "🎯 Test Notifikasi SahamEdge",
      "Sistem Vercel + idx-finance berjalan normal!",
      "TEST"
    );
    return c.json({ ok: true, message: "Test notification sent" });
  } catch (e: any) {
    console.error("[test-notif] error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ============================================================
// WEB PUSH (Chrome PWA)
// ============================================================
app.get("/api/push/key", c => c.json({ publicKey: process.env.VAPID_PUBLIC }));

app.post("/api/push/subscribe", async c => {
  try {
    const body = await c.req.json<{
      endpoint: string;
      keys: { p256dh: string; auth: string };
    }>();
    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      return c.json({ error: "invalid payload" }, 400);
    }
    const db = getDb();
    await db.query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, aktif) 
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (endpoint) DO UPDATE SET 
       p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, aktif = TRUE`,
      [body.endpoint, body.keys.p256dh, body.keys.auth]
    );
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/api/push/unsubscribe", async c => {
  try {
    const body = await c.req.json<{ endpoint: string }>();
    if (!body?.endpoint) return c.json({ error: "invalid" }, 400);
    const db = getDb();
    await db.query(
      `UPDATE push_subscriptions SET aktif = FALSE WHERE endpoint = $1`,
      [body.endpoint]
    );
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ============================================================
// FCM (APK Android)
// ============================================================
app.post("/api/push/subscribe-fcm", async c => {
  try {
    const { fcmToken } = await c.req.json<{ fcmToken: string }>();
    if (!fcmToken) return c.json({ error: "token required" }, 400);
    
    const existing = await redis.get<string[]>("fcm_tokens") || [];
    const tokens = new Set(existing);
    tokens.add(fcmToken);
    await redis.set("fcm_tokens", JSON.stringify([...tokens]));
    
    return c.json({ ok: true, total: tokens.size });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ============================================================
// DATA ENDPOINTS (untuk Frontend)
// ============================================================
app.get("/api/predictions", async c => {
  try {
    const db = getDb();
    const limit = Math.min(parseInt(c.req.query("limit") || "50"), 200);
    const { rows } = await db.query(`
      SELECT * FROM predictions 
      WHERE date = (SELECT MAX(date) FROM predictions)
      AND sinyal != 'HOLD'
      ORDER BY ABS(skor) DESC LIMIT $1
    `, [limit]);
    return c.json({ 
      date: rows[0]?.date || null, 
      items: rows,
      sentimenPasar: "Netral",
      sentimenPasarSkor: 0
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/api/status", async c => {
  try {
    const db = getDb();
    const { rows: pred } = await db.query(
      `SELECT MAX(date) as d, COUNT(*) as n FROM predictions`
    );
    return c.json({
      ok: true,
      build: "vercel-idx-finance-v1",
      now: new Date().toISOString(),
      lastPredictionDate: pred[0]?.d || null,
      predictionCount: pred[0]?.n || 0,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ============================================================
// FALLBACK: SPA (index.html)
// ============================================================
app.get("*", c => {
  return c.text("Not found", 404);
});

export default app;