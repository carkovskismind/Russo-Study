// Revisa que los mazos estén bien escritos antes de publicarlos.
// Uso: node tools/validar.mjs
import { readFileSync, existsSync } from "node:fs";

const errores = [];
const avisos = [];
const VOCAL = /[аеёиоуыэюяАЕЁИОУЫЭЮЯ]/;
const LATINA = /[A-Za-z]/;

let manifest;
try {
  manifest = JSON.parse(readFileSync("data/mazos.json", "utf8"));
} catch (e) {
  console.error("data/mazos.json no es JSON válido:", e.message);
  process.exit(1);
}

const ids = new Set();
const palabras = new Map();
let total = 0;

for (const archivo of manifest.mazos || []) {
  const ruta = `data/${archivo}`;
  if (!existsSync(ruta)) { errores.push(`${archivo}: no existe`); continue; }
  let mazo;
  try {
    mazo = JSON.parse(readFileSync(ruta, "utf8"));
  } catch (e) {
    errores.push(`${archivo}: JSON inválido (${e.message})`);
    continue;
  }
  if (!mazo.id) errores.push(`${archivo}: falta "id"`);
  if (ids.has(mazo.id)) errores.push(`${archivo}: el id "${mazo.id}" está repetido`);
  ids.add(mazo.id);
  if (!mazo.titulo) errores.push(`${archivo}: falta "titulo"`);
  if (!Array.isArray(mazo.tarjetas)) { errores.push(`${archivo}: falta la lista "tarjetas"`); continue; }

  mazo.tarjetas.forEach((t, i) => {
    const donde = `${archivo} tarjeta ${i + 1}`;
    total++;
    if (t.pregunta !== undefined) {
      if (!t.respuesta) errores.push(`${donde}: tiene "pregunta" pero no "respuesta"`);
      return;
    }
    if (!t.ru || !t.es) { errores.push(`${donde}: necesita "ru" y "es"`); return; }
    if (archivo.startsWith("vocabulario/") && !t.fonetica) avisos.push(`${donde}: "${t.ru}" no tiene "fonetica"`);
    if (!t.pista) avisos.push(`${donde}: "${t.ru}" no tiene "pista"`);
    if (LATINA.test(t.ru)) errores.push(`${donde}: "${t.ru}" tiene letras latinas mezcladas`);
    [...t.ru].forEach((ch, j, arr) => {
      if (ch === "́" && !VOCAL.test(arr[j - 1] || "")) {
        errores.push(`${donde}: el acento de "${t.ru}" no está sobre una vocal`);
      }
    });
    const clave = t.ru.replace(/́/g, "").toLowerCase();
    if (t.id) return;
    if (palabras.has(clave)) avisos.push(`"${t.ru}" aparece en ${palabras.get(clave)} y en ${archivo}`);
    else palabras.set(clave, archivo);
  });
}

// Texto en ruso: sin letras latinas y con el acento sobre una vocal.
function revisarRuso(texto, donde) {
  if (LATINA.test(texto)) errores.push(`${donde}: "${texto}" tiene letras latinas mezcladas`);
  [...texto].forEach((ch, j, arr) => {
    if (ch === "́" && !VOCAL.test(arr[j - 1] || "")) errores.push(`${donde}: el acento de "${texto}" no está sobre una vocal`);
  });
}
const limpiar = (s) => String(s).replace(/́/g, "").toLowerCase().replace(/ё/g, "е").replace(/[.,!?¿¡«»—–-]/g, " ").split(/\s+/).filter(Boolean);

for (const archivo of manifest.mazos || []) {
  const ruta = `data/${archivo}`;
  if (!existsSync(ruta)) continue;
  let mazo;
  try { mazo = JSON.parse(readFileSync(ruta, "utf8")); } catch { continue; }
  (mazo.tarjetas || []).forEach((t, i) => {
    if (t.ejemplo) {
      const donde = `${archivo} tarjeta ${i + 1} (ejemplo)`;
      if (!t.ejemplo.ru || !t.ejemplo.es) errores.push(`${donde}: el ejemplo necesita "ru" y "es"`);
      else revisarRuso(t.ejemplo.ru, donde);
    }
  });
  (mazo.frases || []).forEach((f, i) => {
    const donde = `${archivo} frase ${i + 1} (${f.id || "sin id"})`;
    if (!f.id) errores.push(`${donde}: falta "id"`);
    if (!f.idea || !Array.isArray(f.fichas) || !Array.isArray(f.validas) || !f.validas.length) {
      errores.push(`${donde}: necesita "idea", "fichas" y "validas"`);
      return;
    }
    [...f.fichas, ...(f.distractores || []), f.texto || ""].forEach((x) => revisarRuso(x, donde));
    const base = limpiar(f.fichas.join(" ")).sort().join("|");
    for (const v of f.validas) {
      revisarRuso(v, donde);
      if (limpiar(v).sort().join("|") !== base) errores.push(`${donde}: «${v}» no usa exactamente las fichas`);
    }
    if (f.texto && !f.validas.some((v) => limpiar(v).join(" ") === limpiar(f.texto).join(" "))) {
      errores.push(`${donde}: "texto" no coincide con ninguna respuesta válida`);
    }
    if (!Array.isArray(f.opciones) || !f.opciones.includes(f.es)) errores.push(`${donde}: "opciones" debe incluir la traducción "es"`);
    revisarFrase3(f, donde, base);
  });
}

// Campos 3.0 de las frases: bloques, fijo, errores y diccionario.
function revisarFrase3(f, donde, base) {
  const fichas = new Set(f.fichas.map((x) => limpiar(x).join(" ")));
  const extra = new Set((f.distractores || []).map((x) => limpiar(x).join(" ")));
  if (f.bloques !== undefined) {
    if (!Array.isArray(f.bloques) || !f.bloques.every((b) => Array.isArray(b) && b.length)) {
      errores.push(`${donde}: "bloques" debe ser una lista de listas de fichas`);
    } else if (limpiar(f.bloques.flat().join(" ")).sort().join("|") !== base) {
      errores.push(`${donde}: "bloques" debe usar exactamente las fichas, cada una una vez`);
    }
  }
  if (f.fijo !== undefined && typeof f.fijo !== "boolean") errores.push(`${donde}: "fijo" debe ser true o false`);
  if (f.fijo === false && !Array.isArray(f.bloques)) avisos.push(`${donde}: "fijo": false sin "bloques" no cambia nada`);
  if (f.errores !== undefined) {
    if (!Array.isArray(f.errores)) errores.push(`${donde}: "errores" debe ser una lista`);
    else f.errores.forEach((e, j) => {
      const d = `${donde} error ${j + 1}`;
      if (!e || !e.explica) errores.push(`${d}: falta "explica"`);
      if (e.tipo === "distractor") {
        if (!e.ficha) errores.push(`${d}: un error "distractor" necesita "ficha"`);
        else if (!extra.has(limpiar(e.ficha).join(" "))) errores.push(`${d}: «${e.ficha}» no está en "distractores"`);
      } else if (e.tipo === "bloque") {
        const run = (e.fichas || []).map((x) => limpiar(x).join(" "));
        const ok = Array.isArray(f.bloques) && f.bloques.some((b) => limpiar(b.join(" ")).join(" ") === limpiar(run.join(" ")).join(" "));
        if (!run.length) errores.push(`${d}: un error "bloque" necesita "fichas"`);
        else if (!ok) errores.push(`${d}: las fichas «${run.join(" ")}» no forman uno de los "bloques"`);
      } else if (e.tipo !== "orden") errores.push(`${d}: "tipo" debe ser distractor, bloque u orden`);
    });
  }
  if (f.diccionario !== undefined) {
    if (!Array.isArray(f.diccionario)) { errores.push(`${donde}: "diccionario" debe ser una lista`); return; }
    const vistas = new Set();
    f.diccionario.forEach((e, j) => {
      const d = `${donde} diccionario ${j + 1}`;
      if (!e.ficha || !e.forma || !e.es) { errores.push(`${d}: necesita "ficha", "forma" y "es"`); return; }
      const k = limpiar(e.ficha).join(" ");
      if (!fichas.has(k) && !extra.has(k)) errores.push(`${d}: «${e.ficha}» no es ficha ni distractor de la frase`);
      vistas.add(k);
      revisarRuso(e.forma, d);
      if (e.porque !== undefined && typeof e.porque !== "string") errores.push(`${d}: "porque" debe ser texto`);
    });
    for (const k of fichas) if (!vistas.has(k)) avisos.push(`${donde}: la ficha «${k}» no tiene entrada en "diccionario"`);
  }
}

for (const a of avisos) console.log("Aviso:", a);
for (const e of errores) console.log("Error:", e);
console.log(`\n${manifest.mazos.length} mazos · ${total} tarjetas · ${errores.length} errores · ${avisos.length} avisos`);
process.exit(errores.length ? 1 : 0);
