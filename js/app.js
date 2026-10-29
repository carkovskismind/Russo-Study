import { Store, IS_BETA } from "./store.js";
import { schedule, endOfDay, startOfDay, dateKey, DAY } from "./srs.js";

const APP_VERSION = "3.0.0";
const NEW_PER_DECK_SESSION = 20;
const PILOT = "familia";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  decks: [],
  deckById: new Map(),
  currentDeck: null,
  temaFilter: "Todos",
  dudas: {},
  ej: {},
  lectura: null,
  leer: { step: 0, sel: 0 },
  ruta: null,
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
    if (state.decks.length) rebuildMine();
    if (state.view === "home") renderHome();
    if (state.view === "temas") renderTemas();
    if (state.view === "tema") renderTema();
  }
  if (what === "auth" && state.view === "settings") renderSettings();
});

// ---------- Aspecto de cada tema ----------
const PALS = ["lav", "pe", "kh", "bl", "li", "pk", "mint", "aq"];
const SVG = {
  book: `<svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M32 18c-7-5-16-6-24-4v36c8-2 17-1 24 4zM32 18c7-5 16-6 24-4v36c-8-2-17-1-24 4zM32 18v36"/><text x="20" y="38" text-anchor="middle" font-family="Manrope,sans-serif" font-weight="800" font-size="12" fill="currentColor" stroke="none">Аа</text></svg>`,
  palette: `<svg width="52" height="52" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M32 8C16 8 6 20 6 32s10 22 22 22c5 0 6-4 4-7s-1-7 4-7h8c8 0 14-6 14-13C58 16 46 8 32 8z"/><circle cx="20" cy="26" r="4.5" fill="currentColor"/><circle cx="32" cy="18" r="4.5" stroke-width="2.5"/><circle cx="44" cy="24" r="4.5" fill="currentColor"/><circle cx="18" cy="39" r="4.5" stroke-width="2.5"/></svg>`,
  house: `<svg width="54" height="54" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 32L32 12l24 20M15 28v26h34V28M28 54V40h9v14M44 16v9"/></svg>`
};
SVG.star = `<svg width="50" height="50" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2z"/></svg>`;
const VIS = {
  familia: { pal: "lav", art: { type: "img", src: "img/familia.png" } },
  saludos: { pal: "pe", art: { type: "head", src: "img/saludos.png" } },
  numeros: { pal: "red", art: { type: "num", text: "123" } },
  basicas: { pal: "kh", art: { type: "svg", svg: SVG.book } },
  colores: { pal: "li", art: { type: "svg", svg: SVG.palette } },
  casa: { pal: "pe", art: { type: "svg", svg: SVG.house } },
  "mis-palabras": { pal: "aq", art: { type: "svg", svg: SVG.star } }
};
const RU_NAME = {
  saludos: "Приве́т", basicas: "Слова́", familia: "Семья́", profesiones: "Профе́ссии", animales: "Живо́тные",
  casa: "Дом", ciudad: "Го́род", naturaleza: "Приро́да", calendario: "Календа́рь", numeros: "Чи́сла",
  colores: "Цвета́", adjetivos: "Хара́ктер", ideas: "Иде́и", verbos: "Глаго́лы", juegos: "И́гры",
  instrumentos: "Му́зыка", comida: "Еда́", "ropa-cuerpo": "Оде́жда", escuela: "Шко́ла", textos: "Те́ксты",
  cultura: "Культу́ра", servilismo: "Уго́дник", expresiones: "Фра́зы", paises: "Стра́ны",
  "reglas-gentilicios": "мексика́нка", "falsos-amigos": "Ло́жные друзья́", casos: "Падежи́", "gramatica-verbos": "я чита́ю", genero: "Род",
  plurales: "кни́га → кни́ги", posesion: "у меня́ есть", "gramatica-numerales": "две кни́ги"
};

function visFor(deck) {
  const v = VIS[deck.id];
  if (v) return v;
  return { pal: PALS[deck.index % PALS.length], art: null };
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

const VIEWS = ["home", "temas", "mapa", "tema", "palabra", "study", "frase", "dialogo", "cajas", "leer", "done", "settings"];
const NAV_VIEWS = { home: "home", temas: "temas", settings: "settings" };

function show(view) {
  state.view = view;
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
  const navOn = NAV_VIEWS[view];
  $("#nav").hidden = !navOn;
  for (const b of $$("#nav [data-go]")) {
    if (b.dataset.go === navOn) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  document.body.classList.toggle("on-mapa", view === "mapa");
  window.scrollTo(0, 0);
}

function go(view) {
  if (view === "mapa") renderMapa();
  if (view === "home") renderHome();
  if (view === "temas") renderTemas();
  if (view === "settings") renderSettings();
  show(view);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
        q: c.pregunta,
        a: c.respuesta
      });
    });
    decks.push({
      id,
      index: decks.length,
      title: json.titulo || id,
      group: json.grupo || "Vocabulario",
      desc: json.descripcion || "",
      aprender: json.aprender || null,
      frases: Array.isArray(json.frases) ? json.frases : [],
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
  if (broken.length) toast(`No se pudo leer: ${broken.join(", ")}`);
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
  for (const it of itemsFor(deck)) {
    total++;
    const st = store.card(it.key);
    if (!st) { fresh++; continue; }
    if (st.ivl >= 1) learned++;
    if (st.due <= eod) due++;
    if ((st.t || 0) > last) last = st.t;
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
  return state.ruta && suggestedDeck() === deck ? " · Sugerido" : "";
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

// ---------- Inicio ----------
const WEEK_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

function renderHome() {
  activityCache = null;
  const now = Date.now();
  const today = dateKey(now);
  const act = activityByDay();
  let due = 0, learned = 0, total = 0, fresh = 0;
  for (const d of state.decks) {
    const s = deckStats(d, now);
    if (!d.mine) {
      learned += s.learned;
      total += s.total;
    }
    if (deckEnabled(d)) { due += s.due; fresh += s.fresh; }
  }
  const newLeft = Math.max(0, store.settings.newPerDay - store.newToday(today));
  const newCount = Math.min(newLeft, fresh);
  const picks = pickedCards().length;
  const forToday = due + newCount + picks;
  const pct = total ? Math.round((learned / total) * 100) : 0;

  $("#greet-name").textContent = (store.settings.name || "").trim() || "¡Hola!";
  $("#stat-pct").textContent = `${pct}%`;
  $("#stat-learned").textContent = learned.toLocaleString("es-MX");
  $("#stat-total").textContent = total.toLocaleString("es-MX");
  $("#stat-bar").style.width = `${Math.max(pct, learned ? 2 : 0)}%`;
  $("#stat-today").textContent = forToday;
  $("#start-today").disabled = forToday === 0;
  $("#start-today").setAttribute("aria-label", forToday ? `Practicar ahora: ${forToday} para hoy` : "No hay práctica pendiente hoy");
  const note = $("#today-note");
  if (forToday === 0) {
    note.textContent = fresh === 0
      ? "Terminaste todos los temas activos. Activa otro en Ajustes o usa el repaso rápido de un tema."
      : "Todo al día. Vuelve mañana o sube el límite de nuevas en Ajustes.";
  } else note.textContent = picks ? `Incluye ${picks} ${picks === 1 ? "palabra que elegiste" : "palabras que elegiste"}.` : "";

  // Semana (lunes a domingo)
  const d0 = new Date(startOfDay(now));
  const dow = (d0.getDay() + 6) % 7;
  const monday = startOfDay(now) - dow * DAY;
  let weekHtml = "";
  for (let i = 0; i < 7; i++) {
    const ts = monday + i * DAY + DAY / 2;
    const k = dateKey(ts);
    const cls = [k === today ? "today" : "", act[k] ? "done" : "", ts > now && k !== today ? "future" : ""].join(" ");
    weekHtml += `<div class="day ${cls}"><small>${WEEK_LETTERS[i]}</small><b>${new Date(ts).getDate()}</b><i></i></div>`;
  }
  $("#week").innerHTML = weekHtml;

  // Onda con la actividad de los últimos 7 días
  const counts = [];
  for (let i = 6; i >= 0; i--) counts.push(act[dateKey(now - i * DAY)] || 0);
  $("#hero-wave path").setAttribute("d", wavePath(counts));

  // Aprendidas esta semana y racha
  let week = 0;
  for (const st of Object.values(store.p.cards)) {
    if (st && st.ivl >= 1 && st.reps === 1 && (st.t || 0) >= monday) week++;
  }
  $("#stat-learned2").textContent = learned.toLocaleString("es-MX");
  $("#stat-week").textContent = `+${week} esta semana`;
  let streak = 0;
  let day = act[today] ? now : now - DAY;
  while (act[dateKey(day)]) { streak++; day -= DAY; }
  $("#stat-streak").textContent = `${streak} ${streak === 1 ? "día" : "días"}`;
  $("#stat-streak-foot").textContent = streak ? (act[today] ? "¡no la rompas!" : "practica hoy para seguir") : "¡empieza hoy!";

  // Seguir con
  const recent = state.decks
    .map((d) => ({ d, s: deckStats(d, now) }))
    .filter((x) => x.s.last)
    .sort((a, b) => b.s.last - a.s.last)
    .slice(0, 2)
    .map((x) => x.d);
  const pilot = suggestedDeck() || state.deckById.get(PILOT);
  if (pilot && !recent.includes(pilot) && recent.length < 2) recent.unshift(pilot);
  for (const d of state.decks) { if (recent.length >= 2) break; if (!recent.includes(d)) recent.push(d); }
  $("#continue-list").innerHTML = recent.map((d) => rowHtml(d)).join("");
  if (state.ruta) renderRutaMini();
  else $("#ruta-block").hidden = true;
}

function wavePath(counts) {
  const max = Math.max(...counts);
  const pts = counts.map((c, i) => {
    const x = (i / (counts.length - 1)) * 132;
    const y = max ? 54 - (c / max) * 50 : 30 + Math.sin(i * 1.3) * 18;
    return [x, y];
  });
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx.toFixed(1)} ${y0.toFixed(1)} ${cx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

function rowHtml(deck) {
  const s = deckStats(deck);
  const v = visFor(deck);
  const ru = RU_NAME[deck.id];
  return `<button class="trow card-frame pal-${v.pal}" type="button" data-open-tema="${esc(deck.id)}">
    ${artHtml(deck)}
    <span class="t-n">${deckNumber(deck)}${deckTag(deck)}</span>
    <span class="t-title">${esc(deck.title)} ${ru ? `<span lang="ru">${esc(ru)}</span>` : ""}</span>
    <span class="t-foot"><span class="bar"><span style="width:${s.pct}%"></span></span><span class="pct">${s.pct}%</span></span>
  </button>`;
}

// ---------- Temas ----------
const EXPRESIONES = new Set(["expresiones", "falsos-amigos", "servilismo"]);
const FILTROS = ["Todos", "Vocabulario", "Países y gentilicios", "Gramática", "Expresiones"];

function groupOf(deck) {
  if (EXPRESIONES.has(deck.id)) return "Expresiones";
  return deck.group;
}

function renderTemas() {
  const groups = FILTROS.filter((g) => g === "Todos" || state.decks.some((d) => groupOf(d) === g));
  if (!groups.includes(state.temaFilter)) state.temaFilter = "Todos";
  $("#temas-chips").innerHTML = groups
    .map((g) => `<button class="chip" type="button" role="tab" data-filter="${esc(g)}" aria-selected="${g === state.temaFilter}">${esc(g)}</button>`)
    .join("");
  const list = state.decks.filter((d) => state.temaFilter === "Todos" || groupOf(d) === state.temaFilter);
  const ordered = rutaOrder(list);
  if (!ordered.some((d) => d.id === state.openTile) || !state.openSet) {
    const sug = suggestedDeck();
    state.openTile = sug && ordered.includes(sug) ? sug.id : ordered[0] ? ordered[0].id : null;
    state.openSet = true;
  }
  const leer = state.temaFilter === "Todos" ? leerTileHtml() : "";
  $("#temas-grid").innerHTML = ordered.length
    ? leer + ordered.map(tileHtml).join("")
    : `<p class="loading">No hay temas en este grupo.</p>`;
}

// Temas en el orden de la ruta; los que no están en ella (biblioteca) van al final.
function rutaOrder(list) {
  if (!state.ruta) return list;
  const rank = new Map();
  let n = 0;
  for (const m of rutaMods()) for (const t of modTemas(m)) if (t.deck) rank.set(t.deck.id, n++);
  const inRuta = list.filter((d) => rank.has(d.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  const rest = list.filter((d) => !rank.has(d.id));
  return [...inRuta, ...rest];
}

function tileHtml(deck) {
  const s = deckStats(deck);
  const v = visFor(deck);
  const ru = RU_NAME[deck.id] || "";
  const open = deck.id === state.openTile;
  const done = s.total && s.learned === s.total;
  const foot = done
    ? `<span class="t-done"><i>✓</i>Terminado</span>`
    : `<span class="bar"><span style="width:${s.pct}%"></span></span><span class="pct">${s.pct}%</span>`;
  const meta = `${s.learned} de ${s.total} ${deck.cards.some((c) => c.kind === "qa") ? "tarjetas" : "palabras"}`;
  return `<article class="tile card-frame pal-${v.pal}${open ? " open" : ""}" data-tile="${esc(deck.id)}" tabindex="${open ? -1 : 0}" role="button" aria-expanded="${open}" aria-label="${esc(deck.title)}">
    ${artHtml(deck)}
    <div class="t-body">
      <span class="t-n">${deckNumber(deck)}${deckTag(deck)}</span>
      <span class="t-title">${esc(deck.title)}</span>
      ${ru ? `<span class="t-ru" lang="ru">${esc(ru)}</span>` : ""}
      <span class="t-foot">${foot}</span>
    </div>
    <div class="t-big">
      <div class="t-top"><span class="t-tag">${deckNumber(deck)}${deckTag(deck)}</span><span class="pct">${s.pct}%</span></div>
      <span class="t-title">${esc(deck.title)}</span>
      ${ru ? `<span class="t-ru" lang="ru">${esc(ru)}</span>` : ""}
      <span class="t-meta">${meta}</span>
      <div class="t-modes">${modesHtml(deck)}</div>
      <div class="t-links">
        ${dudasFor(deck) ? `<button class="t-link" type="button" data-act="dudas" data-deck="${esc(deck.id)}" aria-expanded="false"><span class="q" aria-hidden="true">?</span>¿Dudas de gramática?</button>` : ""}
        <button class="t-link" type="button" data-act="list" data-deck="${esc(deck.id)}">Ver palabras</button>
      </div>
      <div class="dudas-body" hidden>${dudasFor(deck) ? dudasHtml(deck) : ""}</div>
    </div>
  </article>`;
}

// ----- Modos de un tema: Palabras · Frases · Diálogo · Cajas -----
function ejOf(deck) {
  return state.ej[deck.id] || { dialogos: [], cajas: [] };
}

function ejDone(list) {
  return list.filter((x) => { const r = store.ejer(x.id); return r && r.ok > 0; }).length;
}

function modesList(deck) {
  const s = deckStats(deck);
  const ej = ejOf(deck);
  const out = [];
  if (deck.cards.length) out.push({ key: "words", label: "Palabras", num: String(s.due + s.fresh), sub: "Nuevas y repaso", pct: s.pct, off: s.due + s.fresh === 0 });
  if (deck.frases.length) {
    const done = deck.frases.filter((f) => store.frase(`${deck.id}:${f.id}`)).length;
    out.push({ key: "frases", label: "Frases", num: `${done}/${deck.frases.length}`, sub: "Arma y traduce", pct: Math.round((done / deck.frases.length) * 100) });
  }
  if (ej.dialogos.length) {
    const n = ejDone(ej.dialogos);
    out.push({ key: "dialogo", label: "Diálogo", full: "Mini diálogo", num: `${n}/${ej.dialogos.length}`, sub: "Elige qué contestar", pct: Math.round((n / ej.dialogos.length) * 100) });
  }
  if (ej.cajas.length) {
    const n = ejDone(ej.cajas);
    out.push({ key: "cajas", label: "Cajas", num: `${n}/${ej.cajas.length}`, sub: "Acomoda por caja", pct: Math.round((n / ej.cajas.length) * 100) });
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

function dudasFor(deck) {
  return state.dudas[deck.id] || null;
}

function dudasHtml(deck) {
  const d = dudasFor(deck);
  if (!d) return "";
  const canSpeak = "speechSynthesis" in window;
  return `<div class="dudas">
    <b class="dudas-title">${esc(d.titulo)}</b>
    <ul>${(d.puntos || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    ${(d.ejemplos || []).map((x) => `<div class="dudas-ex"><div><span class="ex-ru" lang="ru">${esc(x.ru)}</span>${x.fonetica ? `<span class="ex-fon">${esc(x.fonetica)}</span>` : ""}<span>${esc(x.es)}</span></div>${canSpeak ? `<button class="audio-btn sm" type="button" data-say="${esc(x.ru)}" aria-label="Escuchar el ejemplo">${SPEAKER}</button>` : ""}</div>`).join("")}
    ${d.ojo ? `<p class="dudas-ojo"><b>Ojo:</b> ${esc(d.ojo)}</p>` : ""}
  </div>`;
}

// Inicia un modo de práctica de un tema.
function startMode(deck, key) {
  state.currentDeck = deck;
  if (key === "words") return startDeck(deck);
  if (key === "frases") return startFrases(deck);
  if (key === "dialogo") return startDialogo(deck);
  if (key === "cajas") return startCajas(deck);
}

// Abre un tema en la cuadrícula: el cuadrado crece y los demás se acomodan
// deslizándose (técnica FLIP: solo se animan transform y clip-path).
function openTileAnimated(id) {
  if (id === state.openTile) return;
  const grid = $("#temas-grid");
  const tiles = Array.from(grid.querySelectorAll(".tile"));
  const first = new Map(tiles.map((t) => [t.dataset.tile, t.getBoundingClientRect()]));
  for (const t of tiles) {
    const on = t.dataset.tile === id;
    t.classList.toggle("open", on);
    t.classList.toggle("opening", on);
    t.setAttribute("aria-expanded", on);
    t.tabIndex = on ? -1 : 0;
  }
  state.openTile = id;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !Element.prototype.animate) return;
  const opts = { duration: 520, easing: "cubic-bezier(.22,1,.36,1)" };
  for (const t of tiles) {
    const a = first.get(t.dataset.tile);
    const b = t.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (t.dataset.tile === id) {
      const r = Math.max(0, b.width - a.width);
      const btm = Math.max(0, b.height - a.height);
      t.animate([
        { transform: `translate(${dx}px, ${dy}px)`, clipPath: `inset(0 ${r}px ${btm}px 0 round 22px)` },
        { transform: "none", clipPath: "inset(0 0 0 0 round 28px)" }
      ], opts);
    } else if (dx || dy) {
      t.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], opts);
    }
  }
  const opened = grid.querySelector(".tile.open");
  setTimeout(() => {
    const r = opened.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 100) {
      window.scrollBy({ top: r.top - 90, behavior: reduce ? "auto" : "smooth" });
    }
  }, 300);
}

// ---------- Tema ----------
function openTema(id) {
  const deck = state.deckById.get(id);
  if (!deck) return;
  state.currentDeck = deck;
  state.selecting = false;
  state.selected = new Set();
  $("#deck-search").value = "";
  $("#tema-search-box").hidden = true;
  $("#tema-search-toggle").setAttribute("aria-expanded", "false");
  state.temaFrom = state.view === "mapa" ? "mapa" : state.view === "home" ? "home" : "temas";
  renderTema();
  show("tema");
}

function renderTema() {
  const d = state.currentDeck;
  if (!d) return;
  const s = deckStats(d);
  const v = visFor(d);
  const ru = RU_NAME[d.id] || "";
  const head = $("#tema-head");
  head.className = `tema-head card-frame pal-${v.pal}`;
  head.innerHTML = `<span class="t-tag">${deckNumber(d)}</span>
    <h1 class="tema-title">${esc(d.title)}</h1>
    ${ru ? `<span class="tema-ru" lang="ru">${esc(ru)}</span>` : ""}
    <div class="tema-prog"><span class="bar"><span style="width:${s.pct}%"></span></span><span class="tema-prog-n"><span class="num">${s.learned}</span> de <span class="num">${s.total}</span> memorizadas</span></div>`;

  const pals = { words: "kh", frases: "pe", dialogo: "bl", cajas: "pk" };
  const ICON = {
    words: `<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5"/>`,
    frases: `<rect x="3" y="7" width="7" height="7" rx="1.5"/><rect x="14" y="7" width="7" height="7" rx="1.5"/>`,
    dialogo: `<path d="M4 5h16v11H9l-5 4z"/>`,
    cajas: `<rect x="3" y="9" width="8" height="11" rx="1.5"/><rect x="13" y="9" width="8" height="11" rx="1.5"/><path d="M7 5v4M17 5v4"/>`
  };
  $("#tema-modes").innerHTML = modesList(d).map((m) => `<button class="mode card-frame pal-${pals[m.key]}" type="button" data-mode="${m.key}"${m.off ? " disabled" : ""}>
      <span class="mode-top"><span class="mode-ic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[m.key]}</svg></span><span class="num mode-num">${m.key === "words" ? `${m.num} hoy` : m.num}</span></span>
      <span class="mode-name">${m.full || m.label}</span><span class="mode-sub">${m.sub}</span>
      <span class="bar"><span style="width:${m.pct}%"></span></span></button>`).join("");

  // Introducción, reglas y tip del tema
  const ap = d.aprender || {};
  let intro = "";
  if (ap.intro || d.desc) {
    intro = `<div class="intro card-frame pal-${v.pal}">
      <span class="label">De qué trata</span>
      <p>${esc(ap.intro || d.desc || "")}</p>
    </div>`;
  }
  const rules = (ap.reglas || []).map((r) => `<div class="rule card-frame pal-bl"><span class="label">La regla</span><p>${esc(r)}</p></div>`);
  if (ap.tip) rules.push(`<div class="rule card-frame pal-li"><span class="label">Tip de memoria</span><p>${esc(ap.tip)}</p></div>`);
  if (rules.length % 2 === 1) rules[rules.length - 1] = rules[rules.length - 1].replace('class="rule ', 'class="rule wide ');
  if (rules.length) intro += `<div class="rules">${rules.join("")}</div>`;
  $("#tema-intro").innerHTML = intro;
  $("#tema-count").textContent = d.cards.length;
  const dd = dudasFor(d);
  $("#tema-dudas").innerHTML = dd
    ? `<button class="dudas-btn" type="button" id="dudas-toggle" aria-expanded="false"><span class="q" aria-hidden="true">?</span><span><b>¿Dudas de gramática?</b><small>${esc(dd.titulo)}</small></span></button><div class="dudas-body" hidden>${dudasHtml(d)}</div>`
    : "";
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
  for (const c of list) {
    const name = c.seccion || "";
    let sec = sections.find((x) => x.name === name);
    if (!sec) sections.push((sec = { name, cards: [] }));
    sec.cards.push(c);
  }
  let i = 0;
  host.innerHTML = sections
    .map((sec) => {
      const rows = sec.cards.map((c) => wordRow(c, PALS[i++ % 6])).join("");
      return `${sec.name ? `<h3 class="label sec-title">${esc(sec.name)}</h3>` : ""}<div class="wlist">${rows}</div>`;
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
  return `<div class="wrow card-frame pal-${pal}" data-word="${esc(c.id)}" role="button" tabindex="0">
    <span class="w-main"><span class="w-ru" lang="ru">${esc(c.ru)}</span>${c.fonetica ? `<span class="w-fon">${esc(c.fonetica)}</span>` : ""}</span>
    <span class="w-es">${esc(c.es)}</span>${right}</div>`;
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
  const canSpeak = "speechSynthesis" in window;
  let html;
  if (c.kind === "qa") {
    html = `<div class="word-card card-frame pal-li"><span class="label">Pregunta</span><p class="qa-text">${esc(c.q)}</p></div>
      <div class="info card-frame pal-lav"><span class="label">Respuesta</span><p class="qa-text answer">${esc(c.a)}</p></div>`;
  } else {
    const tags = [...(c.tag ? c.tag.split("·").map((t) => t.trim()) : []), ...(c.nota && c.nota.length < 22 ? [c.nota] : [])];
    html = `<div class="word-card card-frame pal-aq">
      <div class="word-top"><div><div class="word-ru" lang="ru">${esc(c.ru)}</div>${c.fonetica ? `<div class="word-fon">${esc(c.fonetica)}</div>` : ""}</div>
      ${canSpeak ? `<button class="audio-btn" type="button" data-say="${esc(c.ru)}" aria-label="Escuchar en ruso">${SPEAKER}</button>` : ""}</div>
      <div class="word-es"><b>${esc(c.es)}</b>${tags.length ? `<span class="word-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join("")}</span>` : ""}</div>
    </div>`;
    if (c.pista || (c.nota && c.nota.length >= 22)) {
      html += `<div class="info card-frame pal-lav"><span class="label">Qué significa</span>${c.pista ? `<p>${esc(c.pista)}</p>` : ""}${c.nota && c.nota.length >= 22 ? `<p>${esc(c.nota)}</p>` : ""}</div>`;
    }
    if (c.ejemplo) {
      html += `<div class="info card-frame pal-bl"><div class="info-row"><div><span class="label">Ejemplo</span>
        <span class="ex-ru" lang="ru">${esc(c.ejemplo.ru)}</span>${c.ejemplo.fonetica ? `<span class="ex-fon">${esc(c.ejemplo.fonetica)}</span>` : ""}<span>${esc(c.ejemplo.es)}</span></div>
        ${canSpeak ? `<button class="audio-btn sm" type="button" data-say="${esc(c.ejemplo.ru)}" aria-label="Escuchar el ejemplo">${SPEAKER}</button>` : ""}</div></div>`;
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

function buildQueue(decks, newLimit) {
  const now = Date.now();
  const eod = endOfDay(now);
  const reviews = [];
  const fresh = [];
  for (const d of decks) {
    for (const it of itemsFor(d)) {
      const st = store.card(it.key);
      if (!st) fresh.push({ ...it, phase: "learn" });
      else if (st.due <= eod) reviews.push({ ...it, phase: "quiz", due: st.due });
    }
  }
  reviews.sort((a, b) => a.due - b.due);
  const news = fresh.slice(0, Math.max(0, newLimit));
  const queue = [];
  let n = 0;
  reviews.forEach((r, i) => {
    queue.push(r);
    if ((i + 1) % 3 === 0 && n < news.length) queue.push(news[n++]);
  });
  while (n < news.length) queue.push(news[n++]);
  return queue.map((it) => ({ ...it, failed: false, hint: 0 }));
}

function startToday() {
  const today = dateKey(Date.now());
  const newLeft = Math.max(0, store.settings.newPerDay - store.newToday(today));
  const queue = buildQueue(state.decks.filter(deckEnabled), newLeft);
  // Palabras elegidas a mano: extra, mezcladas con las demás.
  const inQueue = new Set(queue.map((it) => it.key));
  for (const c of pickedCards()) {
    for (const key of keysFor(c)) {
      if (inQueue.has(key)) {
        queue.find((it) => it.key === key).picked = true;
        continue;
      }
      const item = { card: c, key, dir: key.split("|").pop(), phase: store.card(key) ? "quiz" : "learn", failed: false, hint: 0, picked: true };
      queue.splice(Math.floor(Math.random() * (queue.length + 1)), 0, item);
    }
  }
  startSession(queue, "Práctica de hoy", false, "home");
}

function startDeck(deck) {
  const queue = buildQueue([deck], NEW_PER_DECK_SESSION);
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
  state.session = { queue, title, cram, ok: 0, bad: 0, resolved: 0, answered: false, requeue: false, timer: null, returnTo };
  $("#study-title").textContent = title;
  show("study");
  renderItem();
}

function speak(text, rate = 0.9) {
  if (!("speechSynthesis" in window)) return;
  const clean = plain(text).replace(/\(.*?\)/g, "").replace(/[/·]/g, ",").replace(/—/g, ",").trim();
  if (!clean) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = "ru-RU";
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith("ru"));
  if (voice) u.voice = voice;
  u.rate = rate;
  window.speechSynthesis.speak(u);
}

function ruBlock(text, fon) {
  const cursive = store.settings.cursive
    ? `<div class="script-ru" lang="ru" aria-hidden="true">${esc(plain(text))}</div>`
    : "";
  const sound = fon ? `<div class="fon fon-big">${esc(fon)}</div>` : "";
  return `<div class="big-ru" lang="ru">${esc(text)}</div>${sound}${cursive}`;
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

function hideAllControls() {
  for (const id of ["btn-learned", "btn-reveal", "selfcheck", "btn-hint", "btn-next", "options", "feedback", "card-back", "hint-box", "note-box"]) {
    $(`#${id}`).hidden = true;
  }
}

function updateCounters() {
  const s = state.session;
  $("#cnt-due").textContent = s.queue.length;
  $("#cnt-ok").textContent = s.ok;
  $("#cnt-bad").textContent = s.bad;
  const total = s.resolved + s.queue.length;
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

  $("#card").className = `card card-frame study-card pal-${deck ? visFor(deck).pal : "lav"}`;
  $("#card-deck").textContent = deck ? deck.title : "";
  $("#card-badge").hidden = it.phase !== "learn";
  $("#card-badge").textContent = "Nueva";
  if (it.failed && it.phase !== "learn") {
    $("#card-badge").hidden = false;
    $("#card-badge").textContent = "Repetir";
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
      front.innerHTML = `<span class="learn-label">Palabra nueva</span>${ruBlock(c.ru, c.fonetica)}`;
      back.innerHTML = `<div class="big-es">${esc(c.es)}</div>` + extras(c);
      speakBtn.hidden = !("speechSynthesis" in window);
      if (store.settings.autoSpeak) speak(c.ru);
    }
    back.hidden = false;
    $("#btn-learned").hidden = false;
    renderNoteBox();
    return;
  }

  if (it.dir === "qa") {
    front.innerHTML = `<div class="qa-text">${esc(c.q)}</div>`;
    back.innerHTML = `<div class="qa-text answer">${esc(c.a)}</div>`;
    $("#btn-reveal").hidden = false;
    return;
  }

  if (it.dir === "es") {
    front.innerHTML = `<div class="big-es">${esc(c.es)}</div><div class="prompt-blank">___</div>`;
    back.innerHTML = ruBlock(c.ru, c.fonetica) + extras(c);
  } else {
    front.innerHTML = ruBlock(c.ru, c.fonetica) + `<div class="prompt-blank">___</div>`;
    back.innerHTML = `<div class="big-es">${esc(c.es)}</div>` + extras(c);
    speakBtn.hidden = !("speechSynthesis" in window);
    if (store.settings.autoSpeak) speak(c.ru);
  }

  it.options = buildOptions(it);
  const box = $("#options");
  box.innerHTML = it.options
    .map((o, i) => `<button class="option${it.dir === "es" ? " ru" : ""}" type="button" data-opt="${i}"${it.dir === "es" ? ' lang="ru"' : ""}><span class="key">${i + 1}</span><span class="opt-text"><span>${esc(o.text)}</span>${o.fon ? `<span class="fon">${esc(o.fon)}</span>` : ""}</span></button>`)
    .join("");
  box.hidden = false;
  const hint = $("#btn-hint");
  hint.textContent = "No sé, dame una pista";
  hint.hidden = false;
}

function markLearned() {
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
  revealAfterAnswer(it);
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
  if (it.dir === "es") $("#card-speak").hidden = !("speechSynthesis" in window);
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
    $("#hint-text").textContent = hintText(it);
    const mine = store.note(it.card.id);
    $("#hint-mine").hidden = !mine;
    $("#hint-mine-text").textContent = mine;
    $("#hint-box").hidden = false;
    $("#btn-hint").textContent = "No sé, muéstrame la respuesta";
    return;
  }
  s.answered = true;
  $$("#options .option").forEach((b, j) => {
    b.disabled = true;
    if (it.options[j].correct) b.classList.add("correct");
  });
  revealAfterAnswer(it);
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
    : `<button class="link-btn" type="button" data-note="edit">+ Agregar una nota personal</button>`;
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
  if (!s.cram) {
    const prev = store.card(it.key);
    if (!prev) store.countNew(dateKey(now));
    const rating = ok ? (it.hint && !it.failed ? 2 : 3) : 1;
    logActivity();
    store.setCard(it.key, schedule(prev, rating, now));
  }
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
    if (it.picked && !s.cram) store.setPicks([it.card.id], false);
  }
  if (s.queue.length) renderItem();
  else finishSession();
}

function finishSession() {
  const s = state.session;
  $("#done-title").textContent = s.cram ? "Repaso rápido terminado" : "Práctica terminada";
  $("#done-summary").textContent =
    `${s.ok} respuestas correctas y ${s.bad} errores. ` +
    (s.cram ? "El repaso rápido no cambia tu calendario." : "Las palabras que fallaste volverán pronto para reforzarlas.");
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

function backTo(where) {
  if (where === "tema" && state.currentDeck) {
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

function startFrases(deck) {
  if (!deck.frases.length) return;
  const queue = shuffle(deck.frases).map((f) => ({ f, failed: false }));
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
  $("#fr-left").textContent = fr.queue.length;
  $("#fr-ok").textContent = fr.ok;
  $("#fr-bad").textContent = fr.bad;
  let seg = "";
  for (let i = 0; i < fr.total; i++) {
    const r = fr.results[i];
    seg += `<span class="${r === true ? "on" : r === false ? "bad" : ""}"></span>`;
  }
  $("#fr-segments").innerHTML = seg;
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
      extra += `<div class="solution card-frame pal-mint"><span class="label">Una respuesta correcta</span><div class="sol-ru" lang="ru">${esc(f.texto || niceSentence(f.validas[0]))}</div>${f.fonetica ? `<span class="fon">${esc(f.fonetica)}</span>` : ""}${alt ? `<span class="sol-alt">También vale: <span lang="ru">${esc(alt)}</span></span>` : ""}</div>`;
      const report = cur.placed.length && !cur.revealed
        ? `<button class="link-quiet" type="button" data-fr="report1"${cur.reported ? " disabled" : ""}>${cur.reported ? "✓ Enviado, lo voy a revisar" : "Mi respuesta también es correcta"}</button>`
        : "";
      foot = frFoot(f, `<button class="btn btn-primary" type="button" data-fr="step2">Continuar</button>`, report);
    }
    const msg = cur.checked
      ? (cur.ok1 ? `<p class="fr-msg ok" role="status">¡Bien armada!</p>` : "")
      : `<p class="fr-msg">Cualquier orden correcto cuenta. Toca una ficha para quitarla.</p>`;
    body.innerHTML = `<div class="idea card-frame pal-lav"><div><span class="label">Arma la frase · paso <span class="num">1</span> de <span class="num">2</span></span><span class="idea-text">${esc(f.idea)}</span></div></div>
      <div class="answer-zone${zoneCls}" aria-label="Tu frase">${placed}</div>
      ${msg}${extra}
      <div class="bank${cur.checked ? " spent" : ""}">${bank}</div>${foot}`;
    return;
  }
  // Paso 2
  const sentence = displaySentence(fr, cur);
  const showFon = f.fonetica && normSentence(sentence) === normSentence(f.texto || f.validas[0]);
  const canSpeak = "speechSynthesis" in window;
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
      ${canSpeak ? `<button class="audio-btn" type="button" data-fr="say" aria-label="Escuchar la frase en ruso">${SPEAKER}</button>` : ""}</div>
      ${canSpeak ? `<div class="speed"><button type="button" data-rate="0.9" aria-pressed="${cur.rate === 0.9}">Normal</button><button type="button" data-rate="0.55" aria-pressed="${cur.rate === 0.55}">Lento</button></div>` : ""}
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
  if (t.dataset.rate) {
    cur.rate = Number(t.dataset.rate);
    speak(displaySentence(fr, cur), cur.rate);
    return renderFrase();
  }
  if (t.dataset.fopt !== undefined && cur.choice === null) {
    cur.choice = Number(t.dataset.fopt);
    cur.ok2 = cur.options[cur.choice] === f.es;
    cur.reported = false;
    playSound(cur.ok2);
    renderFrase();
    if (cur.ok2) fr.timer = setTimeout(() => { if (state.fr === fr && fr.cur === cur && $("#sheet").hidden) finishFraseItem(); }, AUTO_MS);
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
    if (cur.ok1 && !cur.hint) fr.timer = setTimeout(() => { if (state.fr === fr && fr.cur === cur && cur.step === 1 && $("#sheet").hidden) goStep2(); }, AUTO_MS);
    return;
  }
  if (act === "step2") return goStep2();
  if (act === "dic") {
    clearTimeout(fr.timer);
    return openDiccionario(fr.deck, f, cur.bank.map((b) => b.t));
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
  const done = () => { wrap.hidden = true; };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) done(); else setTimeout(done, 260);
  if (sheetReturn && document.contains(sheetReturn)) sheetReturn.focus();
}

// ---------- Diccionario y «Mis palabras» ----------
const MINE = "mis-palabras";

function mineId(forma) {
  return norm(forma);
}

function openDiccionario(deck, f, tokens) {
  const shown = new Set(tokens.map(norm));
  const seen = new Set();
  const entries = (f.diccionario || []).filter((d) => {
    const k = norm(d.ficha);
    if (!shown.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  state.dic = { deck, f, entries };
  openSheet("Diccionario", dicHtml(), "Las palabras de esta frase, en su forma de diccionario.");
}

function dicHtml() {
  const { entries } = state.dic;
  const canSpeak = "speechSynthesis" in window;
  return `<div class="dic-list">${entries.map((d, i) => {
    const changed = norm(d.ficha) !== norm(d.forma);
    const on = store.inMine(mineId(d.forma));
    const porque = String(d.porque || "").trim();
    const why = porque ? porque.charAt(0).toLowerCase() + porque.slice(1) : "";
    return `<div class="dic-row">
      <div class="dic-top">
        ${canSpeak ? `<button class="dic-say" type="button" data-dsay="${i}" aria-label="Escuchar ${esc(d.forma)}">${SPEAKER}</button>` : ""}
        <div class="dic-main">
          <span class="dic-words">${changed ? `<span class="dic-from" lang="ru">${esc(d.ficha)} →</span>` : ""}<span class="dic-forma" lang="ru">${esc(d.forma)}</span></span>
          <span class="dic-es">${esc(d.es)}${d.fonetica ? ` · <span class="dic-fon">${esc(d.fonetica)}</span>` : ""}</span>
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

function startDialogo(deck) {
  const list = ejOf(deck).dialogos;
  if (!list.length) return;
  state.dl = { deck, list, di: 0, ok: 0, bad: 0, es: false, timer: null, returnTo: state.view === "tema" ? "tema" : state.view };
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

function bubbleHtml(b, dl, first) {
  const m = b.m;
  const canSpeak = "speechSynthesis" in window;
  const es = dl.es && m.es ? `<span class="b-es">${esc(m.es)}</span>` : "";
  if (b.mine) {
    return `<div class="b-row mine"><div class="bubble out${b.late ? " late" : ""}"><div class="b-main"><span class="b-ru" lang="ru">${esc(m.ru)}</span>${CHECK}</div>${m.fonetica ? `<span class="b-fon">${esc(m.fonetica)}</span>` : ""}${es}</div></div>`;
  }
  return `<div class="b-row">${first ? `<span class="b-name">${esc(m.de)}</span>` : ""}<div class="bubble in"><div class="b-main"><span class="b-ru" lang="ru">${esc(m.ru)}</span>${canSpeak ? `<button class="b-say" type="button" data-bsay="${esc(m.ru)}" aria-label="Escuchar el mensaje de ${esc(m.de)}">${SPEAKER}</button>` : ""}</div>${m.fonetica ? `<span class="b-fon">${esc(m.fonetica)}</span>` : ""}${es}</div></div>`;
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
      return `<button class="${cls}" type="button" data-dopt="${i}"${answered ? " disabled" : ""}><span class="num key">${key}</span><span class="opt-text"><span class="ru-t" lang="ru">${esc(o.ru)}</span>${o.fonetica ? `<span class="fon">${esc(o.fonetica)}</span>` : ""}</span></button>`;
    }).join("");
    let why = "";
    if (answered && c.fail) {
      const o = c.wait.opts[c.choice];
      why = `<section class="fr-error" role="status"><b>Casi. Mira por qué.</b><p>${esc(o.porque || "Esa opción no encaja aquí.")}</p></section>
        <section class="fr-ok-note"><span class="label">La correcta</span><p>${esc(c.wait.opts.find((x) => x.correcta).porque || "")}</p></section>
        <button class="btn btn-primary btn-wide" type="button" data-dnext="1">Continuar</button>`;
    }
    foot = `<div class="chat-foot"><span class="chat-q">¿Qué le contestas?</span>${opts}${why}</div>`;
  } else if (c.finished) {
    const last = dl.di >= dl.list.length - 1;
    foot = `<div class="chat-foot"><p class="chat-end">${c.fail ? "Diálogo terminado. Lo repasas cuando quieras." : "¡Diálogo completo!"}</p><button class="btn btn-primary btn-wide" type="button" data-dnext="2">${last ? "Terminar" : "Siguiente diálogo"}</button></div>`;
  }
  $("#dialogo-body").innerHTML = `<div class="chat" aria-live="polite">${bubbles}${typing}${mine}</div>${foot}`;
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
// Tocas una palabra y luego su caja. Si te equivocas se explica por qué y la
// palabra pasa a su caja correcta.

const BOX_PALS = ["bl", "pe", "li", "pk"];

function startCajas(deck) {
  const list = ejOf(deck).cajas;
  if (!list.length) return;
  state.cj = { deck, list, ci: 0, ok: 0, bad: 0, returnTo: state.view === "tema" ? "tema" : state.view };
  show("cajas");
  beginCaja();
}

function beginCaja() {
  const cj = state.cj;
  const e = cj.list[cj.ci];
  cj.cur = {
    e,
    bank: shuffle(e.items.map((it, i) => ({ ...it, i }))),
    boxes: e.cajas.map(() => []),
    sel: null,
    err: null,
    fail: false,
    done: 0
  };
  renderCajas();
}

function renderCajas() {
  const cj = state.cj;
  const c = cj.cur;
  const total = c.e.items.length;
  $("#cajas-title").textContent = c.e.pregunta.length > 34 ? c.e.cajas.join(" o ") + "?" : c.e.pregunta;
  $("#cajas-sub").innerHTML = `<span class="num">${c.done}</span> de <span class="num">${total}</span> acomodadas`;
  const finished = c.done === total && !c.err;
  const boxes = c.e.cajas.map((name, k) => {
    const chips = c.boxes[k].map((x) => `<span class="cx-chip${x.bad ? " bad" : ""}" lang="ru">${esc(x.ru)}</span>`).join("");
    const active = c.sel !== null && !c.err;
    return `<button class="cbox card-frame pal-${BOX_PALS[k % BOX_PALS.length]}${active ? " ready" : ""}" type="button" data-box="${k}" aria-label="Caja ${esc(name)}"${active ? "" : " disabled"}><span class="cbox-name" lang="ru">${esc(name)}</span>${chips}</button>`;
  }).join("");
  let msg = "";
  if (c.err) {
    msg = `<section class="fr-error" role="status"><b><span lang="ru">${esc(c.err.item.ru)}</span> va con <span lang="ru">${esc(c.err.item.caja)}</span></b><p>${esc(c.err.item.porque)}</p></section>`;
  }
  const bank = c.bank.map((x) => `<button class="cx-pick${c.sel === x.i ? " on" : ""}" type="button" lang="ru" data-pick-item="${x.i}" aria-pressed="${c.sel === x.i}"${c.err ? " disabled" : ""}>${esc(x.ru)}</button>`).join("");
  let btn = "";
  if (c.err) btn = `<button class="btn btn-primary btn-wide cx-btn" type="button" data-cnext="1">Entendido, sigue</button>`;
  else if (finished) btn = `<button class="btn btn-primary btn-wide cx-btn" type="button" data-cnext="2">${cj.ci >= cj.list.length - 1 ? "Terminar" : "Siguiente ejercicio"}</button>`;
  $("#cajas-body").innerHTML = `<p class="cx-hint">${finished ? (c.fail ? "Listo. Repásalo cuando quieras." : "¡Todo en su caja!") : esc(c.e.pregunta) + " Toca una palabra y luego su caja."}</p>
    <div class="cboxes" style="--n:${c.e.cajas.length}">${boxes}</div>
    ${msg}
    ${c.bank.length ? `<div class="cx-bank"><span class="chat-q">Faltan</span><div class="cx-picks">${bank}</div></div>` : ""}
    ${btn}`;
  const sc = c.err ? $("#cajas-body .fr-error") : null;
  if (sc) sc.scrollIntoView({ block: "nearest", behavior: REDUCE() ? "auto" : "smooth" });
}

function cajasClick(e) {
  const cj = state.cj;
  if (!cj) return;
  const c = cj.cur;
  const pick = e.target.closest("[data-pick-item]");
  if (pick && !c.err) {
    const i = Number(pick.dataset.pickItem);
    c.sel = c.sel === i ? null : i;
    return renderCajas();
  }
  const box = e.target.closest("[data-box]");
  if (box && c.sel !== null && !c.err) {
    const k = Number(box.dataset.box);
    const idx = c.bank.findIndex((x) => x.i === c.sel);
    const item = c.bank[idx];
    c.sel = null;
    if (item.caja === c.e.cajas[k]) {
      c.bank.splice(idx, 1);
      c.boxes[k].push({ ru: item.ru });
      c.done++;
      playSound(true);
    } else {
      c.fail = true;
      c.boxes[k].push({ ru: item.ru, bad: true });
      c.err = { item, k, idx };
      playSound(false);
    }
    return renderCajas();
  }
  const n = e.target.closest("[data-cnext]");
  if (!n) return;
  if (n.dataset.cnext === "1") {
    const { item, k, idx } = c.err;
    c.boxes[k] = c.boxes[k].filter((x) => !x.bad);
    c.boxes[c.e.cajas.indexOf(item.caja)].push({ ru: item.ru });
    c.bank.splice(c.bank.findIndex((x) => x.i === item.i), 1);
    c.done++;
    c.err = null;
    return renderCajas();
  }
  store.setEjer(c.e.id, !c.fail);
  logActivity();
  if (c.fail) cj.bad++; else cj.ok++;
  if (cj.ci < cj.list.length - 1) {
    cj.ci++;
    return beginCaja();
  }
  finishEjer("Cajas terminadas", `${cj.ok} de ${cj.list.length} ejercicios sin errores. Los que tuvieron errores los puedes repetir cuando quieras.`, cj.returnTo);
  state.cj = null;
}

// ---------- Aprende a leer ----------
const LEER_PAL = ["mint", "pe", "bl", "li", "pk", "kh"];
const LEER_KIND = ["Letra amiga", "Falsa amiga", "Letra nueva", "Acento", "Suaves y duras", "Se lee distinto"];
const LEER_SHORT = ["Amigas", "Falsas amigas", "Nuevas", "Acento y О", "Suaves y duras", "Leer palabras"];

function leerDone() {
  const pasos = state.lectura ? state.lectura.pasos : [];
  return pasos.filter((p) => store.lectura(p.id)).length;
}

function leerTileHtml() {
  if (!state.lectura) return "";
  const n = state.lectura.pasos.length;
  const d = leerDone();
  const pct = Math.round((d / n) * 100);
  return `<article class="tile card-frame pal-aq" data-leer="1" tabindex="0" role="button" aria-label="Aprende a leer, ${d} de ${n} pasos">
    <span class="art art-svg ink" aria-hidden="true">${SVG.book}</span>
    <div class="t-body">
      <span class="t-n">Desde cero</span>
      <span class="t-title">Aprende a leer</span>
      <span class="t-ru" lang="ru">Чита́ть</span>
      <span class="t-foot"><span class="bar"><span style="width:${pct}%"></span></span><span class="pct">${d}/${n}</span></span>
    </div>
  </article>`;
}

function openLeer() {
  if (!state.lectura) return toast("No se pudo cargar la lectura.");
  state.leerFrom = state.view === "mapa" ? "mapa" : "temas";
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
  const canSpeak = "speechSynthesis" in window;
  const wide = L.letra.length > 7;
  const hasSound = L.sonido && L.sonido !== "—";
  const big = `<section class="leer-big card-frame pal-${pal}">
    <span class="label">${esc(LEER_KIND[step] || "Letra")}</span>
    <div class="leer-row">
      <span class="leer-letra${wide ? " wide" : ""}" lang="ru">${esc(L.letra)}</span>
      <div class="leer-txt"><b>${esc(L.tip)}</b><span>${esc(L.como_suena)}</span>${hasSound ? `<span class="leer-son">Suena: <b>${esc(L.sonido)}</b></span>` : ""}</div>
    </div>
    ${(L.ejemplos || []).map((x) => `<div class="leer-ex"><div><span class="leer-ex-ru" lang="ru">${esc(x.ru)}</span><span class="leer-ex-fon">${esc(x.fonetica)} · ${esc(x.es)}</span></div>${canSpeak ? `<button class="audio-btn" type="button" data-lsay="${esc(x.ru)}" aria-label="Escuchar ${esc(x.ru)}">${SPEAKER}</button>` : ""}</div>`).join("")}
  </section>`;
  const tiles = p.letras.map((l, i) => {
    const snd = l.sonido && l.sonido !== "—";
    const w = l.letra.length > 7;
    return `<button class="ltile card-frame pal-${pal}${i === sel ? " on" : ""}${w ? " wide" : ""}" type="button" data-lsel="${i}" aria-pressed="${i === sel}" aria-label="${esc(l.letra)}${snd ? ", suena " + esc(l.sonido) : ""}"><span class="ltile-l" lang="ru">${esc(l.letra)}</span>${snd && !w ? `<span class="ltile-s">${esc(l.sonido)}</span>` : ""}</button>`;
  }).join("");
  const practica = (p.practica || []).map((x) => `<div class="lprac"><div><span class="lprac-ru" lang="ru">${esc(x.ru)}</span><span class="lprac-fon">${esc(x.fonetica)} · ${esc(x.es)}</span></div>${canSpeak ? `<button class="dic-say" type="button" data-lsay="${esc(x.ru)}" aria-label="Escuchar ${esc(x.ru)}">${SPEAKER}</button>` : ""}</div>`).join("");
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
      return go(state.leerFrom === "mapa" ? "mapa" : "temas");
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

// Temas de un módulo con su mazo (los que no existen se omiten).
const modCache = new Map();
function modTemas(mod) {
  if (!modCache.has(mod.id)) modCache.set(mod.id, buildModTemas(mod));
  return modCache.get(mod.id);
}

function buildModTemas(mod) {
  return mod.temas
    .map((t, i) => ({ ...t, deck: t.leer ? null : state.deckById.get(t.id), mod, label: `${mod.n}.${i + 1}` }))
    .filter((t) => t.leer || t.deck);
}

function modCurrent(mod) {
  if (mod.pronto) return null;
  return modTemas(mod).find((t) => t.deck && !isMemorized(t.deck)) || null;
}

function currentMod() {
  const mods = rutaMods().filter((m) => !m.pronto);
  return mods.find((m) => modCurrent(m)) || mods[mods.length - 1] || null;
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
  return s.due + Math.min(s.fresh, NEW_PER_DECK_SESSION);
}

function rutaPos(deckId) {
  for (const m of rutaMods()) {
    const t = modTemas(m).find((x) => x.deck && x.deck.id === deckId);
    if (t) return t;
  }
  return null;
}

function suggestedDeck() {
  const m = currentMod();
  const c = m && modCurrent(m);
  return c ? c.deck : null;
}

// ----- Mini mapa del inicio -----
function renderRutaMini() {
  const host = $("#ruta-mini");
  const mod = currentMod();
  if (!mod) { $("#ruta-block").hidden = true; return; }
  $("#ruta-block").hidden = false;
  const T = modTemas(mod);
  const cur = modCurrent(mod);
  const ci = cur ? T.indexOf(cur) : T.length - 1;
  const start = Math.max(0, Math.min(ci - 1, T.length - 4));
  const list = T.slice(start, start + 4);
  const w = modWords(mod);
  let grid = "";
  for (let r = 0; r < 9; r++) {
    for (let c = -1; c < 5; c++) {
      const x = c * 110 + (r % 2 ? 55 : 0) - 41;
      const y = r * 32 - 42;
      grid += `<polygon points="${x + 55},${y} ${x + 110},${y + 32} ${x + 55},${y + 64} ${x},${y + 32}" fill="${(r + c) % 2 ? "#121214" : "#18181B"}"/>`;
    }
  }
  const plates = list.map((t, i) => {
    const cx = 56 + i * 50, cy = 66 + i * 44;
    const isCur = cur && t === cur;
    const done = t.deck && isMemorized(t.deck);
    const face = isCur ? "#4AF2D5" : done ? PALF[t.deck ? visFor(t.deck).pal : "aq"] : "#2A2A2F";
    const ink = isCur ? "#0B0B0C" : done ? "#111" : "#A3A3AA";
    const hw = 36, hh = 21;
    const pts = (dy) => `${cx},${cy - hh + dy} ${cx + hw},${cy + dy} ${cx},${cy + hh + dy} ${cx - hw},${cy + dy}`;
    const name = t.leer ? "Aprende a leer" : t.deck.title.split(/[,y·]/)[0].trim();
    return `<polygon points="${pts(7)}" fill="#6B675F"/><polygon points="${pts(0)}" fill="${face}"/>
      ${done ? `<path d="M${cx - 7} ${cy} l5 5 l9 -10" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : `<circle cx="${cx}" cy="${cy}" r="${isCur ? 6 : 4}" fill="${ink}"/>`}
      <text x="${cx + 46}" y="${cy + 5}" fill="${isCur ? "#F3EFE6" : "#A3A3AA"}" font-size="12" font-weight="800" font-family="Manrope,sans-serif">${esc(name)}</text>`;
  }).join("");
  host.innerHTML = `<svg class="rm-svg" viewBox="0 0 358 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${grid}${plates}</svg>
    <span class="rm-chip">${esc(mod.titulo)} · <span class="num">${w.learned}</span> de <span class="num">${w.total}</span> palabras</span>
    ${cur && cur.deck ? `<span class="rm-today">Hoy: <span class="num">${todayWords(cur.deck)}</span></span>` : ""}`;
  host.setAttribute("aria-label", `Abrir el mapa de tu ruta. ${mod.titulo}${cur && cur.deck ? `, sigues en ${cur.deck.title}` : ""}`);
}

// ----- Pantalla del mapa (diseño D) -----
// Posiciones de las 8 plataformas en el arte (boceto de 940 px mostrado a 470).
const MAPA_RAW = [[833, 750], [1055, 887], [774, 988], [650, 1131], [901, 1300], [1148, 1446], [915, 1583], [698, 1722]];
const MS = 0.3005, MOX = -40, MOY = 130, MPAD = 8, MF = 0.26, MK = 0.55, MT = 9;
const r1 = (x) => Math.round(x * 10) / 10;

function plateShape(w, ox, oy) {
  const n = r1;
  const P = (p) => n(p[0]) + " " + n(p[1]);
  const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
  const lerp = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  const mid = (p, q) => lerp(p, q, 0.5);
  const h = w * MK;
  const C = [[ox - w / 2, oy], [ox, oy - h / 2], [ox + w / 2, oy], [ox, oy + h / 2]];
  const io = C.map((c, i) => ({ c, i: lerp(c, C[(i + 3) % 4], MF), o: lerp(c, C[(i + 1) % 4], MF) }));
  const [L, Tt, R, B] = io;
  const top = "M" + P(L.o) + " L" + P(Tt.i) + " Q" + P(Tt.c) + " " + P(Tt.o) + " L" + P(R.i) + " Q" + P(R.c) + " " + P(R.o) +
    " L" + P(B.i) + " Q" + P(B.c) + " " + P(B.o) + " L" + P(L.i) + " Q" + P(L.c) + " " + P(L.o) + " Z";
  const lm = [0.25 * L.i[0] + 0.5 * L.c[0] + 0.25 * L.o[0], L.c[1]];
  const rm = [0.25 * R.i[0] + 0.5 * R.c[0] + 0.25 * R.o[0], R.c[1]];
  const d = [0, MT];
  const sil = "M" + P(lm) + " Q" + P(mid(L.c, L.o)) + " " + P(L.o) + " L" + P(Tt.i) + " Q" + P(Tt.c) + " " + P(Tt.o) +
    " L" + P(R.i) + " Q" + P(mid(R.i, R.c)) + " " + P(rm) + " L" + P(add(rm, d)) +
    " Q" + P(add(mid(R.c, R.o), d)) + " " + P(add(R.o, d)) + " L" + P(add(B.i, d)) + " Q" + P(add(B.c, d)) + " " + P(add(B.o, d)) +
    " L" + P(add(L.i, d)) + " Q" + P(add(mid(L.i, L.c), d)) + " " + P(add(lm, d)) + " Z";
  return { top, sil };
}

// Ventana de 8 plataformas del módulo: 7 temas + la siguiente (otro tramo o módulo).
function mapaWindow(mod, page) {
  const T = modTemas(mod);
  const pages = Math.max(1, Math.ceil(T.length / PAGE));
  const p = Math.max(0, Math.min(page, pages - 1));
  const items = T.slice(p * PAGE, p * PAGE + PAGE).map((t) => ({ t, kind: "own" }));
  let extra = null;
  if (p < pages - 1) extra = { t: T[(p + 1) * PAGE], kind: "page" };
  else {
    const mods = rutaMods();
    const nx = mods[mods.indexOf(mod) + 1];
    const nt = nx ? modTemas(nx)[0] : null;
    if (nt) extra = { t: nt, kind: "mod" };
  }
  if (extra) items.push(extra);
  return { items, p, pages };
}

function mapaStatus(it, cur) {
  const { t, kind } = it;
  if (t.mod.pronto || kind === "mod") return "m3";
  if (t.leer) return leerDone() === (state.lectura ? state.lectura.pasos.length : 6) ? "done" : "next";
  if (cur && t === cur) return "now";
  return t.deck && isMemorized(t.deck) ? "done" : "next";
}

function mapaRu(t) {
  return t.leer ? t.ru || "Чита́ть" : RU_NAME[t.deck.id] || t.deck.title;
}

function plateWidth(ru, now) {
  const len = [...ru.replace(/́/g, "")].length;
  const w = len <= 5 ? 92 : len <= 7 ? 102 : len <= 9 ? 110 : 118;
  return now ? w + 12 : w;
}

function mapaStageHtml() {
  const m = state.mapa;
  const mod = rutaMods().find((x) => x.id === m.mod) || rutaMods()[0];
  const cur = modCurrent(mod);
  const win = mapaWindow(mod, m.page);
  const allT = modTemas(mod);
  m.page = win.p;
  // Selección: si no hay (o ya no está en la ventana) se toma el tema actual
  let selIt = win.items.find((it) => m.sel && it.t.id === m.sel.id && it.t.mod.id === m.sel.mod);
  if (!selIt) selIt = win.items.find((it) => cur && it.t === cur) || win.items[0];
  m.sel = selIt ? { id: selIt.t.id, mod: selIt.t.mod.id } : null;

  const pts = MAPA_RAW.slice(0, win.items.length).map((r) => ({ x: r[0] * MS + MOX, y: r[1] * MS + MOY }));
  let bridges = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const a = [pts[i].x, pts[i].y + MT / 2 + 1], b = [pts[i + 1].x, pts[i + 1].y + MT / 2 + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / len * 4.5, ny = (b[0] - a[0]) / len * 4.5;
    const l = Math.min(a[0], b[0]) - 10, t = Math.min(a[1], b[1]) - 10;
    const q = (p) => r1(p[0] - l) + " " + r1(p[1] - t);
    const w = Math.abs(b[0] - a[0]) + 20, hh = Math.abs(b[1] - a[1]) + 20;
    const d = "M" + q([a[0] + nx, a[1] + ny]) + " L" + q([b[0] + nx, b[1] + ny]) + " L" + q([b[0] - nx, b[1] - ny]) + " L" + q([a[0] - nx, a[1] - ny]) + " Z";
    bridges += `<svg class="mp-bridge" aria-hidden="true" width="${r1(w)}" height="${r1(hh)}" viewBox="0 0 ${r1(w)} ${r1(hh)}" style="left:${r1(l)}px;top:${r1(t)}px"><path d="${d}" fill="none" stroke="#F3EFE6" stroke-width="6" stroke-linejoin="round"/><path d="${d}" fill="#F3EFE6" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }

  let plates = "";
  let pin = "";
  win.items.forEach((it, i) => {
    const t = it.t;
    const st = mapaStatus(it, cur);
    const x = pts[i].x, y = pts[i].y;
    const ru = mapaRu(t);
    const w = plateWidth(ru, st === "now");
    const h = w * MK, sw = w + MPAD * 2, sh = h + MT + MPAD * 2;
    const sp = plateShape(w, sw / 2, h / 2 + MPAD);
    const m3 = st === "m3";
    const face = m3 ? "#141417" : PALF[t.leer ? "aq" : visFor(t.deck).pal];
    const side = m3 ? "#0B0B0C" : "#F3EFE6";
    const line = m3 ? "#8E8A82" : "#111111";
    const dash = m3 ? "5 4" : "none";
    const selected = selIt === it;
    const len = [...ru.replace(/́/g, "")].length;
    const fs = len <= 5 ? 13 : len <= 8 ? 12 : 11;
    const es = t.leer ? "aprender" : m3 && t.mod.pronto ? `${t.es} · M${t.mod.n}` : t.es;
    const aria = `${ru}, ${es}${st === "done" ? ", memorizado" : st === "now" ? ", estás aquí" : m3 ? ", próximamente" : ""}`;
    plates += `<svg class="mp-plate" aria-hidden="true" width="${r1(sw)}" height="${r1(sh)}" viewBox="0 0 ${r1(sw)} ${r1(sh)}" style="left:${r1(x - sw / 2)}px;top:${r1(y - h / 2 - MPAD)}px">
      <path d="${sp.sil}" fill="${m3 ? "none" : "#F3EFE6"}" stroke="${m3 ? "none" : "#F3EFE6"}" stroke-width="7" stroke-linejoin="round"/>
      <path d="${sp.sil}" fill="${side}" stroke="${line}" stroke-width="2" stroke-linejoin="round" stroke-dasharray="${dash}"/>
      <path d="${sp.top}" fill="${face}" stroke="${selected && st !== "now" ? "#4AF2D5" : line}" stroke-width="${selected && st !== "now" ? 3.4 : 2}" stroke-linejoin="round" stroke-dasharray="${dash}"/></svg>
      <button class="mp-label" type="button" data-mp="${i}" aria-label="${esc(aria)}" aria-pressed="${selected}" style="left:${r1(x - 46)}px;top:${r1(y - 22)}px">
        <span class="ru" lang="ru" style="font-size:${fs}px;color:${m3 ? "#C9C5BC" : "#111"}">${esc(ru)}</span>
        <span class="mp-es" style="color:${m3 ? "#A3A3AA" : "#3A3A40"}">${esc(es)}</span></button>`;
    if (st === "done") plates += `<span class="mp-check" aria-hidden="true" style="left:${r1(x - w / 2 - 14)}px;top:${r1(y - 12)}px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0B0B0C" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>`;
    if (st === "now") pin = `<svg class="mp-pin" aria-hidden="true" width="64" height="83" viewBox="0 0 48 62" style="left:${r1(x + 18 - 32)}px;top:${r1(y - 12 - 83)}px"><path d="M24 2C12 2 3 11 3 23c0 15 21 37 21 37s21-22 21-37C45 11 36 2 24 2z" fill="#4AF2D5" stroke="#0B0B0C" stroke-width="2.5"/><circle cx="24" cy="23" r="11.5" fill="#F3EFE6"/><path d="M18.5 23.5l4 4 7.5-8" fill="none" stroke="#0B0B0C" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  });

  // Tarjeta del tema seleccionado
  const st = selIt ? mapaStatus(selIt, cur) : "next";
  const t = selIt ? selIt.t : null;
  let card = "";
  if (t) {
    const ru = mapaRu(t);
    const isNow = cur && t === cur;
    const top = t.mod.pronto ? "Pronto" : isNow ? "Estás aquí" : st === "done" ? "Memorizado" : "Tema";
    let body = "";
    if (t.leer) {
      const n = state.lectura ? state.lectura.pasos.length : 6;
      body = `<span class="mc-sub">${leerDone()} de ${n} pasos</span><div class="mc-grid one"><button class="mc-btn fill" type="button" data-mc="leer">Abrir</button></div>`;
    } else if (t.mod.pronto) {
      body = `<span class="mc-sub">${esc(t.deck.title)}</span><p class="mc-soon">Este módulo llega pronto.</p>`;
    } else {
      const ej = ejOf(t.deck);
      const btns = [];
      if (ej.cajas.length) btns.push(["cajas", "Cajas", false]);
      if (t.deck.frases.length) btns.push(["frases", "Frases", false]);
      btns.push(["words", "Palabras", true]);
      if (ej.dialogos.length) btns.push(["dialogo", "Mini diálogo", false]);
      body = `<span class="mc-sub">${esc(t.deck.title)}</span><div class="mc-grid${btns.length === 1 ? " one" : ""}">${btns.map(([k, l, f]) => `<button class="mc-btn${f ? " fill" : ""}" type="button" data-mc="${k}">${l}</button>`).join("")}</div>`;
    }
    card = `<section class="mapa-card" aria-label="Tema seleccionado">
      <div class="mc-head"><span class="mc-top">${top}</span>${t.deck && !t.mod.pronto ? `<button class="mc-list" type="button" data-mc="list">Ver lista</button>` : ""}</div>
      <span class="mc-title">${t.leer ? "Aprende a leer" : `Tema <span class="num">${t.label}</span>`}: <span class="ru" lang="ru">${esc(ru)}</span></span>
      ${body}</section>`;
  }

  // Parte baja
  const w = modWords(mod);
  const head = mod.pronto
    ? `Próximamente`
    : `<span class="num">${w.learned}</span> de <span class="num">${w.total}</span> palabras`;
  const tabs = rutaMods().map((x) => `<button type="button" role="tab" class="num" data-mtab="${x.id}" aria-selected="${x.id === mod.id}">M${x.n}</button>`).join("");
  let today, goBtn;
  if (mod.pronto) {
    today = `<span>El <b>${esc(mod.titulo)}</b> llega pronto. Carol lo va empezando en clase.</span>`;
    const back = currentMod();
    goBtn = back ? `<button class="mapa-go" type="button" data-mgo="mod:${back.id}">Ir al ${esc(back.titulo)}</button>` : "";
  } else if (cur && cur.deck) {
    today = `<span>Hoy toca <b>${esc(cur.deck.title)}</b> · <span class="num">${todayWords(cur.deck)}</span> palabras</span>`;
    const es = cur.es.charAt(0).toUpperCase() + cur.es.slice(1);
    goBtn = `<button class="mapa-go" type="button" data-mgo="words">Seguir con ${esc(es)}</button>`;
  } else {
    today = `<span><b>${esc(mod.titulo)}</b> completo. ¡Bien!</span>`;
    goBtn = `<button class="mapa-go" type="button" data-mgo="temas">Ver todos los temas</button>`;
  }
  const pager = win.pages > 1
    ? `<button class="mapa-pg" type="button" data-mpg="-1" style="left:96px" aria-label="Tramo anterior"${win.p === 0 ? " disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
       <button class="mapa-pg" type="button" data-mpg="1" style="left:332px" aria-label="Tramo siguiente"${win.p >= win.pages - 1 ? " disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`
    : "";
  return `<img class="mapa-art" src="img/mapa/m2.png" alt="">
    ${bridges}${plates}${pin}${card}
    <h1 class="mapa-mod">Módulo <span class="num">${mod.n}</span></h1>${pager}
    <div class="mapa-today"><span class="mt-dot" aria-hidden="true"></span>${today}</div>
    <div class="mapa-bar"><button class="mapa-list" type="button" data-mgo="temas" aria-label="Ver lista de temas"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg></button>${goBtn}</div>
    <button class="mapa-back" type="button" data-mgo="home" aria-label="Volver al inicio"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
    <span class="mapa-h">Tu mapa</span><span class="mapa-n">${head}</span>
    <div class="mapa-tabs" role="tablist" aria-label="Módulos">${tabs}</div>`;
}

function fitMapa() {
  const ms = Math.min(1, window.innerWidth / 390);
  $("#view-mapa").style.setProperty("--ms", ms);
}

function renderMapa() {
  if (!state.mapa) {
    const mod = currentMod() || rutaMods()[0];
    state.mapa = { mod: mod ? mod.id : "m1", page: 0, sel: null };
    const cur = mod && modCurrent(mod);
    if (cur) state.mapa.page = Math.floor(modTemas(mod).indexOf(cur) / PAGE);
  }
  fitMapa();
  $("#mapa-stage").innerHTML = mapaStageHtml();
}

function openMapa() {
  state.mapa = null;
  renderMapa();
  go("mapa");
}

function mapaWinItems() {
  const mod = rutaMods().find((x) => x.id === state.mapa.mod);
  return { mod, win: mapaWindow(mod, state.mapa.page) };
}

function mapaClick(e) {
  const m = state.mapa;
  if (!m) return;
  const tab = e.target.closest("[data-mtab]");
  if (tab) {
    const mod = rutaMods().find((x) => x.id === tab.dataset.mtab);
    const cur = modCurrent(mod);
    state.mapa = { mod: mod.id, page: cur ? Math.floor(modTemas(mod).indexOf(cur) / PAGE) : 0, sel: null };
    renderMapa();
    const b = $(`#mapa-stage [data-mtab="${mod.id}"]`);
    if (b) b.focus();
    return;
  }
  const pg = e.target.closest("[data-mpg]");
  if (pg && !pg.disabled) {
    m.page += Number(pg.dataset.mpg);
    m.sel = null;
    renderMapa();
    return;
  }
  const pl = e.target.closest("[data-mp]");
  if (pl) {
    const { win } = mapaWinItems();
    const it = win.items[Number(pl.dataset.mp)];
    if (it.kind === "page") { m.page++; m.sel = { id: it.t.id, mod: it.t.mod.id }; }
    else if (it.kind === "mod") { m.mod = it.t.mod.id; m.page = 0; m.sel = { id: it.t.id, mod: it.t.mod.id }; }
    else m.sel = { id: it.t.id, mod: it.t.mod.id };
    renderMapa();
    const b = $(`#mapa-stage [aria-pressed="true"].mp-label`);
    if (b) b.focus();
    return;
  }
  const mc = e.target.closest("[data-mc]");
  if (mc) {
    const mod = rutaMods().find((x) => x.id === m.mod);
    const t = modTemas(mod).concat(rutaMods().flatMap((x) => modTemas(x))).find((x) => m.sel && x.id === m.sel.id && x.mod.id === m.sel.mod);
    if (!t) return;
    if (mc.dataset.mc === "leer") return openLeer();
    if (mc.dataset.mc === "list") return openTema(t.deck.id);
    return startMode(t.deck, mc.dataset.mc);
  }
  const go2 = e.target.closest("[data-mgo]");
  if (go2) {
    const a = go2.dataset.mgo;
    if (a === "home" || a === "temas") return go(a);
    if (a.startsWith("mod:")) {
      const mod = rutaMods().find((x) => x.id === a.slice(4));
      const cur = modCurrent(mod);
      state.mapa = { mod: mod.id, page: cur ? Math.floor(modTemas(mod).indexOf(cur) / PAGE) : 0, sel: null };
      return renderMapa();
    }
    if (a === "words") {
      const mod = rutaMods().find((x) => x.id === m.mod);
      const cur = modCurrent(mod);
      if (cur) startMode(cur.deck, "words");
    }
  }
}

// ---------- Ajustes y cuenta ----------
function renderSync() {
  const chip = $("#sync-chip");
  let st = store.status;
  let label = "Solo aquí";
  if (store.syncConfigured && !store.user) { st = "local"; label = "Iniciar sesión"; }
  else if (st === "saving") label = "Guardando…";
  else if (st === "ok") label = "Sincronizado";
  else if (st === "error") label = "Error al sincronizar";
  else if (st === "offline") label = "Sin conexión";
  chip.dataset.state = st;
  chip.textContent = label;
  if (state.view === "settings") renderAccount();
}

function renderAccount() {
  const box = $("#account-box");
  if (!store.syncConfigured) {
    box.innerHTML = `<p class="muted">La sincronización todavía no está configurada, así que tu progreso se guarda solo en este dispositivo.</p>`;
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
  $("#opt-name").value = s.name || "";
  $(`#theme-${s.theme === "light" ? "light" : "dark"}`).checked = true;
  $("#reset-confirm").hidden = true;
  $("#reset-ask").hidden = false;
  $("#app-version").textContent = `Russo Study ${APP_VERSION}${IS_BETA ? " · beta (progreso de prueba)" : ""}`;
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

// ---------- Eventos ----------
function bind() {
  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-go]");
    if (g) return go(g.dataset.go);
    const t = e.target.closest("[data-open-tema]");
    if (t) return openTema(t.dataset.openTema);
  });

  $("#start-today").addEventListener("click", startToday);
  $("#sync-chip").addEventListener("click", () => go("settings"));

  // Temas
  $("#temas-chips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-filter]");
    if (!c) return;
    state.temaFilter = c.dataset.filter;
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
      if (act.dataset.act === "dudas") {
        const body = act.closest(".t-big").querySelector(".dudas-body");
        const on = body.hidden;
        body.hidden = !on;
        act.setAttribute("aria-expanded", String(on));
        if (on) setTimeout(() => body.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
      }
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
    const say = e.target.closest("[data-say]");
    if (say) return speak(say.dataset.say);
    const t = e.target.closest("#dudas-toggle");
    if (!t) return;
    const body = $("#tema-dudas .dudas-body");
    body.hidden = !body.hidden;
    t.setAttribute("aria-expanded", String(!body.hidden));
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
  $("#card-speak").addEventListener("click", () => {
    const s = state.session;
    if (s) speak(s.queue[0].card.ru);
  });
  $("#study-close").addEventListener("click", closeSession);
  $("#study-exit").addEventListener("click", closeSession);
  $("#done-home").addEventListener("click", () => backTo(state.doneReturn || "home"));

  // Mapa
  $("#mapa-stage").addEventListener("click", mapaClick);
  window.addEventListener("resize", () => { if (state.view === "mapa") fitMapa(); });

  // Aprende a leer
  $("#leer-back").addEventListener("click", () => go(state.leerFrom === "mapa" ? "mapa" : "temas"));
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
    dicClick(e);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#sheet").hidden) { e.preventDefault(); closeSheet(); }
  });

  document.addEventListener("keydown", (e) => {
    const s = state.session;
    if (state.view !== "study" || !s || e.target.closest("input, textarea")) return;
    const it = s.queue[0];
    if (e.key === "Escape") return closeSession();
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
  document.title = "Russo Beta";
  const tag = document.createElement("div");
  tag.className = "beta-tag";
  tag.textContent = "BETA";
  tag.setAttribute("aria-label", "Versión beta: progreso de prueba");
  document.body.appendChild(tag);
}

async function main() {
  markBeta();
  applyTheme();
  bind();
  renderSync();
  show("home");
  try {
    await loadDecks();
  } catch (e) {
    console.error(e);
    $("#continue-list").innerHTML = `<p class="loading">No se pudieron cargar los temas: ${esc(e.message)}</p>`;
  }
  renderHome();
  store.init().then(renderSync).catch((e) => console.warn(e));

  startVisitCounter();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch((e) => console.warn("SW", e));
  }
}

main();
