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

- **Principio:** la app es para **memorizar vocabulario y aprenderlo por uso**. La gramática solo aparece **a pedido**: «¿Dudas de gramática?» (data/gramatica/dudas.json), la explicación cuando fallas y el Diccionario. Nada de lecciones obligatorias.
- **El inicio actual se conserva** (semana, Tu avance + para hoy, Aprendidas, Racha, Seguir con). Se agrega una tarjeta «Tu ruta» con un mini mapa.
- **Mapa del módulo** = los temas de vocabulario en el **orden de las clases de CENLEX** (M1 → M2 → M3), estilo ciudad isométrica del boceto de Carol. Aprobado: **propuesta D** (dibujos con contorno crema tipo sticker + calle ámbar #F2C14E, plataformas pastel en código, pin #4AF2D5, tarjeta negra con Cajas · Frases · Palabras · Mini diálogo). Maqueta: artefacto «Russo Study · Ruta 3.0», tablero 2D.
- **Tus temas** sigue en mosaico de 2 columnas con filtros (Todos · Vocabulario · Países y gentilicios · Gramática · Expresiones); al tocar uno crece y muestra Palabras · Frases · Diálogo · Cajas.
- Sección independiente **«Aprende a leer»** (data/lectura/lectura.json, 6 pasos).
- Ejercicios nuevos: **mini diálogos tipo chat** y **clasificar en cajas** (data/ejercicios/).
- Frases: `bloques`, `fijo`, cualquier orden válido en `validas`, `errores` con explicación, y `diccionario` (forma, significado, porqué) por ficha. Botón **«Diccionario»** + «+ Repasar» → mazo personal **«Mis palabras»**.
- Al acertar en frases, avance automático (≈1 s).
- Módulo 3: después; por ahora solo M1 y M2. Carol va empezando M3 en clase.
- **Beta:** https://carkovskismind.github.io/Russo-Study/beta/ (rama `beta`), con su propio progreso en el dispositivo. La tabla `progress_beta` de Supabase queda para después. Todo cambio visible se prueba primero en `beta` y luego pasa a `main` por solicitud.

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
