mport { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { redis } from "./redis";
import webpush from "web-push";
import { getDb } from "./db";

// Init Firebase
let firebaseApp: any = null;
function getFirebase() {
  if (!firebaseApp) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!);
    firebaseApp = initializeApp({ credential: cert(sa) });
  }
  return firebaseApp;
}

export async function sendNotification(title: string, body: string, ticker: string) {
  const payload = { title, body, ticker, url: `/saham/${ticker}` };

  // 1. Kirim ke APK (FCM)
  try {
    const tokensStr = await redis.get<string>("fcm_tokens");
    const tokens: string[] = tokensStr ? (typeof tokensStr === 'string' ? JSON.parse(tokensStr) : tokensStr) : [];
    if (tokens.length > 0) {
      const messaging = getMessaging(getFirebase());
      await messaging.sendEachForMulticast({
        notification: { title, body },
        data: { ticker, url: payload.url },
        android: { priority: "high", notification: { channel_id: "default", sound: "default" } },
        tokens,
      });
    }
  } catch (e) { console.error("FCM Error:", e); }

  // 2. Kirim ke Chrome PWA (Web Push)
  try {
    webpush.setVapidDetails("mailto:admin@sahamedge.com", process.env.VAPID_PUBLIC!, process.env.VAPID_PRIVATE!);
    const db = getDb();
    const { rows } = await db.query(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE aktif = TRUE`);
    for (const sub of rows) {
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload))
        .catch(async (err) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await db.query(`UPDATE push_subscriptions SET aktif = FALSE WHERE endpoint = $1`, [sub.endpoint]);
          }
        });
    }
  } catch (e) { console.error("WebPush Error:", e); }
}