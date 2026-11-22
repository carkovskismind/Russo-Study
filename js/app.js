import { Store, IS_BETA } from "./store.js";
import { schedule, endOfDay, startOfDay, dateKey, DAY } from "./srs.js";

const APP_VERSION = "4.3.0";
// Botón «Reportar falla». Está activo en la beta; para activarlo también en la versión real, cambia a true.
const REPORT_BUTTON = IS_BETA || false;

// Últimos errores de la app (texto corto, sin direcciones con datos ni correos) para los reportes.
const recentErrors = [];
function noteError(msg) {
  const clean = String(msg || "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[correo]")
    .replace(/(token|bearer|apikey|password|contrase\w*)[^\s,;]*/gi, "[oculto]")
    .replace(/\?[^\s)]*/g, "")
    .slice(0, 160);
  if (!clean) return;
  recentErrors.push(clean);
  if (recentErrors.length > 5) recentErrors.shift();
}
window.addEventListener("error", (e) => noteError(e.message));
window.addEventListener("unhandledrejection", (e) => noteError(e.reason && e.reason.message ? e.reason.message : e.reason));
const NEW_PER_DECK_SESSION = 20;
const PILOT = "familia";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  decks: [],
  deckById: new Map(),
  currentDeck: null,
  temaFilter: "Todos",
  temasMod: null,
  temasFrom: null,
  dudas: {},
  ej: {},
  lectura: null,
  leer: { step: 0, sel: 0 },
  ruta: null,
  paradas: null,
  mapa: null,
  openTile: PILOT,
  selecting: false,
  selected: new Set(),
  word: null,
  session: null,
  fr: null,
  view: "home",
  loginEmail: "",
  loginStep: "signin"
};

const store = new Store((what) => {
  if (what === "status" || what === "auth") renderSync();
  if (what === "data" || what === "auth") {
    applyTheme();
    applyFon();
    if (state.decks.length) rebuildMine();
    if (state.view === "home") renderHome();
    if (state.view === "temas") renderTemas();
    if (state.view === "modulo") renderModulo();
    if (state.view === "mapa") renderMapa();
    if (state.view === "tema") renderTema();
  }
  if (what === "auth" && state.view === "settings") renderSettings();
});

// ---------- Aspecto de cada tema ----------
const PALS = ["lav", "pe", "kh", "bl", "li", "pk", "mint", "aq"];
const NEW_DECKS = new Set(["nombres"]);
const SVG = {
  book: `<svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M32 18c-7-5-16-6-24-4v36c8-2 17-1 24 4zM32 18c7-5 16-6 24-4v36c-8-2-17-1-24 4zM32 18v36"/><text x="20" y="38" text-anchor="middle" font-family="Manrope,sans-serif" font-weight="800" font-size="12" fill="currentColor" stroke="none">Аа</text></svg>`,
  palette: `<svg width="52" height="52" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M32 8C16 8 6 20 6 32s10 22 22 22c5 0 6-4 4-7s-1-7 4-7h8c8 0 14-6 14-13C58 16 46 8 32 8z"/><circle cx="20" cy="26" r="4.5" fill="currentColor"/><circle cx="32" cy="18" r="4.5" stroke-width="2.5"/><circle cx="44" cy="24" r="4.5" fill="currentColor"/><circle cx="18" cy="39" r="4.5" stroke-width="2.5"/></svg>`,
  house: `<svg width="54" height="54" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 32L32 12l24 20M15 28v26h34V28M28 54V40h9v14M44 16v9"/></svg>`
};
SVG.star = `<svg width="50" height="50" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2z"/></svg>`;
const VIS = {
  familia: { pal: "lav", art: { type: "img", src: "img/familia.png" } },
  saludos: { pal: "pe", art: { type: "head", src: "img/saludos.png" } },
  nombres: { pal: "pk", art: null },
  numeros: { pal: "red", art: { type: "num", text: "123" } },
  basicas: { pal: "kh", art: { type: "svg", svg: SVG.book } },
  colores: { pal: "li", art: { type: "svg", svg: SVG.palette } },
  casa: { pal: "pe", art: { type: "svg", svg: SVG.house } },
  "mis-palabras": { pal: "aq", art: { type: "svg", svg: SVG.star } }
};
const RU_NAME = {
  saludos: "Приве́т", basicas: "Слова́", familia: "Семья́", profesiones: "Профе́ссии", animales: "Живо́тные",
  casa: "Дом", ciudad: "Го́род", naturaleza: "Приро́да", calendario: "Календа́рь", fiestas: "Пра́здники", numeros: "Чи́сла",
  colores: "Цвета́", adjetivos: "Хара́ктер", ideas: "Иде́и", verbos: "Глаго́лы", juegos: "И́гры",
  instrumentos: "Му́зыка", comida: "Еда́", "ropa-cuerpo": "Оде́жда", escuela: "Шко́ла", textos: "Те́ксты",
  cultura: "Культу́ра", servilismo: "Уго́дник", expresiones: "Фра́зы", paises: "Стра́ны",
  "reglas-gentilicios": "мексика́нка", nombres: "Имена́", "falsos-amigos": "Ло́жные друзья́"
};

function visFor(deck) {
  const v = VIS[deck.id];
  if (v) return v;
  return { pal: PALS[(deck.palIndex ?? deck.index) % PALS.length], art: null };
}

function artHtml(deck) {
  const a = visFor(deck).art;
  if (!a) return "";
  if (a.type === "img") return `<img class="art art-img" src="${a.src}" alt="">`;
  if (a.type === "head") return `<img class="art art-head" src="${a.src}" alt="">`;
  if (a.type === "num") return `<span class="art art-num" aria-hidden="true">${esc(a.text)}</span>`;
  return `<span class="art art-svg ink" aria-hidden="true">${a.svg}</span>`;
}

// ---------- Utilidades ----------
const STRESS = /́/g;

function plain(s) {
  return String(s || "").replace(STRESS, "");
}

function norm(s) {
  return plain(s).toLowerCase().replace(/ё/g, "е").trim();
}

// Para comparar frases: sin acentos, sin mayúsculas y sin puntuación.
function normSentence(s) {
  return norm(s).replace(/[.,!?¿¡«»—–\-:;]/g, " ").split(/\s+/).filter(Boolean).join(" ");
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2600);
}

const VIEWS = ["home", "modulo", "temas", "mapa", "tema", "palabra", "study", "frase", "dialogo", "cajas", "gram", "reto", "leer", "done", "fin", "settings"];
const NAV_VIEWS = { home: "home", temas: "temas", modulo: "temas", mapa: "temas", settings: "settings" };

function show(view) {
  state.view = view;
  hideAudioNote();
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
  const navOn = NAV_VIEWS[view];
  $("#nav").hidden = !navOn;
  for (const b of $$("#nav [data-go]")) {
    if (b.dataset.go === navOn) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  document.body.classList.toggle("on-mapa", view === "mapa");
  document.body.classList.toggle("on-palabra", view === "palabra");
  if (view === "done") renderDoneLogin();
  window.scrollTo(0, 0);
  syncHistory();
  if (view === "home" && state.updatePending) setTimeout(() => location.reload(), 300);
  if (view === "home") startBlink(); else stopBlink();
}

// ---------- Historial (botón y gestos de retroceso del celular) ----------
// Pila deseada: base + top(n:1) + top(n:2). Al retroceder (gesto o botón) se sube un
// nivel igual que la flecha de la app (tema → módulo → inicio). En Inicio, o en un
// repaso, retroceder abre una ventana de confirmación. Chrome Android marca como
// "saltables" las entradas que la página agrega SIN activación de usuario (pushState
// dentro de popstate, touchstart o pointerdown táctil no cuentan; click, pointerup,
// touchend y keydown sí). Por eso la pila se arma en eventos que sí dan activación
// (y de respaldo en los otros), se repone hasta tener 2 entradas "top" en cada toque
// real, y la segunda entrada cubre dos gestos seguidos sin tocar entre medio.
let userActive = false;
let exiting = false;
let needArm = false;
let inPop = false;
let lastArm = "—";
const topN = () => (history.state && history.state.app === "top" ? history.state.n || 1 : 0);

// La línea de diagnóstico del historial se quitó de Ajustes en 4.0.0; sin elemento, esto no hace nada.
function showHistDiag() {
  const el = document.getElementById("hist-diag");
  if (!el) return;
  const st = history.state;
  el.textContent = `Historial: ${history.length} · estado: ${st ? st.app : "—"}/${st && st.n ? st.n : "—"} · armado por: ${lastArm}`;
}

function syncHistory(src) {
  if (!userActive || exiting) return;
  if (inPop && src !== "popstate") return; // dentro de popstate no hay activación: se repone en el siguiente toque
  try {
    const n = topN();
    if (n >= 2) { /* completa */ }
    else if (n === 1) { history.pushState({ app: "top", n: 2 }, ""); lastArm = src || "show"; }
    else {
      if (!history.state || history.state.app !== "base") history.replaceState({ app: "base" }, "");
      history.pushState({ app: "top", n: 1 }, "");
      history.pushState({ app: "top", n: 2 }, "");
      lastArm = src || "show";
    }
    if (n < 2 && src && src !== "popstate") needArm = false;
  } catch (e) { /* sin historial disponible */ }
  showHistDiag();
}

// Ventana de confirmación: «Quedarme/Seguir» (turquesa) y «Salir» (contorno).
let dlgOnLeave = null;
const dlgOpen = () => !$("#dlg").hidden;

function openDlg(kind) {
  if (dlgOpen()) return;
  const app = kind === "app";
  $("#dlg-title").textContent = app ? "¿Salir de Ruso de bolsillo?" : "¿Salir del repaso?";
  $("#dlg-text").textContent = app ? "Tu avance ya está guardado." : "Tu avance de hoy se guarda.";
  $("#dlg-stay").textContent = app ? "Quedarme" : "Seguir";
  $("#dlg-leave").textContent = "Salir";
  dlgOnLeave = app ? exitApp : closeSession;
  dlgReturn = document.activeElement;
  $("#dlg").hidden = false;
  for (const el of $$(".view, #nav, #sheet")) el.inert = true;
  $("#dlg-stay").focus();
}
let dlgReturn = null;

function closeDlg() {
  if (!dlgOpen()) return;
  $("#dlg").hidden = true;
  for (const el of $$(".view, #nav, #sheet")) el.inert = false;
  if (dlgReturn && document.contains(dlgReturn) && !dlgReturn.closest("[hidden]")) dlgReturn.focus();
}

// Salir de la app de verdad: se retrocede por encima de las dos entradas de la app
// (hacia la página anterior). Si no hay página anterior (app instalada, primera
// entrada), se intenta cerrar la ventana; y si el navegador no deja, se avisa.
// Nunca se vuelve a armar el historial durante la salida, así que no hay bucle.
function exitApp() {
  closeDlg();
  exiting = true;
  let left = false;
  const hide = () => { left = true; };
  window.addEventListener("pagehide", hide, { once: true });
  try {
    const back = 1 + topN(); // entradas "top" + la base
    if (history.length > back) history.go(-back);
    else window.close();
  } catch (e) { /* nada */ }
  setTimeout(() => {
    if (left) return;
    try { window.close(); } catch (e) { /* nada */ }
    setTimeout(() => {
      if (left) return;
      exiting = false;
      window.removeEventListener("pagehide", hide);
      toast("Ya puedes cerrar la app desde tu celular");
      syncHistory();
    }, 350);
  }, 350);
}

window.addEventListener("pageshow", (e) => { if (e.persisted) exiting = false; if (userActive) syncHistory("pageshow"); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && userActive) syncHistory("visible"); });

function appBack() {
  if (dlgOpen()) return closeDlg();
  if (document.body.classList.contains("sheet-on")) return closeSheet();
  switch (state.view) {
    case "home": return openDlg("app");
    case "study": return openDlg("repaso");
    case "frase": return $("#frase-close").click();
    case "dialogo": return $("#dialogo-close").click();
    case "cajas": return $("#cajas-close").click();
    case "gram": return $("#gram-back").click();
    case "reto": return retoBack();
    case "done": return doneContinue();
    case "fin": return finEnd();
    case "palabra": return $("#palabra-back").click();
    case "tema": return $("#tema-back").click();
    case "leer": return $("#leer-back").click();
    case "temas": return go(state.temasFrom === "mapa" ? "mapa" : state.temasFrom === "modulo" ? "modulo" : "home");
    case "modulo": return go("mapa");
    case "mapa":
    case "settings": return go("home");
  }
}

window.addEventListener("popstate", () => {
  if (exiting) return;
  // La persona retrocedió. Se actúa; la reposición real va en el siguiente toque.
  userActive = true;
  inPop = true;
  try { appBack(); } finally { inPop = false; }
  needArm = true;
  lastArm = "popstate";
  // Respaldo: si ya no quedan entradas "top", se arman aquí para no cerrar la app.
  if (topN() === 0) syncHistory("popstate");
  else showHistDiag();
});

// Arma el historial con eventos que SÍ dan activación de usuario; los de respaldo
// (pointerdown, touchstart) solo sirven si el navegador los cuenta.
for (const ev of ["click", "pointerup", "touchend", "keydown", "pointerdown", "touchstart"]) {
  window.addEventListener(ev, () => {
    if (exiting) return;
    if (!userActive) userActive = true;
    if (topN() < 2) syncHistory(ev);
  }, { capture: true, passive: true });
}

function go(view) {
  if (view === "modulos") view = "temas"; // 4.2.0: la lista de módulos ya no existe
  if (view === "temas" && state.view !== "temas") state.temasFrom = ["mapa", "modulo"].includes(state.view) ? state.view : null;
  if (view === "mapa") renderMapa();
  if (view === "home") renderHome();
  if (view === "modulo") renderModulo();
  if (view === "temas") renderTemas();
  if (view === "settings") renderSettings();
  show(view);
  if (view === "mapa") mapaHits();
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const TURTLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 15.5c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z"/><path d="M7.5 12.5l4 3 4-3"/><path d="M19.5 13.5h1.2a1.8 1.8 0 0 0 0-3.6h-.7"/><path d="M6.5 15.5v2.5M10 15.5v2.5M13 15.5v2.5M16.5 15.5v2.5"/></svg>`;
const SPEAKER = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>`;
const ARROW = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>`;

// ---------- Datos ----------
async function loadDecks() {
  const res = await fetch("data/mazos.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("No se encontró data/mazos.json");
  const manifest = await res.json();
  const files = manifest.mazos || [];
  const loaded = await Promise.all(
    files.map(async (file) => {
      try {
        const r = await fetch(`data/${file}`, { cache: "no-cache" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return { file, json: await r.json() };
      } catch (e) {
        console.error(`No se pudo leer data/${file}`, e);
        return { file, error: String(e) };
      }
    })
  );

  const decks = [];
  const broken = [];
  for (const { file, json, error } of loaded) {
    if (error || !json) {
      broken.push(file);
      continue;
    }
    const id = json.id || file.replace(/\.json$/, "").replace(/\W+/g, "-");
    const seen = new Set();
    const cards = [];
    (json.tarjetas || []).forEach((c) => {
      const isQA = !!c.pregunta;
      if (isQA ? !c.respuesta : !(c.ru && c.es)) return;
      let base = c.id || `${id}:${norm(isQA ? c.pregunta : c.ru)}`;
      while (seen.has(base)) base += "+";
      seen.add(base);
      cards.push({
        id: base,
        deckId: id,
        kind: isQA ? "qa" : "word",
        ru: c.ru,
        es: c.es,
        tag: c.tag || "",
        nota: c.nota || "",
        pista: c.pista || "",
        fonetica: c.fonetica || "",
        seccion: c.seccion || "",
        ejemplo: c.ejemplo || null,
        tip: c.tip || "",
        // 4.2.0: bloque de la Ruta y palabra extra (no sale sola como nueva)
        bloque: typeof c.bloque === "string" ? c.bloque : "",
        extra: c.extra === true,
        q: c.pregunta,
        a: c.respuesta
      });
    });
    decks.push({
      id,
      index: decks.length,
      // 4.2.0: los mazos nuevos no mueven el color de los que ya existían.
      palIndex: decks.filter((d) => !NEW_DECKS.has(d.id)).length,
      title: json.titulo || id,
      group: json.grupo || "Vocabulario",
      desc: json.descripcion || "",
      aprender: json.aprender || null,
      frases: Array.isArray(json.frases) ? json.frases : [],
      // Diálogos y cajas pueden ir dentro del mazo o en data/ejercicios/<id>.json.
      dialogos: Array.isArray(json.dialogos) ? json.dialogos : [],
      cajas: Array.isArray(json.cajas) ? json.cajas : [],
      // Retos de gramática por bloques (piloto: Saludos).
      retos: Array.isArray(json.retos) ? json.retos : [],
      cards
    });
  }
  state.decks = decks;
  state.deckById = new Map(decks.map((d) => [d.id, d]));
  rebuildMine();
  // Dudas de gramática y ejercicios (diálogos y cajas): archivos opcionales.
  try {
    const r = await fetch("data/gramatica/dudas.json", { cache: "no-cache" });
    if (r.ok) state.dudas = await r.json();
  } catch (e) { console.warn("dudas", e); }
  try {
    const r = await fetch("data/ruta.json", { cache: "no-cache" });
    if (r.ok) state.ruta = await r.json();
  } catch (e) { console.warn("ruta", e); }
  // 4.2.0: paradas de gramática de la Ruta (opcional mientras se escriben).
  try {
    const r = await fetch("data/gramatica/paradas.json", { cache: "no-cache" });
    if (r.ok) {
      const j = await r.json();
      const list = Array.isArray(j) ? j : j.paradas || [];
      state.paradas = new Map(list.filter((p) => p && p.id && Array.isArray(p.elige)).map((p) => [p.id, p]));
    }
  } catch (e) { console.warn("paradas", e); }
  try {
    const r = await fetch("data/lectura/lectura.json", { cache: "no-cache" });
    if (r.ok) state.lectura = await r.json();
  } catch (e) { console.warn("lectura", e); }
  await Promise.all((manifest.ejercicios || []).map(async (id) => {
    try {
      const r = await fetch(`data/ejercicios/${id}.json`, { cache: "no-cache" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      state.ej[id] = { dialogos: j.dialogos || [], cajas: j.cajas || [] };
    } catch (e) { console.warn(`ejercicios/${id}`, e); }
  }));
  if (broken.length && broken.length === files.length) toast("No se cargaron los temas. Revisa tu conexión y vuelve a abrir la app.");
  else if (broken.length) toast(`No se pudo leer: ${broken.join(", ")}`);
}

function keysFor(card) {
  if (card.kind === "qa") return [`${card.id}|qa`];
  const dir = store.settings.dir;
  if (dir === "es") return [`${card.id}|es`];
  if (dir === "both") return [`${card.id}|ru`, `${card.id}|es`];
  return [`${card.id}|ru`];
}

function itemsFor(deck) {
  const out = [];
  for (const card of deck.cards) {
    for (const key of keysFor(card)) {
      out.push({ card, key, dir: key.split("|").pop() });
    }
  }
  return out;
}

function deckEnabled(deck) {
  return !store.settings.disabled[deck.id];
}

function deckStats(deck, now = Date.now()) {
  const eod = endOfDay(now);
  let due = 0, learned = 0, fresh = 0, total = 0, last = 0;
  // «Nuevas» se cuentan por palabra (en «Ambas» una palabra tiene dos tarjetas);
  // la otra dirección de una palabra ya vista cuenta como repaso pendiente.
  for (const card of deck.cards) {
    const keys = keysFor(card);
    const sts = keys.map((k) => store.card(k));
    // 4.2.0: las palabras extra no cuentan en el avance ni salen solas como nuevas;
    // si ya las aprendiste, siguen en repaso.
    if (card.extra) {
      if (sts.every((st) => !st)) continue;
      for (const st of sts) {
        if (!st) { due++; continue; }
        if (st.due <= eod) due++;
        if ((st.t || 0) > last) last = st.t;
      }
      continue;
    }
    total += keys.length;
    if (sts.every((st) => !st)) { fresh++; continue; }
    for (const st of sts) {
      if (!st) { due++; continue; }
      if (st.ivl >= 1) learned++;
      if (st.due <= eod) due++;
      if ((st.t || 0) > last) last = st.t;
    }
  }
  for (const f of deck.frases) {
    const fs = store.frase(`${deck.id}:${f.id}`);
    if (fs && fs.t > last) last = fs.t;
  }
  const pct = total ? Math.round((learned / total) * 100) : 0;
  return { due, learned, fresh, total, pct, last };
}

function deckNumber(deck) {
  if (deck.mine) return "Personal";
  const pos = state.ruta ? rutaPos(deck.id) : null;
  return pos ? `Tema ${pos.label}` : "Biblioteca";
}

function deckTag(deck) {
  return state.ruta && baseOf(suggestedDeck()) === deck ? " · Sugerido" : "";
}

// Actividad de un día: lo que quedó registrado o, para el historial viejo,
// las tarjetas cuyo último repaso cayó ese día.
let activityCache = null;
function activityByDay() {
  if (activityCache) return activityCache;
  const map = {};
  for (const st of Object.values(store.p.cards)) {
    if (!st || !st.t) continue;
    const k = dateKey(st.t);
    map[k] = (map[k] || 0) + 1;
  }
  for (const [k, n] of Object.entries(store.p.days || {})) map[k] = Math.max(map[k] || 0, n);
  activityCache = map;
  return map;
}

function logActivity() {
  store.logActivity(dateKey(Date.now()));
  activityCache = null;
}

// 4.2.0 · Notas de ayuda con flecha: se apagan en Ajustes; cada una se va sola cuando ya
// usaste lo que señala (se guarda en este dispositivo).
const AYUDA_KEY = (IS_BETA ? "russo-beta-" : "russo-") + "ayudas-vistas";
function ayudaVista(id) {
  try { return !!(JSON.parse(localStorage.getItem(AYUDA_KEY) || "{}") || {})[id]; } catch { return false; }
}
function marcarAyuda(id) {
  try { const j = JSON.parse(localStorage.getItem(AYUDA_KEY) || "{}") || {}; j[id] = 1; localStorage.setItem(AYUDA_KEY, JSON.stringify(j)); } catch { /* sin almacenamiento */ }
}
const ayudaOn = (id) => store.settings.ayudas !== false && !ayudaVista(id);

// ---------- Inicio (portada 3.1) ----------
// Tema del que más tarjetas trae la fila de hoy (la que arma «Empezar»).
function todayTopic() {
  const plan = dailyPlan();
  const queue = buildQueue(dailyDecks(), plan.n, plan.r);
  const counts = new Map();
  for (const it of queue) { const u = cardUnitKey(it.card); counts.set(u, (counts.get(u) || 0) + 1); }
  const sug = suggestedDeck();
  if (sug && counts.get(unitKeyOf(sug))) return sug;
  let best = null;
  for (const [id, n] of counts) if (!best || n > best.n) best = { id, n };
  return best ? deckOfKey(best.id) : null;
}

// 4.2.0: tema o bloque de la Ruta al que pertenece una tarjeta (o su mazo).
let cardUnitMap = null;
function cardUnitKey(card) {
  if (!cardUnitMap) {
    cardUnitMap = new Map();
    for (const t of rutaItems()) if (t.kind === "tema" && t.deck) for (const c of t.deck.cards) if (!cardUnitMap.has(c.id)) cardUnitMap.set(c.id, t.key);
  }
  return cardUnitMap.get(card.id) || card.deckId;
}

// 4.2.0 · Aviso «Antes: 2 minutos de gramática»: la primera palabra nueva de hoy es de un
// tema con una parada pendiente (que no se saltó hoy).
const SALTA_KEY = (IS_BETA ? "russo-beta-" : "russo-") + "parada-saltada";
function saltadasHoy() {
  try {
    const j = JSON.parse(localStorage.getItem(SALTA_KEY) || "null");
    return j && j.day === dateKey(Date.now()) ? j.ids || [] : [];
  } catch { return []; }
}
function saltarParada(id) {
  const ids = [...new Set([...saltadasHoy(), id])];
  try { localStorage.setItem(SALTA_KEY, JSON.stringify({ day: dateKey(Date.now()), ids })); } catch { /* sin almacenamiento */ }
}
function avisoParada() {
  if (!state.paradas || !state.paradas.size) return null;
  const plan = dailyPlan();
  if (!plan.n) return null;
  const queue = buildQueue(dailyDecks(), plan.n, 0);
  const first = queue.find((it) => it.phase === "learn");
  if (!first) return null;
  const u = cardUnitKey(first.card);
  const skip = saltadasHoy();
  return rutaItems().find((t) => t.kind === "parada" && t.antes && (t.antes === u || t.antes === first.card.deckId) && !paradaDone(t.id) && !skip.includes(t.id)) || null;
}

// Tema siguiente al actual en la ruta (con mazo), o null.
function nextRutaTema() {
  const cur = currentTema();
  const all = rutaItems().filter((t) => t.kind === "tema" && t.deck);
  const i = cur ? all.indexOf(cur) : -1;
  return all.slice(i + 1).find((t) => !isMemorized(t.deck)) || null;
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Tema con «dudas de gramática»: el actual y, si no tiene, el primero de la ruta que sí.
function gramaticaDeck() {
  const cur = suggestedDeck();
  if (cur && dudasFor(cur)) return cur;
  return rutaOrder(state.decks).find((d) => dudasFor(d)) || null;
}

// ---------- 4.2.0 · Buscador del inicio ----------
function searchKey(s) {
  return norm(String(s || "")).replace(/[-·.,;:!?¿¡«»"()]/g, " ").replace(/\s+/g, " ").trim();
}
function clearSearch() {
  $("#h-q").value = "";
  renderSearch();
}
function renderSearch() {
  const raw = $("#h-q").value;
  const q = searchKey(raw);
  const on = q.length >= 2;
  $("#view-home").classList.toggle("searching", raw.trim().length > 0);
  $("#h-q-clear").hidden = !raw;
  const box = $("#h-results");
  box.hidden = !raw.trim();
  if (!raw.trim()) { box.innerHTML = ""; return; }
  if (!on) { box.innerHTML = `<p class="h-res-hint">Escribe al menos 2 letras.</p>`; return; }
  const words = [], temas = [], frases = [];
  const seenRu = new Set();
  for (const d of state.decks) {
    if (searchKey(d.title).includes(q) && !d.mine) temas.push(d);
    for (const c of d.cards || []) {
      if (words.length >= 30) break;
      const keys = [c.ru, c.es, c.fonetica].map(searchKey);
      if (!keys.some((k) => k.includes(q))) continue;
      const id = norm(c.ru) + "|" + d.id;
      if (seenRu.has(id)) continue;
      seenRu.add(id);
      const starts = keys.some((k) => k.startsWith(q) || k.split(" ").some((w) => w.startsWith(q)));
      words.push({ c, d, starts });
    }
    for (const f of d.frases || []) {
      if (frases.length >= 10) break;
      if ([f.texto, f.es].some((x) => searchKey(x).includes(q))) frases.push({ f, d });
    }
  }
  words.sort((a, b) => Number(b.starts) - Number(a.starts));
  const speakOk = canSpeak();
  const say = (t) => speakOk ? `<button class="h-res-say" type="button" data-say="${esc(t)}" aria-label="Escuchar ${esc(t)}">${SPEAKER}</button>` : "";
  const lab = (t) => `<h2 class="h-res-lab">${t}</h2>`;
  let html = "";
  if (words.length) html += lab("Palabras") + words.slice(0, 6).map(({ c, d }, i) => `<div class="h-res-row" style="--rb:${["#f1eddf", "#f1eddf", "#cefbc8"][i % 3]}"><button class="h-res-main" type="button" data-sword="${esc(c.id)}"><span class="h-res-bar card-frame pal-${visFor(d).pal}" aria-hidden="true"></span><span class="h-res-txt"><span><span class="h-res-ru" lang="ru">${esc(c.ru)}</span>${c.fonetica && fonOn() ? ` <span class="h-res-fon">${esc(c.fonetica)}</span>` : ""}</span><span class="h-res-es">${esc(c.es)}</span><span class="h-res-where">${esc(d.title)}</span></span></button>${say(c.ru)}</div>`).join("");
  if (temas.length) html += lab("Temas") + temas.slice(0, 4).map((d) => `<button class="h-res-tema card-frame pal-${visFor(d).pal}" type="button" data-stema="${esc(d.id)}"><span><b>${esc(d.title)}</b><span class="h-res-sub">Mazo · <span class="num">${(d.cards || []).length}</span> palabras</span></span><span class="h-res-open">Abrir →</span></button>`).join("");
  if (frases.length) html += lab("Frases") + frases.slice(0, 3).map(({ f, d }, i) => `<div class="h-res-row" style="--rb:${["#ece7ff", "#e6ebff"][i % 2]}"><button class="h-res-main" type="button" data-stema="${esc(d.id)}"><span class="h-res-txt"><span class="h-res-ru h-res-frase" lang="ru">${esc(f.texto)}</span><span class="h-res-where">${esc(f.es)} · ${esc(d.title)}</span></span></button>${say(f.texto)}</div>`).join("");
  if (!html) html = `<p class="h-res-hint">No encontré «${esc(raw.trim())}». Prueba en español, en ruso o como suena (sa-BA-ka).</p>`;
  else html += `<p class="h-res-hint">Puedes escribir en español, en ruso o como suena (sa-BA-ka).</p>`;
  box.innerHTML = html;
}

function streakDays(act, now) {
  let streak = 0;
  let day = act[dateKey(now)] ? now : now - DAY;
  while (act[dateKey(day)]) { streak++; day -= DAY; }
  return streak;
}

// ---------- 4.2.0 · Palabras vistas hoy (para «¡Lo lograste!») ----------
// Con el mismo prefijo que las demás claves (la beta no se cruza con la app real).
const HOY_KEY = (IS_BETA ? "russo-beta-" : "russo-") + "hoy";
function hoyLog() {
  const day = dateKey(Date.now());
  try {
    const h = JSON.parse(localStorage.getItem(HOY_KEY) || "null");
    if (h && h.day === day && h.decks && typeof h.decks === "object") return h;
  } catch { /* sin almacenamiento */ }
  return { day, decks: {} };
}
function markHoy(c) {
  if (!c || !c.deckId) return;
  const h = hoyLog();
  const l = h.decks[c.deckId] || (h.decks[c.deckId] = []);
  if (!l.includes(c.id)) l.push(c.id);
  try { localStorage.setItem(HOY_KEY, JSON.stringify(h)); } catch { /* sin almacenamiento */ }
}

function finDona(val, tot, label, color, sub = true) {
  const r = 26, c = 2 * Math.PI * r, f = tot > 0 ? c * Math.min(val / tot, 1) : 0;
  return `<div class="fin-dona">
    <div class="fin-ring"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="fin-track" cx="32" cy="32" r="${r}"/>${f > 0 ? `<circle cx="32" cy="32" r="${r}" stroke="${color}" stroke-dasharray="${f.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/>` : ""}<circle class="fin-edge" cx="32" cy="32" r="30.5"/><circle class="fin-edge" cx="32" cy="32" r="21.5"/></svg><span class="num">${val}</span></div>
    <span class="fin-lab">${label}${sub && tot > 0 ? `<br><span class="fin-de">de <span class="num">${tot}</span></span>` : ""}</span>
  </div>`;
}

const FIN_ICO = {
  frases: `<path d="M4 6h16M4 12h10M4 18h7"/>`,
  cajas: `<rect x="3" y="9" width="8" height="11" rx="1.5"/><rect x="13" y="9" width="8" height="11" rx="1.5"/><path d="M7 5v4M17 5v4"/>`,
  dialogo: `<path d="M4 5h16v10H9l-5 4z"/>`,
};

// Hasta 3 sugerencias (frases, cajas, diálogo) de los temas que viste hoy; primero lo que no has terminado.
// Palabras de hoy en forma comparable: sin acento, minúsculas, ё → е.
function normRu(t) {
  return String(t || "").normalize("NFD").replace(/\u0301/g, "").normalize("NFC").toLowerCase().replace(/ё/g, "е");
}
function ruTokens(t) {
  return normRu(t).split(/[^а-яa-z-]+/).filter(Boolean);
}
// Las palabras que estudiaste hoy (de la práctica del día), listas para buscar en los ejercicios.
function hoyWords(h) {
  const out = [];
  for (const ids of Object.values(h.decks)) {
    for (const id of ids) {
      const c = findCard(id);
      if (!c || !c.ru) continue;
      for (const part of String(c.ru).split(/[\/,;()]+/)) {
        const toks = ruTokens(part);
        if (toks.length) out.push({ ru: part.trim(), toks });
      }
    }
  }
  return out;
}
// ¿Aparece la palabra en el texto? Una palabra sola acepta su forma cambiada (Москва́ → Москве́).
function textHas(toks, w) {
  if (w.toks.length > 1) return normRu(toks.join(" ")).includes(w.toks.join(" "));
  const x = w.toks[0];
  if (x.length < 4) return toks.includes(x);
  const stem = x.slice(0, -1);
  return toks.some((t) => t === x || (t.startsWith(stem) && t.length <= x.length + 2));
}
function wordsIn(text, words) {
  const toks = ruTokens(text);
  const hit = [];
  for (const w of words) if (textHas(toks, w) && !hit.includes(w.ru)) hit.push(w.ru);
  return hit;
}

function finSuggestions() {
  const h = hoyLog();
  const words = hoyWords(h);
  if (!words.length) return [];
  // Primero los temas que estudiaste hoy; solo si en ellos no hay un ejercicio
  // con las palabras de hoy se busca en los demás temas.
  const today = Object.keys(h.decks).sort((a, b) => h.decks[b].length - h.decks[a].length);
  const ok = (d) => d && !d.mine && deckEnabled(d);
  const todayDecks = today.map((id) => state.deckById.get(id)).filter(ok);
  const otherDecks = state.decks.filter((d) => !today.includes(d.id)).filter(ok);
  const textOf = {
    frases: (f) => [f.texto, ...(f.fichas || [])].join(" "),
    cajas: (e) => (e.items || []).map((it) => `${it.ru || ""} ${it.base || ""}`).join(" "),
    dialogo: (d) => (d.mensajes || []).map((m) => [m.ru, ...((m.opciones || []).map((o) => o.ru))].join(" ")).join(" "),
  };
  const listOf = {
    frases: (d) => ejRaw(d).frases,
    cajas: (d) => ejRaw(d).cajas,
    dialogo: (d) => ejRaw(d).dialogos,
  };
  const doneOf = {
    frases: (d, f) => !!store.frase(`${d.id}:${f.id}`),
    cajas: (d, e) => { const r = store.ejer(e.id); return !!(r && r.ok > 0); },
    dialogo: (d, e) => { const r = store.ejer(e.id); return !!(r && r.ok > 0); },
  };
  const out = [];
  for (const key of ["frases", "cajas", "dialogo"]) {
    let best = null;
    for (const group of [todayDecks, otherDecks]) {
      for (const d of group) {
        listOf[key](d).forEach((item, idx) => {
          if (!ejOk(item, true)) return;
          const hit = wordsIn(textOf[key](item), words);
          if (!hit.length) return;
          const score = hit.length * 10 + (doneOf[key](d, item) ? 0 : 5);
          if (!best || score > best.score) best = { key, deck: d, idx, hit, score };
        });
      }
      if (best) break;
    }
    if (best) out.push(best);
  }
  return out.map(({ key, deck, idx, hit }) => {
    const ws = hit.slice(0, 3).join(", ");
    if (key === "frases") return { key, deck, idx, kind: "Uso de las palabras", title: `Armar frases · ${deck.title}`, desc: `Usa ${ws} en frases` };
    if (key === "cajas") return { key, deck, idx, kind: "Gramática", title: `Cajas · ${deck.title}`, desc: `Relaciona ${ws}` };
    return { key, deck, idx, kind: "Uso de las palabras", title: `Mini diálogo · ${deck.title}`, desc: "Úsalas en una conversación corta" };
  });
}

function openFin() {
  const now = Date.now();
  const today = dateKey(now);
  activityCache = null;
  const act = activityByDay();
  const name = (store.settings.name || "").trim().replace(/!+$/, "");
  $("#fin-title").innerHTML = name ? `¡Lo lograste,<br>${esc(name)}!` : "¡Lo lograste!";
  const nNew = store.newToday(today);
  const nRev = store.revToday(today);
  const plan = dailyPlan();
  const newGoal = Math.max(nNew, Math.min(store.settings.newPerDay || 15, nNew + plan.n));
  const revGoal = nRev + plan.r;
  const streak = streakDays(act, now);
  $("#fin-donas").innerHTML = finDona(nNew, newGoal, "nuevas", "#4af2d5") + finDona(nRev, revGoal, "repasos", "#f2c14e") + finDona(streak, 7, "Racha activa", "#f5a3b5", false);
  $("#fin-donas").setAttribute("aria-label", `Hoy: ${nNew} palabras nuevas de ${newGoal}, ${nRev} repasos de ${revGoal}. Racha activa de ${streak} ${streak === 1 ? "día" : "días"}.`);
  $("#fin-donas").setAttribute("role", "img");
  const sug = finSuggestions();
  state.finSug = sug;
  $("#fin-opts").innerHTML = sug.map((s, i) => `<button class="fin-opt fin-${s.key}" type="button" data-fin="${i}">
      <span class="fin-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${FIN_ICO[s.key]}</svg></span>
      <span class="fin-txt"><span class="fin-kind">${esc(s.kind)}</span><span class="fin-t">${esc(s.title)}</span><span class="fin-d">${esc(s.desc)}</span></span>
      <svg class="fin-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
    </button>`).join("");
  $(".fin-ask h2").hidden = !sug.length;
  $(".fin-ask p").textContent = sug.length
    ? "Es opcional: tu avance de hoy ya está guardado."
    : "Por ahora ningún ejercicio usa las palabras de hoy. Tu avance ya está guardado: ¡nos vemos mañana!";
  show("fin");
}

function finEnd() {
  // Sin sesión iniciada: la invitación a guardar el progreso (si no se mostró ya al terminar la práctica).
  if (needLoginInvite() && !state.loginAsked) {
    $("#done-title").textContent = "Práctica terminada";
    $("#done-summary").textContent = "Tu avance de hoy ya está guardado en este dispositivo.";
    state.doneReturn = "home";
    return show("done");
  }
  go("home");
}

function renderHome() {
  activityCache = null;
  const now = Date.now();
  const today = dateKey(now);
  const act = activityByDay();
  let due = 0, fresh = 0;
  for (const d of state.decks) {
    if (!deckEnabled(d)) continue;
    const s = deckStats(d, now);
    due += s.due;
    fresh += s.fresh;
  }
  // 4.0.1: tope de 30 palabras al día (lo atrasado sale los días siguientes).
  const plan = dailyPlan();
  const forToday = plan.p + plan.n + plan.r;

  const name = (store.settings.name || "").trim().replace(/!+$/, "");
  $("#greet-name").textContent = name ? `${name}!` : "¡Hola!";

  // Racha y últimos 7 días (el último es hoy; vacío hasta que practiques)
  const streak = streakDays(act, now);
  $("#h-streak-n").textContent = streak;
  $("#h-streak-u").textContent = streak === 1 ? "día" : "días";
  let dots = "";
  let hits = 0;
  for (let i = 6; i >= 0; i--) {
    const on = !!act[dateKey(now - i * DAY)];
    if (on) hits++;
    dots += `<i class="${on ? "on" : ""}"></i>`;
  }
  $("#h-dots").innerHTML = dots;
  $("#h-streak").setAttribute("aria-label", `Racha de ${streak} ${streak === 1 ? "día" : "días"}. Practicaste ${hits} de los últimos 7 días.`);

  // 4.2.0: con la lección del día terminada, la tarjeta abre «¡Lo lograste!».
  const doneToday = forToday === 0 && store.newToday(today) + store.revToday(today) > 0;
  state.doneToday = doneToday;
  const card = $("#start-card");
  card.classList.toggle("done", doneToday);
  $("#h-stage").classList.toggle("done", doneToday);
  $("#start-card .h-card-todo").hidden = doneToday;
  $("#start-card .h-card-done").hidden = !doneToday;
  $("#h-hint").hidden = doneToday || !ayudaOn("inicio");
  $("#h-stage").classList.toggle("sin-ayuda", !doneToday && !ayudaOn("inicio"));

  // Nota roja: tema del día (con su número en la ruta) y N real
  const td = todayTopic();
  const tema = td ? baseOf(td).title : forToday ? "Tu práctica" : "Todo al día";
  const pos = td && state.ruta ? rutaPos(unitKeyOf(td)) : null;
  $("#h-num").hidden = !pos;
  if (pos) $("#h-num").textContent = pos.label;
  $("#h-tema").textContent = tema;
  $("#h-count").textContent = forToday;
  $("#h-card-go").textContent = forToday ? "Empezar →" : "Todo al día";
  card.setAttribute("aria-label", forToday
    ? `Hoy nos toca${pos ? " " + pos.label : ""}: ${tema}, ${forToday} ${forToday === 1 ? "palabra" : "palabras"} para hoy. Empezar`
    : "Hoy no hay práctica pendiente. Todo al día");
  card.setAttribute("aria-disabled", String(forToday === 0 && !doneToday));
  if (doneToday) card.setAttribute("aria-label", "¡Hoy cumpliste! Ver tu resumen del día");
  // Sin temas cargados (p. ej. sin conexión en la primera visita): aviso claro en vez de «Todo al día».
  const noDecks = !state.decks.some((d) => !d.mine);
  state.noDecks = noDecks;
  if (noDecks) {
    $("#h-num").hidden = true;
    $("#h-tema").textContent = "No se cargaron los temas";
    $("#h-card-go").textContent = "Revisa tu conexión";
    card.setAttribute("aria-label", "No se cargaron los temas. Revisa tu conexión y vuelve a abrir la app.");
  }

  // Mis caminos: Tus temas (N mazos) y «Sigue donde ibas»
  $("#h-mazos").textContent = state.decks.filter((d) => !d.mine).length;
  let cur = suggestedDeck();
  let sigueOpen = false;
  if (cur && td && unitKeyOf(cur) === unitKeyOf(td)) {
    const nx = nextRutaTema();
    if (nx) { cur = nx.deck; sigueOpen = true; }
  }
  const sigue = $("#h-sigue");
  sigue.dataset.deck = cur ? unitKeyOf(cur) : "";
  sigue.dataset.open = sigueOpen ? "1" : "";
  $("#h-sigue-t").textContent = cur ? cur.title : noDecks ? "Sin temas cargados" : "Tus temas";
  sigue.setAttribute("aria-label", cur ? `Sigue donde ibas: ${cur.title}` : "Mira todos tus temas");
  $("#h-gram").hidden = !gramaticaDeck() && !(state.paradas && state.paradas.size);
  // 4.2.0: aviso «Antes: 2 minutos de gramática» (la primera palabra nueva tiene una parada pendiente).
  const av = !doneToday && forToday ? avisoParada() : null;
  state.aviso = av;
  $("#h-aviso").hidden = !av;
  if (av) {
    $("#h-aviso-t").innerHTML = gramText(av.parada.titulo, "t");
    $("#h-aviso-ru").textContent = av.parada.ru || "";
    $("#h-aviso-ru").hidden = !av.parada.ru;
  }
}

// Parpadeo del monito: cada 3 a 5 s, solo en el inicio y sin movimiento reducido.
let blinkTimer = null;
const NO_MOTION = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function stopBlink() {
  clearTimeout(blinkTimer);
  blinkTimer = null;
}
function startBlink() {
  stopBlink();
  if (state.view !== "home" || document.hidden || NO_MOTION()) return;
  blinkTimer = setTimeout(() => {
    const m = $("#h-monito");
    if (state.view !== "home" || !m) return stopBlink();
    m.classList.add("blink");
    setTimeout(() => { m.classList.remove("blink"); startBlink(); }, 260);
  }, 3000 + Math.random() * 2000);
}

// ---------- Temas (4.2.0 · A2) ----------
// Todos los mazos en el orden de la Ruta. Filtros que se prenden y apagan
// (sin filtro activo se ve todo): Gramática · Expresiones · Lectura.
const EXPRESIONES = new Set(["expresiones", "falsos-amigos", "servilismo"]);
const LECTURA = new Set(["textos"]);
// «Gramática» no filtra mazos: abre el índice de Gramática (las paradas de la Ruta).
const FILTROS = ["Gramática", "Expresiones", "Lectura"];
const FILTRO_GRAM = "Gramática";

function groupOf(deck) {
  if (EXPRESIONES.has(deck.id)) return "Expresiones";
  return deck.group;
}
function inFiltro(deck, f) {
  if (f === "Lectura") return LECTURA.has(deck.id);
  return groupOf(deck) === f;
}

// Ícono genérico por tema (línea del tono oscuro de su tarjeta).
const TI = (d) => `<svg viewBox="0 0 64 64" aria-hidden="true">${d}</svg>`;
const TEMA_ICO = {
  basicas: TI(`<path d="M32 18c-7-5-16-6-24-4v36c8-2 17-1 24 4zM32 18c7-5 16-6 24-4v36c-8-2-17-1-24 4zM32 18v36"/>`),
  familia: TI(`<circle cx="24" cy="22" r="8"/><path d="M10 50c1-9 7-15 14-15s13 6 14 15"/><circle cx="44" cy="25" r="6"/><path d="M38 37c2-1 4-2 6-2 6 0 10 5 11 13"/>`),
  saludos: TI(`<path d="M10 14h44v28H30l-12 10V42h-8z"/><path d="M20 26h24M20 33h14"/>`),
  animales: TI(`<ellipse cx="32" cy="43" rx="11" ry="9"/><circle cx="16" cy="29" r="5"/><circle cx="26" cy="17" r="5"/><circle cx="38" cy="17" r="5"/><circle cx="48" cy="29" r="5"/>`),
  profesiones: TI(`<rect x="10" y="22" width="44" height="30" rx="4"/><path d="M24 22v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6M10 35h44"/>`),
  "falsos-amigos": TI(`<path d="M14 26h36M14 38h36M40 14L24 50"/>`),
  casa: TI(`<path d="M8 32L32 12l24 20M15 28v24h34V28M28 52V40h9v12"/>`),
  ciudad: TI(`<rect x="10" y="24" width="18" height="28"/><rect x="32" y="12" width="22" height="40"/><path d="M16 32h6M16 40h6M38 20h10M38 28h10M38 36h10M38 44h10"/>`),
  naturaleza: TI(`<path d="M6 52l18-28 10 14 8-10 16 24z"/><circle cx="46" cy="16" r="5"/>`),
  calendario: TI(`<rect x="10" y="14" width="44" height="40" rx="4"/><path d="M10 26h44M22 8v10M42 8v10M20 36h6M32 36h6M44 36h2M20 45h6M32 45h6"/>`),
  colores: TI(`<path d="M32 8C16 8 6 20 6 32s10 22 22 22c5 0 6-4 4-7s-1-7 4-7h8c8 0 14-6 14-13C58 16 46 8 32 8z"/><circle cx="20" cy="26" r="4"/><circle cx="32" cy="18" r="4"/><circle cx="44" cy="24" r="4"/>`),
  adjetivos: TI(`<circle cx="32" cy="32" r="22"/><path d="M23 38c3 4 6 6 9 6s6-2 9-6"/><circle cx="24" cy="27" r="1.5"/><circle cx="40" cy="27" r="1.5"/>`),
  ideas: TI(`<path d="M24 42c-5-4-8-9-8-15a16 16 0 0 1 32 0c0 6-3 11-8 15v6H24z"/><path d="M26 54h12"/>`),
  verbos: TI(`<path d="M8 32h36M34 20l12 12-12 12"/><path d="M52 16v32"/>`),
  juegos: TI(`<circle cx="32" cy="32" r="22"/><path d="M32 10v44M10 32h44M17 17c8 8 8 22 0 30M47 17c-8 8-8 22 0 30"/>`),
  instrumentos: TI(`<path d="M26 46V14l26-6v32"/><circle cx="19" cy="46" r="7"/><circle cx="45" cy="40" r="7"/>`),
  comida: TI(`<path d="M12 28h40c0 13-9 22-20 22S12 41 12 28z"/><path d="M8 28h48M26 18c0-4 4-4 4-8M36 18c0-4 4-4 4-8"/>`),
  "ropa-cuerpo": TI(`<path d="M22 10l-14 8 6 12 6-3v27h24V27l6 3 6-12-14-8c-2 4-6 6-10 6s-8-2-10-6z"/>`),
  escuela: TI(`<path d="M8 24l24-12 24 12-24 12z"/><path d="M18 29v12c4 4 9 6 14 6s10-2 14-6V29M56 24v14"/>`),
  textos: TI(`<path d="M16 8h24l10 10v38H16z"/><path d="M40 8v10h10M22 28h22M22 36h22M22 44h14"/>`),
  cultura: TI(`<rect x="8" y="16" width="48" height="34" rx="4"/><path d="M28 26v14l12-7z"/>`),
  servilismo: TI(`<path d="M10 46l6-26 10 12 6-16 6 16 10-12 6 26z"/><path d="M10 52h44"/>`),
  expresiones: TI(`<path d="M12 18h18v16c0 8-6 12-14 14M36 18h18v16c0 8-6 12-14 14"/>`),
  paises: TI(`<circle cx="32" cy="32" r="22"/><path d="M10 32h44M32 10c7 7 10 14 10 22s-3 15-10 22c-7-7-10-14-10-22s3-15 10-22z"/>`),
  "reglas-gentilicios": TI(`<path d="M14 56V8"/><path d="M14 10h34l-6 9 6 9H14"/>`),
  fiestas: TI(`<path d="M14 54l10-30 16 16z"/><path d="M30 26c2-6 8-8 8-14M36 32c5-3 10-1 14-5"/><circle cx="46" cy="12" r="3"/>`),
  "mis-palabras": TI(`<path d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2z"/>`)
};
const GRAM_ICO = TI(`<path d="M10 14h44v36H10z"/><path d="M18 26h10M18 36h16M38 26l8 12M46 26l-8 12"/>`);
function temaIco(deck) {
  if (deck.id === "numeros") return `<span class="ti-ico ti-num num" aria-hidden="true">123</span>`;
  const svg = TEMA_ICO[deck.id] || (deck.group === "Gramática" ? GRAM_ICO : TEMA_ICO.basicas);
  return `<span class="ti-ico" aria-hidden="true">${svg}</span>`;
}

function temasList() {
  const f = state.temaFilters || new Set();
  const q = searchKey($("#temas-q") ? $("#temas-q").value : "");
  let list = state.decks.filter((d) => !f.size || [...f].some((x) => inFiltro(d, x)));
  if (q.length >= 2) {
    list = list.filter((d) => searchKey(d.title).includes(q) || searchKey(RU_NAME[d.id] || "").includes(q)
      || (d.cards || []).some((c) => [c.ru, c.es].some((x) => searchKey(x).includes(q))));
  }
  return rutaOrder(list);
}

function renderTemas() {
  if (!state.temaFilters) state.temaFilters = new Set();
  $("#temas-n").textContent = state.decks.filter((d) => !d.mine).length;
  $("#temas-chips").innerHTML = FILTROS
    .map((g) => `<button class="chip" type="button" data-filter="${esc(g)}" aria-pressed="${state.temaFilters.has(g)}">${esc(g)}</button>`)
    .join("");
  const ordered = temasList();
  const f = state.temaFilters;
  const showLeer = state.lectura && (!f.size || f.has("Lectura")) && searchKey($("#temas-q").value).length < 2;
  if (!ordered.some((d) => d.id === state.openTile) || !state.openSet) {
    const sug = suggestedDeck();
    state.openTile = sug && ordered.includes(sug) ? sug.id : ordered[0] ? ordered[0].id : null;
    state.openSet = true;
  }
  $("#temas-q-clear").hidden = !$("#temas-q").value;
  state.tileCol = (ordered.findIndex((d) => d.id === state.openTile) + (showLeer && f.has("Lectura") ? 1 : 0)) % 2;
  $("#temas-grid").innerHTML = ordered.length || showLeer
    ? (showLeer && f.has("Lectura") ? leerTileHtml() : "") + ordered.map(tileHtml).join("")
    : `<p class="loading">No encontré temas con eso.</p>`;
}

// Tarjeta de «Aprende a leer» (solo con el filtro Lectura).
function leerTileHtml() {
  const n = state.lectura.pasos.length;
  const d = leerDone();
  const pct = Math.round((d / n) * 100);
  return `<article class="tile tm-tile card-frame pal-aq" data-leer="1" tabindex="0" role="button" aria-label="Aprende a leer, ${d} de ${n} pasos">
    <span class="ti-ico" aria-hidden="true">${TEMA_ICO.basicas}</span>
    <span class="ti-n">Desde cero</span>
    <span class="ti-title">Aprende a leer</span>
    <span class="ti-ru" lang="ru">Чита́ть</span>
    <span class="ti-foot"><span class="ti-meta"><span class="num">${d}</span> de <span class="num">${n}</span> pasos</span><span class="ti-bar"><span class="bar"><span style="width:${pct}%"></span></span><span class="pct">${pct}%</span></span></span>
  </article>`;
}

// Temas en el orden de la ruta; los que no están en ella (biblioteca) van al final.
function rutaOrder(list) {
  if (!state.ruta) return list;
  const rank = new Map();
  let n = 0;
  // Un mazo partido en bloques (Básicas, Números…) va donde aparece su primer bloque.
  for (const m of rutaMods()) for (const t of modTemas(m)) if (t.deck && !rank.has(t.id)) rank.set(t.id, n++);
  const inRuta = list.filter((d) => rank.has(d.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  const rest = list.filter((d) => !rank.has(d.id));
  return [...inRuta, ...rest];
}

function tileHtml(deck) {
  const s = deckStats(deck);
  const v = visFor(deck);
  const ru = RU_NAME[deck.id] || "";
  const open = deck.id === state.openTile && !deck.__anchor;
  const pos = state.ruta ? rutaPos(deck.id) : null;
  const num = deck.mine ? "Personal" : pos ? `Tema <span class="num">${pos.label}</span>` : "Biblioteca";
  const qa = deck.cards.some((c) => c.kind === "qa");
  const nExtra = deck.cards.filter((c) => c.extra).length;
  const unit = qa ? "tarjetas" : "palabras";
  const sugD = state.ruta ? baseOf(suggestedDeck()) : null;
  const sug = !!sugD && sugD.id === deck.id; // también en la copia marcada (tm-anchor) del tema abierto
  const modes = modesList(deck);
  const words = modes.find((m) => m.key === "words");
  const extra = modes.filter((m) => m.key !== "words");
  const forToday = words && !words.off ? todayWords(deck) : 0;
  // QA: cada ejercicio con su color de marcador; «Solo audio» bloqueado va punteado con candado.
  const EJ_MARK = { frases: "#aa94fc", dialogo: "#99acfc", cajas: "#e9b293", reto: "#4af2d5", audio: "#4af2d5", dudas: "#f2c14e" };
  const small = extra.map((m) => m.key === "audio" && m.off
    ? `<button class="tm-ej tm-ej-lock" type="button" data-mode="audio" data-deck="${esc(deck.id)}"><b>${LOCK}${esc(m.full || m.label)}</b><span>Se abre al memorizar palabras</span></button>`
    : `<button class="tm-ej" type="button" data-mode="${m.key}" data-deck="${esc(deck.id)}"${m.off ? " disabled" : ""}><b style="--mk:${EJ_MARK[m.key] || "#f2c14e"}">${esc(m.full || m.label)}</b><span>${esc(m.sub)}</span></button>`);
  if (dudasFor(deck)) small.push(`<button class="tm-ej" type="button" data-act="dudas" data-deck="${esc(deck.id)}"><b style="--mk:${EJ_MARK.dudas}">Dudas</b><span>gramática</span></button>`);
  // QA (Temas abierto): el tema abierto se queda en su lugar (marcado) y se abre debajo de su fila.
  const anchor = open ? tileHtml({ ...deck, __anchor: true }) : "";
  const col = state.tileCol || 0;
  return `${anchor}<article class="tile tm-tile card-frame pal-${v.pal}${open ? " open" : ""}${deck.__anchor ? " tm-anchor" : ""}${sug ? " sug" : ""}" data-tile="${esc(deck.id)}" tabindex="${open ? -1 : 0}" role="button" aria-expanded="${open}" aria-label="${esc(deck.title)}, ${s.total} ${unit}, ${s.pct}%">
    ${open ? `<span class="tb-notch" aria-hidden="true" style="left:${col ? 262 : 78}px"></span>` : ""}
    <div class="t-body">
      ${sug ? `<span class="tm-sigue">Sigue aquí</span>` : ""}
      ${temaIco(deck)}
      <span class="ti-n">${num}</span>
      <span class="ti-title">${esc(deck.title)}</span>
      ${ru ? `<span class="ti-ru" lang="ru">${esc(ru)}</span>` : ""}
      <span class="ti-foot"><span class="ti-meta"><span class="num">${s.total}</span> ${unit}${nExtra ? ` · <span class="ti-x">+<span class="num">${nExtra}</span> extra</span>` : ""}</span><span class="ti-bar"><span class="bar"><span style="width:${s.pct}%"></span></span><span class="pct">${s.pct}%</span></span></span>
    </div>
    <div class="t-big">
      ${sug ? `<span class="tm-sigue">Sigue aquí</span>` : ""}
      <span class="tb-top"><span class="ti-n tb-tag">${num}</span><span class="pct tb-pct">${s.pct}%</span></span>
      ${temaIco(deck).replace('class="ti-ico', 'class="ti-ico tb-ico')}
      <span class="tb-title"><span class="tq-hl">${esc(deck.title)}</span></span>
      ${ru ? `<span class="tb-ru" lang="ru">${esc(ru)}</span>` : ""}
      <span class="tb-prog"><span class="tb-meta"><span class="num">${s.learned}</span> de <span class="num">${s.total}</span> ${unit}</span><span class="bar"><span style="width:${s.pct}%"></span></span></span>
      <span class="tb-main">
        <button class="tb-btn" type="button" data-act="list" data-deck="${esc(deck.id)}"><span class="tb-btn-t"><b>Aprender</b><span>${qa ? "Las tarjetas del tema, sin preguntas." : `Reglas cortas y las <span class="num">${s.total}</span> palabras con audio y ejemplo. Sin preguntas.`}</span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
        ${words ? `<button class="tb-btn tb-go" type="button" data-mode="words" data-deck="${esc(deck.id)}"${words.off ? " disabled" : ""}><span class="tb-btn-t"><b>Practicar${forToday ? ` · <span class="num">${forToday}</span> para hoy` : ""}</b><span>${forToday ? `Primero ves cada palabra nueva; luego eliges entre <span class="num">4</span> opciones.` : "Por hoy no hay palabras pendientes en este tema."}</span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>` : ""}
      </span>
      ${small.length ? `<div class="tm-ejs" role="group" aria-label="Más ejercicios">${small.join("")}</div>` : ""}
    </div>
  </article>`;
}

// ----- Modos de un tema: Palabras · Frases · Diálogo · Cajas -----
// Diálogos y cajas de un tema, de cualquier módulo: los del mazo más los del archivo de ejercicios.
// 4.2.0: frases, diálogos y cajas con "desde" solo salen cuando ya llegaste a ese paso de la
// Ruta; con "extra": true no salen en la Ruta (Mapa, Módulo, «¡Lo lograste!»), solo en Temas.
function rutaStepKeys() {
  const out = [];
  for (const m of rutaMods()) for (const t of m.temas || []) out.push(t.tipo === "parada" ? `parada:${t.id}` : t.bloque ? `${t.id}:${t.bloque}` : t.id);
  return out;
}
function ejReached(desde) {
  const keys = rutaStepKeys();
  const k = desde.startsWith("g-") ? `parada:${desde}` : desde;
  const i = keys.indexOf(k);
  if (i < 0) return true;
  if (k.startsWith("parada:") && paradaDone(k.slice(7))) return true;
  let far = -1;
  const cur = currentItem();
  if (cur) far = keys.indexOf(cur.key);
  for (const it of rutaItems()) {
    const j = keys.indexOf(it.key);
    if (j <= far) continue;
    if (it.kind === "parada" ? paradaDone(it.id) : it.deck && deckStats(it.deck).learned > 0) far = j;
  }
  return i <= far;
}
const ejOk = (x, ruta) => (!x.desde || ejReached(x.desde)) && (!ruta || !x.extra);
const inRutaView = () => ["mapa", "modulo", "fin", "home"].includes(state.view);
function frasesOf(deck, ruta = false) {
  return (deck.frases || []).filter((f) => ejOk(f, ruta));
}
function ejOf(deck, ruta = false) {
  if (deck.unitKey) return { dialogos: [], cajas: [] }; // un bloque de la Ruta: solo palabras
  const f = state.ej[deck.id] || {};
  return {
    dialogos: [...(deck.dialogos || []), ...(f.dialogos || [])].filter((x) => ejOk(x, ruta)),
    cajas: [...(deck.cajas || []), ...(f.cajas || [])].filter((x) => ejOk(x, ruta))
  };
}
// Lista completa (sin filtrar) para los índices que vienen de «¡Lo lograste!».
function ejRaw(deck) {
  const f = state.ej[deck.id] || {};
  return { frases: deck.frases || [], dialogos: [...(deck.dialogos || []), ...(f.dialogos || [])], cajas: [...(deck.cajas || []), ...(f.cajas || [])] };
}

function ejDone(list) {
  return list.filter((x) => { const r = store.ejer(x.id); return r && r.ok > 0; }).length;
}

function modesList(deck, ruta = false) {
  const s = deckStats(deck);
  const ej = ejOf(deck, ruta);
  const fr = frasesOf(deck, ruta);
  const out = [];
  const nHoy = s.due + Math.min(s.fresh, NEW_PER_DECK_SESSION, newLeftToday());
  if (deck.cards.length) out.push({ key: "words", label: "Palabras", num: String(nHoy), sub: "Nuevas y repaso", pct: s.pct, off: nHoy === 0 });
  if (fr.length) {
    const done = fr.filter((f) => store.frase(`${deck.id}:${f.id}`)).length;
    out.push({ key: "frases", label: "Frases", num: `${done}/${fr.length}`, sub: "Arma y traduce", pct: Math.round((done / fr.length) * 100) });
  }
  if ((deck.retos || []).length) {
    const n = deck.retos.filter((r) => retoState(deck, r).done).length;
    out.push({ key: "reto", label: "Reto", full: "Reto de gramática", num: `${n}/${deck.retos.length}`, sub: "Descubre la regla", pct: Math.round((n / deck.retos.length) * 100) });
  }
  if (ej.dialogos.length) {
    const n = ejDone(ej.dialogos);
    out.push({ key: "dialogo", label: "Diálogo", full: "Mini diálogo", num: `${n}/${ej.dialogos.length}`, sub: "Elige qué contestar", pct: Math.round((n / ej.dialogos.length) * 100) });
  }
  if (ej.cajas.length) {
    const n = ejDone(ej.cajas);
    out.push({ key: "cajas", label: "Cajas", num: `${n}/${ej.cajas.length}`, sub: "Acomoda por caja", pct: Math.round((n / ej.cajas.length) * 100) });
  }
  if (deck.cards.some((c) => c.kind === "word")) {
    const n = audioWords(deck).length;
    out.push({ key: "audio", label: "Solo audio", num: String(n), sub: "Escucha y elige", pct: 0, off: n === 0 });
  }
  return out;
}

// Botones de modo del mosaico abierto (el primero va relleno).
function modesHtml(deck) {
  return modesList(deck).map((m, i) => {
    const lead = i === 0;
    return `<button class="t-mode${lead ? " fill" : ""}" type="button" data-mode="${m.key}" data-deck="${esc(deck.id)}"${m.off ? " disabled" : ""}>${m.label}${m.key === "words" ? ` · <span class="num">${m.num}</span>` : ""}</button>`;
  }).join("");
}

// Palabras ya memorizadas (mismo criterio que el avance: acertadas al menos una vez).
function audioWords(deck) {
  return deck.cards.filter((c) => c.kind === "word" && keysFor(c).some((k) => { const st = store.card(k); return st && st.ivl >= 1; }));
}

function startAudio(deck) {
  const words = shuffle(audioWords(deck)).slice(0, 20);
  if (!words.length) return toast("Primero memoriza algunas palabras de este tema.");
  const queue = words.map((card) => ({ card, key: `${card.id}|audio`, dir: "audio", phase: "quiz", failed: false, hint: 0 }));
  startSession(queue, "Solo audio", true, state.view === "tema" ? "tema" : state.view);
  state.session.audio = true;
}

function dudasFor(deck) {
  return state.dudas[deck.id] || null;
}

function dudasHtml(deck) {
  const d = dudasFor(deck);
  if (!d) return "";
  const speakOk = canSpeak();
  return `<div class="dudas">
    <b class="dudas-title">${esc(d.titulo)}</b>
    <ul>${(d.puntos || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    ${(d.ejemplos || []).map((x) => `<div class="dudas-ex"><div><span class="ex-ru" lang="ru">${esc(x.ru)}</span>${x.fonetica ? `<span class="ex-fon">${esc(x.fonetica)}</span>` : ""}<span>${esc(x.es)}</span></div>${speakOk ? `<span class="pair"><button class="audio-btn sm" type="button" data-say="${esc(x.ru)}" aria-label="Escuchar el ejemplo">${SPEAKER}</button>${slowBtn(x.ru)}</span>` : ""}</div>`).join("")}
    ${d.ojo ? `<p class="dudas-ojo"><b>Ojo:</b> ${esc(d.ojo)}</p>` : ""}
  </div>`;
}

// Guarda el tema que Carol está estudiando (para «Sigue con…» y el mapa).
function markCurrent(deck) {
  if (deck && !deck.mine) store.setCurrent(unitKeyOf(deck));
}

// Inicia un modo de práctica de un tema.
function startMode(deck, key, first, keepCurrent) {
  state.currentDeck = deck;
  if (!keepCurrent) markCurrent(deck);
  if (key === "words") return startDeck(deck);
  if (key === "frases") return startFrases(deck, first);
  if (key === "dialogo") return startDialogo(deck, first);
  if (key === "cajas") return startCajas(deck, first);
  if (key === "reto") return openReto(deck);
  if (key === "audio") return startAudio(deck);
}

// Abre un tema en la cuadrícula: el cuadrado crece y los demás se acomodan
// deslizándose (técnica FLIP: solo se animan transform y clip-path).
function openTileAnimated(id) {
  if (id === state.openTile) return;
  state.openTile = id;
  renderTemas();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const opened = $("#temas-grid .tile.open");
  if (!opened) return;
  const r0 = opened.getBoundingClientRect();
  if (r0.top < 220 || r0.bottom > window.innerHeight - 100) {
    window.scrollBy({ top: r0.top - 250, behavior: reduce ? "auto" : "smooth" });
  }
  if (!reduce && Element.prototype.animate) {
    opened.animate([{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.9,.3,1)" });
  }
  const b = opened.querySelector(".tb-btn");
  if (b) b.focus({ preventScroll: true });
}

// ---------- Tema ----------
function openTema(id) {
  // Un bloque de la Ruta abre el tema completo (con todas sus palabras); el bloque queda como actual.
  const unit = deckOfKey(id);
  const deck = baseOf(unit);
  if (!deck) return;
  state.currentDeck = deck;
  markCurrent(unit);
  state.selecting = false;
  state.selected = new Set();
  $("#deck-search").value = "";
  $("#tema-search-box").hidden = true;
  $("#tema-search-toggle").setAttribute("aria-expanded", "false");
  state.temaFrom = state.view === "mapa" ? "mapa" : state.view === "home" ? "home" : "temas";
  renderTema();
  show("tema");
}

// 4.2.0 · Pantalla del tema (maquetas QA_Tema, QA_TemaPalabras, Ruta_TemaAntes, Ruta_PalabrasExtraA).
// Colores fijos de cada modo: [color de tinta, color pop]; en filas se alternan pop y beige.
const MODE_POP = { words: ["#1f5c38", "#f2c14e"], frases: ["#f04e12", "#e9b293"], reto: ["#10504b", "#4af2d5"], dialogo: ["#2433a0", "#99acfc"], cajas: ["#501043", "#aa94fc"], audio: ["#0b5e52", "#4af2d5"] };
const LOCK = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
const DOT_COLORS = ["#aa94fc", "#f2c14e", "#4af2d5", "#e9b293"];
const CHIP_COLORS = ["#aa94fc", "#99acfc", "#4af2d5", "#f2c14e"];

// Parada de gramática que prepara un tema (o uno de sus bloques).
function paradaDeTema(deck) {
  const id = baseOf(deck).id;
  return rutaItems().find((t) => t.kind === "parada" && t.antes && (t.antes === id || t.antes.startsWith(id + ":"))) || null;
}

// «De qué trata»: «Título: para X (a, b), Y (c) y Z (d). Final.» → título resaltado, filas con fichas y pie.
function introHtml(text) {
  const t = String(text || "");
  const m = t.match(/^([^:]{6,60}):\s*(.+)$/);
  let title = "", body = t;
  if (m) { title = m[1]; body = m[2]; }
  const groups = [];
  const re = /(?:^|,|\sy\s)\s*(?:para\s+)?([a-záéíóúñü ]{3,30}?)\s*\(([^)]+)\)/gi;
  let mm, last = 0;
  while ((mm = re.exec(body))) {
    const items = mm[2].split(",").map((x) => x.trim()).filter(Boolean);
    if (!items.every((x) => /[а-яё]/i.test(x))) { groups.length = 0; break; }
    groups.push({ label: cap(`para ${mm[1].trim()}`), items });
    last = re.lastIndex;
  }
  let foot = "";
  if (groups.length >= 2) {
    const rest = body.slice(last).replace(/^[\s.]+/, "");
    foot = rest;
  }
  const words = title.split(/\s+/);
  const tHtml = title
    ? words.length >= 4 ? `${esc(words[0])} <span class="tq-mark">${esc(words.slice(1, -2).join(" "))}</span> ${esc(words.slice(-2).join(" "))}` : `<span class="tq-mark">${esc(title)}</span>`
    : "";
  if (groups.length >= 2) {
    return `${tHtml ? `<p class="tq-ttl">${tHtml}</p>` : ""}${groups.map((g, i) => `<div class="tq-grp"><span class="tq-grp-l">${esc(g.label)}</span>${g.items.map((x) => `<span class="tq-chip" lang="ru" style="background:${CHIP_COLORS[i % CHIP_COLORS.length]}">${esc(x)}</span>`).join("")}</div>`).join("")}${foot ? `<p class="tq-foot">${ruSpans(foot)}</p>` : ""}`;
  }
  return `${tHtml ? `<p class="tq-ttl">${tHtml}</p>` : ""}<p class="tq-txt">${ruSpans(body)}</p>`;
}

// «La regla»: «Encabezado: ejemplos» → título (ruso grande o texto), explicación y ejemplos abajo.
function reglaHtml(r, i) {
  const t = String(r);
  const k = t.indexOf(":");
  const head = k > 0 ? t.slice(0, k) : t;
  const ex = k > 0 ? t.slice(k + 1).trim() : "";
  const ruTitle = (head.match(/[А-ЯЁа-яё́]+\?/g) || []);
  let titleHtml = "", bodyHtml = "";
  if (ruTitle.length) { titleHtml = `<span class="tq-r-ru" lang="ru">${esc(ruTitle.join(" "))}</span>`; bodyHtml = ruSpans(head).replace(/(<span lang="ru">[^<]*\?<\/span>)/g, "<b>$1</b>") + "."; }
  else if (head.length <= 34) titleHtml = `<span class="tq-r-t">${ruSpans(head)}</span>`;
  else bodyHtml = ruSpans(head) + (ex ? ":" : "");
  const exHtml = ex ? ex.split(/(?<=[.!?])\s+(?=[А-ЯЁ])/).map((x) => ruSpans(x).replace(/ — /g, ` <span class="tq-dash">—</span><br>`)).join("<br>") : "";
  return `<section class="tq-card tq-regla" aria-label="La regla" style="--tq-bg:${i % 2 ? "#e6ebff" : "#ece7ff"};rotate:${i % 2 ? 0.8 : -0.8}deg"><b class="tq-stk">La regla</b>${titleHtml}${bodyHtml ? `<p class="tq-r-p">${bodyHtml}</p>` : ""}${exHtml ? `<p class="tq-r-ex">${exHtml}</p>` : ""}</section>`;
}

function tipHtml(tip) {
  const m = String(tip).match(/^([а-яё́]+)\s+(.*)$/i);
  const body = m ? m[2] : tip;
  const rich = ruSpans(body).replace(/«([a-záéíóúñ]+)»/i, `<b class="tq-tip-b">«$1»</b>`).replace(/(«¿[^»]+»)/, "<i>$1</i>");
  return `<section class="tq-card tq-tip" aria-label="Tip de memoria"><b class="tq-stk tq-stk-tip">Tip de memoria</b>${m ? `<span class="tq-tip-ru" lang="ru">${esc(m[1])}</span>` : ""}<p>${m ? cap(rich) : rich}</p></section>`;
}

function antesHtml(d, dd, open) {
  const p = paradaDeTema(d);
  const tt = String(dd.titulo || "");
  const k = tt.indexOf(":");
  const tEs = k > 0 ? tt.slice(0, k + 1) : tt;
  const tRu = k > 0 ? tt.slice(k + 1).trim() : "";
  const speakOk = canSpeak();
  const body = `<div class="ta-card"><b class="tq-stk ta-stk">La regla</b>
      <b class="ta-ttl"><span class="ta-es">${ruSpans(tEs)}</span>${tRu ? `<span class="ta-ru" lang="ru">${esc(tRu)}</span>` : ""}</b>
      <ul class="ta-pts">${(dd.puntos || []).map((x, i) => `<li><i style="background:${DOT_COLORS[i % DOT_COLORS.length]}"></i>${ruSpans(x)}</li>`).join("")}</ul>
      ${(dd.ejemplos || []).map((x) => `<div class="ta-ex"><div class="ta-ex-t"><span class="ta-ex-ru" lang="ru">${esc(x.ru)}</span>${x.fonetica ? `<span class="ta-ex-fon">${esc(x.fonetica)}</span>` : ""}<span>${esc(x.es)}</span></div>${speakOk ? `<span class="pd-ex-b"><button class="pd-au pd-au-n" type="button" data-say="${esc(x.ru)}" aria-label="Escuchar el ejemplo">${SPEAKER}</button><button class="pd-au ta-slow" type="button" data-say-slow="${esc(x.ru)}" aria-label="Escuchar más lento">${TURTLE}</button></span>` : ""}</div>`).join("")}
      ${dd.ojo ? `<p class="ta-ojo"><b>Ojo:</b> ${ruSpans(dd.ojo)}</p>` : ""}
      <div class="ta-acts"><button class="ms-go ta-ok" type="button" data-antes="ok">Entendido</button>${p ? `<button class="ta-link" type="button" data-antes-par="${esc(p.id)}">Practicar la regla →</button>` : ""}</div>
    </div>`;
  const CHEV_D = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${open ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"}"/></svg>`;
  return `<button class="dudas-btn ta-btn" type="button" id="dudas-toggle" aria-expanded="${open}"><span class="q ta-q" aria-hidden="true">?</span><span class="ta-bt"><b>Antes de empezar</b><small>${open ? `La regla de este tema · <span class="num">2</span> min` : `Ya la viste · ${ruSpans(tt)}`}</small></span>${CHEV_D}</button><div class="dudas-body ta-body"${open ? "" : " hidden"}>${body}</div>`;
}

function renderTema() {
  const d = state.currentDeck;
  if (!d) return;
  const s = deckStats(d);
  const ru = RU_NAME[d.id] || "";
  const head = $("#tema-head");
  head.className = "tema-head tq-head";
  head.innerHTML = `<span class="t-tag tq-tag">${deckNumber(d)}</span>
    <h1 class="tema-title"><span class="tq-hl">${esc(d.title)}</span></h1>
    ${ru ? `<span class="tema-ru" lang="ru">${esc(ru)}</span>` : ""}
    <div class="tema-prog"><span class="bar"><span style="width:${s.pct}%"></span></span><span class="tema-prog-n"><span class="num">${s.learned}</span> de <span class="num">${s.total}</span> memorizadas</span></div>`;

  const ICON = {
    words: `<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5"/>`,
    frases: `<rect x="3" y="7" width="7" height="7" rx="1.5"/><rect x="14" y="7" width="7" height="7" rx="1.5"/>`,
    dialogo: `<path d="M4 5h16v11H9l-5 4z"/>`,
    cajas: `<rect x="3" y="9" width="8" height="11" rx="1.5"/><rect x="13" y="9" width="8" height="11" rx="1.5"/><path d="M7 5v4M17 5v4"/>`,
    audio: `<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>`,
    reto: `<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>`
  };
  const modes = modesList(d);
  const memo = audioWords(d).length;
  let html = modes.map((m, i) => {
    const [ink, pop] = MODE_POP[m.key] || MODE_POP.words;
    const locked = m.key === "audio" && m.off;
    const bg = i % 2 && !locked ? pop : "#f1eddf";
    const ic = `<span class="mode-ic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[m.key]}</svg></span>`;
    const st = `--m-ink:${ink};--m-bg:${bg};--m-ic:${pop}`;
    if (locked) {
      const aviso = `<div class="tq-aviso" role="note"><span class="tq-aviso-ic">${LOCK}</span><span class="tq-aviso-t"><b>Solo audio se abre pronto</b><span>Escuchas las palabras que ya memorizaste. Practica en <b>Palabras</b> y se abre sola.</span></span></div>`;
      return `${i % 2 ? aviso : ""}<button class="mode tq-mode tq-locked" type="button" data-mode="audio" aria-disabled="true" style="${st}">
        <span class="mode-top">${ic}<span class="tq-por">${LOCK}Por abrir</span></span>
        <span class="mode-name">${m.full || m.label}</span><span class="mode-sub">Se abre al memorizar palabras</span>
        <span class="tq-llevas">Llevas <span class="num">${memo}</span> memorizadas.</span></button>${i % 2 ? "" : aviso}`;
    }
    return `<button class="mode tq-mode${m.key === "frases" ? " tq-pe" : ""}" type="button" data-mode="${m.key}"${m.off ? " disabled" : ""} style="${st}">
      <span class="mode-top">${ic}<span class="num mode-num">${m.key === "words" ? `${m.num} hoy` : m.num}</span></span>
      <span class="mode-name">${m.full || m.label}</span><span class="mode-sub">${m.sub}</span>
      <span class="bar"><span style="width:${m.pct}%"></span></span></button>`;
  }).join("");
  $("#tema-modes").innerHTML = html;
  $("#tema-modes").classList.add("tq-modes");

  // De qué trata, reglas y tip del tema
  const ap = d.aprender || {};
  let intro = "";
  if (ap.intro || d.desc) {
    intro = `<section class="tq-card tq-intro" aria-label="De qué trata"><b class="tq-stk tq-stk-de">De qué trata</b><span class="tq-oche" lang="ru">о чём?</span>${introHtml(ap.intro || d.desc || "")}</section>`;
  }
  const rules = (ap.reglas || []).map(reglaHtml);
  if (rules.length) intro += `<div class="tq-rules${rules.length % 2 ? " odd" : ""}">${rules.join("")}</div>`;
  if (ap.tip) intro += tipHtml(ap.tip);
  $("#tema-intro").innerHTML = intro;
  const core = d.cards.filter((c) => !c.extra).length;
  const ext = d.cards.length - core;
  $("#tema-count").innerHTML = ext ? `<span class="num">${core}</span> + <span class="num">${ext}</span> extra` : `<span class="num">${d.cards.length}</span>`;
  // «Antes de empezar»: la duda del tema arriba (abierta la primera vez; luego plegada en una línea).
  const dd = dudasFor(d);
  const seen = !!store.ejer(`antes:${d.id}`);
  if (state.antesOpen === undefined || state.antesDeck !== d.id) { state.antesOpen = !seen; state.antesDeck = d.id; }
  $("#tema-dudas").innerHTML = dd ? antesHtml(d, dd, state.antesOpen) : "";
  $("#tema-cram").hidden = !d.cards.length;
  renderWords();
}

function pickedCards() {
  const out = [];
  for (const id of store.pickedIds()) {
    for (const d of state.decks) {
      const c = d.cards.find((x) => x.id === id);
      if (c) { out.push(c); break; }
    }
  }
  return out;
}

function renderSelectBar() {
  const bar = $("#select-bar");
  const n = state.selected.size;
  $("#select-toggle").textContent = state.selecting ? "Cancelar selección" : "Seleccionar varias";
  bar.hidden = !state.selecting;
  $("#select-count").textContent = n === 1 ? "1 palabra" : `${n} palabras`;
  $("#select-add").disabled = n === 0;
}

function filteredCards() {
  const d = state.currentDeck;
  const q = norm($("#deck-search").value);
  return d.cards.filter((c) => {
    if (!q) return true;
    const hay = norm([c.ru, c.es, c.q, c.a, c.nota, c.tag].join(" "));
    return hay.includes(q);
  });
}

function renderWords() {
  const list = filteredCards();
  const host = $("#deck-words");
  renderSelectBar();
  if (!list.length) {
    host.innerHTML = `<p class="muted">Nada coincide con tu búsqueda.</p>`;
    return;
  }
  const sections = [];
  // 4.2.0: primero las palabras núcleo (por sección); las extra van al final, juntas y con su marca.
  for (const c of list) {
    const name = c.extra ? "\u0000extra" : c.seccion || "";
    let sec = sections.find((x) => x.name === name);
    if (!sec) sections.push((sec = { name, cards: [] }));
    sec.cards.push(c);
  }
  sections.sort((a, b) => Number(a.name === "\u0000extra") - Number(b.name === "\u0000extra"));
  let i = 0;
  host.innerHTML = sections
    .map((sec) => {
      const rows = sec.cards.map((c) => wordRow(c, PALS[i++ % 6])).join("");
      return `${sec.name && sec.name !== "\u0000extra" ? `<h3 class="label sec-title">${esc(sec.name)}</h3>` : ""}<div class="wlist">${rows}</div>`;
    })
    .join("");
}

function wordRow(c, pal) {
  const on = store.picked(c.id);
  const right = state.selecting
    ? `<input class="w-check" type="checkbox" data-select="${esc(c.id)}" ${state.selected.has(c.id) ? "checked" : ""} aria-label="Seleccionar">`
    : `<button class="pick${on ? " on" : ""}" type="button" data-pick="${esc(c.id)}" aria-pressed="${on}" aria-label="${on ? "Quitar de mi práctica de hoy" : "Agregar a mi práctica de hoy"}">${on ? "✓" : "+"}</button>`;
  if (c.kind === "qa") {
    return `<div class="wrow qa-row card-frame pal-${pal}" data-word="${esc(c.id)}" role="button" tabindex="0">
      <span class="w-main"><span class="w-ru">${esc(c.q)}</span></span>${right}</div>`;
  }
  return `<div class="wrow card-frame pal-${pal}${c.extra ? " extra" : ""}" data-word="${esc(c.id)}" role="button" tabindex="0">
    <span class="w-main"><span class="w-ru" lang="ru">${esc(c.ru)}</span>${c.fonetica ? `<span class="w-fon">${esc(c.fonetica)}</span>` : ""}</span>
    <span class="w-es">${c.extra ? `<span class="w-extra">extra</span>` : ""}${esc(c.es)}</span>${right}</div>`;
}

// ---------- Palabra ----------
function findCard(id) {
  for (const d of state.decks) {
    const c = d.cards.find((x) => x.id === id);
    if (c) return c;
  }
  return null;
}

function openPalabra(id) {
  const c = findCard(id);
  if (!c) return;
  state.word = c;
  renderPalabra();
  show("palabra");
}

function renderPalabra(editingNote = false) {
  const c = state.word;
  const deck = state.deckById.get(c.deckId);
  $("#palabra-crumb").textContent = [deck ? deck.title : "", c.seccion].filter(Boolean).join(" › ");
  const on = store.picked(c.id);
  const note = store.note(c.id);
  const speakOk = canSpeak();
  let html;
  if (c.kind === "qa") {
    html = `<div class="word-card card-frame pal-li"><span class="label">Pregunta</span><p class="qa-text">${esc(c.q)}</p></div>
      <div class="info card-frame pal-lav"><span class="label">Respuesta</span><p class="qa-text answer">${esc(c.a)}</p></div>`;
  } else {
    const tags = [...(c.tag ? c.tag.split("·").map((t) => t.trim()) : []), ...(c.nota && c.nota.length < 22 ? [c.nota] : [])];
    html = `<div class="word-card card-frame pal-aq">
      <div class="word-top"><div><div class="word-ru" lang="ru">${esc(c.ru)}</div>${c.fonetica ? `<div class="word-fon">${esc(c.fonetica)}</div>` : ""}</div>
      ${speakOk ? `<button class="audio-btn" type="button" data-say="${esc(c.ru)}" aria-label="Escuchar en ruso">${SPEAKER}</button>` : ""}</div>
      <div class="word-es"><b>${esc(c.es)}</b>${tags.length ? `<span class="word-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join("")}</span>` : ""}</div>
    </div>`;
    if (c.pista || (c.nota && c.nota.length >= 22)) {
      html += `<div class="info card-frame pal-lav"><span class="label">Qué significa</span>${c.pista ? `<p>${esc(c.pista)}</p>` : ""}${c.nota && c.nota.length >= 22 ? `<p>${esc(c.nota)}</p>` : ""}</div>`;
    }
    if (c.ejemplo) {
      html += `<div class="info card-frame pal-bl"><div class="info-row"><div><span class="label">Ejemplo</span>
        <span class="ex-ru" lang="ru">${esc(c.ejemplo.ru)}</span>${c.ejemplo.fonetica ? `<span class="ex-fon">${esc(c.ejemplo.fonetica)}</span>` : ""}<span>${esc(c.ejemplo.es)}</span></div>
        ${speakOk ? `<span class="pair"><button class="audio-btn sm" type="button" data-say="${esc(c.ejemplo.ru)}" aria-label="Escuchar el ejemplo">${SPEAKER}</button>${slowBtn(c.ejemplo.ru)}</span>` : ""}</div></div>`;
    }
    if (c.tip) html += `<div class="info card-frame pal-kh"><span class="label">Tip de memoria</span><p>${esc(c.tip)}</p></div>`;
  }
  if (editingNote) {
    html += `<div class="note-area"><label class="label" for="word-note">Tu nota personal</label>
      <textarea id="word-note" rows="3" maxlength="500" placeholder="Escribe algo que te ayude a recordarla">${esc(note)}</textarea>
      <div class="note-actions"><button class="btn btn-primary" type="button" data-wnote="save">Guardar nota</button><button class="btn btn-ghost" type="button" data-wnote="cancel">Cancelar</button></div></div>`;
  } else {
    html += `<div class="note-area"><div class="row-between"><span class="muted">${note ? "Tu nota" : "Tu nota personal"}</span>
      <button class="link-btn" type="button" data-wnote="edit">${note ? "Editar" : "+ Agregar"}</button></div>${note ? `<p>${esc(note)}</p>` : ""}</div>`;
  }
  html += `<button class="btn btn-wide ${on ? "btn-ghost" : "btn-primary"}" type="button" data-wpick>${on ? "✓ En tu práctica de hoy · quitar" : "+ Agregar a mi práctica de hoy"}</button>`;
  $("#palabra-body").innerHTML = html;
  if (editingNote) $("#word-note").focus();
}

// ---------- Práctica con tarjetas (estilo Chessbook) ----------
// Las palabras nuevas se muestran primero con su respuesta; después se
// preguntan con 4 opciones. Si fallas, la palabra pierde su progreso y
// vuelve a la fila del día hasta que la contestes bien.

// 4.0.1 · Tope diario de la «Práctica de hoy»: 30 palabras en total (dayMax).
// Solo cuenta lo que se practica desde «Hoy nos toca»; un tema aparte («Continúa en…») no suma.
// Reparto: primero lo de «+ Hoy», luego hasta 15 nuevas (newPerDay) y el resto, repasos.
function dailyPlan() {
  const now = Date.now();
  const today = dateKey(now);
  const max = store.settings.dayMax || 30;
  let left = Math.max(0, max - store.newToday(today) - store.revToday(today));
  let due = 0, fresh = 0;
  for (const d of state.decks) {
    if (!deckEnabled(d)) continue;
    const s = deckStats(d, now);
    due += s.due;
    fresh += s.fresh;
  }
  const p = Math.min(pickedCards().length, left);
  left -= p;
  const n = Math.min(Math.max(0, store.settings.newPerDay - store.newToday(today)), fresh, left);
  left -= n;
  const r = Math.min(due, left);
  return { p, n, r };
}

// 4.2.0: la práctica del día toma las palabras nuevas en el orden de la Ruta
// (1.1, 1.2, 1.3…); los temas que no están en la Ruta van al final.
function dailyDecks() {
  // 4.2.0: primero los temas y bloques en el orden de la Ruta; después los mazos completos
  // (lo que falte de ellos: repasos de palabras extra y mazos de la Biblioteca).
  const out = [];
  for (const t of rutaItems()) if (t.kind === "tema" && t.deck && deckEnabled(t.deck)) out.push(t.deck);
  const order = new Map();
  let i = 0;
  for (const m of rutaMods()) for (const t of m.temas || []) if (!t.leer && !t.tipo && !order.has(t.id)) order.set(t.id, i++);
  return out.concat(state.decks
    .filter(deckEnabled)
    .map((d, k) => ({ d, o: order.has(d.id) ? order.get(d.id) : 100000 + k }))
    .sort((a, b) => a.o - b.o)
    .map((x) => x.d));
}

// newLimit cuenta palabras nuevas, no tarjetas: en «Ambas» la palabra nueva se
// muestra una sola vez y su otra dirección se pregunta al final, sin contar doble.
function buildQueue(decks, newLimit, revLimit = Infinity) {
  const now = Date.now();
  const eod = endOfDay(now);
  const reviews = [];
  const fresh = [];
  const seenCard = new Set(); // un mazo puede venir entero y en bloques
  for (const d of decks) {
    for (const card of d.cards) {
      if (seenCard.has(card.id)) continue;
      seenCard.add(card.id);
      const its = keysFor(card).map((key) => ({ card, key, dir: key.split("|").pop() }));
      const sts = its.map((it) => store.card(it.key));
      if (sts.every((st) => !st)) { if (!card.extra) fresh.push(its); continue; }
      its.forEach((it, i) => {
        const st = sts[i];
        if (!st) reviews.push({ ...it, phase: "quiz", due: 0 });
        else if (st.due <= eod) reviews.push({ ...it, phase: "quiz", due: st.due });
      });
    }
  }
  reviews.sort((a, b) => a.due - b.due);
  reviews.splice(Math.max(0, revLimit));
  const picked = fresh.slice(0, Math.max(0, newLimit));
  const news = picked.map((its) => ({ ...its[0], phase: "learn" }));
  const extra = picked.flatMap((its) => its.slice(1).map((it) => ({ ...it, phase: "quiz", dayCounted: true })));
  const queue = [];
  let n = 0;
  reviews.forEach((r, i) => {
    queue.push(r);
    if ((i + 1) % 3 === 0 && n < news.length) queue.push(news[n++]);
  });
  while (n < news.length) queue.push(news[n++]);
  queue.push(...extra);
  return queue.map((it) => ({ ...it, failed: false, hint: 0 }));
}

// Palabras nuevas que todavía caben hoy (tope «nuevas por día»).
function newLeftToday() {
  return Math.max(0, (store.settings.newPerDay || 0) - store.newToday(dateKey(Date.now())));
}

function startToday() {
  const plan = dailyPlan();
  const queue = buildQueue(dailyDecks(), plan.n, plan.r);
  // Palabras elegidas a mano («+ Hoy»), dentro del tope del día; las que no caben salen mañana.
  const inQueue = new Set(queue.map((it) => it.key));
  for (const c of pickedCards().slice(0, plan.p)) {
    // En «Ambas» la palabra nueva se muestra una vez; la otra dirección solo se pregunta.
    const fresh = keysFor(c).every((k) => !store.card(k));
    keysFor(c).forEach((key, i) => {
      if (inQueue.has(key)) {
        queue.find((it) => it.key === key).picked = true;
        return;
      }
      const item = { card: c, key, dir: key.split("|").pop(), phase: fresh && i === 0 ? "learn" : "quiz", failed: false, hint: 0, picked: true };
      if (fresh && i > 0) { item.dayCounted = true; queue.push(item); return; }
      queue.splice(Math.floor(Math.random() * (queue.length + 1)), 0, item);
    });
  }
  // 4.2.0: lo que fallaste en «Elige la forma» otro día (máximo 3), dentro del tope.
  const libre = Math.max(0, (store.settings.dayMax || 30) - store.newToday(dateKey(Date.now())) - store.revToday(dateKey(Date.now())) - queue.length);
  for (const it of eligePendientes(Math.min(ELIGE_POR_DIA, libre))) queue.splice(Math.floor(Math.random() * (queue.length + 1)), 0, it);
  startSession(queue, "Práctica de hoy", false, "home");
  if (state.session && state.session.queue === queue) state.session.daily = true;
}

function startDeck(deck) {
  // La práctica por tema respeta lo que queda del tope de nuevas del día.
  const queue = buildQueue([deck], Math.min(NEW_PER_DECK_SESSION, newLeftToday()));
  startSession(queue, deck.title, false, state.view === "tema" ? "tema" : state.view);
}

function startCram(deck) {
  let items = itemsFor(deck).filter((it) => store.card(it.key));
  if (!items.length) items = itemsFor(deck);
  items = shuffle(items).slice(0, 40).map((it) => ({ ...it, phase: "quiz", failed: false, hint: 0 }));
  startSession(items, "Repaso rápido", true, state.view === "tema" ? "tema" : state.view);
}

function startSession(queue, title, cram, returnTo) {
  if (!queue.length) {
    toast("No hay tarjetas pendientes.");
    return;
  }
  state.loginAsked = false;
  state.session = { queue, title, cram, ok: 0, bad: 0, resolved: 0, answered: false, requeue: false, timer: null, returnTo };
  $("#study-close").setAttribute("aria-label", `Terminar ${title || "la práctica"}`);
  show("study");
  renderItem();
}

// Audio ruso: grabaciones pregeneradas (voz RHVoice Elena) en audio/ru/;
// si no hay grabación, se usa la voz del dispositivo (speechSynthesis).
let audioIndex = null;
let audioIndexTried = false;
let currentAudio = null;
// Botón (dentro de un .pair) que se pulsó para reproducir: se marca «reproduciendo» hasta que termina.
let clickedBtn = null;
let playingBtn = null;
let playingTimer = null;

function setPlaying(btn) {
  clearPlaying();
  if (!btn || !btn.isConnected) return;
  playingBtn = btn;
  btn.classList.add("playing");
  clearTimeout(playingTimer);
  playingTimer = setTimeout(clearPlaying, 20000);
}

function clearPlaying() {
  clearTimeout(playingTimer);
  if (playingBtn) playingBtn.classList.remove("playing");
  playingBtn = null;
}

function loadAudioIndex() {
  if (audioIndexTried) return;
  audioIndexTried = true;
  fetch("audio/ru/index.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j && typeof j === "object") audioIndex = j; })
    .catch(() => {});
}

function canSpeak() {
  return "speechSynthesis" in window || typeof Audio !== "undefined";
}

// 4.0.0 · Aviso de audio: sin internet o sin voz rusa en el dispositivo. Sale una vez por apertura de la app.
const AUDIO_NOTES = {
  red: {
    t: "Sin conexión a internet",
    d: "El audio puede presentar fallas. Las palabras que ya escuchaste antes sí van a sonar.",
    ic: '<path d="M2 8.8a15 15 0 0 1 4.2-2.6M9.5 5.2A15 15 0 0 1 22 8.8M5 12.5a10 10 0 0 1 3.6-2.1M15.5 10.6A10 10 0 0 1 19 12.5M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/><path d="M3 3l18 18"/>'
  },
  voz: {
    t: "Tu dispositivo no tiene voz en ruso",
    d: "Algunas palabras pueden no sonar. Puedes instalar la voz rusa en los ajustes de texto a voz de tu celular.",
    ic: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/>'
  }
};
const audioNoteShown = {};
let audioNoteTimer = null;

function showAudioNote(kind) {
  const n = AUDIO_NOTES[kind];
  const el = $("#audio-note");
  if (!n || !el || audioNoteShown[kind]) return;
  if (!el.hidden) return; // ya hay un aviso a la vista; el otro sale la próxima vez que suene algo
  audioNoteShown[kind] = true;
  $("#audio-note-ic").innerHTML = n.ic;
  $("#audio-note-t").textContent = n.t;
  $("#audio-note-d").textContent = n.d;
  el.hidden = false;
  clearTimeout(audioNoteTimer);
  audioNoteTimer = setTimeout(hideAudioNote, 10000);
}

function hideAudioNote() {
  clearTimeout(audioNoteTimer);
  const el = $("#audio-note");
  if (el) el.hidden = true;
}

function hasRuVoice() {
  return window.speechSynthesis.getVoices().some((v) => v.lang && v.lang.toLowerCase().startsWith("ru"));
}

// Revisa si hay voz rusa; las voces pueden tardar en cargar, así que espera a «voiceschanged».
function checkRuVoice() {
  if (!("speechSynthesis" in window)) { showAudioNote("voz"); return; }
  const ss = window.speechSynthesis;
  if (ss.getVoices().length) { if (!hasRuVoice()) showAudioNote("voz"); return; }
  const once = () => { ss.removeEventListener("voiceschanged", once); if (!hasRuVoice()) showAudioNote("voz"); };
  ss.addEventListener("voiceschanged", once);
  setTimeout(() => { ss.removeEventListener("voiceschanged", once); if (!ss.getVoices().length) showAudioNote("voz"); }, 1500);
}

function speakFallback(clean, rate, btn) {
  checkRuVoice();
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = "ru-RU";
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith("ru"));
  if (voice) u.voice = voice;
  u.rate = rate;
  if (btn) {
    setPlaying(btn);
    const done = () => { if (playingBtn === btn) clearPlaying(); };
    u.onend = done;
    u.onerror = done;
  }
  window.speechSynthesis.speak(u);
}

function speak(text, rate = 0.9) {
  if (!canSpeak()) return;
  const clean = plain(text).replace(/\(.*?\)/g, "").replace(/[/·]/g, ",").replace(/—/g, ",").trim();
  if (!clean) return;
  if (navigator.onLine === false) showAudioNote("red");
  loadAudioIndex();
  const btn = clickedBtn;
  clickedBtn = null;
  clearPlaying();
  if (currentAudio) { try { currentAudio.pause(); } catch (e) { /* nada */ } currentAudio = null; }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  const id = audioIndex && Object.prototype.hasOwnProperty.call(audioIndex, clean) ? audioIndex[clean] : null;
  if (!id || typeof Audio === "undefined") { speakFallback(clean, rate, btn); return; }
  try {
    const a = new Audio(`audio/ru/${id}.mp3`);
    a.playbackRate = Math.min(1.25, Math.max(0.5, rate / 0.9));
    a.preservesPitch = true;
    if ("webkitPreservesPitch" in a) a.webkitPreservesPitch = true;
    currentAudio = a;
    setPlaying(btn);
    a.addEventListener("ended", () => { if (currentAudio === a) { currentAudio = null; if (playingBtn === btn) clearPlaying(); } });
    a.addEventListener("error", () => { if (currentAudio === a) { currentAudio = null; speakFallback(clean, rate, btn); } });
    const pr = a.play();
    if (pr && pr.catch) {
      pr.catch((err) => {
        if (currentAudio !== a) return;
        currentAudio = null;
        // Autoplay bloqueado (sin gesto): en silencio, sin ruido.
        if (err && err.name === "NotAllowedError") { if (playingBtn === btn) clearPlaying(); return; }
        speakFallback(clean, rate, btn);
      });
    }
  } catch (err) {
    currentAudio = null;
    speakFallback(clean, rate, btn);
  }
}

// Marca el botón pulsado (solo los de un par altavoz + tortuga) y atiende la tortuga.
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("button");
  clickedBtn = b && b.closest(".pair") ? b : null;
  const slow = e.target.closest && e.target.closest("[data-slow]");
  if (slow) speak(slow.dataset.slow, 0.55);
  clickedBtn = null;
}, true);

loadAudioIndex();

// Botón de tortuga (audio lento) para frases completas. Con data-slow lleva el texto.
function slowBtn(text, cls = "") {
  return `<button class="slow-btn${cls ? " " + cls : ""}" type="button" data-slow="${esc(text)}" aria-label="Escuchar más lento">${TURTLE}</button>`;
}

function ruBlock(text, fon) {
  const cursive = store.settings.cursive
    ? `<div class="script-ru" lang="ru" aria-hidden="true">${esc(plain(text))}</div>`
    : "";
  const sound = fon ? `<div class="fon fon-big">${esc(fon)}</div>` : "";
  return `<div class="big-ru" lang="ru">${esc(text)}</div>${sound}${cursive}`;
}

// «qué / cuál (fem.)»: lo que va entre paréntesis al final, más chico y gris (maqueta A2 Repaso).
function esPar(t) {
  const m = String(t).match(/^(.*\S)\s+(\([^()]*\))$/);
  return m ? `${esc(m[1])} <span class="st-par">${esc(m[2])}</span>` : esc(t);
}

function extras(card) {
  const parts = (card.tag ? `<span class="tag">${esc(card.tag)}</span>` : "") +
    (card.nota ? `<div class="note">${esc(card.nota)}</div>` : "");
  return parts || `<div class="notes-empty">Sin notas</div>`;
}

// Elige 3 opciones incorrectas del mismo mazo (y del mismo tipo de palabra si se puede).
function buildOptions(it) {
  const c = it.card;
  const field = it.dir === "es" ? "ru" : "es";
  const answer = c[field];
  const seen = new Set([norm(answer)]);
  const head = (c.tag || "").split("·")[0].trim();
  const own = state.deckById.get(c.deckId).cards.filter((x) => x.kind === "word" && x.id !== c.id);
  const sameType = shuffle(own.filter((x) => (x.tag || "").split("·")[0].trim() === head));
  const rest = shuffle(own);
  const others = shuffle(state.decks.flatMap((d) => d.cards).filter((x) => x.kind === "word" && x.deckId !== c.deckId));
  const picks = [];
  for (const pool of [sameType, rest, others]) {
    for (const x of pool) {
      if (picks.length >= 3) break;
      const k = norm(x[field]);
      if (seen.has(k)) continue;
      seen.add(k);
      picks.push({ text: x[field], fon: field === "ru" ? x.fonetica : "" });
    }
  }
  return shuffle([
    { text: answer, fon: field === "ru" ? c.fonetica : "", correct: true },
    ...picks.map((o) => ({ ...o, correct: false }))
  ]);
}

function hintBtnHtml(t, d) {
  return `<span class="st-hint-q" aria-hidden="true">?</span><span class="st-hint-t"><b>${t}</b><span>${d}</span></span>`;
}

function hideAllControls() {
  for (const id of ["btn-learned", "btn-reveal", "selfcheck", "btn-hint", "btn-next", "options", "feedback", "card-back", "hint-box", "note-box", "st-taps", "st-ask"]) {
    $(`#${id}`).hidden = true;
  }
}

function updateCounters() {
  const s = state.session;
  $("#cnt-due").textContent = s.queue.length;
  $("#cnt-ok").textContent = s.ok;
  $("#cnt-bad").textContent = s.bad;
  const total = s.resolved + s.queue.length;
  $("#cnt-pos").textContent = Math.min(total, s.resolved + 1);
  $("#cnt-tot").textContent = total;
  $("#study-progress").style.width = `${total ? Math.round((s.resolved / total) * 100) : 0}%`;
}

function renderItem() {
  const s = state.session;
  clearTimeout(s.timer);
  const it = s.queue[0];
  const c = it.card;
  const deck = state.deckById.get(c.deckId);
  s.answered = false;
  s.requeue = false;
  hideAllControls();
  updateCounters();
  // 4.2.0: encabezado «Gramática» en «Elige la forma»; «Práctica» en lo demás.
  const gramHead = it.dir === "elige" && !!s.parada;
  const h1 = $("#study-title");
  if (h1.firstChild && h1.firstChild.nodeType === 3) h1.firstChild.textContent = gramHead ? "Gramática" : "Práctica";
  $("#view-study .h-sec-ru").textContent = gramHead ? "грамма́тика" : "пра́ктика";
  $("#view-study").classList.toggle("st-gram", it.dir === "elige");
  if (it.dir === "elige") {
    $("#view-study").classList.add("st-quiz");
    return renderElige(it);
  }

  const learn = it.phase === "learn" && c.kind !== "qa";
  const cardEl = $("#card");
  cardEl.className = `card card-frame study-card sh3d pal-${deck ? visFor(deck).pal : "lav"}${learn ? " st-learn" : ""}`;
  // 4.2.0: la palabra nueva se pasa tocando la tarjeta (las dos mitades continúan)
  if (learn) { cardEl.tabIndex = 0; cardEl.setAttribute("role", "group"); cardEl.setAttribute("aria-label", "Palabra nueva. Toca la tarjeta para continuar"); }
  else { cardEl.removeAttribute("tabindex"); cardEl.removeAttribute("role"); cardEl.removeAttribute("aria-label"); }
  $("#card-deck").textContent = deck ? deck.title : "";
  const pos = deck && state.ruta ? rutaPos(cardUnitKey(c)) : null;
  $("#study-sub").innerHTML = deck ? `${pos ? `Tema <span class="num">${pos.label}</span> · ` : ""}${esc(deck.title)}` : "";
  $("#study-exit").hidden = learn;
  $("#view-study").classList.toggle("st-quiz", !learn); // maqueta A2 Repaso · pregunta: «Salir» abajo, sin «Reportar falla»
  $("#card-badge").hidden = false;
  $("#card-badge").className = "card-badge" + (it.phase === "learn" ? "" : " q");
  $("#card-badge").textContent = it.phase === "learn" ? (c.kind === "qa" ? "Regla nueva" : "Palabra nueva") : it.dir === "es" ? "¿Cómo se dice?" : it.dir === "audio" ? "Escucha" : it.dir === "qa" ? "Pregunta" : "¿Qué significa?";
  if (it.failed && it.phase !== "learn") {
    $("#card-badge").textContent = "Repetir · " + $("#card-badge").textContent;
  }

  const front = $("#card-front");
  const back = $("#card-back");
  const speakBtn = $("#card-speak");
  speakBtn.hidden = true;

  if (it.phase === "learn") {
    if (c.kind === "qa") {
      front.innerHTML = `<span class="learn-label">Regla nueva</span><div class="qa-text">${esc(c.q)}</div>`;
      back.innerHTML = `<div class="qa-text answer">${esc(c.a)}</div>`;
    } else {
      front.innerHTML = ruBlock(c.ru, c.fonetica);
      const sp = canSpeak();
      const ej = c.ejemplo && c.ejemplo.ru
        ? `<div class="learn-ex st-ex"><div class="st-ex-t"><span class="learn-ex-label">EJEMPLO</span><span class="ex-ru" lang="ru">${esc(c.ejemplo.ru)}</span>${c.ejemplo.fonetica ? `<span class="ex-fon">${esc(c.ejemplo.fonetica)}</span>` : ""}${c.ejemplo.es ? `<span class="st-ex-es">${esc(c.ejemplo.es)}</span>` : ""}</div>${sp ? `<button class="audio-btn st-ex-btn" type="button" data-say="${esc(c.ejemplo.ru)}" aria-label="Escuchar el ejemplo">${SPEAKER}</button>${slowBtn(c.ejemplo.ru, "st-ex-btn")}` : ""}</div>`
        : "";
      back.innerHTML = `<span class="st-div" aria-hidden="true"></span><div class="big-es">${esPar(c.es)}</div>` + extras(c) + ej;
      speakBtn.hidden = !canSpeak();
      if (store.settings.autoSpeak) speak(c.ru);
    }
    back.hidden = false;
    $("#btn-learned").hidden = false;
    $("#st-taps").hidden = !learn || !ayudaOn("taps");
    renderNoteBox();
    return;
  }

  if (it.dir === "qa") {
    front.innerHTML = `<div class="qa-text">${esc(c.q)}</div>`;
    back.innerHTML = `<div class="qa-text answer">${esc(c.a)}</div>`;
    $("#btn-reveal").hidden = false;
    return;
  }

  if (it.dir === "audio") {
    front.innerHTML = `<span class="learn-label">Solo audio</span><div class="audio-prompt"><span class="audio-ic" aria-hidden="true">${SPEAKER}</span><p>Escucha y elige el significado</p><button class="btn btn-ghost audio-repeat" id="audio-repeat" type="button">${SPEAKER}<span>Repetir palabra</span></button></div>`;
    back.innerHTML = ruBlock(c.ru, c.fonetica) + `<div class="big-es">${esPar(c.es)}</div>` + extras(c);
    if (canSpeak()) speak(c.ru);
  } else if (it.dir === "es") {
    front.innerHTML = `<div class="big-es">${esPar(c.es)}</div>`;
    back.innerHTML = ruBlock(c.ru, c.fonetica) + extras(c);
  } else {
    front.innerHTML = ruBlock(c.ru, c.fonetica);
    back.innerHTML = `<div class="big-es">${esPar(c.es)}</div>` + extras(c);
    speakBtn.hidden = !canSpeak();
    if (store.settings.autoSpeak) speak(c.ru);
  }

  it.options = buildOptions(it);
  const box = $("#options");
  box.innerHTML = it.options
    .map((o, i) => `<button class="option${it.dir === "es" ? " ru" : ""}" type="button" data-opt="${i}"${it.dir === "es" ? ' lang="ru"' : ""}><span class="key">${i + 1}</span><span class="opt-text"><span>${esc(o.text)}</span>${o.fon ? `<span class="fon">${esc(o.fon)}</span>` : ""}</span></button>`)
    .join("");
  box.hidden = false;
  $("#st-ask").textContent = it.dir === "es" ? "Elige cómo se dice en ruso." : "Elige su significado.";
  $("#st-ask").hidden = false;
  const hint = $("#btn-hint");
  hint.innerHTML = hintBtnHtml("Dame una pista", "Te da una idea, no la respuesta. La palabra vuelve al final de hoy.");
  hint.hidden = false;
}

function markLearned() {
  marcarAyuda("taps");
  const s = state.session;
  const it = s.queue.shift();
  it.phase = "quiz";
  // Se pregunta después de un par de tarjetas, como en Chessbook.
  s.queue.splice(Math.min(2, s.queue.length), 0, it);
  renderItem();
}

// ---------- Sonidos ----------
let audioCtx = null;
function playSound(ok) {
  if (!store.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t0 = audioCtx.currentTime;
    const notes = ok
      ? [{ f: 880, at: 0, len: 0.12, type: "sine" }, { f: 1318.5, at: 0.09, len: 0.2, type: "sine" }]
      : [{ f: 220, at: 0, len: 0.16, type: "triangle" }, { f: 164.8, at: 0.12, len: 0.24, type: "triangle" }];
    for (const n of notes) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = n.type;
      osc.frequency.value = n.f;
      gain.gain.setValueAtTime(0.0001, t0 + n.at);
      gain.gain.exponentialRampToValueAtTime(ok ? 0.18 : 0.22, t0 + n.at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.len);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + n.at);
      osc.stop(t0 + n.at + n.len + 0.02);
    }
  } catch {
    /* sin audio disponible */
  }
}

const fonOn = () => store.settings.fonetica !== false;
function applyFon() {
  document.body.classList.toggle("no-fon", !fonOn());
}

function applyTheme() {
  const theme = store.settings.theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f4f1ea" : "#0b0b0c");
}

function choose(i) {
  const s = state.session;
  const it = s.queue[0];
  if (s.answered || it.phase !== "quiz" || !it.options || !it.options[i]) return;
  s.answered = true;
  const buttons = $$("#options .option");
  buttons.forEach((b, j) => {
    b.disabled = true;
    if (it.options[j].correct) b.classList.add("correct");
  });
  const right = it.options[i].correct;
  if (!right) buttons[i].classList.add("wrong");
  if (it.dir === "elige") revealElige(it, right && !it.hint);
  else revealAfterAnswer(it);
  // Usar la pista cuenta como error aunque la respuesta sea correcta.
  const ok = right && !it.hint;
  playSound(right);
  settle(ok);
  if (ok) s.timer = setTimeout(next, it.card.nota ? 2200 : 1100);
}

function revealAfterAnswer(it) {
  $("#card-back").hidden = false;
  $("#btn-hint").hidden = true;
  $("#btn-next").hidden = false;
  if (it.dir === "es") $("#card-speak").hidden = !canSpeak();
  renderNoteBox();
}

// Pista escrita en el mazo; si la palabra no tiene, se arma una con su tipo.
function hintText(it) {
  const c = it.card;
  if (c.pista) return c.pista;
  const deck = state.deckById.get(c.deckId);
  const answer = plain(it.dir === "es" ? c.ru : c.es).trim();
  const parts = [];
  if (c.tag) parts.push(c.tag);
  if (deck) parts.push(`tema: ${deck.title}`);
  if (answer) parts.push(`empieza con «${answer[0]}»`);
  return parts.join(" · ");
}

function useHint() {
  const s = state.session;
  const it = s.queue[0];
  if (s.answered || it.phase !== "quiz") return;
  if (it.hint === 0) {
    it.hint = 1;
    if (it.dir === "elige") {
      $("#hint-text").textContent = eligeHint(it);
      $("#hint-text").lang = "";
      $("#hint-mine").hidden = true;
      $("#hint-box").hidden = false;
      $("#btn-hint").innerHTML = hintBtnHtml("No sé, muéstrame la respuesta", "Cuenta como error y vuelve al final de hoy.");
      return;
    }
    $("#hint-text").textContent = it.dir === "audio" ? it.card.ru : hintText(it);
    $("#hint-text").lang = it.dir === "audio" ? "ru" : "";
    const mine = it.dir === "audio" ? "" : store.note(it.card.id);
    $("#hint-mine").hidden = !mine;
    $("#hint-mine-text").textContent = mine;
    $("#hint-box").hidden = false;
    $("#btn-hint").innerHTML = hintBtnHtml("No sé, muéstrame la respuesta", "Cuenta como error y la palabra vuelve al final de hoy.");
    return;
  }
  s.answered = true;
  $$("#options .option").forEach((b, j) => {
    b.disabled = true;
    if (it.options[j].correct) b.classList.add("correct");
  });
  if (it.dir === "elige") revealElige(it, false);
  else revealAfterAnswer(it);
  playSound(false);
  settle(false);
}

function revealQA() {
  $("#card-back").hidden = false;
  $("#btn-reveal").hidden = true;
  $("#selfcheck").hidden = false;
  renderNoteBox();
}

// ---------- Notas personales (durante la práctica) ----------
function renderNoteBox(editing = false) {
  const s = state.session;
  if (!s) return;
  const c = s.queue[0].card;
  const box = $("#note-box");
  const text = store.note(c.id);
  if (editing) {
    box.innerHTML = `<label class="note-label" for="note-input">Tu nota personal</label>
      <textarea id="note-input" rows="3" maxlength="500" placeholder="Escribe algo que te ayude a recordarla">${esc(text)}</textarea>
      <div class="note-actions">
        <button class="btn btn-primary" type="button" data-note="save">Guardar nota</button>
        <button class="btn btn-ghost" type="button" data-note="cancel">Cancelar</button>
      </div>`;
    box.hidden = false;
    const input = $("#note-input");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    return;
  }
  box.innerHTML = text
    ? `<span class="note-label">Tu nota</span><p class="note-mine">${esc(text)}</p>
       <button class="link-btn" type="button" data-note="edit">Editar nota</button>`
    : `<button class="st-note-add" type="button" data-note="edit"><span class="st-note-plus" aria-hidden="true">+</span><span>Tu nota: algo que te ayude a recordarla</span><span class="st-opt">(opcional)</span></button>`;
  box.hidden = false;
}

function handleNoteClick(e) {
  const b = e.target.closest("[data-note]");
  const s = state.session;
  if (!b || !s) return;
  clearTimeout(s.timer);
  const c = s.queue[0].card;
  if (b.dataset.note === "edit") renderNoteBox(true);
  else if (b.dataset.note === "cancel") renderNoteBox(false);
  else if (b.dataset.note === "save") {
    store.setNote(c.id, $("#note-input").value);
    renderNoteBox(false);
    toast("Nota guardada");
  }
}

function selfCheck(knew) {
  const s = state.session;
  if (s.answered) return;
  s.answered = true;
  playSound(knew);
  settle(knew);
  next();
}

// Guarda el resultado de la tarjeta actual.
function settle(ok) {
  const s = state.session;
  const it = s.queue[0];
  const now = Date.now();
  if (ok) s.ok++;
  else s.bad++;
  if (it.dir === "elige") {
    // Se guarda el primer intento: lo fallado vuelve en la práctica del día siguiente.
    if (!it.failed) {
      store.setEjer(it.key, ok);
      if (!ok && s.firstBad) s.firstBad.push(it.elige);
      if (s.daily && !it.dayCounted) { it.dayCounted = true; store.countReview(dateKey(now)); }
      logActivity();
    } else if (ok && !s.parada) store.setEjer(it.key, true);
    if (!ok) { it.failed = true; it.hint = 0; s.requeue = true; }
    updateCounters();
    return;
  }
  if (!s.cram) {
    const prev = store.card(it.key);
    // Nueva = ninguna dirección de la palabra se había visto (en «Ambas» cuenta una vez).
    const isNew = !prev && keysFor(it.card).every((k) => !store.card(k));
    // La «Práctica de hoy» cuenta para el tope del día; una vez por palabra.
    if (s.daily && !it.dayCounted) {
      it.dayCounted = true;
      if (isNew) store.countNew(dateKey(now));
      else store.countReview(dateKey(now));
      markHoy(it.card);
    } else if (!s.daily && isNew && !it.dayCounted) {
      // Las palabras nuevas de un tema aparte también gastan el tope de nuevas del día.
      it.dayCounted = true;
      store.countNew(dateKey(now));
    }
    const rating = ok ? (it.hint && !it.failed ? 2 : 3) : 1;
    logActivity();
    store.setCard(it.key, schedule(prev, rating, now));
  }
  // Aciertos seguidos sin pista (para abrir los retos de gramática).
  if (it.dir !== "audio" && it.dir !== "qa") store.setLimpio(it.key, ok);
  if (!ok) {
    it.failed = true;
    it.hint = 0;
    s.requeue = true;
  }
  updateCounters();
}

function next() {
  const s = state.session;
  if (!s || !s.answered) return;
  clearTimeout(s.timer);
  const it = s.queue.shift();
  if (s.requeue) s.queue.push(it);
  else {
    s.resolved++;
    if (it.picked && !s.cram && it.dir !== "elige") store.setPicks([it.card.id], false);
  }
  if (s.queue.length) renderItem();
  else finishSession();
}

function finishSession() {
  const s = state.session;
  if (s && s.parada) return finishElige(s);
  if (s && s.daily) {
    state.session = null;
    // Sin sesión iniciada: primero la invitación a guardar el progreso y luego «¡Lo lograste!».
    if (needLoginInvite()) {
      $("#done-title").textContent = "Práctica terminada";
      $("#done-summary").textContent = "Tu avance de hoy ya está guardado en este dispositivo.";
      state.doneReturn = "fin";
      state.loginAsked = true;
      return show("done");
    }
    return openFin();
  }
  $("#done-title").textContent = s.audio ? "Solo audio terminado" : s.cram ? "Repaso rápido terminado" : "Práctica terminada";
  $("#done-summary").textContent =
    `${s.ok} respuestas correctas y ${s.bad} errores. ` +
    (s.audio ? "Esta práctica no cambia tu calendario de repaso." : s.cram ? "El repaso rápido no cambia tu calendario." : "Las palabras que fallaste volverán pronto para reforzarlas.");
  state.doneReturn = s.returnTo;
  state.session = null;
  show("done");
}

function closeSession() {
  const s = state.session;
  if (s) clearTimeout(s.timer);
  state.session = null;
  backTo(s ? s.returnTo : "home");
}

function doneContinue() {
  backTo(state.doneReturn || "home");
}

// Sin sesión iniciada: invita a guardar el progreso en la nube. Con «Ahora no»
// el avance sigue guardado en este dispositivo (Store.save siempre escribe en localStorage).
function needLoginInvite() {
  return store.syncConfigured && !store.user;
}

function renderDoneLogin() {
  const ask = store.syncConfigured && !store.user;
  $("#done-login").hidden = !ask;
  $("#done-home").hidden = ask;
}

function backTo(where) {
  if (where === "reto" && state.reto) {
    renderReto();
    show("reto");
  } else if (where === "fin") {
    openFin();
  } else if (where === "tema" && state.currentDeck) {
    renderTema();
    show("tema");
  } else go(where === "temas" || where === "mapa" ? where : "home");
}

// ---------- Armar frases ----------
// Paso 1: con la idea en español acomodas las fichas en ruso. Cuenta como
// correcta cualquier frase de "validas" y, si la frase tiene "bloques" y no es
// "fijo", cualquier orden de los bloques (sin separarlos). Al fallar se
// explica por qué (ficha que sobra, bloque separado u orden). Paso 2: eliges
// qué significa la frase que armaste. Al acertar se avanza solo (≈1 s).

const AUTO_MS = 1000;

function startFrases(deck, first) {
  const all = frasesOf(deck, inRutaView());
  if (!all.length) return;
  let list = shuffle(all);
  // Desde «¡Lo lograste!»: primero la frase que usa tus palabras de hoy (índice en la lista completa).
  const want = Number.isInteger(first) ? ejRaw(deck).frases[first] : null;
  if (want && all.includes(want)) list = [want, ...list.filter((f) => f !== want)];
  const queue = list.map((f) => ({ f, failed: false }));
  state.fr = { deck, queue, ok: 0, bad: 0, resolved: 0, results: [], total: queue.length, returnTo: state.view === "tema" ? "tema" : state.view, timer: null };
  show("frase");
  newFraseItem();
}

function fraseKey(fr, f) {
  return `${fr.deck.id}:${f.id}`;
}

function newFraseItem() {
  const fr = state.fr;
  clearTimeout(fr.timer);
  const it = fr.queue[0];
  const f = it.f;
  const seenBefore = !!store.frase(fraseKey(fr, f));
  let tokens = f.fichas.map((t) => ({ t, dist: false }));
  if (seenBefore || it.failed) tokens = tokens.concat((f.distractores || []).slice(0, 2).map((t) => ({ t, dist: true })));
  let bank = shuffle(tokens);
  for (let i = 0; i < 4 && bank.map((b) => b.t).join(" ") === f.fichas.join(" "); i++) bank = shuffle(tokens);
  fr.cur = { bank: bank.map((b) => ({ ...b, used: false })), placed: [], step: 1, hint: 0, checked: false, ok1: null, ok2: null, choice: null, rate: 0.9, reported: false, err: null };
  fr.cur.options = shuffle(f.opciones);
  renderFrase();
}

function fraseCounters() {
  const fr = state.fr;
  // 4.2.0: encabezado y avance como en la práctica (maqueta Frases_Enfasis).
  const total = fr.resolved + fr.queue.length;
  $("#fr-pos").textContent = Math.min(total, fr.resolved + 1);
  $("#fr-tot").textContent = total;
  $("#fr-ok").textContent = fr.ok;
  $("#fr-bad").textContent = fr.bad;
  $("#fr-progress").style.width = `${total ? Math.round(((fr.resolved + 1) / total) * 100) : 0}%`;
  $("#fr-count").setAttribute("aria-label", `Frase ${Math.min(total, fr.resolved + 1)} de ${total}. ${fr.ok} bien, ${fr.bad} para repetir`);
  const pos = state.ruta ? rutaPos(fr.deck.id) : null;
  $("#fr-sub").innerHTML = `${pos ? `Tema <span class="num">${pos.label}</span> · ` : ""}Frases`;
}

function builtTokens(cur) {
  return cur.placed.map((i) => cur.bank[i].t);
}

function builtSentence(cur) {
  return builtTokens(cur).join(" ");
}

function niceSentence(s) {
  const t = String(s || "").trim();
  const c = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(c) ? c : `${c}.`;
}

// ¿La frase armada es válida? Primero contra "validas"; después, si hay
// bloques y el orden es libre, cualquier orden de bloques completos.
function fraseValid(f, tokens) {
  const mine = normSentence(tokens.join(" "));
  if (f.validas.some((v) => normSentence(v) === mine)) return true;
  if (!Array.isArray(f.bloques) || !f.bloques.length || f.fijo) return false;
  const toks = tokens.map(normSentence);
  const blocks = f.bloques.map((b) => b.map(normSentence));
  const used = blocks.map(() => false);
  const rec = (i, n) => {
    if (i === toks.length) return n === blocks.length;
    for (let b = 0; b < blocks.length; b++) {
      if (used[b]) continue;
      const bl = blocks[b];
      if (bl.every((t, k) => toks[i + k] === t)) {
        used[b] = true;
        if (rec(i + bl.length, n + 1)) return true;
        used[b] = false;
      }
    }
    return false;
  };
  return rec(0, 0);
}

function hasRun(tokens, run) {
  for (let i = 0; i + run.length <= tokens.length; i++) {
    if (run.every((t, k) => tokens[i + k] === t)) return true;
  }
  return false;
}

// Explicación del error: ficha que sobra, ficha que falta, bloque separado u orden.
function fraseError(f, cur) {
  const errs = Array.isArray(f.errores) ? f.errores : [];
  const placed = cur.placed.map((i) => cur.bank[i]);
  const extra = placed.find((b) => b.dist);
  if (extra) {
    const e = errs.find((x) => x.tipo === "distractor" && norm(x.ficha) === norm(extra.t));
    return { title: `Casi. «${extra.t}» no va en esta frase.`, body: e ? e.explica : "Esa ficha sobra: con ella la frase dice otra cosa." };
  }
  const missing = cur.bank.filter((b) => !b.dist && !b.used).map((b) => b.t);
  if (missing.length) {
    return { title: missing.length === 1 ? "Casi. Te faltó una ficha." : "Casi. Te faltaron fichas.", body: `Falta: ${missing.join(", ")}. Todas las fichas de la idea se usan.` };
  }
  const toks = placed.map((b) => normSentence(b.t));
  for (const e of errs.filter((x) => x.tipo === "bloque" && Array.isArray(x.fichas))) {
    if (!hasRun(toks, e.fichas.map(normSentence))) return { title: "Casi. Estas fichas van juntas.", body: e.explica };
  }
  const o = errs.find((x) => x.tipo === "orden");
  return { title: "Casi. Revisa el orden.", body: o ? o.explica : "Con estas fichas el orden no funciona así en ruso. Mira la respuesta de abajo." };
}

function otherValid(f) {
  const main = normSentence(f.texto || f.validas[0]);
  const alt = f.validas.find((v) => normSentence(v) !== main);
  return alt ? niceSentence(alt) : "";
}

function displaySentence(fr, cur) {
  const f = fr.queue[0].f;
  if (!cur.ok1) return f.texto || f.validas[0];
  const mine = builtSentence(cur);
  if (normSentence(mine) === normSentence(f.texto || f.validas[0])) return f.texto || mine;
  return niceSentence(mine);
}

const BOOK = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>`;

function dicBtn(f) {
  if (!Array.isArray(f.diccionario) || !f.diccionario.length) return "";
  return `<button class="btn btn-line" type="button" data-fr="dic">${BOOK}Diccionario</button>`;
}

function frFoot(f, main, extra = "") {
  const dic = dicBtn(f);
  return `<div class="fr-foot">${extra}<div class="fr-actions${dic ? "" : " one"}">${dic}${main}</div></div>`;
}

// 4.2.0 · Nota de énfasis: con un orden válido distinto al principal se explica qué resalta;
// con el orden principal (si la frase tiene otros órdenes) se explica el orden más común.
function enfasisText(t) {
  return esc(t)
    .replace(/[а-яё\u0301]+(?:\s+[а-яё\u0301]+)*/gi, (w) => `<span class="fr-tk" lang="ru">${w}</span>`)
    .replace(/«([^»]+)»/g, "<i>«$1»</i>")
    .replace(/\b(énfasis|contraste)\b/g, "<b>$1</b>");
}
function enfasisHtml(f, cur) {
  const list = Array.isArray(f.enfasis) ? f.enfasis : [];
  if (list.length < 2) return "";
  const built = normSentence(builtSentence(cur));
  const mainTxt = f.texto || f.validas[0];
  const isMain = built === normSentence(mainTxt);
  const hit = list.find((x) => normSentence(x.ru) === built);
  const stk = `<span class="fr-enf-ru" lang="ru">поря́док слов</span>`;
  if (isMain) {
    const nota = (hit || list[0]).nota || "";
    const m = nota.match(/^Orden neutro:\s*(.+)$/i);
    if (!m) return "";
    return `<section class="fr-enf fr-enf-main" aria-label="El orden más común"><b class="fr-enf-stk">¡El orden más común!</b>${stk}<p>Así lo dice casi todo el mundo: ${enfasisText(m[1])}</p><p class="fr-enf-foot">Otro orden también vale: solo cambia el énfasis.</p></section>`;
  }
  const nota = hit ? hit.nota : "Este orden también se entiende; solo cambia el énfasis.";
  return `<section class="fr-enf" aria-label="Tu orden también vale"><b class="fr-enf-stk">¡Tu orden también vale!</b>${stk}<p>${enfasisText(nota)}</p><p class="fr-enf-foot">Lo más común: <span lang="ru">${esc(String(mainTxt).replace(/[.!?]+$/, ""))}</span></p></section>`;
}
// Fonética en el orden que armaste (si cada palabra tiene su pedazo de fonética).
function builtFon(f, cur) {
  if (!f.fonetica) return "";
  const main = f.texto || f.validas[0];
  const words = normSentence(main).split(" ");
  const fon = String(f.fonetica).replace(/[.,!?¿¡]/g, "").split(/\s+/).filter(Boolean);
  const built = normSentence(builtSentence(cur)).split(" ");
  if (normSentence(builtSentence(cur)) === normSentence(main)) return f.fonetica;
  if (fon.length !== words.length) return "";
  const used = new Set();
  return built.map((w) => { const i = words.findIndex((x, k) => x === w && !used.has(k)); if (i < 0) return "?"; used.add(i); return fon[i]; }).join(" ");
}

function renderFrase() {
  const fr = state.fr;
  const cur = fr.cur;
  const f = fr.queue[0].f;
  fraseCounters();
  const body = $("#frase-body");
  if (cur.step === 1) {
    const zoneCls = cur.checked ? (cur.ok1 ? " ok" : " bad") : "";
    const placed = cur.placed.map((i) => {
      const b = cur.bank[i];
      const bad = cur.checked && !cur.ok1 && b.dist;
      return `<button class="tok${bad ? " bad" : ""}" type="button" lang="ru" data-ans="${i}"${cur.checked ? " disabled" : ""}>${esc(b.t)}</button>`;
    }).join("");
    const bank = cur.bank.map((b, i) => b.used
      ? `<span class="tok ghost" aria-hidden="true">${esc(b.t)}</span>`
      : `<button class="tok" type="button" lang="ru" data-bank="${i}"${cur.checked ? " disabled" : ""}>${esc(b.t)}</button>`).join("");
    let foot;
    let extra = "";
    if (!cur.checked) {
      foot = `<div class="fr-foot">
        ${cur.hint ? `<div class="hint-box"><span class="label">Pista</span><p class="hint-text">${esc(f.pista || "Fíjate en el orden de la idea en español.")}</p></div>` : ""}
        <button class="menu-item" type="button" data-fr="hint">${cur.hint ? "No sé, muéstrame la respuesta" : "No sé, dame una pista"}</button>
        <button class="btn btn-primary btn-wide" type="button" data-fr="check"${cur.placed.length ? "" : " disabled"}>Comprobar</button></div>`;
    } else if (cur.ok1) {
      foot = frFoot(f, `<button class="btn btn-primary" type="button" data-fr="step2">Continuar</button>`);
    } else {
      if (cur.err) {
        extra += `<section class="fr-error" role="status"><b>${esc(cur.err.title)}</b><p>${esc(cur.err.body)}</p></section>`;
      }
      const alt = otherValid(f);
      const solText = f.texto || niceSentence(f.validas[0]);
      extra += `<div class="solution card-frame pal-mint"><span class="label">Una respuesta correcta</span><div class="sol-line"><div class="sol-txt"><div class="sol-ru" lang="ru">${esc(solText)}</div>${f.fonetica ? `<span class="fon">${esc(f.fonetica)}</span>` : ""}</div>${canSpeak() ? `<span class="pair"><button class="audio-btn sm" type="button" data-say="${esc(solText)}" aria-label="Escuchar en ruso">${SPEAKER}</button>${slowBtn(solText)}</span>` : ""}</div>${alt ? `<span class="sol-alt">También vale: <span lang="ru">${esc(alt)}</span></span>` : ""}</div>`;
      const report = cur.placed.length && !cur.revealed
        ? `<button class="link-quiet" type="button" data-fr="report1"${cur.reported ? " disabled" : ""}>${cur.reported ? "✓ Enviado, lo voy a revisar" : "Mi respuesta también es correcta"}</button>`
        : "";
      foot = frFoot(f, `<button class="btn btn-primary" type="button" data-fr="step2">Continuar</button>`, report);
    }
    const msg = cur.checked
      ? (cur.ok1 ? `<p class="fr-msg ok" role="status">¡Bien armada!</p>` : "")
      : `<p class="fr-msg">Cualquier orden correcto cuenta. Toca una ficha para quitarla.</p>`;
    const okDone = cur.checked && cur.ok1;
    const enf = okDone && !cur.hint ? enfasisHtml(f, cur) : "";
    cur.enf = !!enf;
    const fon = okDone && fonOn() ? builtFon(f, cur) : "";
    body.innerHTML = `<article class="fr-card card-frame pal-bl sh3d">
        <span class="fr-card-top"><span class="fr-badge">Arma la frase · paso <span class="num">1</span> de <span class="num">2</span></span>${okDone && canSpeak() ? `<button class="speak-btn fr-say" type="button" data-fr="say" aria-label="Escuchar en ruso"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg></button>` : ""}</span>
        <span class="fr-idea">${esc(f.idea)}</span>
        <span class="fr-div" aria-hidden="true"></span>
        <div class="answer-zone${zoneCls}" aria-label="Tu frase">${placed}</div>
        ${fon ? `<span class="fr-fon">${esc(fon)}</span>` : ""}
      </article>
      ${msg}${enf}${extra}
      ${okDone ? "" : `<div class="bank${cur.checked ? " spent" : ""}">${bank}</div>`}${foot}`;
    return;
  }
  // Paso 2
  const sentence = displaySentence(fr, cur);
  const showFon = f.fonetica && normSentence(sentence) === normSentence(f.texto || f.validas[0]);
  const speakOk = canSpeak();
  const opts = cur.options.map((o, i) => {
    let cls = "option";
    let key = i + 1;
    if (cur.choice !== null) {
      if (o === f.es) { cls += " correct"; key = "✓"; }
      else if (i === cur.choice) cls += " wrong";
    }
    return `<button class="${cls}" type="button" data-fopt="${i}"${cur.choice !== null ? " disabled" : ""}><span class="key">${key}</span><span class="opt-text"><span>${esc(o)}</span></span></button>`;
  }).join("");
  let foot;
  if (cur.choice === null) foot = dicBtn(f) ? `<div class="fr-foot"><div class="fr-actions one">${dicBtn(f)}</div></div>` : "";
  else {
    const report = !cur.ok2
      ? `<button class="link-quiet" type="button" data-fr="report2"${cur.reported ? " disabled" : ""}>${cur.reported ? "✓ Enviado, lo voy a revisar" : "Mi respuesta también es correcta"}</button>`
      : "";
    foot = frFoot(f, `<button class="btn btn-primary" type="button" data-fr="next">Continuar</button>`, report);
  }
  body.innerHTML = `<div class="sentence card-frame pal-bl">
      <span class="label">¿Qué dijiste? · paso <span class="num">2</span> de <span class="num">2</span></span>
      <div class="sentence-row"><div><span class="sentence-ru" lang="ru">${esc(sentence)}</span>${showFon ? `<span class="fon">${esc(f.fonetica)}</span>` : ""}</div>
      ${speakOk ? `<span class="pair"><button class="audio-btn" type="button" data-fr="say" aria-label="Escuchar la frase en ruso">${SPEAKER}</button>${slowBtn(sentence)}</span>` : ""}</div>
    </div>
    <p class="fr-msg">Elige la traducción de la frase que armaste:</p>
    <div class="options">${opts}</div>
    ${foot}`;
}

function goStep2() {
  const fr = state.fr;
  if (!fr) return;
  clearTimeout(fr.timer);
  const cur = fr.cur;
  cur.step = 2;
  cur.reported = false;
  renderFrase();
  if (store.settings.autoSpeak) speak(displaySentence(fr, cur), cur.rate);
}

function fraseClick(e) {
  const fr = state.fr;
  if (!fr) return;
  const cur = fr.cur;
  const f = fr.queue[0].f;
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.bank !== undefined && !cur.checked) {
    const i = Number(t.dataset.bank);
    cur.bank[i].used = true;
    cur.placed.push(i);
    return renderFrase();
  }
  if (t.dataset.ans !== undefined && !cur.checked) {
    const i = Number(t.dataset.ans);
    cur.placed = cur.placed.filter((x) => x !== i);
    cur.bank[i].used = false;
    return renderFrase();
  }
  if (t.dataset.say) return speak(t.dataset.say);
  if (t.dataset.fopt !== undefined && cur.choice === null) {
    cur.choice = Number(t.dataset.fopt);
    cur.ok2 = cur.options[cur.choice] === f.es;
    cur.reported = false;
    playSound(cur.ok2);
    renderFrase();
    // La última frase no avanza sola: terminas cuando toques Continuar.
    if (cur.ok2 && fr.queue.length > 1) fr.timer = setTimeout(() => { if (state.fr === fr && fr.cur === cur && $("#sheet").hidden) finishFraseItem(); }, AUTO_MS);
    return;
  }
  const act = t.dataset.fr;
  if (act === "hint") {
    if (!cur.hint) { cur.hint = 1; return renderFrase(); }
    cur.checked = true;
    cur.ok1 = false;
    cur.revealed = true;
    cur.err = null;
    playSound(false);
    return renderFrase();
  }
  if (act === "check") {
    cur.checked = true;
    cur.ok1 = fraseValid(f, builtTokens(cur));
    cur.err = cur.ok1 ? null : fraseError(f, cur);
    playSound(cur.ok1);
    renderFrase();
    // Al acertar (sin pista) pasa solo al paso 2.
    if (cur.ok1 && !cur.hint && !cur.enf) fr.timer = setTimeout(() => { if (state.fr === fr && fr.cur === cur && cur.step === 1 && $("#sheet").hidden) goStep2(); }, AUTO_MS);
    return;
  }
  if (act === "step2") return goStep2();
  if (act === "dic") {
    clearTimeout(fr.timer);
    return openDiccionario(fr.deck, f, cur.bank.map((b) => b.t), displaySentence(fr, cur));
  }
  if (act === "say") return speak(displaySentence(fr, cur), cur.rate);
  if (act === "report1" || act === "report2") {
    clearTimeout(fr.timer);
    cur.reported = true;
    if (act === "report1") cur.reported1 = true;
    store.report({
      mazo: fr.deck.id,
      frase_id: f.id,
      paso: act === "report1" ? "armar" : "traduccion",
      respuesta: act === "report1" ? builtSentence(cur) : cur.options[cur.choice],
      esperada: act === "report1" ? (f.texto || f.validas[0]) : f.es
    }).then((sent) => toast(sent ? "Gracias, lo voy a revisar" : "Guardado; se enviará cuando haya conexión"));
    return renderFrase();
  }
  if (act === "next") return finishFraseItem();
}

function finishFraseItem() {
  const fr = state.fr;
  if (!fr) return;
  clearTimeout(fr.timer);
  const cur = fr.cur;
  const item = fr.queue.shift();
  // Si reportaste que tu respuesta también era correcta, no se repite.
  const ok = (cur.ok1 && !cur.hint && cur.ok2) || (cur.reported1 && cur.ok2);
  store.setFrase(fraseKey(fr, item.f), ok);
  logActivity();
  if (ok) {
    fr.ok++;
    fr.results[fr.resolved++] = true;
  } else {
    fr.bad++;
    if (!item.failed) {
      item.failed = true;
      fr.queue.push(item);
    } else fr.results[fr.resolved++] = false;
  }
  if (fr.queue.length) newFraseItem();
  else {
    $("#done-title").textContent = "Frases terminadas";
    $("#done-summary").textContent = `${fr.ok} frases bien y ${fr.bad} para repasar. Las que fallaste volverán con una ficha de más para despistar.`;
    state.doneReturn = fr.returnTo;
    state.fr = null;
    show("done");
  }
}

// ---------- Hoja inferior (Diccionario, dudas) ----------
let sheetReturn = null;

function openSheet(title, html, sub = "") {
  sheetReturn = document.activeElement;
  $("#sheet-title").textContent = title;
  $("#sheet-sub").textContent = sub;
  $("#sheet-sub").hidden = !sub;
  $("#sheet-body").innerHTML = html;
  const wrap = $("#sheet");
  wrap.hidden = false;
  document.body.classList.add("sheet-on");
  syncHistory();
  for (const el of $$(".view, #nav")) el.inert = true;
  requestAnimationFrame(() => wrap.classList.add("on"));
  $("#sheet-close").focus();
}

function closeSheet() {
  const wrap = $("#sheet");
  if (wrap.hidden) return;
  wrap.classList.remove("on");
  document.body.classList.remove("sheet-on");
  for (const el of $$(".view, #nav")) el.inert = false;
  state.dic = null;
  state.cdic = null;
  wrap.classList.remove("sheet-cdic");
  const cdb = $("#cajas-dic");
  if (cdb) cdb.classList.remove("on");
  const done = () => { wrap.hidden = true; };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) done(); else setTimeout(done, 260);
  if (sheetReturn && document.contains(sheetReturn)) sheetReturn.focus();
  syncHistory();
}

// ---------- Diccionario y «Mis palabras» ----------
const MINE = "mis-palabras";

function mineId(forma) {
  return norm(forma);
}

function openDiccionario(deck, f, tokens, phrase) {
  const shown = new Set(tokens.map(norm));
  const seen = new Set();
  const entries = (f.diccionario || []).filter((d) => {
    const k = norm(d.ficha);
    if (!shown.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  state.dic = { deck, f, entries, phrase: phrase || "" };
  openSheet("Diccionario", dicHtml(), "Las palabras de esta frase, en su forma de diccionario.");
}

function dicHtml() {
  const { entries } = state.dic;
  const speakOk = canSpeak();
  const phrase = state.dic.phrase;
  const top = phrase ? `<div class="dic-phrase card-frame pal-bl"><div class="dp-txt"><span class="dp-ru" lang="ru">${esc(phrase)}</span>${state.dic.f.fonetica && fonOn() ? `<span class="fon">${esc(state.dic.f.fonetica)}</span>` : ""}</div>${speakOk ? `<span class="pair"><button class="audio-btn sm" type="button" data-say="${esc(phrase)}" aria-label="Escuchar la frase en ruso">${SPEAKER}</button>${slowBtn(phrase)}</span>` : ""}</div>` : "";
  return `${top}<div class="dic-list">${entries.map((d, i) => {
    const changed = norm(d.ficha) !== norm(d.forma);
    const on = store.inMine(mineId(d.forma));
    const porque = String(d.porque || "").trim();
    const why = porque ? porque.charAt(0).toLowerCase() + porque.slice(1) : "";
    return `<div class="dic-row">
      <div class="dic-top">
        ${speakOk ? `<button class="dic-say" type="button" data-dsay="${i}" aria-label="Escuchar ${esc(d.forma)}">${SPEAKER}</button>` : ""}
        <div class="dic-main">
          <span class="dic-words">${changed ? `<span class="dic-from" lang="ru">${esc(d.ficha)} →</span>` : ""}<span class="dic-forma" lang="ru">${esc(d.forma)}</span></span>
          <span class="dic-es">${esc(d.es)}${d.fonetica && fonOn() ? ` · <span class="dic-fon">${esc(d.fonetica)}</span>` : ""}</span>
        </div>
        <button class="dic-add${on ? " on" : ""}" type="button" data-dadd="${i}" aria-pressed="${on}">${on ? "En Mis palabras" : "+ Repasar"}</button>
      </div>
      ${why ? `<span class="dic-why"><b>Cambió:</b> ${esc(why)}</span>` : ""}
    </div>`;
  }).join("")}</div>`;
}

function dicClick(e) {
  const dic = state.dic;
  if (!dic) return;
  const say = e.target.closest("[data-dsay]");
  if (say) return speak(dic.entries[Number(say.dataset.dsay)].forma);
  const add = e.target.closest("[data-dadd]");
  if (!add) return;
  const i = Number(add.dataset.dadd);
  const d = dic.entries[i];
  const id = mineId(d.forma);
  const on = !store.inMine(id);
  store.setMine(id, {
    ru: d.forma, es: d.es, fonetica: d.fonetica || "", porque: d.porque || "", ficha: d.ficha,
    deck: dic.deck.id, frase: dic.f.texto || "", fraseFon: dic.f.fonetica || "", fraseEs: dic.f.es || ""
  }, on);
  rebuildMine();
  $("#sheet-body").innerHTML = dicHtml();
  const again = $(`#sheet-body [data-dadd="${i}"]`);
  if (again) again.focus();
  toast(on ? "Agregada a Mis palabras" : "Quitada de Mis palabras");
}

// Mazo personal: las palabras guardadas con «+ Repasar». Entra a la práctica
// diaria como cualquier otro tema.
function mineCards() {
  return store.mineList().map((w) => {
    const from = state.deckById.get(w.deck);
    return {
      id: `${MINE}:${w.id}`,
      deckId: MINE,
      kind: "word",
      ru: w.ru,
      es: w.es,
      tag: "",
      nota: w.ficha && norm(w.ficha) !== norm(w.ru) ? `En la frase: ${w.ficha}` : "",
      pista: `La guardaste de una frase${from ? ` de «${from.title}»` : ""}.`,
      fonetica: w.fonetica || "",
      seccion: "",
      ejemplo: w.frase ? { ru: w.frase, fonetica: w.fraseFon || "", es: w.fraseEs || "" } : null,
      tip: w.porque || "",
      q: undefined,
      a: undefined
    };
  });
}

function rebuildMine() {
  let deck = state.deckById.get(MINE);
  if (!deck) {
    deck = {
      id: MINE, index: state.decks.length, title: "Mis palabras", group: "Vocabulario",
      desc: "Las palabras que guardaste con «+ Repasar» en el Diccionario de las frases. Entran a tu práctica diaria.",
      aprender: null, frases: [], cards: [], mine: true
    };
    state.decks.push(deck);
    state.deckById.set(MINE, deck);
  }
  deck.cards = mineCards();
}

// ---------- Mini diálogos (tipo chat) ----------
// Lena escribe y tú contestas eligiendo una opción. Al acertar el chat avanza
// solo (≈1 s); al fallar se explica por qué y sigues cuando quieras.

const REDUCE = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const CHECK = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Correcta"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

function backFrom(where) {
  return where === "tema" || where === "temas" || where === "mapa" ? where : "home";
}

function startDialogo(deck, first) {
  const list = ejOf(deck, inRutaView()).dialogos;
  if (!list.length) return;
  const want = Number.isInteger(first) ? ejRaw(deck).dialogos[first] : null;
  const di = want && list.includes(want) ? list.indexOf(want) : 0;
  state.dl = { deck, list, di, ok: 0, bad: 0, es: false, timer: null, returnTo: state.view === "tema" ? "tema" : state.view };
  $("#dialogo-es").setAttribute("aria-pressed", "false");
  show("dialogo");
  beginDialog();
}

function beginDialog() {
  const dl = state.dl;
  clearTimeout(dl.timer);
  const d = dl.list[dl.di];
  dl.cur = { d, mi: 0, shown: [], wait: null, choice: null, fail: false, typing: false, finished: false };
  stepDialog();
}

function stepDialog() {
  const dl = state.dl;
  if (!dl) return;
  const c = dl.cur;
  if (c.mi >= c.d.mensajes.length) {
    c.typing = false;
    c.finished = true;
    return renderDialogo();
  }
  const m = c.d.mensajes[c.mi];
  if (m.opciones) {
    c.typing = false;
    c.wait = { m, opts: shuffle(m.opciones) };
    c.choice = null;
    return renderDialogo();
  }
  const mine = m.de === "yo";
  if (mine) {
    // Tu mensaje no se manda solo: esperas a tocarlo.
    c.typing = false;
    c.wait = { m, opts: [{ ru: m.ru, fonetica: m.fonetica, correcta: true, porque: m.es || "" }], send: true };
    c.choice = null;
    return renderDialogo();
  }
  c.typing = !mine;
  renderDialogo();
  dl.timer = setTimeout(() => {
    if (state.dl !== dl || dl.cur !== c) return;
    c.typing = false;
    c.shown.push({ m, mine });
    c.mi++;
    if (!mine && store.settings.autoSpeak) speak(m.ru);
    renderDialogo();
    dl.timer = setTimeout(stepDialog, REDUCE() ? 0 : 250);
  }, REDUCE() ? 0 : mine ? 300 : 650);
}

// QA (acento): la vocal fuerte (letra + acento) va marcada; й nunca se marca.
function accentHtml(t) {
  return esc(t).replace(/([аеёиоуыэюяАЕЁИОУЫЭЮЯ]\u0301)/g, `<span class="acc">$1</span>`);
}

function bubbleHtml(b, dl, first) {
  const m = b.m;
  const speakOk = canSpeak();
  const es = dl.es && m.es ? `<span class="b-es">${esc(m.es)}</span>` : "";
  if (b.mine) {
    return `<div class="b-row mine"><div class="bubble out${b.late ? " late" : ""}"><div class="b-main"><span class="b-ru" lang="ru">${esc(m.ru)}</span>${CHECK}</div>${m.fonetica ? `<span class="b-fon">${esc(m.fonetica)}</span>` : ""}${es}</div></div>`;
  }
  return `<div class="b-row">${first ? `<span class="b-name">${esc(m.de)}</span>` : ""}<div class="bubble in"><div class="b-main"><span class="b-ru" lang="ru">${esc(m.ru)}</span>${speakOk ? `<span class="pair"><button class="b-say" type="button" data-bsay="${esc(m.ru)}" aria-label="Escuchar el mensaje de ${esc(m.de)}">${SPEAKER}</button>${slowBtn(m.ru, "b-slow")}</span>` : ""}</div>${m.fonetica ? `<span class="b-fon">${esc(m.fonetica)}</span>` : ""}${es}</div></div>`;
}

function renderDialogo() {
  const dl = state.dl;
  const c = dl.cur;
  const other = (c.d.mensajes.find((m) => m.de !== "yo") || {}).de || "";
  $("#dialogo-sub").innerHTML = `${esc(other)} te escribe · <span class="num">${dl.di + 1}</span> de <span class="num">${dl.list.length}</span>`;
  const bubbles = c.shown.map((b, i) => bubbleHtml(b, dl, !b.mine && (i === 0 || c.shown[i - 1].mine))).join("");
  const typing = c.typing ? `<div class="b-row"><div class="typing" aria-label="Está escribiendo"><i></i><i></i><i></i></div></div>` : "";
  const mine = c.wait ? `<div class="b-row mine"><div class="typing mine" aria-label="Tu respuesta"><i></i><i></i><i></i></div></div>` : "";
  let foot = "";
  if (c.wait) {
    const m = c.wait.m;
    const answered = c.choice !== null;
    const opts = c.wait.opts.map((o, i) => {
      let cls = "chat-opt";
      let key = i + 1;
      if (answered) {
        if (o.correcta) { cls += " correct"; key = "✓"; }
        else if (i === c.choice) cls += " wrong";
      }
      return `<button class="${cls}" type="button" data-dopt="${i}"${answered ? " disabled" : ""} style="--ob:${["#ece7ff", "#e6ebff", "#f1eddf"][i % 3]};rotate:${[-0.6, 0.5, -0.4][i % 3]}deg"><span class="num key">${key}</span><span class="opt-text"><span class="ru-t" lang="ru">${accentHtml(o.ru)}</span>${o.fonetica ? `<span class="fon">${esc(o.fonetica)}</span>` : ""}</span></button>`;
    }).join("");
    let why = "";
    if (answered && c.fail) {
      const o = c.wait.opts[c.choice];
      why = `<section class="fr-error" role="status"><b>Casi. Mira por qué.</b><p>${esc(o.porque || "Esa opción no encaja aquí.")}</p></section>
        <section class="fr-ok-note"><span class="label">La correcta</span><p>${esc(c.wait.opts.find((x) => x.correcta).porque || "")}</p></section>
        <button class="btn btn-primary btn-wide" type="button" data-dnext="1">Continuar</button>`;
    }
    const accNote = !answered && c.wait.opts.some((o) => /и\u0301/.test(o.ru)) ? `<p class="chat-acc">La vocal fuerte va en color para que <span lang="ru">и\u0301</span> no se confunda con <span lang="ru">й</span>.</p>` : "";
    foot = `<div class="chat-foot"><span class="chat-q${c.wait.send ? "" : " chat-stk"}">${c.wait.send ? "Toca tu mensaje para enviarlo" : "¿Qué le contestas?"}</span>${opts}${accNote}${why}</div>`;
  } else if (c.hold) {
    foot = `<div class="chat-foot"><button class="btn btn-primary btn-wide" type="button" data-dnext="3">Continuar</button></div>`;
  } else if (c.finished) {
    const last = dl.di >= dl.list.length - 1;
    foot = `<div class="chat-foot"><p class="chat-end">${c.fail ? "Diálogo terminado. Lo repasas cuando quieras." : "¡Diálogo completo!"}</p><button class="btn btn-primary btn-wide" type="button" data-dnext="2">${last ? "Terminar" : "Siguiente diálogo"}</button></div>`;
  }
  $("#dialogo-body").innerHTML = `<div class="chat" aria-live="polite">${bubbles}${typing}${mine}</div>${foot}`;
  // Solo se anima la burbuja nueva; las que ya estaban no vuelven a aparecer (antes todo el chat parpadeaba).
  const seen = c.seenN || 0;
  $$("#dialogo-body .bubble").forEach((el, i) => { if (i < seen) el.style.animation = "none"; });
  c.seenN = c.shown.length;
  const f = $("#dialogo-body .chat-foot");
  if (f) f.scrollIntoView({ block: "end", behavior: REDUCE() ? "auto" : "smooth" });
}

function dialogoClick(e) {
  const dl = state.dl;
  if (!dl) return;
  const c = dl.cur;
  const say = e.target.closest("[data-bsay]");
  if (say) return speak(say.dataset.bsay);
  const o = e.target.closest("[data-dopt]");
  if (o && c.wait && c.choice === null) {
    const i = Number(o.dataset.dopt);
    const opt = c.wait.opts[i];
    c.choice = i;
    playSound(!!opt.correcta);
    if (opt.correcta) {
      c.shown.push({ m: { ...c.wait.m, ru: opt.ru, fonetica: opt.fonetica }, mine: true });
      c.mi++;
      c.wait = null;
      // Tu última respuesta no avanza sola: sigues cuando toques Continuar.
      if (!c.d.mensajes.slice(c.mi).some((x) => x.de === "yo")) {
        c.hold = true;
        return renderDialogo();
      }
      renderDialogo();
      dl.timer = setTimeout(() => { if (state.dl === dl && dl.cur === c) stepDialog(); }, 1000);
    } else {
      c.fail = true;
      renderDialogo();
    }
    return;
  }
  const n = e.target.closest("[data-dnext]");
  if (!n) return;
  if (n.dataset.dnext === "3") {
    c.hold = false;
    return stepDialog();
  }
  if (n.dataset.dnext === "1") {
    // Después de un error: se muestra la respuesta correcta y sigue el chat.
    const right = c.wait.opts.find((x) => x.correcta);
    c.shown.push({ m: { ...c.wait.m, ru: right.ru, fonetica: right.fonetica }, mine: true, late: true });
    c.mi++;
    c.wait = null;
    c.choice = null;
    return stepDialog();
  }
  // Fin del diálogo
  store.setEjer(c.d.id, !c.fail);
  logActivity();
  if (c.fail) dl.bad++; else dl.ok++;
  if (dl.di < dl.list.length - 1) {
    dl.di++;
    return beginDialog();
  }
  finishEjer("Diálogos terminados", `${dl.ok} de ${dl.list.length} sin errores. Los que tuvieron errores los puedes repetir cuando quieras.`, dl.returnTo);
  state.dl = null;
}

function finishEjer(title, summary, returnTo) {
  $("#done-title").textContent = title;
  $("#done-summary").textContent = summary;
  state.doneReturn = returnTo;
  show("done");
}

// ---------- Cajas ----------
// Tocas una palabra y luego su caja. Antes de empezar sale una pantalla que explica
// el ejercicio. Si el ejercicio trae "cajas_es" y "es" en cada palabra, se puede
// hacer «en español» (cajas en ruso, fichas en español) o «en ruso» (todo en ruso);
// el significado de cada caja solo se ve con su botón ?. Si te equivocas, la palabra
// regresa a «Faltan», se explica por qué y lo intentas de nuevo (4.1.0).

const BOX_PALS = ["bl", "pe", "li", "pk"];

// Botón ? de cada caja: basta con la traducción de las cajas (cajas_es).
function cajaHasHelp(e) {
  return Array.isArray(e.cajas_es) && e.cajas_es.length === e.cajas.length;
}

// Diccionario de Cajas: explicación corta de cada forma (botón ? junto a la etiqueta).
const GRAM_TAGS = {
  "dativo": "Dativo: la forma de la persona a quien le pasa algo. мне стра́шно = me da miedo.",
  "у + genitivo": "Después de у, я cambia a меня́. У меня́ есть… = tengo…",
  "palabra de estado": "Palabra de estado: dice cómo te sientes. Va con мне: мне смешно́ = me da risa.",
  "neutro": "Neutro: la forma para cosas neutras (las que terminan en -о o -е). мой cambia a моё: э́то моё письмо́ = es mi carta.",
};
const BOOK_ICO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>`;

function cajaHasDic(e) {
  return Array.isArray(e.diccionario) && e.diccionario.length > 0;
}

function openCajasDic() {
  const cj = state.cj;
  if (!cj) return;
  const e = cj.list[cj.ci];
  if (!cajaHasDic(e)) return;
  state.cdic = { entries: e.diccionario, open: null };
  marcarAyuda("cajas-dic");
  cj.dicSeen = true; // maqueta K5: la flecha «búscala aquí» ya no sale después de abrirlo
  $("#cajas-dic-hint").hidden = true;
  $("#cajas-dic").classList.add("on");
  $("#sheet").classList.add("sheet-cdic");
  openSheet("Diccionario", cajasDicHtml(), "Si una palabra cambió, primero va su forma de diccionario.");
  $("#sheet-title").innerHTML = `<span class="h-sec-head"><span class="h-sec-t">Diccionario<svg viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true"><path d="M2 5c12-4 22 3 36 0s24-4 38-1 26 3 42-1"/></svg></span><span class="h-sec-ru" lang="ru">слова́рь</span></span>`;
}

// Texto mixto: las palabras en ruso van con su letra (PT Sans) y en un <span lang="ru">.
function ruSpans(t) {
  return esc(t).replace(/[а-яё\u0301]+(?:[\s,?!]+[а-яё\u0301]+)*[?!]?/gi, (w) => `<span lang="ru">${w}</span>`);
}

// «Dativo: la forma…» → etiqueta en negritas y el ruso con su letra.
function gramTagHtml(t) {
  const m = String(t).match(/^([^:]{1,30}):\s*(.*)$/);
  const ru = (x) => esc(x).replace(/[а-яё\u0301]+(?:\s+[а-яё\u0301]+)*/gi, (w) => `<span lang="ru">${w}</span>`);
  return m ? `<b>${esc(m[1])}:</b> ${ru(m[2])}` : ru(t);
}

// 4.2.0: parada de gramática que explica una etiqueta del Diccionario («después de 2, 3, 4»).
function paradaForTag(tag) {
  if (!tag || !state.paradas) return null;
  const k = norm(tag);
  for (const p of state.paradas.values()) if ((p.tags || []).some((t) => norm(t) === k)) return p;
  return null;
}
function tagHelp(tag) {
  if (GRAM_TAGS[tag]) return GRAM_TAGS[tag];
  const p = paradaForTag(tag);
  return p ? `${cap(tag)}: ${(p.puntos || [])[0] || p.titulo}` : "";
}

function cajasDicHtml() {
  const { entries, open } = state.cdic;
  return `<div class="dic-list">${entries.map((d, i) => {
    const tag = d.tag || "";
    const help = tagHelp(tag);
    const isOpen = open === i && help;
    return `<div class="dic-row cdic-row${isOpen ? ` open card-frame pal-${BOX_PALS[i % BOX_PALS.length]}` : ""}">
      <span class="cdic-words">${d.dic ? `<span class="dic-from" lang="ru">${esc(d.dic)}</span><span class="cdic-arrow" aria-hidden="true">→</span>` : ""}<span class="dic-forma" lang="ru">${esc(d.forma)}</span>${tag ? `<span class="cdic-tag">${esc(tag)}</span>` : ""}${tag && help ? `<button class="cdic-q" type="button" data-ctag="${i}" aria-expanded="${!!isOpen}" aria-label="Qué quiere decir ${esc(tag)}">?</button>` : ""}</span>
      <span class="cdic-es">= ${esc(d.es)}</span>
      ${isOpen ? `<div class="cdic-expl" role="status"><span>${gramTagHtml(help)}</span><button class="cdic-gram" type="button" data-cgram="${i}">Repasar gramática →</button></div>` : ""}
    </div>`;
  }).join("")}</div>`;
}

function cajasDicClick(e) {
  const cd = state.cdic;
  if (!cd) return false;
  const q = e.target.closest("[data-ctag]");
  if (q) {
    const i = Number(q.dataset.ctag);
    cd.open = cd.open === i ? null : i;
    $("#sheet-body").innerHTML = cajasDicHtml();
    const again = $(`#sheet-body [data-ctag="${i}"]`);
    if (again) again.focus();
    return true;
  }
  const g = e.target.closest("[data-cgram]");
  if (g) {
    // 4.2.0: abre la parada que tiene esa etiqueta; si no hay, el índice de Gramática.
    const tag = cd.entries[Number(g.dataset.cgram)].tag || "";
    closeSheet();
    const p = paradaForTag(tag);
    if (p) openParada(p.id, { from: "cajas", tag, sub: "Desde el Diccionario de Cajas" });
    else openGramIndice("cajas");
    return true;
  }
  return false;
}

function cajaHasEs(e) {
  return Array.isArray(e.cajas_es) && e.cajas_es.length === e.cajas.length && e.items.every((it) => it.es);
}

function startCajas(deck, first) {
  const list = ejOf(deck, inRutaView()).cajas;
  if (!list.length) return;
  // Empieza en el primer ejercicio que aún no terminas: el avance se queda guardado.
  let ci = list.findIndex((x) => { const r = store.ejer(x.id); return !(r && r.ok > 0); });
  if (ci < 0) ci = 0;
  const want = Number.isInteger(first) ? ejRaw(deck).cajas[first] : null;
  if (want && list.includes(want)) ci = list.indexOf(want);
  state.cj = { deck, list, ci, ok: 0, bad: 0, stage: "intro", returnTo: state.view === "tema" ? "tema" : state.view };
  show("cajas");
  renderCajasIntro();
}

function renderCajasIntro() {
  const cj = state.cj;
  const e = cj.list[cj.ci];
  const es = cajaHasEs(e);
  $("#cajas-title").textContent = "Cajas";
  $("#cajas-dic").hidden = !cajaHasDic(e);
  $("#cajas-sub").textContent = cj.deck && cj.deck.title ? cj.deck.title : "";
  const minis = e.cajas.map((n, k) => `<span class="cx-mini card-frame pal-${BOX_PALS[k % BOX_PALS.length]}"${/[а-яё]/i.test(n) ? ' lang="ru"' : ""}>${esc(n)}</span>`).join("");
  const help = es || cajaHasHelp(e);
  const tilt = [-3, 2, -1.5, 2.5];
  const minis2 = e.cajas.map((n, k) => `<span class="a2-chip pal-${BOX_PALS[k % BOX_PALS.length]}" style="rotate:${tilt[k % 4]}deg"${/[а-яё]/i.test(n) ? ' lang="ru"' : ""}>${esc(n)}</span>`).join("");
  const steps = [];
  steps.push(es ? `<b>Hazlo en español.</b> ¿Quieres un reto extra? ¡En ruso!` : `<b>Toca una palabra</b> y luego su caja.`);
  if (help) steps.push(`<b>¿Dudas?</b> Toca <span class="cx-q-ico" aria-hidden="true">?</span> para ver el significado.`);
  // Maqueta K0: el Diccionario se señala con la flecha de arriba (sin paso aparte).
  steps.push(`<b>Tómate tu tiempo.</b> Cada ejercicio terminado se guarda; uno a medias vuelve a empezar. <span class="a2-easy">Take it easy!</span>`);
  $("#cajas-body").innerHTML = `<div class="cx-intro">
      <section class="cx-intro-card a2-card pal-pk">
        <div class="a2-kicker"><span class="a2-kic-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="9" width="8" height="11" rx="1.5"/><rect x="13" y="9" width="8" height="11" rx="1.5"/><path d="M7 5v4M17 5v4"/></svg></span><span>ANTES DE EMPEZAR</span></div>
        <h2 class="a2-h"><span class="a2-h-s">Ya conoces las palabras.</span><span class="a2-h-b">¿Las puedes <span class="a2-u">relacionar?<svg viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true"><path d="M2 5c12-4 22 3 36 0s24-4 38-1 26 3 42-1"/></svg></span></span></h2>
        <div class="a2-chips">${minis2}</div>
        <ol class="a2-steps">${steps.map((t, i) => `<li><span class="a2-step-n num" aria-hidden="true">${i + 1}</span><span>${t}</span></li>`).join("")}</ol>
      </section>
      ${es ? `<button class="btn btn-primary btn-wide a2-go" type="button" data-cstart="es">Empezar en español</button>
      <button class="btn btn-line btn-wide cx-ru-btn a2-ru" type="button" data-cstart="ru"><span class="cx-tag">Reto extra</span>En ruso<span class="a2-ru-t" lang="ru">· по-ру́сски</span></button>`
        : `<button class="btn btn-primary btn-wide a2-go" type="button" data-cstart="ru">Empezar</button>`}
    </div>`;
  $("#cajas-dic-hint").hidden = true;
  $("#view-cajas").classList.add("cx-at-intro"); // maqueta K0: sin «Reportar falla» antes de empezar
}

function beginCaja(lang) {
  const cj = state.cj;
  const e = cj.list[cj.ci];
  cj.stage = "play";
  $("#view-cajas").classList.remove("cx-at-intro");
  cj.cur = {
    e,
    lang: lang === "es" && cajaHasEs(e) ? "es" : "ru",
    bank: shuffle(e.items.map((it, i) => ({ ...it, i }))),
    boxes: e.cajas.map(() => []),
    sel: null,
    err: null,
    good: null,
    help: -1,
    fail: false,
    done: 0
  };
  renderCajas();
}

// Tamaño del nombre de la caja según su palabra más larga, para que nunca se salga ni se corte.
function boxSize(name) {
  const longest = String(name).replace(/́/g, "").split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0);
  const total = String(name).length;
  if (longest <= 5 && total <= 8) return "s1";
  if (longest <= 8 && total <= 12) return "s2";
  if (longest <= 10) return "s3";
  return "s4";
}

// Al fallar no se dice en qué caja va: se quita lo que viene después de los dos puntos
// cuando ahí está la respuesta en ruso («Dice un momento: когда́.» → «Dice un momento.»).
function cajaPista(porque) {
  const m = String(porque).match(/^(.*?):\s*[^:]*[а-яё][^:]*$/i);
  return m ? m[1] + "." : porque;
}

function cajaWord(c, it) {
  return c.lang === "es" ? it.es : it.ru;
}

function renderCajas() {
  const cj = state.cj;
  const c = cj.cur;
  const e = c.e;
  const total = e.items.length;
  const hasEs = cajaHasHelp(e);
  $("#cajas-dic").hidden = !cajaHasDic(e);
  $("#cajas-dic-hint").hidden = !cajaHasDic(e) || c.done === total || !!cj.dicSeen || !ayudaOn("cajas-dic"); // maquetas K4/K5: visible mientras juegas, hasta abrir el Diccionario
  const wordLang = c.lang === "es" ? "" : ' lang="ru"';
  $("#cajas-title").textContent = "Cajas";
  $("#cajas-sub").textContent = cj.deck && cj.deck.title ? cj.deck.title : "";
  const phase = cajaHasEs(e)
    ? (c.lang === "es" ? `<span class="cx-phase">Fase 1 · en español</span>` : `<span class="cx-phase ru">Fase 2 · ahora en ruso</span>`)
    : "";
  const countRow = `<div class="cx-count-row">${phase}<span class="cx-count"><span class="num">${c.done}</span> de <span class="num">${total}</span> acomodadas</span></div>`;
  const finished = c.done === total;
  const boxes = e.cajas.map((name, k) => {
    const items = c.boxes[k];
    const chips = items.map((x) => `<span class="cx-chip${c.lang === "es" ? " es" : ""}"${wordLang}>${esc(cajaWord(c, x))}</span>`).join("");
    const active = c.sel !== null && !finished;
    const help = hasEs ? `<button class="cbox-help" style="color: var(--ink-${BOX_PALS[k % BOX_PALS.length]})" type="button" data-chelp="${k}" aria-label="Qué significa ${esc(name)}" aria-expanded="${c.help === k}">?</button>` : "";
    const tip = hasEs && c.help === k
      ? `<p class="cbox-tip" role="status"><b><span lang="ru">${esc(name)}</span> = ${esc(e.cajas_es[k])}</b>${e.cajas_uso && e.cajas_uso[k] ? `<span class="cbox-uso">${esc(e.cajas_uso[k])}</span>` : ""}</p>`
      : "";
    return `<div class="cbox-wrap"><button class="cbox card-frame pal-${BOX_PALS[k % BOX_PALS.length]}${active ? " ready" : ""}${hasEs ? " has-help" : ""}" type="button" data-box="${k}" aria-label="Caja ${esc(name)}"${active ? "" : " disabled"}><span class="cbox-name ${boxSize(name)}"${/[а-яё]/i.test(name) ? ' lang="ru"' : ""}>${esc(name)}</span>${chips ? `<span class="cbox-chips">${chips}</span>` : ""}${tip}</button>${help}</div>`;
  }).join("");
  let msg = "";
  if (c.err) {
    const it = c.err.item;
    msg = `<section class="fr-error" role="status"><b>«<span${wordLang}>${esc(cajaWord(c, it))}</span>» no va en <span lang="ru">${esc(e.cajas[c.err.k])}</span>.</b><p>${esc(cajaPista(it.porque))}</p><p class="cx-retry">Inténtalo de nuevo</p></section>`;
  } else if (c.good) {
    msg = `<p class="cx-good" role="status"><b>¡Bien!</b> ${esc(c.good.porque)}</p>`;
  }
  const bank = c.bank.map((x) => `<button class="cx-pick${c.lang === "es" ? " es" : ""}${c.sel === x.i ? " on" : ""}${c.err && c.err.item.i === x.i ? " bad" : ""}" type="button"${wordLang} data-pick-item="${x.i}" aria-pressed="${c.sel === x.i}">${esc(cajaWord(c, x))}</button>`).join("");
  let btns = "";
  if (finished) {
    const last = cj.ci >= cj.list.length - 1;
    btns = c.lang === "es"
      ? `<button class="btn btn-primary btn-wide cx-btn" type="button" data-cnext="ru">Ahora en ruso</button>
         <button class="btn btn-line btn-wide" type="button" data-cnext="next">${last ? "Terminar" : "Siguiente ejercicio"}</button>`
      : `<button class="btn btn-primary btn-wide cx-btn" type="button" data-cnext="next">${last ? "Terminar" : "Siguiente ejercicio"}</button>`;
  }
  const hint = finished
    ? (c.fail ? "Listo. Repásalo cuando quieras." : "¡Todo en su caja!")
    : `Toca una ${e.items.some((it) => /…|\s/.test(String(cajaWord(c, it)).trim())) ? "frase" : "palabra"} y luego su caja.`;
  $("#cajas-body").innerHTML = `${countRow}<p class="cx-hint cx-hint-main">${hint}</p>
    <div class="cboxes" style="--n:${e.cajas.length}">${boxes}</div>
    ${msg}
    ${c.bank.length ? `<div class="cx-bank"><span class="chat-q">Faltan</span><div class="cx-picks">${bank}</div></div>` : ""}
    ${btns}`;
  const sc = c.err ? $("#cajas-body .fr-error") : null;
  if (sc) sc.scrollIntoView({ block: "nearest", behavior: REDUCE() ? "auto" : "smooth" });
}

function finishCaja() {
  const cj = state.cj;
  const c = cj.cur;
  store.setEjer(c.e.id, !c.fail);
  logActivity();
  if (c.fail) cj.bad++; else cj.ok++;
}

function cajasClick(e) {
  const cj = state.cj;
  if (!cj) return;
  const start = e.target.closest("[data-cstart]");
  if (start && cj.stage === "intro") { cj.mode = start.dataset.cstart; return beginCaja(cj.mode); }
  const c = cj.cur;
  if (!c) return;
  const help = e.target.closest("[data-chelp]");
  if (help) {
    const k = Number(help.dataset.chelp);
    c.help = c.help === k ? -1 : k;
    return renderCajas();
  }
  const pick = e.target.closest("[data-pick-item]");
  if (pick) {
    const i = Number(pick.dataset.pickItem);
    c.sel = c.sel === i ? null : i;
    c.err = null;
    c.good = null;
    return renderCajas();
  }
  const box = e.target.closest("[data-box]");
  if (box && c.sel !== null) {
    const k = Number(box.dataset.box);
    const idx = c.bank.findIndex((x) => x.i === c.sel);
    const item = c.bank[idx];
    c.sel = null;
    if (item.caja === c.e.cajas[k]) {
      c.bank.splice(idx, 1);
      c.boxes[k].push(item);
      c.done++;
      c.err = null;
      c.good = item;
      playSound(true);
    } else {
      // La palabra regresa a «Faltan»: se explica por qué y lo intentas de nuevo.
      c.fail = true;
      c.err = { item, k };
      c.good = null;
      playSound(false);
    }
    return renderCajas();
  }
  const n = e.target.closest("[data-cnext]");
  if (!n) return;
  if (n.dataset.cnext === "ru") {
    // Reto extra: el mismo ejercicio, ahora todo en ruso.
    finishCaja();
    return beginCaja("ru");
  }
  if (c.lang === "ru" || n.dataset.cnext === "next") finishCaja();
  if (cj.ci < cj.list.length - 1) {
    cj.ci++;
    return beginCaja(cj.mode);
  }
  finishEjer("Cajas terminadas", `${cj.ok} de ${cj.ok + cj.bad} rondas sin errores. Tu avance se queda guardado; repítelas cuando quieras.`, cj.returnTo);
  state.cj = null;
}

// ---------- Retos de gramática por bloques (piloto: Saludos) ----------
// Cada bloque junta varias tarjetas del tema. El reto se abre cuando cada
// tarjeta lleva 3 aciertos seguidos sin pista (en la práctica o al practicar el
// bloque) o el repaso espaciado ya la acertó 2 veces seguidas, lo que pase
// primero. Se elige entre 2 explicaciones; si fallas, se enseña la regla y
// repasas el bloque una vez antes de intentarlo de nuevo.
const RETO_LIMPIO = 3;
const RETO_REPS = 2;
const RETO_PALS = ["lav", "pe", "bl", "li"];

function retoCards(deck, r) {
  return r.tarjetas.map((ru) => deck.cards.find((c) => c.ru === ru)).filter(Boolean);
}

function cardReady(c) {
  return keysFor(c).every((k) => {
    const st = store.card(k);
    return store.limpio(k) >= RETO_LIMPIO || (st && st.reps >= RETO_REPS);
  });
}

function retoState(deck, r) {
  const cards = retoCards(deck, r);
  const ready = cards.filter(cardReady).length;
  const res = store.ejer(`reto:${deck.id}:${r.id}`);
  return { cards, ready, total: cards.length, open: cards.length > 0 && ready === cards.length, done: !!(res && res.ok > 0) };
}

function openReto(deck) {
  if (!deck.retos.length) return;
  state.reto = { deckId: deck.id, block: null, from: state.view === "tema" ? "tema" : state.view, order: null, pick: null };
  renderReto();
  show("reto");
}

function retoDeck() {
  return state.reto ? state.deckById.get(state.reto.deckId) : null;
}

function renderReto() {
  const deck = retoDeck();
  if (!deck) return;
  const R = state.reto;
  const r = R.block && deck.retos.find((x) => x.id === R.block);
  $("#reto-sub").textContent = deck.title;
  const body = $("#reto-body");
  if (!r) {
    $("#reto-title").textContent = "Reto de gramática";
    body.innerHTML = `<p class="cx-hint">Practica las palabras de cada bloque. Cuando te las sepas, descubre qué tienen en común.</p>
      ${deck.retos.map((b, i) => {
        const s = retoState(deck, b);
        const pct = s.total ? Math.round((s.ready / s.total) * 100) : 0;
        const status = s.done ? "Superado" : s.open ? "Listo para el reto" : `<span class="num">${s.ready}</span> de <span class="num">${s.total}</span> palabras listas`;
        return `<button class="reto-blk card-frame pal-${RETO_PALS[i % RETO_PALS.length]}" type="button" data-blk="${esc(b.id)}">
          <span class="reto-n num" aria-hidden="true">${i + 1}</span>
          <span class="reto-blk-body">
            <span class="reto-blk-title">${esc(b.titulo)}</span>
            <span class="reto-blk-sub">${s.done ? `<i aria-hidden="true">✓</i> ` : ""}${status}</span>
            ${s.done ? "" : `<span class="bar"><span style="width:${pct}%"></span></span>`}
          </span>
        </button>`;
      }).join("")}`;
    return;
  }

  const i = deck.retos.indexOf(r);
  const s = retoState(deck, r);
  $("#reto-title").textContent = `Bloque ${i + 1}`;
  const pal = RETO_PALS[i % RETO_PALS.length];
  const chunks = r.muestra.map((m) => `<div class="reto-chunk card-frame pal-${pal}">
      <div><span class="reto-ru" lang="ru">${esc(m.ru)}</span><span class="reto-es">${esc(m.es)}</span></div>
      ${s.open ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>` : ""}
    </div>`).join("");
  const head = `<p class="label">${esc(r.titulo)}</p>${chunks}`;

  if (!s.open) {
    body.innerHTML = `${head}
      <div class="fr-ok-note reto-lock"><p>Para abrir el reto, acierta cada palabra <span class="num">3</span> veces seguidas sin pista. Llevas <span class="num">${s.ready}</span> de <span class="num">${s.total}</span> listas.</p></div>
      <button class="btn btn-primary btn-wide reto-cta" type="button" data-reto-act="practicar">Practicar el bloque</button>`;
    return;
  }

  if (!R.order) R.order = Math.random() < 0.5 ? [0, 1] : [1, 0];
  const texts = [r.correcta, r.incorrecta];
  const picked = R.pick;
  const opts = R.order.map((k, j) => {
    let cls = "option";
    if (picked !== null) cls += k === 0 ? " correct" : picked === k ? " wrong" : "";
    return `<button class="${cls}" type="button" data-reto-opt="${k}"${picked !== null ? " disabled" : ""}><span class="key num">${j + 1}</span><span class="opt-text"><span>${esc(texts[k])}</span></span></button>`;
  }).join("");
  let result = "";
  if (picked === 0) {
    const last = i >= deck.retos.length - 1;
    result = `<div class="fr-ok-note"><p><b>¡Eso!</b> ${esc(r.bien)}</p>${r.nombre ? `<p class="reto-nombre">${esc(r.nombre)}</p>` : ""}</div>
      <button class="btn btn-primary btn-wide reto-cta" type="button" data-reto-act="${last ? "lista" : "siguiente"}">${last ? "Volver a los bloques" : "Siguiente bloque"}</button>`;
  } else if (picked === 1) {
    result = `<div class="fr-error"><p><b>Casi.</b> ${esc(r.mal)}</p>${r.nombre ? `<p class="reto-nombre">${esc(r.nombre)}</p>` : ""}<p>Fíjate en eso al repasar.</p></div>
      <button class="btn btn-primary btn-wide reto-cta" type="button" data-reto-act="repasar">Repasar el bloque una vez más</button>`;
  }
  body.innerHTML = `${head}
    <p class="reto-q">${esc(r.pregunta)}</p>
    <div class="options">${opts}</div>
    ${result}`;
}

function retoBlockSession(deck, r, again) {
  const items = [];
  for (const card of retoCards(deck, r)) {
    for (const key of keysFor(card)) {
      items.push({ card, key, dir: key.split("|").pop(), phase: store.card(key) ? "quiz" : "learn", failed: false, hint: 0 });
    }
  }
  // Sin cambiar el calendario de repaso: cuenta para los aciertos sin pista.
  startSession(shuffle(items), again ? `Repaso · ${r.titulo}` : r.titulo, true, "reto");
}

function retoClick(e) {
  const deck = retoDeck();
  if (!deck) return;
  const R = state.reto;
  const blk = e.target.closest("[data-blk]");
  if (blk) {
    R.block = blk.dataset.blk;
    R.order = null;
    R.pick = null;
    renderReto();
    window.scrollTo(0, 0);
    return;
  }
  const r = R.block && deck.retos.find((x) => x.id === R.block);
  if (!r) return;
  const opt = e.target.closest("[data-reto-opt]");
  if (opt && R.pick === null) {
    R.pick = Number(opt.dataset.retoOpt);
    const ok = R.pick === 0;
    playSound(ok);
    store.setEjer(`reto:${deck.id}:${r.id}`, ok);
    logActivity();
    renderReto();
    return;
  }
  const act = e.target.closest("[data-reto-act]");
  if (!act) return;
  const a = act.dataset.retoAct;
  if (a === "practicar") return retoBlockSession(deck, r, false);
  if (a === "repasar") {
    R.order = null;
    R.pick = null;
    return retoBlockSession(deck, r, true);
  }
  if (a === "siguiente") {
    const i = deck.retos.indexOf(r);
    R.block = deck.retos[i + 1].id;
  } else R.block = null;
  R.order = null;
  R.pick = null;
  renderReto();
  window.scrollTo(0, 0);
}

function retoBack() {
  const R = state.reto;
  if (R && R.block) {
    R.block = null;
    R.order = null;
    R.pick = null;
    renderReto();
    window.scrollTo(0, 0);
    return;
  }
  backTo(R ? R.from : "home");
}

// ---------- Aprende a leer ----------
const LEER_PAL = ["mint", "pe", "bl", "li", "pk", "kh"];
const LEER_KIND = ["Letra amiga", "Falsa amiga", "Letra nueva", "Acento", "Suaves y duras", "Se lee distinto"];
const LEER_SHORT = ["Amigas", "Falsas amigas", "Nuevas", "Acento y О", "Suaves y duras", "Leer palabras"];

function leerDone() {
  const pasos = state.lectura ? state.lectura.pasos : [];
  return pasos.filter((p) => store.lectura(p.id)).length;
}

function openLeer() {
  if (!state.lectura) return toast("No se pudo cargar la lectura.");
  state.leerFrom = ["mapa", "home", "modulo"].includes(state.view) ? state.view : "temas";
  const pasos = state.lectura.pasos;
  const first = pasos.findIndex((p) => !store.lectura(p.id));
  state.leer = { step: first < 0 ? 0 : first, sel: 0 };
  renderLeer();
  show("leer");
}

function renderLeer() {
  const pasos = state.lectura.pasos;
  const { step, sel } = state.leer;
  const p = pasos[step];
  $("#leer-paso").innerHTML = `Paso <span class="num">${step + 1}</span> de <span class="num">${pasos.length}</span>`;
  $("#leer-steps").innerHTML = pasos.map((x, i) => {
    const done = !!store.lectura(x.id);
    const cls = done ? "done" : i === step ? "now" : "";
    return `<button class="step ${cls}" type="button" role="tab" data-step="${i}" aria-selected="${i === step}" aria-label="Paso ${i + 1}: ${esc(LEER_SHORT[i] || x.titulo)}${done ? ", visto" : ""}"><i></i><span>${esc(LEER_SHORT[i] || x.titulo)}</span></button>`;
  }).join("");
  const pal = LEER_PAL[step % LEER_PAL.length];
  const L = p.letras[sel] || p.letras[0];
  const speakOk = canSpeak();
  const wide = L.letra.length > 7;
  const hasSound = L.sonido && L.sonido !== "—";
  const big = `<section class="leer-big card-frame pal-${pal}">
    <span class="label">${esc(LEER_KIND[step] || "Letra")}</span>
    <div class="leer-row">
      <span class="leer-letra${wide ? " wide" : ""}" lang="ru">${esc(L.letra)}</span>
      <div class="leer-txt"><b>${esc(L.tip)}</b><span>${esc(L.como_suena)}</span>${hasSound ? `<span class="leer-son">Suena: <b>${esc(L.sonido)}</b></span>` : ""}</div>
    </div>
    ${(L.ejemplos || []).map((x) => `<div class="leer-ex"><div><span class="leer-ex-ru" lang="ru">${esc(x.ru)}</span><span class="leer-ex-fon">${esc(x.fonetica)} · ${esc(x.es)}</span></div>${speakOk ? `<button class="audio-btn" type="button" data-lsay="${esc(x.ru)}" aria-label="Escuchar ${esc(x.ru)}">${SPEAKER}</button>` : ""}</div>`).join("")}
  </section>`;
  const tiles = p.letras.map((l, i) => {
    const snd = l.sonido && l.sonido !== "—";
    const w = l.letra.length > 7;
    return `<button class="ltile card-frame pal-${pal}${i === sel ? " on" : ""}${w ? " wide" : ""}" type="button" data-lsel="${i}" aria-pressed="${i === sel}" aria-label="${esc(l.letra)}${snd ? ", suena " + esc(l.sonido) : ""}"><span class="ltile-l" lang="ru">${esc(l.letra)}</span>${snd && !w ? `<span class="ltile-s">${esc(l.sonido)}</span>` : ""}</button>`;
  }).join("");
  const practica = (p.practica || []).map((x) => `<div class="lprac"><div><span class="lprac-ru" lang="ru">${esc(x.ru)}</span><span class="lprac-fon">${esc(x.fonetica)} · ${esc(x.es)}</span></div>${speakOk ? `<button class="dic-say" type="button" data-lsay="${esc(x.ru)}" aria-label="Escuchar ${esc(x.ru)}">${SPEAKER}</button>` : ""}</div>`).join("");
  const last = step >= pasos.length - 1;
  $("#leer-body").innerHTML = `<p class="leer-intro">${esc(p.intro)}</p>
    ${big}
    <div class="row-between sec-row"><h2 class="sec-h">${esc(p.titulo.replace(/^\d+\.\s*/, ""))}</h2><span class="muted small-note">Toca una para verla</span></div>
    <div class="ltiles">${tiles}</div>
    ${practica ? `<h2 class="sec-h">Léelas en voz alta</h2><div class="lpracs">${practica}</div>` : ""}
    <button class="btn btn-primary btn-wide" type="button" data-lnext="1">${last ? "Terminar lectura" : "Listo, siguiente paso"}</button>`;
}

function leerClick(e) {
  const say = e.target.closest("[data-lsay]");
  if (say) return speak(say.dataset.lsay);
  const sel = e.target.closest("[data-lsel]");
  if (sel) {
    state.leer.sel = Number(sel.dataset.lsel);
    renderLeer();
    const b = $(`#leer-body [data-lsel="${state.leer.sel}"]`);
    if (b) b.focus({ preventScroll: true });
    return;
  }
  if (e.target.closest("[data-lnext]")) {
    const pasos = state.lectura.pasos;
    store.setLectura(pasos[state.leer.step].id);
    if (state.leer.step >= pasos.length - 1) {
      toast("¡Terminaste Aprende a leer!");
      return go(state.leerFrom || "temas");
    }
    state.leer = { step: state.leer.step + 1, sel: 0 };
    renderLeer();
    window.scrollTo(0, 0);
  }
}

// ---------- Ruta y mapa ----------
// data/ruta.json fija el orden de los temas por módulo. «Memorizado» = el 80 %
// o más de las palabras del tema ya se acertaron al menos una vez (el mismo
// conteo que muestra el % de cada tema). El «tema actual» de un módulo es el
// primer tema (sin contar Aprende a leer) que todavía no está memorizado.

const MEM_PCT = 0.8;
const PAGE = 7;
const PALF = { lav: "#ECE7FF", pe: "#FFEDE3", kh: "#F1EDDF", bl: "#E6EBFF", li: "#F2F9D3", pk: "#F9D3EF", mint: "#CEFBC8", red: "#FFE6E6", aq: "#D8F7F2" };

function isMemorized(deck) {
  const s = deckStats(deck);
  return s.total > 0 && s.learned / s.total >= MEM_PCT;
}

function rutaMods() {
  return state.ruta ? state.ruta.modulos : [];
}

// ----- 4.2.0 · Ruta con bloques y paradas de gramática -----
// Etiqueta rusa corta de cada bloque en el Mapa (solo se muestra; no cambia ids).
const BLOQUE_RU = {
  "basicas:b1": "кто?", "basicas:b2": "я, ты", "basicas:b3": "мой", "basicas:b4": "где?", "basicas:b5": "меня́",
  "basicas:b6": "како́й?", "basicas:b7": "когда́?", "basicas:b8": "отку́да?"
};
// Mayúscula en la primera letra de cada pregunta («¿quién? ¿qué?» → «¿Quién? ¿Qué?»).
function capEs(s) {
  return String(s || "").replace(/(^|[¿¡]\s*)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}
// Un bloque es un pedazo del mazo: mismas tarjetas núcleo con ese «bloque». Mismo id de
// mazo (el progreso no cambia), sin frases ni ejercicios (esos van con el tema completo).
const unitCache = new Map();
function unitDeck(base, bloque, es) {
  const key = `${base.id}:${bloque}`;
  if (!unitCache.has(key)) {
    unitCache.set(key, {
      ...base,
      unitKey: key,
      bloque,
      base,
      sub: capEs(es),
      title: `${base.title} · ${capEs(es)}`,
      cards: base.cards.filter((c) => c.bloque === bloque && !c.extra),
      frases: [], dialogos: [], cajas: [], retos: [], aprender: null
    });
  }
  return unitCache.get(key);
}
// Clave de un tema en la Ruta: «mazo» o «mazo:bloque».
const unitKeyOf = (deck) => (deck ? deck.unitKey || deck.id : "");
// Mazo completo de un tema o bloque.
const baseOf = (deck) => (deck && deck.base) || deck;

// Paradas de gramática (contenido en data/gramatica/paradas.json).
function paradaData(id) {
  return state.paradas ? state.paradas.get(id) || null : null;
}
function paradaDone(id) {
  const r = store.ejer(`parada:${id}`);
  return !!(r && r.ok > 0);
}

// Temas y paradas de un módulo (los mazos que no existen se omiten; las paradas sin
// contenido todavía no se muestran en el Mapa ni en el Módulo, solo en el índice).
const modCache = new Map();
function modTemas(mod) {
  if (!modCache.has(mod.id)) modCache.set(mod.id, buildModTemas(mod));
  return modCache.get(mod.id);
}
function modItems(mod) {
  if (!modCache.has("i:" + mod.id)) { modTemas(mod); }
  return modCache.get("i:" + mod.id);
}

function buildModTemas(mod) {
  const items = [];
  const counts = new Map();
  for (const m of rutaMods()) for (const t of m.temas || []) if (t.bloque) counts.set(t.id, (counts.get(t.id) || 0) + 1);
  const seen = new Map();
  let n = 0;
  for (const t of mod.temas) {
    if (t.tipo === "parada") {
      const p = paradaData(t.id);
      if (p) items.push({ ...t, kind: "parada", key: `parada:${t.id}`, parada: p, mod, deck: null });
      continue;
    }
    if (t.tipo) continue; // diálogo final: todavía no existe
    if (t.leer) { items.push({ ...t, kind: "leer", key: "leer", mod, deck: null, label: `${mod.n}.${++n}` }); continue; }
    const base = state.deckById.get(t.id);
    if (!base) continue;
    const deck = t.bloque ? unitDeck(base, t.bloque, t.es) : base;
    if (t.bloque && !deck.cards.length) continue;
    let parte = 0;
    if (t.bloque) { parte = (seen.get(t.id) || 0) + 1; seen.set(t.id, parte); }
    items.push({ ...t, kind: "tema", key: unitKeyOf(deck), deck, base, mod, label: `${mod.n}.${++n}`, parte, partes: t.bloque ? counts.get(t.id) : 0 });
  }
  // Las partes se cuentan en toda la Ruta (Básicas · parte 3 de 8).
  for (const it of items) {
    if (!it.bloque) continue;
    let k = 0;
    for (const m of rutaMods()) {
      if (m === mod) break;
      for (const t of m.temas || []) if (t.bloque && t.id === it.id) k++;
    }
    it.parte += k;
  }
  modCache.set("i:" + mod.id, items);
  return items.filter((x) => x.kind !== "parada");
}

// Todo lo de la Ruta en orden (temas, bloques y paradas).
function rutaItems() {
  return rutaMods().filter((m) => !m.pronto).flatMap((m) => modItems(m));
}
function itemDone(it) {
  if (it.kind === "parada") return paradaDone(it.id);
  return it.deck ? isMemorized(it.deck) : false;
}

// Primer tema sin memorizar de un módulo (lo que sugiere la ruta).
function modFirstOpen(mod) {
  if (mod.pronto) return null;
  return modTemas(mod).find((t) => t.deck && !isMemorized(t.deck)) || null;
}

// Tema actual de Carol: el último tema (o parada) que abrió o practicó, si está en la ruta.
// Si ese tema ya está memorizado y lo que sigue es una parada pendiente, «Sigue aquí» pasa a ella.
// Sin historial, el que sugiere la ruta.
function currentItem() {
  const id = store.currentDeck();
  const all = rutaItems();
  let i = id ? all.findIndex((x) => x.key === id) : -1;
  if (i < 0 && id) i = all.findIndex((x) => x.kind === "tema" && x.id === id);
  if (i >= 0) {
    const t = all[i];
    if (t.kind === "tema" && isMemorized(t.deck) && all[i + 1] && all[i + 1].kind === "parada" && !paradaDone(all[i + 1].id)) return all[i + 1];
    return t;
  }
  const mods = rutaMods().filter((m) => !m.pronto);
  const m = mods.find((x) => modFirstOpen(x));
  return m ? modFirstOpen(m) : null;
}
// Igual, pero siempre un tema (para «Sigue donde ibas», el tema del día, etc.).
function currentTema() {
  const c = currentItem();
  if (!c || c.kind !== "parada") return c;
  const all = rutaItems();
  const i = all.indexOf(c);
  return all.slice(i + 1).find((x) => x.kind === "tema") || all.slice(0, i).reverse().find((x) => x.kind === "tema") || null;
}

// En el módulo del tema actual es ese tema; en los demás, el primero sin memorizar.
function modCurrent(mod) {
  const c = currentTema();
  if (c && c.mod === mod) return c;
  return modFirstOpen(mod);
}

function currentMod() {
  const c = currentItem();
  if (c) return c.mod;
  const mods = rutaMods().filter((m) => !m.pronto);
  return mods[mods.length - 1] || null;
}

function modWords(mod) {
  let learned = 0, total = 0;
  for (const t of modTemas(mod)) {
    if (!t.deck) continue;
    const s = deckStats(t.deck);
    learned += s.learned;
    total += s.total;
  }
  return { learned, total };
}

// Palabras de hoy en un tema (lo que arma «Seguir con»).
function todayWords(deck) {
  const s = deckStats(deck);
  return s.due + Math.min(s.fresh, NEW_PER_DECK_SESSION, newLeftToday());
}

// Lugar de un tema en la ruta. Con un mazo completo partido en bloques, el primer bloque.
function rutaPos(deckId) {
  for (const m of rutaMods()) {
    const T = modTemas(m);
    const t = T.find((x) => x.deck && x.key === deckId) || T.find((x) => x.deck && x.id === deckId);
    if (t) return t;
  }
  return null;
}

// Tema (o bloque) guardado como actual.
function deckOfKey(key) {
  if (!key) return null;
  const pos = rutaPos(key);
  if (pos && pos.key === key) return pos.deck;
  return state.deckById.get(key) || null;
}

// «Tema actual»: el último mazo que abrió o practicó; si no hay, el de la ruta.
function suggestedDeck() {
  const id = store.currentDeck();
  const d = id && !id.startsWith("parada:") ? deckOfKey(id) : null;
  if (d && !d.mine) return d;
  const c = currentTema();
  return c ? c.deck : null;
}

// ----- Ruta · Mapa A3 (4.2.0) -----
// Pestañas M1 · M2 · M3, paradas de colores en filas de 3 unidas por un camino
// punteado en ángulos de 90° (de ida y vuelta), sobre el dibujo del mapa tenue.
const STOP_COLORS = ["#f2c14e", "#f5a3b5", "#aa94fc", "#4af2d5", "#ff7a45", "#99acfc", "#c8f25a", "#e9b293"];
const MAP_X = [30, 174, 318];
const MAP_VW = 348;

// Palabras acertadas al menos una vez (la tarjeta ya tuvo un acierto).
function hitOnce(deck) {
  let n = 0, total = 0;
  for (const it of itemsFor(deck)) {
    total++;
    const st = store.card(it.key);
    if (st && (st.reps > 0 || st.lapses > 0 || st.ivl >= 1)) n++;
  }
  return { n, total };
}
function modHits(mod) {
  let n = 0, total = 0;
  for (const t of modTemas(mod)) if (t.deck) { const h = hitOnce(t.deck); n += h.n; total += h.total; }
  return { n, total };
}
const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// Ejercicios de gramática de un tema (cajas y retos) y su avance.
function gramOf(deck) {
  const ej = ejOf(deck, true);
  const total = ej.cajas.length + (deck.retos || []).length;
  const done = ejDone(ej.cajas) + (deck.retos || []).filter((r) => retoState(deck, r).done).length;
  const d = dudasFor(deck);
  return { titulo: d ? d.titulo : "", done, total };
}

// Ejercicios pequeños de un tema, explicados (los que existan).
const EJ_SUB = { frases: "arma frases", cajas: "clasifica", dialogo: "conversa", reto: "descubre la regla", audio: "escucha" };
function ejButtons(deck, max = 3) {
  const order = ["frases", "cajas", "dialogo", "reto", "audio"];
  return modesList(deck, true).filter((m) => m.key !== "words" && !m.off)
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)).slice(0, max);
}

function mapaPathD(n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / 3), c = i % 3;
    const col = r % 2 ? 2 - c : c;
    pts.push([MAP_X[col], 58 + 82 * r + (c === 1 ? 28 : 0)]);
  }
  const seg = [];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    if (Math.floor(i / 3) !== Math.floor((i - 1) / 3)) {
      const ex = x1 > 174 ? x1 + 20 : x1 - 20; // sale por el borde y baja a la fila siguiente
      seg.push(`M${x1} ${y1} H${ex} V${y2} H${x2}`);
    } else seg.push(`M${x1} ${y1} H${x2} V${y2}`);
  }
  return seg;
}

// Color de cada mazo en el Mapa: los bloques de un mismo mazo van del mismo color.
const DECK_COLORS = { saludos: "#f5a3b5", basicas: "#f2c14e", animales: "#4af2d5", familia: "#aa94fc", numeros: "#99acfc", verbos: "#e9b293",
  profesiones: "#ff7a45", nombres: "#aa94fc", adjetivos: "#99acfc", "falsos-amigos": "#c8f25a" };
const stopColor = (t, i) => DECK_COLORS[t.id] || STOP_COLORS[i % STOP_COLORS.length];
const MAP_BOOK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>`;
function mapaPt(k) {
  const r = Math.floor(k / 3), c = k % 3, col = r % 2 ? 2 - c : c;
  return [MAP_X[col], 58 + 82 * r + (c === 1 ? 28 : 0)];
}
// Punto de una parada sobre el camino entre el tema k y el k+1 (fracción f).
function mapaParadaPt(k, f, n) {
  const [x1, y1] = mapaPt(Math.max(0, k));
  if (k < 0) return [x1 - 20 + 20 * f, y1];
  if (k + 1 >= n) return [x1 > 174 ? x1 + 20 : x1 - 20, y1 + 24 * f];
  const [x2, y2] = mapaPt(k + 1);
  if (Math.floor(k / 3) === Math.floor((k + 1) / 3)) return [x1 + (x2 - x1) * f, y1];
  return [x1 > 174 ? x1 + 20 : x1 - 20, y1 + (y2 - y1) * f];
}

function mapaStageHtml() {
  const m = state.mapa;
  const mods = rutaMods();
  const mod = mods.find((x) => x.id === m.mod) || mods[0];
  const all = modItems(mod);
  const T = all.filter((t) => t.kind === "tema");
  const curIt = currentItem();
  const glob = curIt && curIt.mod === mod ? curIt : null;
  let sel = m.sel && all.find((t) => t.key === m.sel.key);
  if (!sel) sel = glob || modFirstOpen(mod) || T[0] || null;
  m.sel = sel ? { key: sel.key, mod: mod.id } : null;
  // «Sigue aquí» y «Tema actual» solo en el punto actual de verdad (no en otros módulos).
  const selIsCur = !!(sel && glob && glob.key === sel.key);
  // Índice (en T) del último tema antes o en el punto seleccionado.
  const before = (it) => { let k = -1; for (const x of all) { if (x.kind === "tema") k++; if (x === it) break; } return it && it.kind === "parada" ? k : T.indexOf(it); };
  const selK = sel ? before(sel) : -1;

  // Avance: palabras acertadas al menos una vez ÷ palabras del módulo (y de toda la ruta)
  let rn = 0, rt = 0;
  for (const x of mods) { const h = modHits(x); rn += h.n; rt += h.total; }
  const mh = modHits(mod);
  const mp = pctOf(mh.n, mh.total);
  const memo = T.filter((t) => isMemorized(t.deck)).length;

  const tabs = mods.map((x) => `<button type="button" role="tab" class="num" data-mtab="${x.id}" aria-selected="${x.id === mod.id}" aria-label="Módulo ${x.n}">M${x.n}</button>`).join("");

  // Paradas de temas y, sobre el camino, las paradas de gramática
  const rows = Math.max(1, Math.ceil(T.length / 3));
  const H = 132 + 82 * (rows - 1);
  const segs = mapaPathD(T.length);
  let doneSegs = segs.slice(0, Math.max(0, sel && sel.kind === "parada" ? selK : selK));
  let restSegs = segs.slice(Math.max(0, selK));
  let stops = "";
  T.forEach((t, i) => {
    const r = Math.floor(i / 3), c = i % 3;
    const col = r % 2 ? 2 - c : c;
    const top = 44 + 82 * r + (c === 1 ? 28 : 0);
    const ru = mapaRu(t);
    const n = `<span class="ms-n num">${i + 1}</span>`;
    const label = `<span>${esc(ru)}</span>`;
    const isSel = sel === t;
    const done = isMemorized(t.deck);
    stops += `<button class="ms-stop ms-c${col}${isSel ? " sel" : ""}${done ? " done" : ""}" type="button" lang="ru" data-mp="${esc(t.key)}" aria-pressed="${isSel}" aria-label="Tema ${t.label}, ${esc(ru)}, ${esc(t.deck.title)}${isSel && selIsCur ? ", tema actual" : done ? ", memorizado" : ""}" style="top:${top}px;--sc:${stopColor(t, i)}">${col === 2 ? label + n : n + label}</button>`;
  });
  // Paradas de gramática: puntos sobre el camino, entre el tema anterior y el siguiente.
  let k = -1;
  const groups = new Map();
  for (const x of all) { if (x.kind === "tema") k++; else if (x.kind === "parada") { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); } }
  for (const [kk, arr] of groups) {
    arr.forEach((x, j) => {
      const f = (j + 1) / (arr.length + 1);
      const [px, py] = mapaParadaPt(kk, f, T.length);
      const ok = paradaDone(x.id);
      const isSel = sel === x;
      if (isSel && kk >= 0) {
        // Camino hecho hasta la parada seleccionada.
        const [x1, y1] = mapaPt(kk);
        const same = kk + 1 < T.length && Math.floor(kk / 3) === Math.floor((kk + 1) / 3);
        doneSegs = segs.slice(0, kk).concat(same ? [`M${x1} ${y1} H${px}`] : [`M${x1} ${y1} H${px} V${py}`]);
        restSegs = segs.slice(kk);
      }
      stops += `<button class="ms-par${ok ? " done" : ""}${isSel ? " sel" : ""}" type="button" data-mp="${esc(x.key)}" aria-pressed="${isSel}" aria-label="Parada de gramática: ${esc(x.titulo)}${ok ? ", hecha" : isSel && selIsCur ? ", sigue aquí" : ""}" style="left:${px - 9 + 2}px;top:${py - 9 + 2}px">${ok ? ICO_OK : MAP_BOOK}</button>`;
    });
  }
  const full = !!m.full;
  // Mapa pequeño: hasta 3 filas (el resto se ve con «ver mapa completo»).
  const bgH = full ? Math.max(H, 532) : Math.min(H, 300);
  const map = `<div class="ms-map${full ? " full" : ""}" style="height:${bgH}px" role="group" aria-label="Mapa del Módulo ${mod.n}">
      <span class="ms-bg" aria-hidden="true"></span>
      <svg class="ms-path" viewBox="0 0 ${MAP_VW} ${H}" preserveAspectRatio="none" style="height:${H}px" aria-hidden="true">
        ${restSegs.length ? `<path class="ms-rest" d="${restSegs.join(" ")}"/>` : ""}${doneSegs.length ? `<path class="ms-done" d="${doneSegs.join(" ")}"/>` : ""}
      </svg>
      ${stops}
      <span class="ms-fade" aria-hidden="true"></span>
      <button class="ms-full" type="button" data-mfull aria-pressed="${full}" aria-label="${full ? "Ver el mapa pequeño" : "Ver mapa completo"}"><svg viewBox="0 0 24 24" aria-hidden="true">${full ? `<path d="M5 9h14M5 15h14"/>` : `<path d="M9 5l-5 7 5 7M15 5l5 7-5 7"/>`}</svg></button>
      ${full ? "" : `<span class="ms-full-t" aria-hidden="true">ver mapa completo<svg viewBox="0 0 14 10"><path d="M1 5h11M8 1.5L12 5 8 8.5"/></svg></span>`}
    </div>`;

  // Tarjeta del punto seleccionado (tema o parada)
  let card = "";
  if (mod.pronto) card = `<section class="ms-card sh3d"><p class="ms-soon">El ${esc(mod.titulo)} llega pronto.</p></section>`;
  else if (sel && sel.kind === "parada") {
    const p = sel.parada;
    const at = sel.antes ? deckOfKey(sel.antes) : null;
    const ex = (p.ejemplos || [])[0];
    card = `<section class="ms-card ms-card-par sh3d card-frame pal-bl" aria-label="Parada de gramática">
      ${selIsCur ? `<span class="tm-sigue">Sigue aquí</span>` : ""}
      <span class="ms-c-head"><span class="ms-c-num ms-c-book" aria-hidden="true">${MAP_BOOK}</span><span class="ms-c-ttl"><span class="ms-c-lab">Parada de gramática · <span class="num">2</span> min</span><b>${gramText(p.titulo, "t")}</b></span>${sel.es ? `<span class="ms-c-ru" lang="ru">${esc(sel.es)}</span>` : ""}</span>
      ${at ? `<span class="ms-row"><span class="ms-row-l">Prepara</span><span class="ms-row-t">${esc(baseOf(at).title)}${ex ? `: <span lang="ru">${esc(ex.ru)}</span>` : ""}</span></span>` : ""}
      <span class="ms-row"><span class="ms-row-l">Practica</span><span class="ms-row-t">Elige la forma · <span class="num">${(p.elige || []).length}</span> ejercicios</span></span>
      <button class="ms-go" type="button" data-mpar="regla">${paradaDone(sel.id) ? "Repasar la regla →" : "Ver la regla →"}</button>
      <span class="ms-ejs">${at ? `<button class="ms-ej" type="button" data-mpar="saltar"><b>Saltar</b><span>ir a ${esc(shortTitle(at.bloque ? { ...at, title: baseOf(at).title } : at))}</span></button>` : ""}<button class="ms-ej" type="button" data-mpar="indice"><b>Todas las paradas</b><span>índice</span></button></span>
    </section>`;
  } else if (sel) {
    const d = sel.deck;
    const v = visFor(baseOf(d));
    const st = deckStats(d);
    const g = gramOf(d);
    const nToday = todayWords(d);
    const ejs = ejButtons(d);
    const kick = sel.bloque ? `${esc(baseOf(d).title)} · parte <span class="num">${sel.parte}</span> de <span class="num">${sel.partes}</span>` : "";
    card = `<section class="ms-card sh3d card-frame pal-${v.pal}" aria-label="${selIsCur ? "Tema actual" : `Tema ${sel.label}`}">
      ${selIsCur ? `<span class="tm-sigue">Sigue aquí</span>` : ""}
      <span class="ms-c-head"><span class="ms-c-num num">${sel.label}</span><span class="ms-c-ttl">${selIsCur || kick ? `<span class="ms-c-lab">${selIsCur ? "Tema actual" : ""}${selIsCur && kick ? " · " : ""}${kick}</span>` : ""}<b>${esc(sel.bloque ? d.sub : d.title)}</b></span><span class="ms-c-ru" lang="ru">${esc(RU_NAME[sel.id] || mapaRu(sel))}</span></span>
      <span class="ms-row"><span class="ms-row-l">Palabras</span><span class="bar"><span style="width:${st.pct}%"></span></span><span class="ms-row-n"><span class="num">${st.learned}</span>/<span class="num">${st.total}</span></span></span>
      ${g.titulo || g.total ? `<span class="ms-row"><span class="ms-row-l">Gramática</span><span class="ms-row-t">${esc(g.titulo || "Cajas y retos")}</span>${g.total ? `<span class="ms-row-n"><span class="num">${g.done}</span>/<span class="num">${g.total}</span></span>` : ""}</span>` : ""}
      <button class="ms-go" type="button" data-mc="words">${nToday ? `Palabras · <span class="num">${nToday}</span> para hoy →` : "Repasar palabras →"}</button>
      ${ejs.length ? `<span class="ms-ejs">${ejs.map((e) => `<button class="ms-ej" type="button" data-mc="${e.key}"><b>${esc(e.full || e.label)}</b><span>${EJ_SUB[e.key]}</span></button>`).join("")}</span>` : ""}
    </section>`;
  }

  const leerN = state.lectura ? state.lectura.pasos.length : 0;
  const leerD = state.lectura ? leerDone() : 0;
  const leerOk = leerN && leerD >= leerN;
  const gd = gramaticaDeck() || (state.paradas && state.paradas.size);
  return `<header class="ms-top">
      <button class="circle-btn" type="button" data-mgo="home" aria-label="Volver al inicio"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="tm-ttl">
        <div class="h-sec-head"><h1 class="h-sec-t">Ruta<svg viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true"><path d="M2 5c12-4 22 3 36 0s24-4 38-1 26 3 42-1"/></svg></h1><span class="h-sec-ru" lang="ru">маршру́т</span></div>
        <span class="tm-sub">Toda la ruta · <span class="num">${pctOf(rn, rt)}%</span></span>
      </div>
      <div class="ms-tabs" role="tablist" aria-label="Módulos">${tabs}</div>
    </header>
    <button class="ms-mod" type="button" data-mgo="modulo" aria-label="Ver el Módulo ${mod.n}: ${mh.n} de ${mh.total} palabras acertadas, ${memo} de ${T.length} temas, ${mp}%">
      <span class="ms-mod-top"><b>Módulo <span class="num">${mod.n}</span></b><span class="ms-mod-sub"><span class="num">${mh.n}</span> de <span class="num">${mh.total}</span> palabras · <span class="num">${memo}</span> de <span class="num">${T.length}</span> temas</span><span class="ms-pct">${mp}%</span><svg class="ms-mod-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></span>
      <span class="ms-bar" aria-hidden="true"><span style="width:${mp}%"></span></span>
    </button>
    ${map}
    ${card}
    <div class="ms-extra">
      ${state.lectura ? `<button class="ms-x ms-leer sh3d" type="button" data-mgo="leer"><b>Aprende a leer</b>${leerOk ? `<svg viewBox="0 0 24 24" aria-label="terminado"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>` : `<span><span class="num">${leerD}</span>/<span class="num">${leerN}</span></span>`}</button>` : ""}
      ${gd ? `<button class="ms-x ms-gram sh3d" type="button" data-mgo="gram"><b>Gramática</b><span>reglas cortas</span></button>` : ""}
    </div>`;
}

function mapaRu(t) {
  const base = RU_NAME[t.deck ? t.id : ""] || (t.deck ? t.deck.title : "Чита́ть");
  return t.bloque && BLOQUE_RU[t.key] ? `${base} · ${BLOQUE_RU[t.key]}` : base;
}

function renderMapa() {
  if (!state.mapa) {
    const mod = currentMod() || rutaMods()[0];
    state.mapa = { mod: mod ? mod.id : "m1", sel: null };
  }
  $("#mapa-stage").innerHTML = mapaStageHtml();
}
function mapaHits() { /* 4.2.0: las paradas ya miden 44 px de alto táctil por sí mismas */ }

function openMapa() {
  state.mapa = null; // se abre en el módulo del tema actual
  go("mapa");
}

function mapaClick(e) {
  const m = state.mapa;
  if (!m) return;
  const mods = rutaMods();
  const mod = mods.find((x) => x.id === m.mod);
  const tab = e.target.closest("[data-mtab]");
  if (tab) {
    state.mapa = { mod: tab.dataset.mtab, sel: null, full: m.full };
    renderMapa();
    const b = $(`#mapa-stage [data-mtab="${tab.dataset.mtab}"]`);
    if (b) b.focus();
    return;
  }
  if (e.target.closest("[data-mfull]")) {
    m.full = !m.full;
    renderMapa();
    const b = $("#mapa-stage [data-mfull]");
    if (b) b.focus();
    return;
  }
  const st = e.target.closest("[data-mp]");
  if (st && mod) {
    const t = modItems(mod).find((x) => x.key === st.dataset.mp);
    if (!t) return;
    m.sel = { key: t.key, mod: mod.id };
    // la tarjeta y «Sigue aquí» van con el tema (o la parada) tocado
    if (t.kind === "parada") store.setCurrent(t.key); else markCurrent(t.deck);
    renderMapa();
    const b = $(`#mapa-stage [data-mp="${st.dataset.mp}"]`);
    if (b) b.focus();
    return;
  }
  const par = e.target.closest("[data-mpar]");
  if (par && mod && m.sel) {
    const t = modItems(mod).find((x) => x.key === m.sel.key);
    if (!t || t.kind !== "parada") return;
    const a = par.dataset.mpar;
    if (a === "regla") return openParada(t.id, { from: "mapa" });
    if (a === "indice") return openGramIndice("mapa");
    if (a === "saltar") {
      const at = modItems(mod).find((x) => x.key === t.antes) || rutaItems().find((x) => x.key === t.antes);
      if (at) { m.mod = at.mod.id; m.sel = { key: at.key, mod: at.mod.id }; markCurrent(at.deck); renderMapa(); }
    }
    return;
  }
  const mc = e.target.closest("[data-mc]");
  if (mc && mod) {
    const t = modItems(mod).find((x) => m.sel && x.key === m.sel.key);
    if (t && t.deck) startMode(t.deck, mc.dataset.mc);
    return;
  }
  const go2 = e.target.closest("[data-mgo]");
  if (go2) {
    const a = go2.dataset.mgo;
    if (a === "home") return go("home");
    if (a === "leer") return openLeer();
    if (a === "modulo") { state.modulo = m.mod; return go("modulo"); }
    if (a === "gram") return openGramIndice("mapa");
  }
}

// ----- Módulo (4.2.0 · A2) -----
// Línea de tiempo de los temas del módulo con su avance y «Sigue aquí».
const CONFETI_ICO = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 56l12-30 18 18z" fill="#F2C14E" stroke="#151515" stroke-width="3" stroke-linejoin="round"/><path d="M15 44l7 7M18 36l10 10" stroke="#151515" stroke-width="2.4" stroke-linecap="round"/><path d="M30 30c2-8 9-10 10-18" stroke="#4AF2D5" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M36 34c6-4 12-1 18-6" stroke="#F5A3B5" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M27 24c-2-5 1-10-2-15" stroke="#AA94FC" stroke-width="4" stroke-linecap="round" fill="none"/><circle cx="48" cy="12" r="3" fill="#F04E12"/><circle cx="56" cy="40" r="2.5" fill="#4AF2D5"/><circle cx="40" cy="6" r="2" fill="#F5A3B5"/><path d="M50 20l4-2M44 46l3 3" stroke="#F2C14E" stroke-width="3" stroke-linecap="round"/></svg>`;
function renderModulo() {
  const mods = rutaMods();
  const mod = mods.find((x) => x.id === state.modulo) || currentMod() || mods[0];
  if (!mod) return;
  state.modulo = mod.id;
  const all = modItems(mod);
  const T = all.filter((t) => t.kind === "tema");
  const P = all.filter((t) => t.kind === "parada");
  const w = modWords(mod);
  const pct = pctOf(w.learned, w.total);
  const ci = currentItem();
  const cur = ci && ci.mod === mod ? ci : modFirstOpen(mod);
  const curIdx = cur ? all.indexOf(cur) : -1;
  $("#mod-n").textContent = mod.n;
  $("#mod-n-ru").textContent = mod.n;
  $("#mod-sub").innerHTML = `<span class="num">${T.length}</span> temas · ${P.length ? `<span class="num">${P.length}</span> ${P.length === 1 ? "parada" : "paradas"} · ` : ""}<span class="num">${w.learned}</span> de <span class="num">${w.total}</span> palabras`;
  $("#mod-felic").innerHTML = `<span class="mf-ico" aria-hidden="true">${CONFETI_ICO}</span>
    <span class="mf-txt"><span class="mf-t">${w.learned ? "¡Felicidades!" : "¡A empezar!"}</span>
    <span class="mf-l">Ya aprendiste <span class="num">${w.learned}</span> ${w.learned === 1 ? "palabra" : "palabras"}</span>
    <span class="mf-s">de <span class="num">${w.total}</span> del módulo · <span class="num">${pct}%</span></span>
    <span class="mf-bar" aria-hidden="true"><span style="width:${pct}%"></span></span></span>`;
  $(".mod-note").innerHTML = P.length
    ? `Cada tema trae sus palabras. Las <b>paradas de gramática</b> (amarillas) van justo antes del tema que las usa. El porcentaje cuenta solo las palabras de los temas.`
    : "Cada tema trae sus palabras y su gramática. Puedes abrir cualquiera.";
  $("#mod-list").innerHTML = `<svg class="ml-line" aria-hidden="true" width="4" height="100%"><line class="ml-done" x1="2" x2="2" y1="0" y2="0"/><line class="ml-rest" x1="2" x2="2" y1="0" y2="100%"/></svg>` + all.map((t, i) => {
    const isCur = i === curIdx;
    if (t.kind === "parada") {
      const ok = paradaDone(t.id);
      return `<div class="ml-item ml-parada${isCur ? " cur" : ""}" role="button" tabindex="0" data-mpar="${esc(t.id)}" aria-label="Parada de gramática: ${esc(t.titulo)}${ok ? ", hecha" : isCur ? ", sigue aquí" : ""}">
        <span class="ml-num ml-pn${ok || isCur ? " on" : ""}" aria-hidden="true">${ok ? ICO_OK : MAP_BOOK}</span>
        ${isCur ? `<span class="tm-sigue">Sigue aquí</span>` : ""}
        <span class="ml-pbox sh3d"><span class="ml-pt"><span class="ml-pk">Gramática${t.es ? ` · <span lang="ru">${esc(t.es)}</span>` : ""}</span><b>${gramText(t.parada.titulo, "t")}</b></span><span class="ml-pmin">${ok ? ICO_OK : `<span class="num">2</span> min`}</span>${isCur ? `<span class="ms-go ml-pgo">${ok ? "Repasar la regla →" : "Ver la regla →"}</span>` : ""}</span>
      </div>`;
    }
    const d = t.deck;
    const st = deckStats(d);
    const g = gramOf(d);
    const n = todayWords(d);
    const kick = t.bloque ? `<span class="ml-kick">${esc(baseOf(d).title)} · parte <span class="num">${t.parte}</span> de <span class="num">${t.partes}</span></span>` : "";
    return `<div class="ml-item card-frame pal-${visFor(baseOf(d)).pal} sh3d${isCur ? " cur" : ""}" role="button" tabindex="0" data-mtema="${esc(t.key)}" aria-label="Tema ${t.label} ${esc(d.title)}${isCur ? ", sigue aquí" : ""}">
      <span class="ml-num num" aria-hidden="true">${t.label}</span>
      ${isCur ? `<span class="tm-sigue">Sigue aquí</span>` : ""}
      ${kick}
      <span class="ml-head"><b>${esc(t.bloque ? d.sub : d.title)}</b><span class="ml-ru" lang="ru">${esc(RU_NAME[t.id] || "")}</span></span>
      <span class="ms-row"><span class="ms-row-l">Palabras</span><span class="bar"><span style="width:${st.pct}%"></span></span><span class="ms-row-n"><span class="num">${st.learned}</span>/<span class="num">${st.total}</span></span></span>
      ${!P.length && (g.titulo || g.total) ? `<span class="ms-row"><span class="ms-row-l">Gramática</span><span class="ms-row-t">${ruSpans(g.titulo || "Cajas y retos")}</span>${g.total ? `<span class="ms-row-n"><span class="num">${g.done}</span>/<span class="num">${g.total}</span></span>` : ""}</span>` : ""}
      ${isCur ? `<button class="ms-go" type="button" data-mword="${esc(t.key)}">${n ? `Seguir · <span class="num">${n}</span> palabras para hoy →` : "Seguir con este tema →"}</button>` : ""}
    </div>`;
  }).join("");
  // Línea: turquesa hasta el punto actual, punteada después
  requestAnimationFrame(() => {
    const list = $("#mod-list");
    const items = list.querySelectorAll(".ml-item");
    const ln = list.querySelector(".ml-done");
    if (!ln || !items.length) return;
    const top = list.getBoundingClientRect().top;
    const it = items[Math.max(0, curIdx)];
    // Maqueta A2Modulo: turquesa hasta dentro del círculo del tema actual; la punteada sigue después de él.
    const num = it.querySelector(".ml-num").getBoundingClientRect();
    const y = curIdx > 0 ? num.top - top + 26 : 0;
    ln.setAttribute("y1", "30");
    ln.setAttribute("y2", String(Math.max(30, y)));
    const rest = list.querySelector(".ml-rest");
    if (rest) rest.setAttribute("y1", String(curIdx > 0 ? num.bottom - top + 5 : 30));
  });
}

// ---------- 4.2.0 · Gramática en la Ruta: índice, parada, «Elige la forma» ----------
// Las paradas viven en data/gramatica/paradas.json (formato en docs/contenido.md).
// Al terminar «Elige la forma» la parada queda hecha (ejer «parada:<id>»); lo que
// fallaste al primer intento vuelve en la práctica del día siguiente (máximo 3 al día).
const GRAM_PALS = ["kh", "pe", "lav", "li", "pk", "bl", "mint"];
const ELIGE_POR_DIA = 3;
const FICHAS = ["reglas-gentilicios"];
const ICO_BOOK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>`;
const ICO_CHEV = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
const ICO_OK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const UNDERLINE = `<svg viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true"><path d="M2 5c12-4 22 3 36 0s24-4 38-1 26 3 42-1"/></svg>`;

// Texto de gramática: ruso con su letra y color, números aparte y flechas en color.
// mode "pt" = puntos (números en pastilla amarilla); "t" = títulos (números en Lato).
function gramText(t, mode = "pt") {
  return esc(t)
    .replace(/[а-яё́]+(?:[\s,]+[а-яё́]+)*/gi, (w) => {
      const m = w.match(/^(.*?)([\s,]*)$/);
      return `<span lang="ru">${m[1]}</span>${m[2]}`;
    })
    .replace(/(^|[^\w-])(\d+)(?![\w])/g, (m, a, n) => `${a}<span class="num${mode === "pt" ? " gx-n" : ""}">${n}</span>`)
    .replace(/→/g, `<span class="gx-arr">→</span>`);
}

// Título grande de la parada con una parte resaltada (marcador amarillo y subrayado).
function paradaTitle(p) {
  const t = p.titulo || "";
  let a = -1, b = -1;
  const pick = (from, to) => { a = from; b = to; };
  if (p.resalta && t.includes(p.resalta)) pick(t.indexOf(p.resalta), t.indexOf(p.resalta) + p.resalta.length);
  else if (t.includes("…")) {
    const i = t.indexOf("…") + 1;
    const rest = t.slice(i);
    const m = rest.match(/^\s*(\S+(?:\s+\S+){0,2})/);
    if (m) pick(i + rest.indexOf(m[1]), i + rest.indexOf(m[1]) + m[1].length);
  } else if (t.includes(":")) {
    const i = t.indexOf(":") + 1;
    const m = t.slice(i).match(/^\s*(.+)$/);
    if (m) pick(i + t.slice(i).indexOf(m[1]), t.length);
  }
  if (a < 0) return gramText(t, "t");
  return `${gramText(t.slice(0, a), "t")}<span class="pd-mark">${gramText(t.slice(a, b), "t")}${UNDERLINE}</span>${gramText(t.slice(b), "t")}`;
}

// Nombre corto del tema al que prepara una parada («Antes de Verbos», «Básicas · Yo, tú, él»).
function shortTitle(d) {
  const t = d.title === "Palabras básicas" ? "Básicas" : d.title.split(" y ")[0];
  return d.bloque && d.base && d.base.id === "basicas" ? `${t} · ${d.sub}` : t;
}
function antesTitle(key) {
  if (!key) return "";
  const t = rutaPos(key);
  const d = t && t.key === key ? t.deck : state.deckById.get(key);
  if (!d) return "";
  const base = baseOf(d);
  return shortTitle(d.bloque ? { ...d, title: base.title } : d);
}

// Todas las paradas de la Ruta en orden (con o sin contenido).
function gramParadas() {
  const out = [];
  let n = 0;
  for (const m of rutaMods()) {
    for (const t of m.temas || []) {
      if (t.tipo !== "parada") continue;
      out.push({ ...t, n: ++n, mod: m, parada: paradaData(t.id) });
    }
  }
  return out;
}

function openGramIndice(from) {
  state.gram = { mode: "indice", from: from || state.view };
  renderGram();
  show("gram");
  window.scrollTo(0, 0);
  const w = $("#gram-body");
  if (w) w.scrollTop = 0;
}

function openParada(id, opts = {}) {
  const p = paradaData(id);
  if (!p) return toast("Esta parada llega pronto.");
  const prev = state.gram;
  state.gram = { mode: "parada", id, from: opts.from || (prev && state.view === "gram" ? prev.from : state.view), back: state.view === "gram" && prev ? { ...prev } : null, tag: opts.tag || "", sub: opts.sub || "" };
  store.setCurrent(`parada:${id}`);
  renderGram();
  show("gram");
  const w = $("#gram-body");
  if (w) w.scrollTop = 0;
}

function gramBack() {
  const g = state.gram;
  if (g && g.back) { state.gram = g.back; renderGram(); return; }
  const from = g ? g.from : "home";
  state.gram = null;
  if (from === "cajas") return show("cajas");
  if (from === "study" && state.session) return show("study");
  if (from === "modulo") return go("modulo");
  backTo(from);
}

function renderGram() {
  const g = state.gram;
  const view = $("#view-gram");
  view.classList.toggle("gram-idx", g.mode === "indice");
  const done = $("#gram-done"), later = $("#gram-later");
  later.hidden = true;
  done.hidden = false;
  $("#gram-back").setAttribute("aria-label", "Volver");
  if (g.mode === "indice") {
    const ps = gramParadas();
    $("#gram-sub").innerHTML = `<span class="num">${ps.length}</span> paradas · en el orden de la Ruta`;
    done.hidden = true;
    const cur = currentItem();
    let html = "";
    for (const m of rutaMods()) {
      const mine = ps.filter((p) => p.mod === m);
      if (!mine.length) continue;
      const hechas = mine.filter((p) => paradaDone(p.id)).length;
      html += `<div class="gi-mod"><b>Módulo <span class="num">${m.n}</span></b><span><span class="num">${hechas}</span> de <span class="num">${mine.length}</span> hechas</span></div>`;
      html += mine.map((p) => {
        const ok = paradaDone(p.id);
        const pronto = !p.parada;
        const isCur = !pronto && cur && cur.kind === "parada" && cur.id === p.id;
        const pal = GRAM_PALS[(p.n - 1) % GRAM_PALS.length];
        const antes = antesTitle(p.antes);
        const circ = ok ? `<span class="gi-c ok" aria-hidden="true">${ICO_OK}</span>` : `<span class="gi-c num${isCur ? " cur" : ""}" aria-hidden="true">${p.n}</span>`;
        const right = pronto ? `<span class="gi-pronto">pronto</span>` : `<span class="gi-chev" aria-hidden="true">${ICO_CHEV}</span>`;
        const lab = `Parada ${p.n}: ${p.titulo}${ok ? ", hecha" : isCur ? ", sigue aquí" : pronto ? ", próximamente" : ""}`;
        return `<div class="gi-item${pronto ? " pronto" : ` card-frame pal-${pal} sh3d`}${isCur ? " cur" : ""}" ${pronto ? "" : `role="button" tabindex="0" data-gpar="${esc(p.id)}"`} aria-label="${esc(lab)}">
          ${isCur ? `<span class="tm-sigue">Sigue aquí</span>` : ""}${circ}
          <span class="gi-t"><b>${gramText(p.titulo, "t")}</b><span class="gi-s"><span class="gi-es">${gramText(p.es || "", "t")}</span>${antes ? ` · antes de ${esc(antes)}` : ""}</span></span>${right}</div>`;
      }).join("");
    }
    const fichas = FICHAS.map((id) => state.deckById.get(id)).filter(Boolean);
    if (fichas.length) {
      html += `<div class="h-sec-head gi-fichas-h"><h2 class="h-sec-t">Fichas de consulta${UNDERLINE}</h2><span class="h-sec-ru" lang="ru">спра́вка</span></div>
        <p class="gi-note">Solo para leer: todas las reglas juntas, sin ejercicios.</p>
        <div class="gi-fichas">${fichas.map((d, i) => `<button class="gi-ficha card-frame pal-${GRAM_PALS[i % GRAM_PALS.length]} sh3d" type="button" data-gficha="${esc(d.id)}"><b>${esc(d.id === "reglas-gentilicios" ? "Gentilicios" : d.title.split(/:| y /)[0])}</b><span><span class="num">${d.cards.length}</span> fichas</span></button>`).join("")}</div>`;
    }
    $("#gram-body").innerHTML = html;
    return;
  }
  const p = paradaData(g.id);
  if (!p) return;
  const t = rutaItems().find((x) => x.kind === "parada" && x.id === g.id);
  const antes = antesTitle(t && t.antes);
  if (g.mode === "parada") {
    $("#gram-sub").textContent = g.sub || (t ? `Parada · Módulo ${t.mod.n}` : "Parada de gramática");
    const pts = (p.puntos || []).slice(0, 3);
    const ex = (p.ejemplos || []).map((x, i) => `<div class="pd-ex">${i === 0 ? `<b class="pd-lab pd-lab-ex">Ejemplos</b>` : ""}<div class="pd-ex-t"><span class="pd-ex-ru" lang="ru">${esc(x.ru)}</span>${x.fonetica ? `<span class="pd-ex-fon">${esc(x.fonetica)}</span>` : ""}<span class="pd-ex-es">${esc(x.es)}</span></div><span class="pd-ex-b"><button class="pd-au pd-au-n" type="button" data-say="${esc(x.ru)}" aria-label="Escuchar el ejemplo">${SPEAKER}</button><button class="pd-au" type="button" data-say-slow="${esc(x.ru)}" aria-label="Escuchar más lento">${TURTLE}</button></span></div>`).join("");
    $("#gram-body").innerHTML = `<section class="pd-card a2-card pal-bl">
      <span class="pd-sticker"><span class="num">2</span> min</span>
      <div class="pd-kick"><span class="pd-ico" aria-hidden="true">${ICO_BOOK}</span><span class="pd-pill">PARADA DE GRAMÁTICA</span></div>
      <h2 class="pd-h">${antes ? `<span class="pd-h-s">Antes de ${esc(antes)}</span>` : ""}<span class="pd-h-b">${paradaTitle(p)}</span></h2>
      <div class="pd-chips">${p.ru ? `<span class="pd-chip" lang="ru">${esc(p.ru)}</span>` : ""}${g.tag ? `<span class="pd-chip pd-chip-tag">${gramText(g.tag, "t")}</span>` : ""}</div>
      <div class="pd-box"><b class="pd-lab">La regla</b>
        <ul class="pd-pts">${pts.map((x, i) => `<li><i style="background:${["#AA94FC", "#F2C14E", "#4AF2D5"][i % 3]}"></i>${gramText(x)}</li>`).join("")}</ul>
        ${ex}
        ${p.ojo ? `<p class="pd-ojo"><b>Ojo:</b> ${gramText(p.ojo, "t")}</p>` : ""}
      </div>
    </section>`;
    done.textContent = "Practicar";
    later.textContent = "Ahora no";
    later.hidden = false;
    return;
  }
  if (g.mode === "fin") {
    const r = g.result || { ok: 0, tot: 0, bad: [] };
    $("#gram-sub").innerHTML = `Elige la forma${p.ru ? ` · <span lang="ru">${esc(p.ru)}</span>` : ""}`;
    const fallo = r.bad.length ? r.bad.map((e) => `<span lang="ru">${esc(e.texto.replace(/[.!?]+$/, "").split(/\s+/).slice(-2).join(" "))}</span>`).join(", ") : "";
    $("#gram-body").innerHTML = `<section class="pd-card pd-fin a2-card pal-kh">
      <span class="pd-sticker"><span lang="ru">Гото́во!</span> listo</span>
      <div class="pd-kick pd-kick-fin"><span class="pd-ico pd-ico-fin" aria-hidden="true">${ICO_BOOK}</span><span>PARADA TERMINADA</span></div>
      <h2 class="pd-h"><span class="pd-h-s">${gramText(p.titulo, "t")}</span><span class="pd-h-b"><span class="a2-u">¡Listo!${UNDERLINE}</span></span></h2>
      <div class="a2-chips"><span class="a2-chip c1"><span class="num">${r.ok}</span> de <span class="num">${r.tot}</span> bien</span>${r.bad.length ? `<span class="a2-chip c2"><span class="num">${r.bad.length}</span> para repetir</span>` : ""}</div>
      <p class="a2-note">${r.bad.length ? `<b>${r.bad.length === 1 ? "La que fallaste vuelve" : "Las que fallaste vuelven"}</b> mañana en tu práctica del día: ${fallo}.` : "<b>¡Todas bien!</b> Ya puedes seguir con la Ruta."}</p>
    </section>`;
    done.textContent = "Seguir con la Ruta";
    later.textContent = "Repasar la explicación";
    later.hidden = false;
  }
}

function gramClick(e) {
  const g = state.gram;
  if (!g) return;
  const sl = e.target.closest("[data-say-slow]");
  if (sl) return speak(sl.dataset.saySlow, 0.6);
  const sy = e.target.closest("[data-say]");
  if (sy) return speak(sy.dataset.say);
  const par = e.target.closest("[data-gpar]");
  if (par) return openParada(par.dataset.gpar, { from: g.from });
  const fi = e.target.closest("[data-gficha]");
  if (fi) { state.gram = null; return openTema(fi.dataset.gficha); }
}

function gramDone() {
  const g = state.gram;
  if (!g) return;
  if (g.mode === "parada") return startElige(g.id);
  if (g.mode === "fin") {
    // Seguir con la Ruta: el tema al que prepara la parada (o el Mapa).
    const t = rutaItems().find((x) => x.kind === "parada" && x.id === g.id);
    state.gram = null;
    if (t && t.antes && deckOfKey(t.antes)) { store.setCurrent(t.antes); state.mapa = null; }
    // Sin sesión iniciada: invitación a guardar el progreso antes de seguir con la Ruta.
    if (needLoginInvite()) {
      $("#done-title").textContent = "Parada terminada";
      $("#done-summary").textContent = "Tu avance ya está guardado en este dispositivo.";
      state.doneReturn = "mapa";
      return show("done");
    }
    if (t && t.antes && deckOfKey(t.antes)) return go("mapa");
    return openMapa();
  }
}

function gramLater() {
  const g = state.gram;
  if (!g) return;
  if (g.mode === "fin") { state.gram = { ...g, mode: "parada", back: null }; renderGram(); $("#gram-body").scrollTop = 0; return; }
  gramBack();
}

// «Elige la forma»: se juega con la misma pantalla de práctica.
function eligeItem(p, e) {
  return { card: { id: `elige:${e.id}`, deckId: "", kind: "elige", ru: e.texto, es: e.es, fonetica: e.fonetica || "" }, elige: e, parada: p, key: `elige:${e.id}`, dir: "elige", phase: "quiz", failed: false, hint: 0 };
}

function startElige(id) {
  const p = paradaData(id);
  if (!p || !(p.elige || []).length) return;
  const queue = p.elige.map((e) => eligeItem(p, e));
  const g = state.gram;
  startSession(queue, "Elige la forma", false, g && g.from ? g.from : "home");
  state.session.parada = id;
  state.session.gramFrom = g ? g.from : "home";
  state.session.firstBad = [];
}

// Lo que fallaste al primer intento en días anteriores (para la práctica del día).
function eligePendientes(max = ELIGE_POR_DIA) {
  if (!state.paradas) return [];
  const sod = startOfDay(Date.now());
  const out = [];
  for (const p of state.paradas.values()) {
    for (const e of p.elige || []) {
      const r = store.ejer(`elige:${e.id}`);
      if (r && r.last === 0 && r.t < sod) out.push(eligeItem(p, e));
    }
  }
  return out.sort((a, b) => store.ejer(a.key).t - store.ejer(b.key).t).slice(0, max);
}

// Frase con el hueco (antes de contestar) o con la forma correcta subrayada.
function eligeFrase(e, filled) {
  const parts = esc(e.frase).split("___");
  const gap = filled ? `<span class="el-fill">${esc(e.correcta)}</span>` : `<span class="el-gap" aria-label="hueco"></span>`;
  return parts.join(gap);
}

function renderElige(it) {
  const e = it.elige;
  const s = state.session;
  $("#card").className = "card card-frame study-card sh3d pal-kh st-elige";
  $("#card-badge").hidden = false;
  $("#card-badge").className = "card-badge q";
  $("#card-badge").textContent = it.failed ? "Repetir · Completa la frase" : "Completa la frase";
  $("#study-sub").innerHTML = `Elige la forma${it.parada.ru ? ` · <span lang="ru">${esc(it.parada.ru)}</span>` : ""}`;
  $("#card-front").innerHTML = eligeFront(e, false);
  $("#card-speak").hidden = true;
  it.options = shuffle(e.opciones.map((o) => ({ text: o, correct: o === e.correcta })));
  $("#options").innerHTML = it.options.map((o, i) => `<button class="option ru" type="button" data-opt="${i}" lang="ru"><span class="key">${i + 1}</span><span class="opt-text"><span>${esc(o.text)}</span></span></button>`).join("");
  $("#options").hidden = false;
  $("#st-ask").textContent = "Elige la forma que va en el hueco.";
  $("#st-ask").hidden = false;
  $("#btn-hint").innerHTML = hintBtnHtml("Dame una pista", "Te da una idea, no la respuesta. Cuenta como error.");
  $("#btn-hint").hidden = false;
  $("#study-exit").hidden = false;
  s.answered = false;
}

function eligeFront(e, done) {
  return `<span class="big-ru el-frase" lang="ru">${eligeFrase(e, done)}</span>
    ${done && e.fonetica ? `<span class="fon-big el-fon">${esc(e.fonetica)}</span>` : ""}
    <span class="st-div el-div" aria-hidden="true"></span>
    ${e.base ? `<span class="el-base">Palabra base <span class="el-base-w" lang="ru">${esc(e.base)}</span></span>` : ""}
    <span class="el-es">${esc(e.es)}</span>`;
}

// Después de contestar: la frase completa, su fonética y audio; si fallaste, el porqué.
function revealElige(it, right) {
  const e = it.elige;
  $("#card-front").innerHTML = eligeFront(e, true);
  $("#card-speak").hidden = !canSpeak();
  $("#btn-hint").hidden = true;
  $("#hint-box").hidden = true;
  const box = $("#options");
  box.querySelectorAll(".el-msg, .el-err").forEach((x) => x.remove());
  if (right) {
    box.insertAdjacentHTML("beforeend", `<p class="el-msg" role="status">¡Bien! En un momento pasa a la siguiente.</p>`);
  } else {
    box.insertAdjacentHTML("beforeend", `<section class="el-err" role="status"><b>Va <span lang="ru">${esc(e.correcta)}</span>.</b><p>${gramText(e.porque, "t")}</p></section>`);
    $("#btn-next").textContent = "Siguiente";
    $("#btn-next").hidden = false;
  }
}

function eligeHint(it) {
  const e = it.elige;
  return e.pista || (e.base ? `Fíjate en la palabra que va junto al hueco. Su forma de diccionario es «${e.base}».` : "Fíjate en la palabra que va junto al hueco.");
}

function finishElige(s) {
  const id = s.parada;
  const p = paradaData(id);
  const tot = p ? p.elige.length : s.resolved;
  store.setEjer(`parada:${id}`, true);
  const bad = s.firstBad || [];
  state.gram = { mode: "fin", id, from: s.gramFrom || "home", result: { ok: Math.max(0, tot - bad.length), tot, bad } };
  state.session = null;
  renderGram();
  show("gram");
}

// ---------- Ajustes y cuenta ----------
function renderSync() {
  // La portada 3.1 no muestra el chip de sincronización; el estado vive en Ajustes.
  if (state.view === "settings") renderAccount();
}

function renderAccount() {
  const box = $("#account-box");
  if (!store.syncConfigured) {
    box.innerHTML = store.syncWanted
      ? `<p class="muted">No se pudo conectar con la sincronización. Tu progreso se guarda en este dispositivo y se volverá a intentar la próxima vez que abras la app.</p>`
      : `<p class="muted">La sincronización todavía no está configurada, así que tu progreso se guarda solo en este dispositivo.</p>`;
    return;
  }
  if (store.user) {
    const label = { ok: "sincronizado", saving: "guardando…", error: "error al sincronizar", offline: "sin conexión" }[store.status] || "listo";
    box.innerHTML = `<p>Sesión iniciada como <b>${esc(store.user.email)}</b>.</p>
      <p class="muted">Estado: ${label}. Tu progreso se guarda en la nube y aparece en todos tus dispositivos.</p>
      <div class="confirm-actions">
        <button class="btn btn-ghost" id="sync-now" type="button">Sincronizar ahora</button>
        <button class="btn btn-ghost" id="sign-out" type="button">Cerrar sesión</button>
      </div>`;
    return;
  }
  const signup = state.loginStep === "signup";
  box.innerHTML = `<form class="account-form" id="login-form" novalidate>
      <p class="muted">${signup
        ? "Crea tu cuenta una sola vez. Después entra con el mismo correo y contraseña en cada dispositivo."
        : "Entra con tu correo y contraseña para guardar tu progreso en la nube."}</p>
      <label for="login-email" class="visually-hidden">Correo</label>
      <input id="login-email" type="email" autocomplete="email" placeholder="tu@correo.com" required value="${esc(state.loginEmail)}">
      <label for="login-password" class="visually-hidden">Contraseña</label>
      <input id="login-password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" placeholder="${signup ? "Contraseña (mínimo 6 caracteres)" : "Contraseña"}" required minlength="6">
      <button class="btn btn-primary" type="submit">${signup ? "Crear cuenta" : "Entrar"}</button>
      <button class="link-btn" type="button" id="login-switch">${signup ? "Ya tengo cuenta: entrar" : "¿No tienes cuenta? Crea una"}</button>
    </form>`;
}

// Traduce los errores de inicio de sesión de Supabase.
function authMessage(err) {
  const m = String((err && err.message) || "");
  if (/invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos.";
  if (/already registered|already exists/i.test(m)) return "Ese correo ya tiene cuenta. Usa «Entrar».";
  if (/email not confirmed/i.test(m)) return "Falta confirmar tu correo. Abre el enlace que te llegó o apaga «Confirm email» en Supabase.";
  if (/at least 6|password should be/i.test(m)) return "La contraseña debe tener al menos 6 caracteres.";
  if (/rate limit|too many/i.test(m)) return "Demasiados intentos. Espera un momento y vuelve a intentar.";
  if (/failed to fetch|network/i.test(m)) return "Sin conexión con el servidor. Revisa tu internet.";
  return m || "No se pudo completar. Intenta de nuevo.";
}

function renderSettings() {
  const s = store.settings;
  $(`#dir-${s.dir === "both" ? "both" : s.dir}`).checked = true;
  $("#new-per-day").value = s.newPerDay;
  $("#opt-cursive").checked = !!s.cursive;
  $("#opt-autospeak").checked = !!s.autoSpeak;
  $("#opt-sound").checked = s.sound !== false;
  $("#opt-fon").checked = s.fonetica !== false;
  $("#opt-ayudas").checked = s.ayudas !== false;
  $("#opt-name").value = s.name || "";
  $(`#theme-${s.theme === "light" ? "light" : "dark"}`).checked = true;
  $("#reset-confirm").hidden = true;
  $("#reset-ask").hidden = false;
  $("#app-version").textContent = `Ruso de bolsillo ${APP_VERSION}${IS_BETA ? " · beta (progreso de prueba)" : ""}`;
  $("#deck-toggles").innerHTML = state.decks
    .map((d) => `<label class="deck-toggle" for="en-${esc(d.id)}"><span>${esc(d.title)}</span>
      <input class="switch" type="checkbox" id="en-${esc(d.id)}" data-toggle="${esc(d.id)}" ${deckEnabled(d) ? "checked" : ""}></label>`)
    .join("");
  renderAccount();
}

function setDeckEnabled(ids, on) {
  const disabled = { ...store.settings.disabled };
  for (const id of ids) {
    if (on) delete disabled[id];
    else disabled[id] = true;
  }
  store.setSetting("disabled", disabled);
}

// ---------- Reportar falla ----------
const REPORT_MAX = 2000;
const REPORT_GAP_MS = 10000;
let lastReportAt = 0;

// Dónde estaba Carol: vista, tema y modo (solo ids y nombres de pantalla).
function screenInfo() {
  const v = state.view;
  const deck = state.currentDeck && ["tema", "study", "frase", "dialogo", "cajas", "palabra", "done"].includes(v) ? state.currentDeck.id : "";
  let mode = "";
  if (v === "study" && state.session) mode = state.session.audio ? "audio" : state.session.cram ? "repaso" : "palabras";
  else if (["frase", "dialogo", "cajas"].includes(v)) mode = v;
  if (v === "temas" && state.temasMod) mode = state.temasMod;
  return [v, deck, mode].filter(Boolean).join("/");
}

function reportEnv() {
  const c = navigator.connection || {};
  const cur = suggestedDeck();
  return {
    userAgent: String(navigator.userAgent || "").slice(0, 200),
    viewport: `${innerWidth}x${innerHeight}`,
    tema: document.documentElement.dataset.theme === "light" ? "claro" : "oscuro",
    idioma: navigator.language || "",
    conexion: `${navigator.onLine ? "en línea" : "sin conexión"}${c.effectiveType ? " " + c.effectiveType : ""}${c.saveData ? " ahorro" : ""}`,
    tema_actual: cur ? cur.id : null,
    errores: recentErrors.slice()
  };
}

function openReport(kind = "falla") {
  const pantalla = screenInfo();
  const com = kind === "comentario";
  state.report = { pantalla, kind };
  openSheet(com ? "Comentarios" : "Reportar falla", `<form class="rep-form" id="rep-form" novalidate>
      <label class="rep-label" for="rep-text">${com ? "¿Qué te gustaría decirnos?" : "¿Qué pasó?"}</label>
      <textarea id="rep-text" rows="5" maxlength="${REPORT_MAX}" placeholder="${com ? "Ideas, sugerencias o lo que te gusta de la app" : "Cuéntanos qué viste y qué esperabas ver"}" aria-describedby="rep-count rep-msg"></textarea>
      <div class="rep-meta"><span class="rep-msg" id="rep-msg" role="status"></span><span class="rep-count" id="rep-count"><span class="num">0</span>/<span class="num">${REPORT_MAX}</span></span></div>
      <div class="rep-actions">
        <button class="btn btn-primary" type="submit">Enviar</button>
        <button class="btn btn-ghost" type="button" data-sheet-close>Cancelar</button>
      </div>
    </form>`, com ? "Con tu mensaje enviamos la versión en que estás." : "Con tu mensaje enviamos la pantalla y la versión en que estás.");
  requestAnimationFrame(() => $("#rep-text") && $("#rep-text").focus());
}

async function submitReport() {
  const ta = $("#rep-text");
  const msg = $("#rep-msg");
  const text = ta.value.trim();
  if (!text) { msg.textContent = "Escribe unas palabras para que podamos ayudarte."; ta.focus(); return; }
  if (Date.now() - lastReportAt < REPORT_GAP_MS) { msg.textContent = "Espera unos segundos para enviar otro reporte."; return; }
  lastReportAt = Date.now();
  const kind = (state.report && state.report.kind) || "falla";
  const entry = {
    tipo: kind,
    pantalla: (state.report && state.report.pantalla) || screenInfo(),
    version: APP_VERSION,
    descripcion: text.slice(0, REPORT_MAX),
    entorno: reportEnv()
  };
  closeSheet();
  // El aviso dice la verdad: «Recibimos» solo si llegó; si no, quedó guardado en el teléfono.
  let sent = false;
  try { sent = await store.reportFalla(entry); } catch (e) { console.warn("reporte", e); }
  const what = kind === "comentario" ? "comentario" : "reporte";
  toast(sent ? `¡Gracias! Recibimos tu ${what}` : `Guardamos tu ${what} en este dispositivo; se enviará cuando haya conexión`);
}

// ---------- Privacidad (mismo texto que docs/privacidad.md) ----------
const PRIVACIDAD = [
  ["Qué se guarda", "Si creas una cuenta: tu correo y tu progreso de estudio (palabras vistas, repasos, listas, notas y ajustes). Se guardan en Supabase para que puedas continuar en otro dispositivo. Sin cuenta, el progreso se queda solo en tu dispositivo."],
  ["Qué no se hace", "No se venden ni se comparten tus datos, no hay anuncios y no se usan cookies de seguimiento."],
  ["Visitas", "La versión 2.0 cuenta visitas de forma anónima con GoatCounter (sin cookies ni datos personales). La beta no las cuenta."],
  ["Reportes", "Si usas «Reportar falla» o «Mi respuesta también es correcta», se guarda lo que escribes y tu cuenta, para poder revisarlo."],
  ["Usuarios beta", "Para ser usuario beta hace falta registrarte con una cuenta. Así tu avance y tu uso de la app ayudan a optimizar los datos y a mejorar la aplicación. Para eso se revisa el avance de las personas que prueban la beta con un seudónimo (por ejemplo «Beta 1»), sin mostrar tu correo."],
  ["Borrar tus datos", "Escribe desde «Reportar falla» o a carkovskismind en GitHub y se borra tu cuenta y tu progreso. Cuando la información se haya borrado, se te avisará por correo electrónico."]
];

function openPrivacidad() {
  openSheet("Privacidad", `<div class="priv">${PRIVACIDAD.map(([h, p]) => `<h3>${esc(h)}</h3><p>${esc(p)}</p>`).join("")}</div>`);
}

// ---------- Eventos ----------
function bind() {
  $("#audio-note-x").addEventListener("click", hideAudioNote);
  for (const b of $$("[data-report]")) b.hidden = !REPORT_BUTTON;
  document.addEventListener("click", (e) => { if (e.target.closest("[data-report]")) openReport("falla"); });
  $("#open-comentarios").addEventListener("click", () => openReport("comentario"));
  $("#open-privacidad").addEventListener("click", openPrivacidad);
  $("#sheet-body").addEventListener("input", (e) => {
    if (e.target.id !== "rep-text") return;
    $("#rep-count .num").textContent = e.target.value.length;
    $("#rep-msg").textContent = "";
  });
  $("#sheet-body").addEventListener("submit", (e) => {
    if (e.target.id !== "rep-form") return;
    e.preventDefault();
    submitReport();
  });
  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-go]");
    if (g) return go(g.dataset.go);
    const t = e.target.closest("[data-open-tema]");
    if (t) return openTema(t.dataset.openTema);

  });
  $("#temas-back").addEventListener("click", () => go(state.temasFrom === "mapa" ? "mapa" : state.temasFrom === "modulo" ? "modulo" : "home"));
  $("#temas-ruta").addEventListener("click", openMapa);
  $("#mod-back").addEventListener("click", () => go("mapa"));
  const modOpen = (e) => {
    const w = e.target.closest("[data-mword]");
    if (w) { const d = deckOfKey(w.dataset.mword); if (d) startMode(d, "words"); return; }
    const pa = e.target.closest("[data-mpar]");
    if (pa) return openParada(pa.dataset.mpar, { from: "modulo" });
    const it = e.target.closest("[data-mtema]");
    if (!it) return;
    const unit = deckOfKey(it.dataset.mtema);
    if (unit) markCurrent(unit);
    const id = baseOf(unit) ? baseOf(unit).id : it.dataset.mtema;
    state.openTile = id;
    state.openSet = true;
    state.temaFilters = new Set();
    $("#temas-q").value = "";
    go("temas");
    const t = $(`#temas-grid [data-tile="${id}"]`);
    if (t) t.scrollIntoView({ block: "center" });
  };
  $("#mod-list").addEventListener("click", modOpen);
  $("#mod-list").addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-mtema], [data-mpar]")) { e.preventDefault(); modOpen(e); } });
  $("#temas-q").addEventListener("input", () => { state.openSet = false; renderTemas(); });
  $("#temas-q").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.target.value = ""; renderTemas(); } });
  $("#temas-q-clear").addEventListener("click", () => { $("#temas-q").value = ""; renderTemas(); $("#temas-q").focus(); });

  // Portada
  const startIfAny = () => {
    if (state.noDecks) return toast("No se cargaron los temas. Revisa tu conexión y vuelve a abrir la app.");
    if ($("#start-card").getAttribute("aria-disabled") === "true") return toast("Hoy no hay práctica pendiente. ¡Todo al día!");
    startToday();
  };
  $("#start-card").addEventListener("click", () => { if (!state.doneToday) marcarAyuda("inicio"); return state.doneToday ? openFin() : startIfAny(); });
  $("#h-aviso-go").addEventListener("click", () => { if (state.aviso) openParada(state.aviso.id, { from: "home" }); });
  $("#h-aviso-skip").addEventListener("click", () => { if (state.aviso) saltarParada(state.aviso.id); startIfAny(); });
  $("#fin-end").addEventListener("click", finEnd);
  $("#fin-opts").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fin]");
    if (!b || !state.finSug) return;
    const s = state.finSug[Number(b.dataset.fin)];
    if (!s) return;
    // Una sugerencia no cambia el tema actual ni «Sigue donde ibas».
    startMode(s.deck, s.key, s.idx, true);
  });
  // Buscador del inicio
  $("#h-q").addEventListener("input", renderSearch);
  $("#h-q").addEventListener("keydown", (e) => { if (e.key === "Escape") clearSearch(); });
  $("#h-q-clear").addEventListener("click", () => { clearSearch(); $("#h-q").focus(); });
  $("#h-results").addEventListener("click", (e) => {
    const say = e.target.closest("[data-say]");
    if (say) return speak(say.dataset.say);
    const w = e.target.closest("[data-sword]");
    if (w) return openPalabra(w.dataset.sword);
    const t = e.target.closest("[data-stema]");
    if (t) return openTema(t.dataset.stema);
  });
  $("#h-sigue").addEventListener("click", (e) => {
    const t = e.currentTarget;
    const deck = deckOfKey(t.dataset.deck || "");
    if (deck && t.dataset.open) return openTema(unitKeyOf(deck));
    if (deck) { state.currentDeck = deck; markCurrent(deck); return startDeck(deck); }
    go("modulos");
  });
  $("#h-mapa").addEventListener("click", openMapa);
  $("#h-leer").addEventListener("click", openLeer);
  $("#h-gram").addEventListener("click", () => openGramIndice("home"));

  // Temas
  $("#temas-chips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-filter]");
    if (!c) return;
    if (c.dataset.filter === FILTRO_GRAM) return openGramIndice("temas");
    const f = state.temaFilters || (state.temaFilters = new Set());
    if (f.has(c.dataset.filter)) f.delete(c.dataset.filter); else f.add(c.dataset.filter);
    state.openSet = false;
    renderTemas();
  });
  $("#temas-grid").addEventListener("click", (e) => {
    const say = e.target.closest("[data-say]");
    if (say) return speak(say.dataset.say);
    const mode = e.target.closest("[data-mode]");
    if (mode) return startMode(state.deckById.get(mode.dataset.deck), mode.dataset.mode);
    const act = e.target.closest("[data-act]");
    if (act) {
      const deck = state.deckById.get(act.dataset.deck);
      if (act.dataset.act === "list") return openTema(deck.id);
      if (act.dataset.act === "dudas") openSheet("Dudas de gramática", dudasHtml(deck), deck.title);
      return;
    }
    if (e.target.closest("[data-leer]")) return openLeer();
    const tile = e.target.closest("[data-tile]");
    if (tile && !tile.classList.contains("open")) openTileAnimated(tile.dataset.tile);
  });
  $("#temas-grid").addEventListener("keydown", (e) => {
    const lt = e.target.closest("[data-leer]");
    if (lt && (e.key === "Enter" || e.key === " ") && e.target === lt) {
      e.preventDefault();
      return openLeer();
    }
    const tile = e.target.closest("[data-tile]");
    if (tile && (e.key === "Enter" || e.key === " ") && e.target === tile) {
      e.preventDefault();
      openTileAnimated(tile.dataset.tile);
    }
  });

  // Tema
  $("#tema-back").addEventListener("click", () => go(state.temaFrom === "mapa" ? "mapa" : state.temaFrom === "home" ? "home" : "temas"));
  $("#tema-search-toggle").addEventListener("click", () => {
    const box = $("#tema-search-box");
    box.hidden = !box.hidden;
    $("#tema-search-toggle").setAttribute("aria-expanded", String(!box.hidden));
    if (!box.hidden) $("#deck-search").focus();
  });
  $("#tema-modes").addEventListener("click", (e) => {
    const m = e.target.closest("[data-mode]");
    if (m && !m.disabled) startMode(state.currentDeck, m.dataset.mode);
  });
  $("#tema-dudas").addEventListener("click", (e) => {
    const sl = e.target.closest("[data-say-slow]");
    if (sl) return speak(sl.dataset.saySlow, 0.6);
    const say = e.target.closest("[data-say]");
    if (say) return speak(say.dataset.say);
    const d = state.currentDeck;
    if (e.target.closest("[data-antes]")) {
      store.setEjer(`antes:${d.id}`, true);
      state.antesOpen = false;
      renderTema();
      return;
    }
    const pa = e.target.closest("[data-antes-par]");
    if (pa) { store.setEjer(`antes:${d.id}`, true); return openParada(pa.dataset.antesPar, { from: "tema" }); }
    const t = e.target.closest("#dudas-toggle");
    if (!t) return;
    state.antesOpen = !state.antesOpen;
    renderTema();
  });
  $("#tema-cram").addEventListener("click", () => startCram(state.currentDeck));
  $("#deck-search").addEventListener("input", renderWords);
  $("#deck-words").addEventListener("click", (e) => {
    const p = e.target.closest("[data-pick]");
    if (p) {
      const id = p.dataset.pick;
      const on = !store.picked(id);
      store.setPicks([id], on);
      toast(on ? "Agregada a tu práctica de hoy" : "Quitada de tu práctica de hoy");
      return renderWords();
    }
    if (e.target.closest("[data-select]")) return;
    const row = e.target.closest("[data-word]");
    if (!row) return;
    if (state.selecting) {
      const id = row.dataset.word;
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);
      return renderWords();
    }
    openPalabra(row.dataset.word);
  });
  $("#deck-words").addEventListener("keydown", (e) => {
    const row = e.target.closest("[data-word]");
    if (row && e.target === row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); row.click(); }
  });
  $("#deck-words").addEventListener("change", (e) => {
    const c = e.target.closest("[data-select]");
    if (!c) return;
    if (c.checked) state.selected.add(c.dataset.select);
    else state.selected.delete(c.dataset.select);
    renderSelectBar();
  });
  $("#select-toggle").addEventListener("click", () => {
    state.selecting = !state.selecting;
    state.selected = new Set();
    renderWords();
  });
  $("#select-all").addEventListener("click", () => {
    for (const c of filteredCards()) state.selected.add(c.id);
    renderWords();
  });
  $("#select-add").addEventListener("click", () => {
    const ids = Array.from(state.selected);
    store.setPicks(ids, true);
    toast(ids.length === 1 ? "1 palabra agregada a hoy" : `${ids.length} palabras agregadas a hoy`);
    state.selecting = false;
    state.selected = new Set();
    renderWords();
  });

  // Palabra
  $("#palabra-back").addEventListener("click", () => {
    if (state.currentDeck && state.currentDeck.id === state.word.deckId) { renderTema(); show("tema"); }
    else openTema(state.word.deckId);
  });
  $("#palabra-body").addEventListener("click", (e) => {
    const say = e.target.closest("[data-say]");
    if (say) return speak(say.dataset.say);
    const n = e.target.closest("[data-wnote]");
    if (n) {
      if (n.dataset.wnote === "edit") return renderPalabra(true);
      if (n.dataset.wnote === "save") { store.setNote(state.word.id, $("#word-note").value); toast("Nota guardada"); }
      return renderPalabra(false);
    }
    if (e.target.closest("[data-wpick]")) {
      const on = !store.picked(state.word.id);
      store.setPicks([state.word.id], on);
      toast(on ? "Agregada a tu práctica de hoy" : "Quitada de tu práctica de hoy");
      renderPalabra();
    }
  });

  // Estudio con tarjetas
  $("#btn-learned").addEventListener("click", markLearned);
  // 4.2.0: palabra nueva: tocar la tarjeta (izquierda «ya la conozco», derecha «continuar»).
  // Todavía no hay una acción de repaso propia para «ya la conozco»: las dos mitades continúan.
  $("#card").addEventListener("click", (e) => {
    if (!$("#card").classList.contains("st-learn")) return;
    const say = e.target.closest("[data-say]");
    if (say) return speak(say.dataset.say);
    if (e.target.closest("button, a, [data-slow]")) return;
    markLearned();
  });
  $("#card").addEventListener("keydown", (e) => {
    if (!$("#card").classList.contains("st-learn") || e.target !== $("#card")) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); markLearned(); }
  });
  $("#btn-reveal").addEventListener("click", revealQA);
  $("#btn-knew").addEventListener("click", () => selfCheck(true));
  $("#btn-didnt").addEventListener("click", () => selfCheck(false));
  $("#btn-hint").addEventListener("click", useHint);
  $("#btn-next").addEventListener("click", next);
  $("#note-box").addEventListener("click", handleNoteClick);
  $("#options").addEventListener("click", (e) => {
    const b = e.target.closest("[data-opt]");
    if (b) choose(Number(b.dataset.opt));
  });
  $("#card-front").addEventListener("click", (e) => {
    if (e.target.closest("#audio-repeat") && state.session) speak(state.session.queue[0].card.ru);
  });
  $("#card-speak").addEventListener("click", () => {
    const s = state.session;
    if (s) speak(s.queue[0].card.ru);
  });
  $("#study-close").addEventListener("click", closeSession);
  $("#study-exit").addEventListener("click", closeSession);
  $("#done-home").addEventListener("click", doneContinue);
  $("#done-later").addEventListener("click", doneContinue);
  $("#done-signin").addEventListener("click", () => {
    state.loginStep = "signin";
    go("settings");
    const em = $("#login-email");
    if (em) em.focus();
  });
  $("#dlg-stay").addEventListener("click", closeDlg);
  $("#dlg-leave").addEventListener("click", () => { const f = dlgOnLeave; closeDlg(); if (f) f(); });
  document.addEventListener("keydown", (e) => {
    if (!dlgOpen()) return;
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); closeDlg(); }
  }, true);

  // Mapa
  $("#mapa-stage").addEventListener("click", mapaClick);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (state.view === "mapa") mapaHits(); });

  // Aprende a leer
  $("#leer-back").addEventListener("click", () => go(state.leerFrom || "temas"));
  // Reto de gramática
  $("#reto-close").addEventListener("click", retoBack);
  $("#reto-body").addEventListener("click", retoClick);
  $("#leer-steps").addEventListener("click", (e) => {
    const b = e.target.closest("[data-step]");
    if (b) { state.leer = { step: Number(b.dataset.step), sel: 0 }; renderLeer(); window.scrollTo(0, 0); }
  });
  $("#leer-body").addEventListener("click", leerClick);

  // Diálogo y cajas
  $("#dialogo-body").addEventListener("click", dialogoClick);
  $("#dialogo-close").addEventListener("click", () => {
    const dl = state.dl;
    if (dl) clearTimeout(dl.timer);
    state.dl = null;
    backTo(dl ? dl.returnTo : "home");
  });
  $("#dialogo-es").addEventListener("click", (e) => {
    if (!state.dl) return;
    state.dl.es = !state.dl.es;
    e.currentTarget.setAttribute("aria-pressed", String(state.dl.es));
    renderDialogo();
  });
  $("#cajas-body").addEventListener("click", cajasClick);
  $("#cajas-dic").addEventListener("click", openCajasDic);
  $("#gram-back").addEventListener("click", gramBack);
  $("#gram-done").addEventListener("click", gramDone);
  $("#gram-later").addEventListener("click", gramLater);
  $("#gram-body").addEventListener("click", gramClick);
  $("#gram-body").addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-gpar]")) { e.preventDefault(); e.target.click(); }
  });
  $("#cajas-close").addEventListener("click", () => {
    const cj = state.cj;
    state.cj = null;
    backTo(cj ? cj.returnTo : "home");
  });

  // Frases
  $("#frase-body").addEventListener("click", fraseClick);
  $("#frase-close").addEventListener("click", () => {
    const fr = state.fr;
    if (fr) clearTimeout(fr.timer);
    closeSheet();
    state.fr = null;
    backTo(fr ? fr.returnTo : "home");
  });

  // Hoja inferior
  $("#sheet").addEventListener("click", (e) => {
    if (e.target.closest("[data-sheet-close]")) return closeSheet();
    const say = e.target.closest("[data-say]");
    if (say) return speak(say.dataset.say);
    if (cajasDicClick(e)) return;
    dicClick(e);
  });
  document.addEventListener("visibilitychange", () => { if (state.view === "home") startBlink(); else stopBlink(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#sheet").hidden) { e.preventDefault(); closeSheet(); }
  });

  document.addEventListener("keydown", (e) => {
    const s = state.session;
    if (state.view !== "study" || !s || e.target.closest("input, textarea")) return;
    // La tarjeta de palabra nueva ya atendió la tecla (Enter/Espacio): no avanzar dos veces.
    if (e.defaultPrevented) return;
    const it = s.queue[0];
    // Escape pregunta igual que el botón Atrás del celular.
    if (e.key === "Escape") { e.preventDefault(); return openDlg("repaso"); }
    if (s.answered) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); next(); }
      return;
    }
    if (it.phase === "learn") {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); markLearned(); }
    } else if (it.dir === "qa") {
      if ($("#selfcheck").hidden) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); revealQA(); }
      } else if (e.key === "1") selfCheck(false);
      else if (e.key === "2") selfCheck(true);
    } else if (["1", "2", "3", "4"].includes(e.key)) {
      choose(Number(e.key) - 1);
    } else if (e.key.toLowerCase() === "h") {
      useHint();
    }
  });

  // Ajustes
  for (const r of $$('input[name="dir"]')) {
    r.addEventListener("change", () => { if (r.checked) store.setSetting("dir", r.value); });
  }
  $("#new-per-day").addEventListener("change", (e) => {
    const n = Math.max(0, Math.min(200, Math.round(Number(e.target.value) || 0)));
    e.target.value = n;
    store.setSetting("newPerDay", n);
  });
  $("#opt-name").addEventListener("change", (e) => store.setSetting("name", e.target.value.trim().slice(0, 24)));
  $("#opt-cursive").addEventListener("change", (e) => store.setSetting("cursive", e.target.checked));
  $("#opt-autospeak").addEventListener("change", (e) => store.setSetting("autoSpeak", e.target.checked));
  $("#opt-fon").addEventListener("change", (e) => { store.setSetting("fonetica", e.target.checked); applyFon(); });
  $("#opt-ayudas").addEventListener("change", (e) => store.setSetting("ayudas", e.target.checked));
  $("#ayudas-reset").addEventListener("click", () => {
    try { localStorage.removeItem(AYUDA_KEY); } catch { /* sin almacenamiento */ }
    store.setSetting("ayudas", true);
    $("#opt-ayudas").checked = true;
    toast("Las notas de ayuda vuelven a salir");
  });
  $("#opt-sound").addEventListener("change", (e) => {
    store.setSetting("sound", e.target.checked);
    if (e.target.checked) playSound(true);
  });
  for (const r of $$('input[name="theme"]')) {
    r.addEventListener("change", () => { if (r.checked) { store.setSetting("theme", r.value); applyTheme(); } });
  }
  $("#deck-toggles").addEventListener("change", (e) => {
    const t = e.target.closest("[data-toggle]");
    if (t) setDeckEnabled([t.dataset.toggle], t.checked);
  });
  $("#reset-ask").addEventListener("click", () => { $("#reset-confirm").hidden = false; $("#reset-ask").hidden = true; });
  $("#reset-no").addEventListener("click", () => { $("#reset-confirm").hidden = true; $("#reset-ask").hidden = false; });
  $("#reset-yes").addEventListener("click", () => {
    store.reset();
    try { localStorage.removeItem(HOY_KEY); } catch { /* sin almacenamiento */ }
    activityCache = null;
    $("#reset-confirm").hidden = true;
    $("#reset-ask").hidden = false;
    toast("Progreso reiniciado");
  });

  $("#account-box").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const email = $("#login-email").value.trim();
      const password = $("#login-password").value;
      state.loginEmail = email;
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Escribe un correo válido.");
      if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
      if (state.loginStep === "signup") {
        const inside = await store.signUp(email, password);
        if (inside) toast("Cuenta creada. Ya estás dentro.");
        else {
          state.loginStep = "signin";
          toast("Cuenta creada. Confirma tu correo con el enlace que te llegó y después entra.");
        }
      } else {
        await store.signIn(email, password);
        toast("Sesión iniciada");
      }
    } catch (err) {
      toast(authMessage(err));
    } finally {
      btn.disabled = false;
      renderAccount();
    }
  });
  $("#account-box").addEventListener("click", async (e) => {
    if (e.target.id === "login-switch") {
      const input = $("#login-email");
      if (input) state.loginEmail = input.value.trim();
      state.loginStep = state.loginStep === "signup" ? "signin" : "signup";
      renderAccount();
    }
    if (e.target.id === "sync-now") { await store.pull(); toast("Sincronizado"); }
    if (e.target.id === "sign-out") { await store.signOut(); state.loginStep = "signin"; renderAccount(); renderSync(); }
  });
}

// ---------- Contador de visitas (GoatCounter) ----------
function startVisitCounter() {
  const code = String((window.RUSSO_CONFIG || {}).goatcounter || "").trim();
  if (!code || !/^[a-z0-9-]+$/i.test(code) || location.protocol === "file:") return;
  if (IS_BETA) return; // la beta no cuenta visitas para no mezclar estadísticas
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  document.head.appendChild(s);
}

// ---------- Arranque ----------
// Etiqueta discreta para saber que estás en la beta.
function markBeta() {
  if (!IS_BETA) return;
  document.documentElement.classList.add("is-beta");
  document.title = "Ruso de bolsillo · beta";
  const tag = document.createElement("div");
  tag.className = "beta-tag";
  tag.textContent = "BETA";
  tag.setAttribute("aria-label", "Versión beta: progreso de prueba");
  document.body.appendChild(tag);
  $("#palabra-beta").hidden = false;
}

// Atajos de la app instalada (manifest.webmanifest): ./?ir=hoy|temas|mapa|leer
function openShortcut() {
  let ir = "";
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has("ir")) return;
    ir = (u.searchParams.get("ir") || "").toLowerCase();
    u.searchParams.delete("ir");
    history.replaceState(null, "", u.pathname + u.search + u.hash); // limpia la URL
  } catch (e) { return; }
  if (ir === "hoy") go("home");
  else if (ir === "temas") { state.openSet = false; go("temas"); }
  else if (ir === "mapa") openMapa();
  else if (ir === "leer") openLeer();
}

async function main() {
  markBeta();
  applyTheme();
  applyFon();
  bind();
  renderSync();
  show("home");
  try {
    await loadDecks();
  } catch (e) {
    console.error(e);
    $("#h-sigue-t").textContent = "No se pudieron cargar los temas";
  }
  renderHome();
  openShortcut();
  // Pantalla de carga: se quita cuando la primera pantalla ya está pintada (mín. 1 s, máx. 8 s)
  requestAnimationFrame(() => requestAnimationFrame(() => { if (window.hideSplash) window.hideSplash(); }));
  store.init().then(renderSync).catch((e) => console.warn(e));

  startVisitCounter();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    // Si ya había una versión abierta y llega una nueva, se recarga sola (en el inicio)
    // para no quedarse con pantallas de la versión anterior.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || state.updatePending) return;
      state.updatePending = true;
      if (state.view === "home") location.reload();
      else toast("Hay una versión nueva; se aplica al volver al inicio");
    });
    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch((e) => console.warn("SW", e));
  }
}

main();
