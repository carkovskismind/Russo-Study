// Service worker: permite instalar la app y estudiar sin conexión.
// Los mazos (data/) se piden primero a la red para que tus cambios aparezcan
// en cuanto los subas; si no hay conexión se usa la última copia guardada.
// Todo se pide primero a la red, así que los cambios aparecen al recargar.
// El mismo archivo sirve a la app real (raíz) y a la beta (/beta/sw.js).
// Cada una usa su propia caché y la app real no toca nada bajo /beta/.
const IS_BETA = /\/beta\/sw\.js$/.test(location.pathname);
const CACHE_FAMILY = IS_BETA ? "russo-beta-v" : "russo-v";
const CACHE = CACHE_FAMILY + "55"; // 4.2.2
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
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "icons/favicon-16.png",
  "img/familia.png",
  "img/saludos.png",
  "img/perfil.png",
  "img/mapa/mapa-claro-a3.svg",
  "img/mapa/mapa-oscuro-a3.svg",
  "img/mapa/casa-oscuro.svg",
  "img/mapa/pin-o.png",
  "img/mapa/pin-c.png",
  "img/mapa/cruz-o.png",
  "img/mapa/cruz-c.png",
  "img/home/monito-oscuro.png",
  "img/home/monito-claro.png",
  "img/home/carta-oscuro.svg",
  "img/home/carta-claro.svg",
  "img/home/globo-oscuro.png",
  "img/home/globo-claro.png",
  "img/home/azul-oscuro.png",
  "img/home/azul-claro.png",
  "img/home/naranja-oscuro.png",
  "img/home/naranja-claro.png",
  "data/ruta.json",
  "data/mazos.json",
  "data/gramatica/dudas.json",
  "data/lectura/lectura.json",
  "audio/ru/index.json"
];

// Para estudiar sin conexión desde la primera visita se guardan también todos los
// mazos (clave "mazos" de data/mazos.json) y los ejercicios (clave "ejercicios"):
// en la primera visita la página carga los datos antes de que el service worker
// la controle, así que no se guardarían solos. Si alguno falla no se rompe la instalación.
// Los audios (unos 25 MB) no se instalan de golpe: se guardan al oírse.
const FONTS_CSS = [
  "https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Manrope:wght@400;500;600;700;800&family=Marck+Script&family=PT+Sans:wght@400;700&family=Unbounded:wght@700&display=swap",
  "https://fonts.googleapis.com/css2?family=PT+Sans:wght@700&display=block"
];
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";

// Fuentes: la hoja de estilos y solo los archivos de los alfabetos que usa la app.
async function precacheFonts(c) {
  await Promise.all(FONTS_CSS.map(async (u) => {
    try {
      const res = await fetch(u);
      if (!res.ok) return;
      const css = await res.clone().text();
      await c.put(u, res);
      const files = [];
      css.replace(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{[^}]*?url\(([^)]+)\)/g, (m, subset, url) => {
        if (subset === "latin" || subset === "cyrillic") files.push(url.replace(/['"]/g, ""));
        return m;
      });
      await Promise.all(files.map((f) => c.add(f).catch(() => {})));
    } catch (err) { /* sin fuentes: se usan las del sistema */ }
  }));
}

async function precache() {
  const c = await caches.open(CACHE);
  await c.addAll(SHELL);
  try {
    const res = await fetch("data/mazos.json", { cache: "no-cache" });
    const m = await res.json();
    const extra = [
      ...(m.mazos || []).map((f) => `data/${f}`),
      ...(m.ejercicios || []).map((id) => `data/ejercicios/${id}.json`),
      "data/gramatica/paradas.json" // 4.2.0: paradas de gramática de la Ruta
    ];
    await Promise.all(extra.map((u) => c.add(new Request(u, { cache: "no-cache" })).catch(() => {})));
  } catch (err) { /* sin lista: se guardan al usarse */ }
  await c.add(SUPABASE_JS).catch(() => {});
  await precacheFonts(c);
}

self.addEventListener("install", (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
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

// Audios en ruso (varios MB): no se instalan de golpe; se guardan al oírse
// y desde entonces suenan sin conexión.
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreVary: true });
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
    if (/\/audio\/ru\/[^/]+\.mp3$/.test(url.pathname)) {
      e.respondWith(cacheFirst(req));
      return;
    }
    if (/\/audio\/ru\/index\.json$/.test(url.pathname)) {
      e.respondWith(staleWhileRevalidate(req));
      return;
    }
    e.respondWith(networkFirst(req));
    return;
  }

  // Fuentes y la librería de Supabase desde CDN.
  if (/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req));
  }
});
