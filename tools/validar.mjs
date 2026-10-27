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
  });
}

for (const a of avisos) console.log("Aviso:", a);
for (const e of errores) console.log("Error:", e);
console.log(`\n${manifest.mazos.length} mazos · ${total} tarjetas · ${errores.length} errores · ${avisos.length} avisos`);
process.exit(errores.length ? 1 : 0);
