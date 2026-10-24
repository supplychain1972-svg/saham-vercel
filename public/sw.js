// Service worker versi 7 — jangan cache API
const CACHE_NAME = "saham-edge-v7";
const SHELL = ["/", "/index.html", "/app.js", "/styles.css", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  if (url.pathname.startsWith("/api/")) {
    e.respondWith(fetch(e.request, { cache: "no-store" }));
    return;
  }

  if (e.request.method !== "GET") return;

  e.respondWith(
    fetch(e.request)
      .then(r => {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});

// ============================================================
// PUSH — Terima notifikasi dari server
// ============================================================
self.addEventListener("push", event => {
  let data = { title: "SahamEdge", body: "Sinyal baru tersedia", url: "/" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = {
        title: parsed.title || data.title,
        body: parsed.body || data.body,
        ticker: parsed.ticker,
        url: parsed.url || (parsed.ticker ? `/saham/${parsed.ticker}` : "/"),
      };
    }
  } catch (e) {
    data.body = event.data ? event.data.text() : data.body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.ticker ? `ticker-${data.ticker}` : "saham-edge",
      data: { url: data.url },
      vibrate: [200, 100, 200],
      requireInteraction: false,
      renotify: true,
    })
  );
});

// ============================================================
// KLIK NOTIFIKASI — Buka halaman yang sesuai
// ============================================================
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(target) && "focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

// ============================================================
// PUSH SUBSCRIPTION CHANGE — KRUSIAL!
// Chrome Android rotate endpoint otomatis. Tanpa handler ini,
// server tetap kirim ke endpoint lama → 410 Gone → gagal terus.
// ============================================================
self.addEventListener("pushsubscriptionchange", event => {
  console.log("[sw] pushsubscriptionchange terdeteksi");
  event.waitUntil(
    (async () => {
      try {
        const oldOptions = event.oldSubscription?.options || {};
        const applicationServerKey = oldOptions.applicationServerKey;

        if (!applicationServerKey) {
          console.error("[sw] Tidak ada applicationServerKey, skip");
          return;
        }

        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });

        console.log("[sw] Subscription baru:", newSub.endpoint.slice(0, 60));

        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newSub.toJSON()),
        });

        if (res.ok) {
          console.log("[sw] ✅ Subscription baru terkirim ke server");
        } else {
          console.error("[sw] Gagal kirim ke server:", res.status);
        }
      } catch (e) {
        console.error("[sw] pushsubscriptionchange GAGAL:", e);
      }
    })()
  );
});