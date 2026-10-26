# Russo Study

Tarjetas de estudio de ruso con repaso espaciado. Es una app web que se instala en el celular y guarda tu progreso en la nube para verlo en cualquier dispositivo.

- **Práctica como Chessbook:** las palabras nuevas se muestran primero y luego se preguntan con 4 opciones. Si fallas o pides pista, la palabra cuenta como error, pierde su progreso y vuelve a tu fila del día.
- **Pronunciación** debajo de cada palabra rusa, en las opciones y en la lista del mazo.
- **Lista para hoy:** en cada mazo agrega palabras con «+ Hoy» o selecciona varias; entran extra en tu práctica del día y se quedan hasta que las practiques.
- **Sonidos** al acertar y al fallar (se apagan en Ajustes) y tema **oscuro** o claro.
- **Pistas y notas personales:** cada palabra tiene una explicación breve, y puedes agregar tu propia nota para recordarla (se sincroniza con tu progreso).
- **Mazos por tema:** vocabulario, países y gentilicios, y gramática. Activa o desactiva cada mazo para tu sesión diaria.
- **Etiquetas de gramática:** cada sustantivo dice su género y si es animado (`Fem. · anim.`).
- **Extras:** cursiva rusa, pronunciación con la voz del dispositivo, búsqueda dentro de cada mazo y repaso rápido antes de un examen.

## Cómo agregar o cambiar palabras

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

**Mazo nuevo:** crea un archivo `.json` con la misma forma que los demás (`id`, `titulo`, `grupo`, `descripcion`, `tarjetas`) y agrega su ruta en `data/mazos.json`.

Cuando guardes cambios en GitHub, una revisión automática comprueba que los mazos estén bien escritos (pestaña **Actions**). Si sale en rojo, abre el detalle para ver qué línea falla. También puedes revisarlo en tu computadora con `node tools/validar.mjs`.

## Publicar la app (GitHub Pages)

1. En el repositorio, ve a **Settings → Pages**.
2. En **Source** elige **Deploy from a branch**.
3. En **Branch** elige `main` y la carpeta `/ (root)`. Guarda.
4. En uno o dos minutos la app queda en `https://carkovskismind.github.io/Russo-Study/`.

**Instalarla en el celular:** abre ese enlace. En iPhone (Safari): Compartir → *Agregar a pantalla de inicio*. En Android (Chrome): menú ⋮ → *Instalar app*.

## Sincronizar el progreso (Supabase)

Sin este paso la app funciona, pero el progreso solo se guarda en el dispositivo donde estudias.

1. Crea una cuenta gratis en [supabase.com](https://supabase.com) y un proyecto nuevo.
2. Abre **SQL Editor → New query**, pega el contenido de `supabase/schema.sql` y presiona **Run**. Eso crea la tabla y las reglas para que solo tú veas tu progreso.
3. En **Authentication → Sign In / Providers**, verifica que **Email** esté activado.
4. En **Authentication → Emails → Magic Link**, agrega `{{ .Token }}` al texto del correo para que llegue un código de 6 dígitos. Por ejemplo: `Tu código para Russo Study es: {{ .Token }}`. El código sirve para entrar desde la app instalada en el celular.
5. En **Authentication → URL Configuration**, pon como **Site URL** `https://carkovskismind.github.io/Russo-Study/`.
6. En **Project Settings → API** copia el **Project URL** y la **anon public key**, y pégalos en `js/config.js`.

La *anon key* es pública y está hecha para ir dentro de la app. **Nunca** pongas en el repositorio la llave `service_role`.

Después, en la app: **Ajustes → Cuenta y sincronización**, escribe tu correo, recibe el código y entra. Haz lo mismo en cada dispositivo.

## Estructura

```
index.html              la app
css/app.css             estilos
js/app.js               pantallas y sesiones de estudio
js/srs.js               algoritmo de repaso espaciado
js/store.js             progreso local y sincronización
js/config.js            datos de Supabase
sw.js                   funcionamiento sin conexión
data/mazos.json         lista de mazos
data/vocabulario/       mazos de vocabulario
data/paises/            países, gentilicios y sus reglas
data/gramatica/         mazos de gramática
supabase/schema.sql     tabla del progreso
tools/validar.mjs       revisión de los mazos
```

Si cambias archivos de la app (no los mazos), sube el número de `CACHE` en `sw.js` para que los celulares descarguen la versión nueva.
