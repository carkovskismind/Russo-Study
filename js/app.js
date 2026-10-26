import { Store } from "./store.js";
import { schedule, endOfDay, dateKey } from "./srs.js";

const APP_VERSION = "1.3.0";
const NEW_PER_DECK_SESSION = 20;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  decks: [],
  deckById: new Map(),
  currentDeck: null,
  selecting: false,
  selected: new Set(),
  session: null,
  view: "home",
  loginEmail: "",
  loginStep: "email"
};

const store = new Store((what) => {
  if (what === "status" || what === "auth") renderSync();
  if (what === "data" || what === "auth") {
    applyTheme();
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
        pista: c.pista || "",
        fonetica: c.fonetica || "",
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
  const picks = pickedCards().length;
  btn.disabled = due + newCount + picks === 0;
  if (picks) {
    note.textContent = `Más ${picks} ${picks === 1 ? "palabra que elegiste" : "palabras que elegiste"}.`;
  } else if (due + newCount === 0) {
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
  state.selecting = false;
  state.selected = new Set();
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
  $("#select-count").textContent = n === 1 ? "1 palabra seleccionada" : `${n} palabras seleccionadas`;
  $("#select-add").disabled = n === 0;
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
  renderSelectBar();
  host.innerHTML = list
    .map((c) => {
      const sts = keysFor(c).map((k) => store.card(k));
      const cls = sts.every((x) => x && x.ivl >= 1) ? "known" : sts.some(Boolean) ? "learning" : "";
      const dot = `<span class="wl-dot ${cls}" aria-hidden="true"></span>`;
      const on = store.picked(c.id);
      const check = state.selecting
        ? `<input class="wl-check" type="checkbox" data-select="${esc(c.id)}" ${state.selected.has(c.id) ? "checked" : ""} aria-label="Seleccionar">`
        : "";
      const pick = `<button class="pick-btn${on ? " on" : ""}" type="button" data-pick="${esc(c.id)}" aria-pressed="${on}">${on ? "✓ Hoy" : "+ Hoy"}</button>`;
      if (c.kind === "qa") {
        return `<li class="${state.selecting ? "selecting" : ""}">${check}
          <span class="wl-es wl-full">${dot}${esc(c.q)}</span>
          <span class="wl-foot">${pick}</span>
        </li>`;
      }
      return `<li class="${state.selecting ? "selecting" : ""}">${check}
        <span class="wl-ru" lang="ru">${dot}${esc(c.ru)}${c.fonetica ? `<span class="fon">${esc(c.fonetica)}</span>` : ""}</span>
        <span class="wl-es">${esc(c.es)}</span>
        <span class="wl-foot">${c.tag ? `<span class="wl-tag">${esc(c.tag)}</span>` : "<span></span>"}${pick}</span>
        ${store.note(c.id) ? `<span class="wl-note">Tu nota: ${esc(store.note(c.id))}</span>` : ""}
      </li>`;
    })
    .join("");
}

// ---------- Práctica (estilo Chessbook) ----------
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
  startSession(queue, "Práctica", false);
}

function startDeck() {
  const queue = buildQueue([state.currentDeck], NEW_PER_DECK_SESSION);
  startSession(queue, state.currentDeck.title, false);
}

function startCram() {
  const d = state.currentDeck;
  let items = itemsFor(d).filter((it) => store.card(it.key));
  if (!items.length) items = itemsFor(d);
  items = shuffle(items).slice(0, 40).map((it) => ({ ...it, phase: "quiz", failed: false, hint: 0 }));
  startSession(items, "Repaso rápido", true);
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
    ok: 0,
    bad: 0,
    resolved: 0,
    answered: false,
    requeue: false,
    timer: null,
    returnTo: state.view === "deck" ? "deck" : "home"
  };
  $("#study-title").textContent = title;
  show("study");
  renderItem();
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  if (meta) meta.setAttribute("content", theme === "light" ? "#f4f5f7" : "#0b0c0d");
}

function showFeedback(ok, text) {
  const fb = $("#feedback");
  fb.className = `feedback ${ok ? "ok" : "bad"}`;
  fb.textContent = text;
  fb.hidden = false;
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

// ---------- Notas personales ----------
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
        <button class="btn" type="button" data-note="cancel">Cancelar</button>
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
  show("done");
}

function closeSession() {
  const s = state.session;
  if (s) clearTimeout(s.timer);
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
  $("#opt-sound").checked = s.sound !== false;
  $(`#theme-${s.theme === "light" ? "light" : "dark"}`).checked = true;
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
  $("#done-home").addEventListener("click", closeSession);

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
  $("#opt-cursive").addEventListener("change", (e) => store.setSetting("cursive", e.target.checked));
  $("#opt-autospeak").addEventListener("change", (e) => store.setSetting("autoSpeak", e.target.checked));
  $("#opt-sound").addEventListener("change", (e) => {
    store.setSetting("sound", e.target.checked);
    if (e.target.checked) playSound(true);
  });
  for (const r of $$('input[name="theme"]')) {
    r.addEventListener("change", () => { if (r.checked) { store.setSetting("theme", r.value); applyTheme(); } });
  }

  // Lista del día desde un mazo
  $("#deck-words").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    const id = b.dataset.pick;
    const on = !store.picked(id);
    store.setPicks([id], on);
    toast(on ? "Agregada a tu práctica de hoy" : "Quitada de tu práctica de hoy");
    renderWords();
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
    const q = norm($("#deck-search").value);
    for (const c of state.currentDeck.cards) {
      const hay = norm([c.ru, c.es, c.q, c.a, c.nota, c.tag].join(" "));
      if (!q || hay.includes(q)) state.selected.add(c.id);
    }
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
  applyTheme();
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
