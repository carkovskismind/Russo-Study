// Service worker: permite instalar la app y estudiar sin conexión.
// Los mazos (data/) se piden primero a la red para que tus cambios aparezcan
// en cuanto los subas; si no hay conexión se usa la última copia guardada.
// Todo se pide primero a la red, así que los cambios aparecen al recargar.
// El mismo archivo sirve a la app real (raíz) y a la beta (/beta/sw.js).
// Cada una usa su propia caché y la app real no toca nada bajo /beta/.
const IS_BETA = /\/beta\/sw\.js$/.test(location.pathname);
const CACHE_FAMILY = IS_BETA ? "russo-beta-v" : "russo-v";
const CACHE = CACHE_FAMILY + "10";
const BETA_PATH = new URL("beta", self.registration.scope).pathname; // p. ej. /Russo-Study/beta
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
  "icons/icon-512.png",
  "img/familia.png",
  "img/saludos.png",
  "img/perfil.png",
  "img/mapa/m2.png",
  "data/ruta.json",
  "data/mazos.json",
  "data/gramatica/dudas.json",
  "data/lectura/lectura.json",
  "data/ejercicios/paises.json",
  "data/ejercicios/casa.json",
  "data/ejercicios/ciudad.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_FAMILY) && k !== CACHE).map((k) => caches.delete(k))))
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

  // La app real no intercepta ni guarda nada de la beta.
  if (!IS_BETA && url.origin === location.origin && url.pathname.startsWith(BETA_PATH)) return;

  // Nunca guardar en caché las llamadas a Supabase.
  if (url.hostname.endsWith("supabase.co")) return;

  // Archivos de la app y mazos: siempre la versión más nueva si hay
  // internet; la copia guardada solo se usa sin conexión.
  if (url.origin === location.origin) {
    e.respondWith(networkFirst(req));
    return;
  }

  // Fuentes y la librería de Supabase desde CDN.
  if (/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req));
  }
});
