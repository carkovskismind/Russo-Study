# Cómo agregar o cambiar contenido

Formato de los mazos de `data/` (tarjetas, Aprender y frases). Para revisar los mazos antes de publicar: `node tools/validar.mjs`.

## Palabras

Todo el vocabulario vive en la carpeta `data/`. Para agregar una palabra, abre el archivo del mazo y añade una línea dentro de `"tarjetas"`:

```json
{"ru": "соба́ка", "fonetica": "sa-BA-ka", "es": "perro / perra", "pista": "Animal doméstico que ladra.", "tag": "Fem. · anim.", "nota": "pl. соба́ки"}
```

| Campo  | Obligatorio | Qué es |
|--------|-------------|--------|
| `ru`   | sí | La palabra en ruso. Puedes marcar el acento con el carácter ◌́ (U+0301) después de la vocal. |
| `fonetica` | recomendado | Pronunciación con letras del español; la sílaba fuerte en MAYÚSCULAS (`sa-BA-ka`). |
| `es`   | sí | La traducción. |
| `pista` | recomendado | Explicación breve que aparece con «No sé, dame una pista». No debe decir la respuesta. Si falta, la app arma una con el tipo de palabra y la primera letra. |
| `tag`  | no | Género, animado, tipo de palabra. |
| `nota` | no | Plural, conjugación o cualquier aclaración. `\n` hace un salto de línea. |

Para tarjetas de gramática usa `pregunta` y `respuesta` en lugar de `ru` y `es`:

```json
{"pregunta": "¿Cómo se forma el pasado?", "respuesta": "Infinitivo sin -ть + -л / -ла / -ло / -ли"}
```

**Reglas importantes**

- Cada línea termina en coma, menos la última de la lista.
- Usa comillas rectas `"` y escribe el ruso con letras cirílicas (no mezcles letras latinas).
- Si cambias el texto `ru` de una palabra que ya estudiaste, la app la toma como palabra nueva.

### Modo Aprender y frases para armar (piloto: Familia y personas)

Cada palabra puede llevar además:

| Campo | Qué es |
|-------|--------|
| `seccion` | Subgrupo dentro del tema («Abuelos y nietos»). La lista de Aprender se agrupa con esto. |
| `ejemplo` | `{"ru": "...", "fonetica": "...", "es": "..."}`: una frase de ejemplo con audio. |
| `tip` | Tip de memoria que aparece en la ficha de la palabra. |

Y el mazo puede tener, junto a `tarjetas`:

- `"aprender": {"intro": "...", "reglas": ["...", "..."], "tip": "..."}`: lo que se ve arriba del tema.
- `"frases": [...]`: ejercicios de armar frases. Cada uno lleva `id`, `idea` (en español), `fichas` (las palabras en ruso), `validas` (todas las frases correctas que se pueden armar con esas fichas, en cualquier orden válido), `texto` (cómo se muestra), `fonetica`, `es` (traducción), `opciones` (4 traducciones; una es `es`), `distractores` (fichas de más que aparecen en los repasos) y `pista`.

Si alguien toca «Mi respuesta también es correcta», se guarda en la tabla `reportes` de Supabase. Revísalos en **Table Editor → reportes** y, si tienen razón, agrega esa frase a `validas`.

**Mazo nuevo:** crea un archivo `.json` con la misma forma que los demás (`id`, `titulo`, `grupo`, `descripcion`, `tarjetas`) y agrega su ruta en `data/mazos.json`.

Cuando guardes cambios en GitHub, una revisión automática comprueba que los mazos estén bien escritos (pestaña **Actions**). Si sale en rojo, abre el detalle para ver qué línea falla. También puedes revisarlo en tu computadora con `node tools/validar.mjs`.
