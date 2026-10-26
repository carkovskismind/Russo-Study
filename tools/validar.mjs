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

for (const a of avisos) console.log("Aviso:", a);
for (const e of errores) console.log("Error:", e);
console.log(`\n${manifest.mazos.length} mazos · ${total} tarjetas · ${errores.length} errores · ${avisos.length} avisos`);
process.exit(errores.length ? 1 : 0);
