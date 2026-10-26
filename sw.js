// Service worker: permite instalar la app y estudiar sin conexión.
// Los mazos (data/) se piden primero a la red para que tus cambios aparezcan
// en cuanto los subas; si no hay conexión se usa la última copia guardada.
// Si cambias archivos de la app (no los mazos), sube el número de CACHE.
const CACHE = "russo-v1";
const SHELL = [
  "./",
  "index.html",
  "css/app.css",
  "js/app.js",
  "js/store.js",
  "js/srs.js",
  "js/config.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: "no-cache" });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Nunca guardar en caché las llamadas a Supabase.
  if (url.hostname.endsWith("supabase.co")) return;

  if (url.origin === location.origin) {
    if (url.pathname.includes("/data/") || req.mode === "navigate" || url.pathname.endsWith("/js/config.js")) {
      e.respondWith(networkFirst(req));
      return;
    }
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Fuentes y la librería de Supabase desde CDN.
  if (/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req));
  }
});
