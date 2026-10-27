// Progreso del estudio: se guarda en el dispositivo y, si hay sesión
// iniciada en Supabase, también en la nube para verlo en cualquier lado.

import { dateKey } from "./srs.js";

const LOCAL_KEY = "russo-progress-v1";
const TABLE = "progress";
const REPORTS = "reportes";
const PENDING_KEY = "russo-reportes-pendientes";

function readPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch { return []; }
}

function writePending(list) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch { /* sin almacenamiento */ }
}

export const DEFAULT_SETTINGS = {
  dir: "ru",
  newPerDay: 15,
  cursive: false,
  autoSpeak: false,
  sound: true,
  theme: "dark",
  name: "",
  disabled: {}
};

function emptyProgress() {
  return {
    v: 1,
    cards: {},
    newLog: {},
    days: {},
    frases: {},
    notes: {},
    picks: {},
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

function normalize(p) {
  const base = emptyProgress();
  if (!p || typeof p !== "object") return base;
  return {
    v: 1,
    cards: p.cards && typeof p.cards === "object" ? p.cards : {},
    newLog: p.newLog && typeof p.newLog === "object" ? p.newLog : {},
    days: p.days && typeof p.days === "object" ? p.days : {},
    frases: p.frases && typeof p.frases === "object" ? p.frases : {},
    notes: p.notes && typeof p.notes === "object" ? p.notes : {},
    picks: p.picks && typeof p.picks === "object" ? p.picks : {},
    settings: { ...base.settings, ...(p.settings || {}) },
    resetAt: p.resetAt || 0
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
  for (const src of [a, b]) {
    for (const [day, n] of Object.entries(src.newLog)) {
      if (resetDay && day < resetDay) continue;
      out.newLog[day] = Math.max(out.newLog[day] || 0, n);
    }
  }
  // Actividad por día (para la racha y la gráfica de la semana).
  for (const src of [a, b]) {
    for (const [day, n] of Object.entries(src.days)) {
      if (resetDay && day < resetDay) continue;
      out.days[day] = Math.max(out.days[day] || 0, n);
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
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
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

    window.addEventListener("online", () => this.pull());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && this.dirty) this.push();
      if (document.visibilityState === "visible") this.pull();
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
  async report(entry) {
    const row = { ...entry, user_id: this.user ? this.user.id : null, created_at: new Date().toISOString() };
    const pending = readPending();
    pending.push(row);
    writePending(pending);
    return this.flushReports();
  }

  async flushReports() {
    const pending = readPending();
    if (!pending.length || !this.sb) return false;
    try {
      const { error } = await this.sb.from(REPORTS).insert(pending);
      if (error) throw error;
      writePending([]);
      return true;
    } catch (e) {
      console.warn("No se pudo enviar el reporte", e);
      return false;
    }
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

  reset() {
    const now = Date.now();
    const settings = { ...this.p.settings, t: now };
    const notes = this.p.notes;
    this.p = emptyProgress();
    this.p.notes = notes;
    this.p.settings = settings;
    this.p.resetAt = now;
    this.save();
  }
}
