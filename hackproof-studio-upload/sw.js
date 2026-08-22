/* HackProof Studio — service worker.
 *
 * Two jobs:
 *   1. The site keeps loading with no connection at all. Pages, fonts, logos and
 *      the runtime are precached on install; screenshots are cached the first
 *      time they are seen.
 *   2. A brief submitted with no connection is not lost. It is held in IndexedDB
 *      and sent the moment the device is back online, whether that is two
 *      seconds or two days later.
 *
 * Bump CACHE_VERSION on every deploy. Old caches are deleted on activate.
 */
const CACHE_VERSION = "hp-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

// Everything needed to render any page with the network switched off.
// Screenshots are deliberately absent: 3MB of them would make install slow and
// fragile, and the runtime cache picks them up as they are viewed.
const SHELL = [
  // Clean URLs, matching the canonicals, the sitemap and the in-page links.
  // .htaccess rewrites these to the .html files on disk.
  "/",
  "/work",
  "/services",
  "/security",
  "/studio",
  "/open-brief",
  "/hp-nav.html",
  "/hp-footer.html",
  "/support.js",
  "/js/hp-offline.js",
  "/site.webmanifest",
  "/fonts/everett-regular.ttf",
  "/assets/logo-ink-web.png",
  "/assets/logo-paper-web.png",
  "/assets/logo-studio-coral.png",
  "/assets/favicon/favicon-32.png",
  "/assets/favicon/apple-touch-icon.png",
];

// Third-party files the pages need. Fetched no-cors where required; an opaque
// response still replays fine from cache.
const THIRD_PARTY = [
  "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js",
  "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js",
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap",
];

// ---------------------------------------------------------------- install
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, not addAll: one 404 must not fail the whole install and
      // leave the site with no offline support at all.
      await Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      );
      await Promise.all(
        THIRD_PARTY.map((url) =>
          fetch(new Request(url, { mode: "no-cors" }))
            .then((res) => cache.put(url, res))
            .catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

// ---------------------------------------------------------------- activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })()
  );
});

// ---------------------------------------------------------------- fetch
const isHTML = (req) =>
  req.mode === "navigate" ||
  (req.headers.get("accept") || "").includes("text/html");

async function networkFirst(event) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const preload = await event.preloadResponse;
    const fresh = preload || (await fetch(event.request));
    if (fresh && fresh.ok) cache.put(event.request, fresh.clone());
    return fresh;
  } catch (e) {
    // Offline: serve the page from cache, then the shell copy, then the
    // front door. A visitor should never see the browser's error page.
    return (
      (await cache.match(event.request)) ||
      (await caches.match(event.request, { ignoreSearch: true })) ||
      (await caches.match("/index.html")) ||
      new Response("<h1>Offline</h1>", {
        headers: { "Content-Type": "text/html" },
        status: 503,
      })
    );
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request, { ignoreSearch: false });
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res && (res.ok || res.type === "opaque")) {
      const cache = await caches.open(ASSET_CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch (e) {
    return caches.match(request, { ignoreSearch: true }) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;             // POSTs are handled by the queue
  const url = new URL(req.url);
  if (url.pathname === "/__save") return;       // local dev helper

  if (isHTML(req)) {
    event.respondWith(networkFirst(event));
    return;
  }
  // Analytics is deliberately NOT matched below: googletagmanager.com,
  // google-analytics.com and hotjar.com fall through to the network and are
  // never cached.
  // Caching a tracker would replay stale hits and corrupt the measurement.
  // Same-origin assets plus the third-party files listed above.
  if (
    url.origin === self.location.origin ||
    /cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.host)
  ) {
    event.respondWith(cacheFirst(req));
  }
});

// ---------------------------------------------------------------- brief queue
// Shared with js/hp-offline.js. Keep the names in step.
const DB_NAME = "hp-briefs";
const STORE = "queue";

function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) {
        r.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function idb(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// A sync event and a postMessage flush can overlap. Without this guard the same
// brief is POSTed twice and the studio gets duplicate emails for one visitor.
// Set by the page via postMessage, so a brief queued before an endpoint existed
// can still be delivered once one is configured.
let FALLBACK_ENDPOINT = "";

let flushing = false;

async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    await flushInner();
  } finally {
    flushing = false;
  }
}

async function flushInner() {
  const db = await openDB();
  const items = await idb(db, "readonly", (s) => s.getAll());
  if (!items.length) return;

  for (const item of items) {
    const target = item.endpoint || FALLBACK_ENDPOINT;
    if (!target) continue; // nothing configured yet; hold it, do not drop it
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ briefId: item.id }, item.payload)),
      });
      if (res.ok) {
        await idb(db, "readwrite", (s) => s.delete(item.id));
        const clientList = await self.clients.matchAll();
        clientList.forEach((c) =>
          c.postMessage({ type: "brief-sent", id: item.id })
        );
      } else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        // The server rejected it outright. Retrying forever will not help.
        await idb(db, "readwrite", (s) => s.delete(item.id));
      } else {
        throw new Error("retry");
      }
    } catch (e) {
      // Still offline or the server is down. Leave it queued and let the next
      // sync or the next `online` event try again.
      throw e;
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "hp-brief-sync") event.waitUntil(flushQueue());
});

// Safari and every iOS browser lack Background Sync, so the page also asks
// directly whenever it regains connectivity.
self.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data.type === "flush-briefs") {
    if (event.data.endpoint) FALLBACK_ENDPOINT = event.data.endpoint;
    event.waitUntil(flushQueue());
  }
  if (event.data.type === "skip-waiting") self.skipWaiting();
});
