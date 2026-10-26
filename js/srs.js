// Repaso espaciado (variante sencilla de SM-2, como Anki/Chessable).
// Calificaciones: 1 = Otra vez, 2 = Difícil, 3 = Bien, 4 = Fácil.

export const MIN = 60 * 1000;
export const DAY = 24 * 60 * MIN;

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts) {
  return startOfDay(ts) + DAY - 1;
}

export function dateKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// Devuelve el nuevo estado de una tarjeta tras calificarla.
export function schedule(prev, rating, now = Date.now()) {
  const st = prev
    ? { ...prev }
    : { ivl: 0, ease: 2.5, reps: 0, lapses: 0 };

  if (rating === 1) {
    if (st.reps > 0) st.lapses += 1;
    st.reps = 0;
    st.ivl = 0;
    st.ease = Math.max(1.3, st.ease - 0.2);
    st.due = now + MIN;
  } else {
    let ivl;
    if (st.reps === 0) {
      ivl = rating === 4 ? 4 : 1;
    } else if (st.reps === 1) {
      ivl = rating === 2 ? 2 : rating === 3 ? 3 : 6;
    } else {
      const base = Math.max(1, st.ivl);
      if (rating === 2) ivl = base * 1.2;
      else if (rating === 3) ivl = base * st.ease;
      else ivl = base * st.ease * 1.3;
    }
    if (rating === 2) st.ease = Math.max(1.3, st.ease - 0.15);
    if (rating === 4) st.ease = st.ease + 0.15;
    st.ivl = Math.max(1, Math.round(ivl));
    st.reps += 1;
    st.due = startOfDay(now) + st.ivl * DAY;
  }
  st.t = now;
  return st;
}

// Texto corto con el intervalo que resultaría de cada calificación.
export function previewLabel(prev, rating, now = Date.now()) {
  const st = schedule(prev, rating, now);
  if (st.ivl === 0) return "<1 min";
  return formatDays(st.ivl);
}

export function formatDays(days) {
  if (days < 30) return `${days} d`;
  if (days < 365) return `${Math.round(days / 30)} m`;
  return `${(days / 365).toFixed(1)} a`;
}
