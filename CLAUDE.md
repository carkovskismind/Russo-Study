# Russo Study · reglas para Claude

App para estudiar ruso de Carol (CENLEX, Básico 1-2, México). GitHub: carkovskismind.
Responde siempre en español, claro y breve.

## Reglas de trabajo (obligatorias)

1. Antes de crear o programar algo, pregunta si hay dudas. Jamás asumas nada. Si decides algo sin preguntar, dilo al final.
2. Primero una maqueta o propuesta; se aplica a la app solo cuando Carol la aprueba. Si ella edita la maqueta, respeta sus cambios.
3. Nunca pongas en el código la llave service_role (secret) de Supabase. Solo la publishable key, que ya está en `js/config.js`.
4. Antes de publicar: `node tools/validar.mjs` sin errores y prueba en celular (390×844) en modo oscuro y claro.
5. En cada versión nueva sube `APP_VERSION` (js/app.js) y `CACHE` (sw.js).

## La app

- En vivo: https://carkovskismind.github.io/Russo-Study/ (GitHub Pages, rama `main`, raíz).
- PWA sin build: `index.html`, `css/app.css`, `js/app.js` (pantallas), `js/store.js` (progreso y Supabase), `js/srs.js` (repaso espaciado), `sw.js`, `data/` (mazos JSON, lista en `data/mazos.json`).
- Supabase: login con correo y contraseña; tablas `progress` y `reportes` (`supabase/schema.sql`).
- Formato de tarjetas, Aprender y frases: ver `README.md`.

## Cómo debe funcionar el estudio

- Estilo Chessbook: la palabra nueva primero se muestra y luego se pregunta con 4 opciones.
- «Dame una pista» no dice la respuesta y cuenta como error. Si fallas, la palabra vuelve al final de la fila del día.
- Al acertar, la app avanza sola (≈1 s); al fallar se queda para leer la explicación.
- Fonética tipo «sa-BA-ka» (sílaba fuerte en MAYÚSCULAS) debajo del ruso. Sonidos suaves. Nada de mensajes pasivo-agresivos.
- Frases: cuenta como correcta CUALQUIER frase válida; si está mal, se explica por qué.

## Diseño aprobado (2.0)

- Fondo negro #0B0B0C con cuadrícula sutil; versión clara crema #F4F1EA con marcos negros.
- Tarjetas pastel con marco crema; cada color con su tono oscuro (ver variables `--pal-*` / `--ink-*` en `css/app.css`).
- Acento turquesa #4AF2D5 en botones principales y lo seleccionado; errores en rosa #F5A3B5.
- Letras: Manrope (texto), Lato 900 (TODOS los números), Unbounded (nombre en el saludo), PT Sans (ruso).
- NO: rojo o coral como color principal, animaciones trabadas, dibujos de personas en temas que no son de personas.

## Plan acordado (oct 2026)

- **Ruta** de unidades en orden sugerido (todas abiertas, con «sigue aquí»), cada una con su vocabulario y su gramática.
- Sección independiente **«Aprende a leer»** (alfabeto, acento, reducción de О, suaves/duras, Ь y Ъ).
- **Biblioteca** con todos los mazos para práctica libre.
- Palabras pequeñas (кто, что, где, куда́…) repartidas por unidad y aprendidas con su uso.
- Ejercicios nuevos: **mini diálogos tipo chat** y **clasificar en cajas**.
- Frases: bloques que van juntos + cualquier orden válido + explicación del error.
- Botón **«Diccionario»** en las frases (forma de diccionario, significado, por qué cambió) y «+ Repasar» → mazo personal **«Mis palabras»**.

## Agentes del proyecto (`.claude/agents/`)

| Agente | Papel |
|---|---|
| `orden` | Coordina: Ruta, qué va en cada unidad, reparte trabajo, revisa entregas, maquetas. |
| `gramatica` | Reglas, Aprender, lectura, diálogos, cajas, bloques y explicaciones de frases. |
| `mazos` | Tarjetas de vocabulario, frases (contenido), datos del Diccionario. |
| `programador` | Único que toca `index.html`, `css/`, `js/`, `sw.js`. |
| `revisor` | Prueba la app y el contenido; **solo reporta**, no corrige. |
| `diseno-ux` | Maquetas fieles a los bocetos de Carol, coherentes con el diseño aprobado en oscuro y claro. |

Orden de trabajo en un mismo archivo: primero `mazos`, después `gramatica`. Nunca dos agentes a la vez sobre el mismo archivo.
