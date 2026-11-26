// Progreso del estudio: se guarda en el dispositivo y, si hay sesión
// iniciada en Supabase, también en la nube para verlo en cualquier lado.

import { dateKey } from "./srs.js";

// Versión beta (/beta/): progreso de prueba totalmente aparte. Usa otras
// claves en el dispositivo, otra sesión de Supabase y la tabla progress_beta,
// así nada de lo que hagas en la beta toca tu progreso real.
export const IS_BETA = /\/beta\//.test(location.pathname);
const PREFIX = IS_BETA ? "russo-beta-" : "russo-";

const LOCAL_KEY = PREFIX + "progress-v1";
const TABLE = IS_BETA ? "progress_beta" : "progress";
const REPORTS = "reportes";
const PENDING_KEY = PREFIX + "reportes-pendientes";
const AUTH_KEY = IS_BETA ? "russo-beta-auth" : undefined;

function readPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch { return []; }
}

function newKey() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function writePending(list) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch { /* sin almacenamiento */ }
}

export const DEFAULT_SETTINGS = {
  dir: "ru",
  newPerDay: 15,
  dayMax: 30, // tope de la «Práctica de hoy» (4.0.1); lo atrasado sale los días siguientes
  cursive: false,
  autoSpeak: false,
  sound: true,
  fonetica: true,
  theme: "dark",
  name: "",
  ayudas: true, // 4.2.0: notas de ayuda con flecha
  disabled: {}
};

function emptyProgress() {
  return {
    v: 1,
    cards: {},
    newLog: {},
    revLog: {},
    days: {},
    frases: {},
    notes: {},
    picks: {},
    mine: {},
    ejer: {},
    lectura: {},
    current: null,
    settings: { ...DEFAULT_SETTINGS, t: 0 },
    resetAt: 0
  };
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return emptyProgress();
    return normalize(JSON.parse(raw));
  } catch {
    return emptyProgress();
  }
}

function writeLocal(p) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(p));
  } catch {
    /* almacenamiento no disponible: el progreso vive solo en memoria */
  }
}

// Ajustes: cada campo con su tipo; lo que venga vacío, null o con otro tipo
// (copia vieja o dañada, o de la nube) se cambia por el valor por omisión.
export function normalizeSettings(raw) {
  const d = DEFAULT_SETTINGS;
  const s = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const num = (v, def, min, max) => (typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : def);
  const bool = (v, def) => (typeof v === "boolean" ? v : def);
  const disabled = {};
  if (s.disabled && typeof s.disabled === "object" && !Array.isArray(s.disabled)) {
    for (const [k, v] of Object.entries(s.disabled)) if (v) disabled[k] = true;
  }
  return {
    dir: ["ru", "es", "both"].includes(s.dir) ? s.dir : d.dir,
    newPerDay: num(s.newPerDay, d.newPerDay, 0, 200),
    dayMax: num(s.dayMax, d.dayMax, 1, 500),
    cursive: bool(s.cursive, d.cursive),
    autoSpeak: bool(s.autoSpeak, d.autoSpeak),
    sound: bool(s.sound, d.sound),
    fonetica: bool(s.fonetica, d.fonetica),
    theme: s.theme === "light" ? "light" : "dark",
    name: typeof s.name === "string" ? s.name : d.name,
    ayudas: bool(s.ayudas, d.ayudas),
    disabled,
    t: typeof s.t === "number" && Number.isFinite(s.t) ? s.t : 0
  };
}

function normalize(p) {
  const base = emptyProgress();
  if (!p || typeof p !== "object") return base;
  return {
    v: 1,
    cards: p.cards && typeof p.cards === "object" ? p.cards : {},
    newLog: p.newLog && typeof p.newLog === "object" ? p.newLog : {},
    revLog: p.revLog && typeof p.revLog === "object" ? p.revLog : {},
    days: p.days && typeof p.days === "object" ? p.days : {},
    frases: p.frases && typeof p.frases === "object" ? p.frases : {},
    notes: p.notes && typeof p.notes === "object" ? p.notes : {},
    picks: p.picks && typeof p.picks === "object" ? p.picks : {},
    mine: p.mine && typeof p.mine === "object" ? p.mine : {},
    ejer: p.ejer && typeof p.ejer === "object" ? p.ejer : {},
    lectura: p.lectura && typeof p.lectura === "object" ? p.lectura : {},
    current: p.current && typeof p.current === "object" && p.current.deck ? p.current : null,
    settings: normalizeSettings(p.settings),
    resetAt: typeof p.resetAt === "number" && Number.isFinite(p.resetAt) ? p.resetAt : 0
  };
}

// Une dos copias del progreso: por tarjeta gana la calificación más reciente.
export function merge(a, b) {
  a = normalize(a);
  b = normalize(b);
  const resetAt = Math.max(a.resetAt, b.resetAt);
  const out = emptyProgress();
  out.resetAt = resetAt;
  for (const src of [a, b]) {
    for (const [k, st] of Object.entries(src.cards)) {
      if (!st || (st.t || 0) <= resetAt) continue;
      const cur = out.cards[k];
      if (!cur || (st.t || 0) > (cur.t || 0)) out.cards[k] = st;
    }
  }
  const resetDay = resetAt ? dateKey(resetAt) : "";
  // Los contadores por día no llevan hora: del día del reinicio solo valen los de
  // una copia que ya conoce ese reinicio (lo de esa mañana antes de reiniciar se descarta).
  const skipDay = (src, day) => !!resetDay && (day < resetDay || (day === resetDay && src.resetAt < resetAt));
  const count = (n) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);
  for (const src of [a, b]) {
    for (const [day, n] of Object.entries(src.newLog)) {
      if (skipDay(src, day)) continue;
      out.newLog[day] = Math.max(out.newLog[day] || 0, count(n));
    }
    // Repasos hechos por día (tope diario de repasos, 4.0.1).
    for (const [day, n] of Object.entries(src.revLog)) {
      if (skipDay(src, day)) continue;
      out.revLog[day] = Math.max(out.revLog[day] || 0, count(n));
    }
  }
  // Actividad por día (para la racha y la gráfica de la semana).
  for (const src of [a, b]) {
    for (const [day, n] of Object.entries(src.days)) {
      if (skipDay(src, day)) continue;
      out.days[day] = Math.max(out.days[day] || 0, count(n));
    }
  }
  // Frases para armar: gana el intento más reciente.
  for (const src of [a, b]) {
    for (const [id, f] of Object.entries(src.frases)) {
      if (!f || (f.t || 0) <= resetAt) continue;
      const cur = out.frases[id];
      if (!cur || (f.t || 0) > (cur.t || 0)) out.frases[id] = f;
    }
  }
  // Las notas personales no se borran al reiniciar el progreso.
  for (const src of [a, b]) {
    for (const [id, n] of Object.entries(src.notes)) {
      const cur = out.notes[id];
      if (!cur || (n.t || 0) > (cur.t || 0)) out.notes[id] = n;
    }
  }
  // Palabras elegidas para estudiar: gana el cambio más reciente.
  for (const src of [a, b]) {
    for (const [id, n] of Object.entries(src.picks)) {
      const cur = out.picks[id];
      if (!cur || (n.t || 0) > (cur.t || 0)) out.picks[id] = n;
    }
  }
  // «Mis palabras», diálogos y cajas, y pasos de «Aprende a leer»: gana el
  // cambio más reciente. «Mis palabras» no se borra al reiniciar (como las notas).
  for (const key of ["mine", "ejer", "lectura"]) {
    for (const src of [a, b]) {
      for (const [id, n] of Object.entries(src[key])) {
        if (!n || (key !== "mine" && (n.t || 0) <= resetAt)) continue;
        const cur = out[key][id];
        if (!cur || (n.t || 0) > (cur.t || 0)) out[key][id] = n;
      }
    }
  }
  // Tema actual: gana el más reciente.
  out.current = [a.current, b.current].filter(Boolean).sort((x, y) => (y.t || 0) - (x.t || 0))[0] || null;
  out.settings = (b.settings.t || 0) > (a.settings.t || 0) ? b.settings : a.settings;
  return out;
}

export class Store {
  constructor(onChange) {
    this.p = readLocal();
    this.onChange = onChange || (() => {});
    this.sb = null;
    this.user = null;
    this.status = "local";
    this.pushTimer = null;
    this.dirty = false;

    const cfg = window.RUSSO_CONFIG || {};
    if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
      try {
        this.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            ...(AUTH_KEY ? { storageKey: AUTH_KEY } : {})
          }
        });
      } catch (e) {
        console.error("No se pudo iniciar Supabase", e);
        this.sb = null;
      }
    }
  }

  get syncConfigured() {
    return !!this.sb;
  }

  // Hay datos de Supabase en config.js (aunque la librería no haya cargado).
  get syncWanted() {
    const cfg = window.RUSSO_CONFIG || {};
    return !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  }

  async init() {
    if (!this.sb) {
      this.setStatus("local");
      return;
    }
    const { data } = await this.sb.auth.getSession();
    this.user = data.session ? data.session.user : null;
    this.sb.auth.onAuthStateChange((_event, session) => {
      const prev = this.user ? this.user.id : null;
      this.user = session ? session.user : null;
      const now = this.user ? this.user.id : null;
      if (now && now !== prev) this.pull();
      if (!now) this.setStatus("local");
      this.onChange("auth");
    });
    if (this.user) await this.pull();
    else this.setStatus("local");
    this.flushReports();

    window.addEventListener("online", () => { this.pull(); this.flushReports(); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && this.dirty) this.push();
      if (document.visibilityState === "visible") { this.pull(); this.flushReports(); }
    });
  }

  setStatus(s) {
    this.status = s;
    this.onChange("status");
  }

  save() {
    writeLocal(this.p);
    if (this.sb && this.user) {
      this.dirty = true;
      this.setStatus("saving");
      clearTimeout(this.pushTimer);
      this.pushTimer = setTimeout(() => this.push(), 1500);
    }
  }

  async pull() {
    if (!this.sb || !this.user) return;
    try {
      const { data, error } = await this.sb
        .from(TABLE)
        .select("data")
        .eq("user_id", this.user.id)
        .maybeSingle();
      if (error) throw error;
      const merged = merge(this.p, data ? data.data : null);
      this.p = merged;
      writeLocal(this.p);
      this.onChange("data");
      await this.push();
    } catch (e) {
      console.warn("No se pudo descargar el progreso", e);
      this.setStatus(navigator.onLine ? "error" : "offline");
    }
  }

  async push() {
    if (!this.sb || !this.user) return;
    clearTimeout(this.pushTimer);
    try {
      const { error } = await this.sb.from(TABLE).upsert({
        user_id: this.user.id,
        data: this.p,
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      this.dirty = false;
      this.setStatus("ok");
    } catch (e) {
      console.warn("No se pudo guardar en la nube", e);
      this.setStatus(navigator.onLine ? "error" : "offline");
    }
  }

  // --- Cuenta ---
  async signIn(email, password) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  // Devuelve true si la cuenta quedó con sesión iniciada; false si Supabase
  // pide confirmar el correo antes de entrar.
  async signUp(email, password) {
    const { data, error } = await this.sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
    if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("User already registered");
    }
    return !!(data && data.session);
  }

  async signOut() {
    if (this.dirty) await this.push();
    await this.sb.auth.signOut();
  }

  // --- Datos ---
  get settings() {
    return this.p.settings;
  }

  setSetting(key, value) {
    this.p.settings = { ...this.p.settings, [key]: value, t: Date.now() };
    this.save();
  }

  card(key) {
    return this.p.cards[key];
  }

  setCard(key, st) {
    this.p.cards[key] = st;
    this.save();
  }

  newToday(day) {
    return this.p.newLog[day] || 0;
  }

  countNew(day) {
    this.p.newLog[day] = (this.p.newLog[day] || 0) + 1;
  }

  revToday(day) {
    return this.p.revLog[day] || 0;
  }

  countReview(day) {
    this.p.revLog[day] = (this.p.revLog[day] || 0) + 1;
  }

  logActivity(day) {
    this.p.days[day] = (this.p.days[day] || 0) + 1;
  }

  activity(day) {
    return this.p.days[day] || 0;
  }

  frase(id) {
    return this.p.frases[id] || null;
  }

  setFrase(id, ok) {
    const prev = this.p.frases[id] || { n: 0, ok: 0 };
    this.p.frases[id] = { n: prev.n + 1, ok: prev.ok + (ok ? 1 : 0), last: ok ? 1 : 0, t: Date.now() };
    this.save();
  }

  // «Mi respuesta también es correcta»: se guarda en Supabase para revisarla.
  // Sin conexión o sin Supabase se queda en el dispositivo y se envía después.
  // Devuelve true solo si ESTE reporte llegó.
  async report(entry) {
    const row = { ...entry, mazo: (IS_BETA ? "beta/" : "") + entry.mazo, user_id: this.user ? this.user.id : null, created_at: new Date().toISOString(), _k: newKey() };
    const pending = readPending();
    pending.push(row);
    writePending(pending);
    const sent = await this.flushReports();
    return sent.has(row._k);
  }

  // «Reportar falla» (botón de la beta). Sin conexión se queda en la cola de pendientes.
  // Devuelve true solo si ESTE reporte llegó.
  async reportFalla(entry) {
    const row = { tipo: "falla", ...entry, user_id: this.user ? this.user.id : null, created_at: new Date().toISOString(), _k: newKey() };
    const pending = readPending();
    pending.push(row);
    writePending(pending.slice(-50));
    const sent = await this.flushReports();
    return sent.has(row._k);
  }

  // Envía la cola fila por fila: si una falla, las demás sí llegan. Una fila con
  // user_id de otra sesión (o guardada con sesión y enviada sin ella) se manda sin
  // user_id, porque Supabase la rechazaría. Devuelve las claves de las filas enviadas.
  async flushReports() {
    if (this._flushP) {
      const before = await this._flushP;
      if (!readPending().some((r) => !r._k || !before.has(r._k))) return before;
      const again = await this.flushReports();
      return new Set([...before, ...again]);
    }
    this._flushP = this._flushOnce();
    try { return await this._flushP; } finally { this._flushP = null; }
  }

  async _flushOnce() {
    const sent = new Set();
    const pending = readPending().map((r) => (r && r._k ? r : { ...r, _k: newKey() }));
    if (!pending.length || !this.sb) return sent;
    writePending(pending);
    const me = this.user ? this.user.id : null;
    const done = new Set();
    for (const r of pending) {
      const { _k, ...data } = r;
      // Todas las filas con las mismas columnas (los reportes viejos no traen las nuevas).
      const row = {
        tipo: "respuesta", pantalla: null, version: null, descripcion: null, entorno: null,
        mazo: null, frase_id: null, paso: null, respuesta: null, esperada: null, ...data,
        user_id: data.user_id && data.user_id === me ? data.user_id : null
      };
      try {
        const { error } = await this.sb.from(REPORTS).insert(row);
        if (error) {
          // Datos que Supabase nunca aceptará (p. ej. texto demasiado largo): se descartan.
          if (/^2[23]/.test(String(error.code || ""))) { done.add(_k); console.warn("Reporte descartado", error); continue; }
          // Otro rechazo del servidor: esta fila se queda en la cola y se sigue con las demás.
          if (error.code) { console.warn("No se pudo enviar el reporte", error); continue; }
          throw error;
        }
        done.add(_k);
        sent.add(_k);
      } catch (e) {
        console.warn("No se pudo enviar el reporte", e);
        break; // sin conexión: lo demás se intenta después
      }
    }
    // Solo se quitan los enviados; lo que llegó mientras tanto se conserva.
    if (done.size) writePending(readPending().filter((r) => !(r && done.has(r._k))));
    return sent;
  }

  picked(id) {
    const n = this.p.picks[id];
    return !!(n && n.on);
  }

  pickedIds() {
    return Object.keys(this.p.picks).filter((id) => this.p.picks[id].on);
  }

  setPicks(ids, on) {
    const t = Date.now();
    for (const id of ids) this.p.picks[id] = { on, t };
    this.save();
  }

  note(id) {
    const n = this.p.notes[id];
    return n && n.text ? n.text : "";
  }

  setNote(id, text) {
    this.p.notes[id] = { text: text.trim(), t: Date.now() };
    this.save();
  }

  // --- «Mis palabras» (mazo personal) ---
  mineList() {
    return Object.entries(this.p.mine).filter(([, w]) => w && w.on).map(([id, w]) => ({ id, ...w }));
  }

  inMine(id) {
    const w = this.p.mine[id];
    return !!(w && w.on);
  }

  setMine(id, word, on) {
    this.p.mine[id] = { ...(this.p.mine[id] || {}), ...(word || {}), on, t: Date.now() };
    this.save();
  }

  // --- Diálogos y cajas ---
  ejer(id) {
    return this.p.ejer[id] || null;
  }

  setEjer(id, ok) {
    const prev = this.p.ejer[id] || { n: 0, ok: 0 };
    this.p.ejer[id] = { n: prev.n + 1, ok: prev.ok + (ok ? 1 : 0), last: ok ? 1 : 0, t: Date.now() };
    this.save();
  }

  // --- Retos de gramática: aciertos seguidos sin pista por tarjeta ---
  // Se guarda en «ejer» (con la clave «limpio:…») para sincronizarse igual.
  limpio(key) {
    const r = this.p.ejer[`limpio:${key}`];
    return r ? r.c || 0 : 0;
  }

  setLimpio(key, ok) {
    const c = ok ? this.limpio(key) + 1 : 0;
    this.p.ejer[`limpio:${key}`] = { c, t: Date.now() };
    this.save();
  }

  // --- Aprende a leer ---
  lectura(id) {
    return this.p.lectura[id] || null;
  }

  setLectura(id) {
    this.p.lectura[id] = { done: 1, t: Date.now() };
    this.save();
  }

  // --- Tema actual (el último mazo que abrió o practicó) ---
  currentDeck() {
    return this.p.current ? this.p.current.deck : null;
  }

  setCurrent(deckId) {
    if (!deckId || (this.p.current && this.p.current.deck === deckId)) return;
    this.p.current = { deck: deckId, t: Date.now() };
    this.save();
  }

  // 4.2.2 · Ejercicios a medias: una clave por ejercicio y por día (fecha local), solo en este dispositivo.
  // Lo de otros días se ignora y se borra.
  _parcialKey(tipo, id) {
    return `${PREFIX}parcial-${dateKey(Date.now())}-${tipo}-${id}`;
  }

  parcialGet(tipo, id) {
    try {
      const raw = localStorage.getItem(this._parcialKey(tipo, id));
      const d = raw ? JSON.parse(raw) : null;
      return d && typeof d === "object" ? d : null;
    } catch { return null; }
  }

  parcialSet(tipo, id, data) {
    try { localStorage.setItem(this._parcialKey(tipo, id), JSON.stringify(data)); } catch { /* sin almacenamiento */ }
  }

  parcialDel(tipo, id) {
    try { localStorage.removeItem(this._parcialKey(tipo, id)); } catch { /* sin almacenamiento */ }
  }

  // Borra lo guardado de otros días (o todo, si all es true).
  parcialPurge(all = false) {
    try {
      const pre = `${PREFIX}parcial-`;
      const hoy = `${pre}${dateKey(Date.now())}-`;
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(pre) && (all || !k.startsWith(hoy))) localStorage.removeItem(k);
      }
    } catch { /* sin almacenamiento */ }
  }

  reset() {
    this.parcialPurge(true);
    const now = Date.now();
    const settings = { ...this.p.settings, t: now };
    const notes = this.p.notes;
    const mine = this.p.mine;
    this.p = emptyProgress();
    this.p.notes = notes;
    this.p.mine = mine;
    this.p.settings = settings;
    this.p.resetAt = now;
    this.save();
  }
}
