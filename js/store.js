// Progreso del estudio: se guarda en el dispositivo y, si hay sesión
// iniciada en Supabase, también en la nube para verlo en cualquier lado.

import { dateKey } from "./srs.js";

const LOCAL_KEY = "russo-progress-v1";
const TABLE = "progress";

export const DEFAULT_SETTINGS = {
  dir: "ru",
  newPerDay: 15,
  cursive: false,
  autoSpeak: false,
  disabled: {}
};

function emptyProgress() {
  return {
    v: 1,
    cards: {},
    newLog: {},
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
  async sendCode(email) {
    const { error } = await this.sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
  }

  async verifyCode(email, token) {
    const { error } = await this.sb.auth.verifyOtp({ email, token, type: "email" });
    if (error) throw error;
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

  reset() {
    const now = Date.now();
    const settings = { ...this.p.settings, t: now };
    this.p = emptyProgress();
    this.p.settings = settings;
    this.p.resetAt = now;
    this.save();
  }
}
