import { Store } from "./store.js";
import { schedule, previewLabel, endOfDay, dateKey, MIN } from "./srs.js";

const APP_VERSION = "1.0.0";
const NEW_PER_DECK_SESSION = 20;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  decks: [],
  deckById: new Map(),
  currentDeck: null,
  session: null,
  view: "home",
  loginEmail: "",
  loginStep: "email"
};

const store = new Store((what) => {
  if (what === "status" || what === "auth") renderSync();
  if (what === "data" || what === "auth") {
    if (state.view === "home") renderHome();
    if (state.view === "deck") renderDeck();
  }
  if (what === "auth" && state.view === "settings") renderSettings();
});

// ---------- Utilidades ----------
const STRESS = /́/g;

function plain(s) {
  return String(s || "").replace(STRESS, "");
}

function norm(s) {
  return plain(s).toLowerCase().replace(/ё/g, "е").trim();
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

function show(view) {
  state.view = view;
  for (const v of ["home", "deck", "study", "done", "settings"]) {
    $(`#view-${v}`).hidden = v !== view;
  }
  window.scrollTo(0, 0);
}

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
        q: c.pregunta,
        a: c.respuesta
      });
    });
    decks.push({
      id,
      title: json.titulo || id,
      group: json.grupo || "Vocabulario",
      desc: json.descripcion || "",
      cards
    });
  }
  state.decks = decks;
  state.deckById = new Map(decks.map((d) => [d.id, d]));
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
  let due = 0, learned = 0, fresh = 0, total = 0;
  for (const it of itemsFor(deck)) {
    total++;
    const st = store.card(it.key);
    if (!st) { fresh++; continue; }
    if (st.ivl >= 1) learned++;
    if (st.due <= eod) due++;
  }
  return { due, learned, fresh, total };
}

// ---------- Inicio ----------
function renderHome() {
  const now = Date.now();
  const today = dateKey(now);
  let due = 0, learned = 0, total = 0, fresh = 0;
  for (const d of state.decks) {
    const s = deckStats(d, now);
    learned += s.learned;
    total += s.total;
    if (deckEnabled(d)) { due += s.due; fresh += s.fresh; }
  }
  const newLeft = Math.max(0, store.settings.newPerDay - store.newToday(today));
  const newCount = Math.min(newLeft, fresh);
  $("#stat-due").textContent = due;
  $("#stat-new").textContent = newCount;
  $("#stat-learned").textContent = learned;
  $("#stat-total").textContent = total;

  const btn = $("#start-today");
  const note = $("#today-note");
  btn.disabled = due + newCount === 0;
  if (due + newCount === 0) {
    note.textContent = fresh === 0
      ? "Terminaste todos los mazos activos. Activa otro mazo o usa el repaso rápido."
      : "Todo al día. Vuelve mañana o sube el límite de nuevas en Ajustes.";
  } else {
    note.textContent = "";
  }

  const groups = new Map();
  for (const d of state.decks) {
    if (!groups.has(d.group)) groups.set(d.group, []);
    groups.get(d.group).push(d);
  }
  const host = $("#deck-groups");
  if (!state.decks.length) {
    host.innerHTML = `<p class="loading">No hay mazos. Revisa data/mazos.json.</p>`;
    return;
  }
  host.innerHTML = Array.from(groups.entries())
    .map(([group, decks]) => {
      const allOn = decks.every(deckEnabled);
      const items = decks
        .map((d) => {
          const s = deckStats(d, now);
          const pct = s.total ? Math.round((s.learned / s.total) * 100) : 0;
          return `<li class="deck-item">
            <button class="deck-open" type="button" data-deck="${esc(d.id)}">
              <span class="deck-name">${esc(d.title)}</span>
              <span class="deck-sub">
                <span>${s.learned}/${s.total} aprendidas</span>
                ${s.due ? `<span class="due">${s.due} para hoy</span>` : ""}
              </span>
              <span class="meter" aria-hidden="true"><span style="width:${pct}%"></span></span>
            </button>
            <input class="switch" type="checkbox" id="en-${esc(d.id)}" data-toggle="${esc(d.id)}"
              ${deckEnabled(d) ? "checked" : ""} aria-label="Incluir ${esc(d.title)} en la sesión diaria">
          </li>`;
        })
        .join("");
      return `<section class="deck-group">
        <div class="deck-group-head">
          <h2 class="eyebrow">${esc(group)}</h2>
          <button type="button" data-group="${esc(group)}" data-on="${allOn ? "0" : "1"}">${allOn ? "Quitar todos" : "Incluir todos"}</button>
        </div>
        <ul class="deck-list">${items}</ul>
      </section>`;
    })
    .join("");
}

function setDeckEnabled(ids, on) {
  const disabled = { ...store.settings.disabled };
  for (const id of ids) {
    if (on) delete disabled[id];
    else disabled[id] = true;
  }
  store.setSetting("disabled", disabled);
}

// ---------- Mazo ----------
function openDeck(id) {
  state.currentDeck = state.deckById.get(id);
  if (!state.currentDeck) return;
  $("#deck-search").value = "";
  renderDeck();
  show("deck");
}

function renderDeck() {
  const d = state.currentDeck;
  if (!d) return;
  const s = deckStats(d);
  $("#deck-title").textContent = d.title;
  $("#deck-desc").textContent = d.desc;
  $("#deck-stats").innerHTML =
    `<span><b>${d.cards.length}</b> tarjetas</span>` +
    `<span><b>${s.learned}</b> aprendidas</span>` +
    `<span><b>${s.due}</b> para hoy</span>` +
    `<span><b>${s.fresh}</b> sin ver</span>`;
  $("#deck-study").disabled = s.due + s.fresh === 0;
  renderWords();
}

function renderWords() {
  const d = state.currentDeck;
  const q = norm($("#deck-search").value);
  const list = d.cards.filter((c) => {
    if (!q) return true;
    const hay = norm([c.ru, c.es, c.q, c.a, c.nota, c.tag].join(" "));
    return hay.includes(q);
  });
  const host = $("#deck-words");
  if (!list.length) {
    host.innerHTML = `<li><span class="empty">Nada coincide con tu búsqueda.</span></li>`;
    return;
  }
  host.innerHTML = list
    .map((c) => {
      const sts = keysFor(c).map((k) => store.card(k));
      const cls = sts.every((x) => x && x.ivl >= 1) ? "known" : sts.some(Boolean) ? "learning" : "";
      const dot = `<span class="wl-dot ${cls}" aria-hidden="true"></span>`;
      if (c.kind === "qa") {
        return `<li><span class="wl-es" style="grid-column:1/-1">${dot}${esc(c.q)}</span></li>`;
      }
      return `<li>
        <span class="wl-ru" lang="ru">${dot}${esc(c.ru)}</span>
        <span class="wl-es">${esc(c.es)}</span>
        ${c.tag ? `<span class="wl-tag">${esc(c.tag)}</span>` : ""}
      </li>`;
    })
    .join("");
}

// ---------- Sesiones ----------
function buildQueue(decks, newLimit) {
  const now = Date.now();
  const eod = endOfDay(now);
  const reviews = [];
  const fresh = [];
  for (const d of decks) {
    for (const it of itemsFor(d)) {
      const st = store.card(it.key);
      if (!st) fresh.push(it);
      else if (st.due <= eod) reviews.push({ ...it, due: st.due });
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
  return queue;
}

function startToday() {
  const today = dateKey(Date.now());
  const newLeft = Math.max(0, store.settings.newPerDay - store.newToday(today));
  const queue = buildQueue(state.decks.filter(deckEnabled), newLeft);
  startSession(queue, "Sesión de hoy", false);
}

function startDeck() {
  const queue = buildQueue([state.currentDeck], NEW_PER_DECK_SESSION);
  startSession(queue, state.currentDeck.title, false);
}

function startCram() {
  const d = state.currentDeck;
  let items = itemsFor(d).filter((it) => store.card(it.key));
  if (!items.length) items = itemsFor(d);
  items = items.sort(() => Math.random() - 0.5).slice(0, 40);
  startSession(items, `${d.title} · repaso rápido`, true);
}

function startSession(queue, title, cram) {
  if (!queue.length) {
    toast("No hay tarjetas pendientes.");
    return;
  }
  state.session = {
    queue,
    title,
    cram,
    done: 0,
    total: queue.length,
    tally: { 1: 0, 2: 0, 3: 0, 4: 0 },
    flipped: false,
    returnTo: state.view === "deck" ? "deck" : "home"
  };
  show("study");
  renderCard();
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const clean = plain(text).replace(/\(.*?\)/g, "").replace(/[/·]/g, ",").trim();
  if (!clean) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = "ru-RU";
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith("ru"));
  if (voice) u.voice = voice;
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

function ruBlock(text) {
  const cursive = store.settings.cursive
    ? `<div class="script-ru" lang="ru" aria-hidden="true">${esc(plain(text))}</div>`
    : "";
  return `<div class="big-ru" lang="ru">${esc(text)}</div>${cursive}`;
}

function extras(card) {
  return (card.tag ? `<span class="tag">${esc(card.tag)}</span>` : "") +
    (card.nota ? `<div class="note">${esc(card.nota)}</div>` : "");
}

function renderCard() {
  const s = state.session;
  const it = s.queue[0];
  const st = store.card(it.key);
  const deck = state.deckById.get(it.card.deckId);
  s.flipped = false;

  $("#card-deck").textContent = deck ? deck.title : "";
  $("#card-badge").hidden = !!st || s.cram;
  $("#study-count").textContent = s.queue.length;
  $("#study-progress").style.width = `${Math.round((s.done / (s.done + s.queue.length)) * 100)}%`;

  const front = $("#card-front");
  const back = $("#card-back");
  const c = it.card;
  if (it.dir === "qa") {
    front.innerHTML = `<div class="qa-text">${esc(c.q)}</div>`;
    back.innerHTML = `<div class="qa-text answer">${esc(c.a)}</div>`;
  } else if (it.dir === "es") {
    front.innerHTML = `<div class="big-es">${esc(c.es)}</div>`;
    back.innerHTML = ruBlock(c.ru) + extras(c);
  } else {
    front.innerHTML = ruBlock(c.ru);
    back.innerHTML = `<div class="big-es">${esc(c.es)}</div>` + extras(c);
  }
  back.hidden = true;

  const canSpeak = "speechSynthesis" in window && it.dir !== "qa";
  $("#card-speak").hidden = !(canSpeak && it.dir === "ru");
  $("#show-answer").hidden = false;
  $("#ratings").hidden = true;

  const now = Date.now();
  for (const el of $$("[data-ivl]")) {
    const r = Number(el.dataset.ivl);
    el.textContent = s.cram ? (r === 1 ? "otra vuelta" : "") : previewLabel(st, r, now);
  }
  if (store.settings.autoSpeak && it.dir === "ru") speak(c.ru);
}

function flip() {
  const s = state.session;
  if (!s || s.flipped) return;
  s.flipped = true;
  const it = s.queue[0];
  $("#card-back").hidden = false;
  $("#show-answer").hidden = true;
  $("#ratings").hidden = false;
  if (it.dir === "es") {
    $("#card-speak").hidden = !("speechSynthesis" in window);
    if (store.settings.autoSpeak) speak(it.card.ru);
  }
}

function rate(r) {
  const s = state.session;
  if (!s || !s.flipped) return;
  const it = s.queue.shift();
  const now = Date.now();
  s.tally[r]++;
  if (s.cram) {
    if (r === 1) s.queue.splice(Math.min(3, s.queue.length), 0, it);
    else s.done++;
  } else {
    const prev = store.card(it.key);
    if (!prev) store.countNew(dateKey(now));
    const st = schedule(prev, r, now);
    store.setCard(it.key, st);
    if (st.due <= now + 20 * MIN) {
      s.queue.splice(Math.min(3, s.queue.length), 0, it);
    } else {
      s.done++;
    }
  }
  if (s.queue.length) renderCard();
  else finishSession();
}

function finishSession() {
  const s = state.session;
  const total = s.tally[1] + s.tally[2] + s.tally[3] + s.tally[4];
  $("#done-title").textContent = s.title;
  $("#done-summary").textContent =
    `Respondiste ${total} veces: ${s.tally[3] + s.tally[4]} bien o fácil, ` +
    `${s.tally[2]} difíciles y ${s.tally[1]} para repetir.`;
  show("done");
}

function closeSession() {
  const s = state.session;
  state.session = null;
  if (s && s.returnTo === "deck" && state.currentDeck) {
    renderDeck();
    show("deck");
  } else {
    renderHome();
    show("home");
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
    box.innerHTML = `<p class="muted">La sincronización todavía no está configurada, así que tu progreso se guarda solo en este dispositivo. Para activarla, agrega tus datos de Supabase en <code>js/config.js</code> (las instrucciones están en el README del repositorio).</p>`;
    return;
  }
  if (store.user) {
    const label = { ok: "sincronizado", saving: "guardando…", error: "error al sincronizar", offline: "sin conexión" }[store.status] || "listo";
    box.innerHTML = `<p>Sesión iniciada como <b>${esc(store.user.email)}</b>.</p>
      <p class="muted">Estado: ${label}. Tu progreso se guarda en la nube y aparece en todos tus dispositivos.</p>
      <div class="confirm-actions">
        <button class="btn" id="sync-now" type="button">Sincronizar ahora</button>
        <button class="btn" id="sign-out" type="button">Cerrar sesión</button>
      </div>`;
    return;
  }
  if (state.loginStep === "code") {
    box.innerHTML = `<form class="account-form" id="code-form" novalidate>
        <p>Te enviamos un código a <b>${esc(state.loginEmail)}</b>. Escríbelo aquí:</p>
        <input class="code" id="login-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" required>
        <button class="btn btn-primary" type="submit">Entrar</button>
        <button class="btn" type="button" id="login-back">Usar otro correo</button>
      </form>`;
    return;
  }
  box.innerHTML = `<form class="account-form" id="email-form" novalidate>
      <p class="muted">Inicia sesión con tu correo para guardar tu progreso en la nube. Te llegará un código para entrar, sin contraseña.</p>
      <label for="login-email" class="visually-hidden">Correo</label>
      <input id="login-email" type="email" autocomplete="email" placeholder="tu@correo.com" required value="${esc(state.loginEmail)}">
      <button class="btn btn-primary" type="submit">Enviarme un código</button>
    </form>`;
}

function renderSettings() {
  const s = store.settings;
  $(`#dir-${s.dir === "both" ? "both" : s.dir}`).checked = true;
  $("#new-per-day").value = s.newPerDay;
  $("#opt-cursive").checked = !!s.cursive;
  $("#opt-autospeak").checked = !!s.autoSpeak;
  $("#reset-confirm").hidden = true;
  $("#reset-ask").hidden = false;
  $("#app-version").textContent = `Russo Study ${APP_VERSION}`;
  renderAccount();
}

// ---------- Eventos ----------
function bind() {
  $("#start-today").addEventListener("click", startToday);
  $("#open-settings").addEventListener("click", () => { renderSettings(); show("settings"); });
  $("#sync-chip").addEventListener("click", () => { renderSettings(); show("settings"); });

  $("#deck-groups").addEventListener("click", (e) => {
    const open = e.target.closest("[data-deck]");
    if (open) return openDeck(open.dataset.deck);
    const grp = e.target.closest("[data-group]");
    if (grp) {
      const ids = state.decks.filter((d) => d.group === grp.dataset.group).map((d) => d.id);
      setDeckEnabled(ids, grp.dataset.on === "1");
      renderHome();
    }
  });
  $("#deck-groups").addEventListener("change", (e) => {
    const t = e.target.closest("[data-toggle]");
    if (t) {
      setDeckEnabled([t.dataset.toggle], t.checked);
      renderHome();
    }
  });

  for (const b of $$("[data-back]")) {
    b.addEventListener("click", () => { renderHome(); show("home"); });
  }
  $("#deck-study").addEventListener("click", startDeck);
  $("#deck-cram").addEventListener("click", startCram);
  $("#deck-search").addEventListener("input", renderWords);

  $("#show-answer").addEventListener("click", flip);
  $("#card").addEventListener("click", (e) => {
    if (e.target.closest("#card-speak")) return;
    flip();
  });
  $("#card-speak").addEventListener("click", () => {
    const s = state.session;
    if (s) speak(s.queue[0].card.ru);
  });
  $("#ratings").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rate]");
    if (b) rate(Number(b.dataset.rate));
  });
  $("#study-close").addEventListener("click", closeSession);
  $("#done-home").addEventListener("click", closeSession);

  document.addEventListener("keydown", (e) => {
    if (state.view !== "study" || e.target.closest("input")) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
    else if (["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key));
    else if (e.key === "Escape") closeSession();
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
  $("#opt-cursive").addEventListener("change", (e) => store.setSetting("cursive", e.target.checked));
  $("#opt-autospeak").addEventListener("change", (e) => store.setSetting("autoSpeak", e.target.checked));
  $("#reset-ask").addEventListener("click", () => { $("#reset-confirm").hidden = false; $("#reset-ask").hidden = true; });
  $("#reset-no").addEventListener("click", () => { $("#reset-confirm").hidden = true; $("#reset-ask").hidden = false; });
  $("#reset-yes").addEventListener("click", () => {
    store.reset();
    $("#reset-confirm").hidden = true;
    $("#reset-ask").hidden = false;
    toast("Progreso reiniciado");
  });

  $("#account-box").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      if (e.target.id === "email-form") {
        const email = $("#login-email").value.trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Escribe un correo válido.");
        await store.sendCode(email);
        state.loginEmail = email;
        state.loginStep = "code";
        toast("Código enviado. Revisa tu correo.");
      } else {
        const code = $("#login-code").value.replace(/\s/g, "");
        if (!code) throw new Error("Escribe el código del correo.");
        await store.verifyCode(state.loginEmail, code);
        state.loginStep = "email";
        toast("Sesión iniciada");
      }
    } catch (err) {
      toast(err.message || "No se pudo completar. Intenta de nuevo.");
    } finally {
      btn.disabled = false;
      renderAccount();
    }
  });
  $("#account-box").addEventListener("click", async (e) => {
    if (e.target.id === "login-back") { state.loginStep = "email"; renderAccount(); }
    if (e.target.id === "sync-now") { await store.pull(); toast("Sincronizado"); }
    if (e.target.id === "sign-out") { await store.signOut(); state.loginStep = "email"; renderAccount(); renderSync(); }
  });
}

// ---------- Arranque ----------
async function main() {
  bind();
  renderSync();
  try {
    await loadDecks();
  } catch (e) {
    console.error(e);
    $("#deck-groups").innerHTML = `<p class="loading">No se pudieron cargar los mazos: ${esc(e.message)}</p>`;
  }
  renderHome();
  store.init().then(renderSync).catch((e) => console.warn(e));

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW", e));
  }
}

main();
