# Ruso de bolsillo · reglas para Claude (antes Russo Study)

App para estudiar ruso de Carol (CENLEX, Básico 1-2, México). GitHub: carkovskismind.
Responde siempre en español, claro y breve.

## Reglas de trabajo (obligatorias)

1. Antes de crear o programar algo, pregunta si hay dudas. Jamás asumas nada. **Si te atoras o aparece una bifurcación real, para y pregunta**; no decidas por tu cuenta para no frenar la conversación. Decir al final lo que decidiste es la red por si algo se escapa, no un permiso para decidir y avisar después. Un permiso amplio («arréglalo», «agrégalas») cubre lo que pediste, no las decisiones que aparezcan en el camino.
   - **Ningún agente sin que Carol lo pida.** No lances subagentes por iniciativa propia, ni uno. Si crees que hacen falta, di para qué, cuántos y qué va a hacer cada uno, y espera su respuesta. Lanzar varios a la vez gasta el límite de uso de Carol y puede cortar el trabajo a la mitad.
2. Primero una maqueta o propuesta; se aplica a la app solo cuando Carol la aprueba. Si ella edita la maqueta, respeta sus cambios. **Fidelidad 100 % a la maqueta:** lo programado debe verse exactamente igual a la maqueta viva (textos, medidas, espacios, colores, imágenes y fondos), comprobado con capturas lado a lado en oscuro y claro antes de subir.
3. Nunca pongas en el código la llave service_role (secret) de Supabase. Solo la publishable key, que ya está en `js/config.js`.
4. Antes de publicar: `node tools/validar.mjs` sin errores y prueba en celular (390×844) en modo oscuro y claro.
5. En cada versión nueva sube `APP_VERSION` (js/app.js) y `CACHE` (sw.js). **El número de versión lo decide Carol: pregúntaselo siempre, nunca lo inventes.** Varios arreglos distintos pueden ir en la misma versión, así que no subas el número solo porque tocaste algo.

## Commits y descripción de PR (acordado con Carol, nov 2026)

- **Descripción del PR:** un resumen de las fallas encontradas y cómo se solucionaron (tabla «Falla | Cómo se solucionó»), lo que se comprobó y qué revisar en la vista previa. Si el PR no corrige fallas, un resumen corto de qué cambia y por qué.
- **Mensajes de commit:** primera línea con la versión y lo que se arregla o cambia; si hace falta, un cuerpo corto con la falla y su solución.
- **Nunca** pongas en un commit ni en un PR las preguntas o mensajes de Carol ni comandos (p. ej. `node tools/validar.mjs`): se escribe «validación sin errores».
- Termina con las líneas de atribución que pida la sesión.

## La app

- En vivo: https://carkovskismind.github.io/Russo-Study/ (GitHub Pages, rama `main`, raíz).
- PWA sin build: `index.html`, `css/app.css`, `js/app.js` (pantallas), `js/store.js` (progreso y Supabase), `js/srs.js` (repaso espaciado), `sw.js`, `data/` (mazos JSON, lista en `data/mazos.json`).
- Supabase: login con correo y contraseña; tablas `progress` y `reportes` (`supabase/schema.sql`).
- Formato de tarjetas, Aprender y frases: ver `docs/contenido.md`.

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

**Estos agentes solo se usan cuando Carol lo pide** (regla 1). Vale para todos los chats, incluido `orden`: coordinar no da permiso de repartir trabajo por cuenta propia.

Orden de trabajo en un mismo archivo: primero `mazos`, después `gramatica`. Nunca dos agentes a la vez sobre el mismo archivo.

## Documentación en Notion (acordado con Carol, nov 2026)

- Los pendientes, mejoras y bugs viven en Notion: página «Ruso de bolsillo · pendientes» y su base de datos «Bugs y mejoras · Ruso de bolsillo» (columnas: Título, Tipo, Estado, Prioridad, Pantalla, Dispositivo, Versión donde aparece, Versión donde se arregló, Pasos para repetirlo, Notas, Enlace).
- Cuando surja un pendiente, una mejora o una duda abierta, agrégalo directo a Notion y avisa a Carol en una línea, sin pedir permiso cada vez.
- Cuando Carol anote un bug en Notion: primero verifícalo (reproduce o revisa el código y di qué encontraste), después corrige con el flujo normal (maqueta si cambia el diseño; programador; validar), y al terminar márcalo «Arreglado» con la versión en «Versión donde se arregló». Si no se puede reproducir, márcalo «No se reproduce» y explica por qué.
- Si el conector de Notion no está activo en la sesión, dilo y deja los pendientes en el chat para pasarlos después.
- Subir a Netlify (conector o zip) y a GitHub SOLO cuando Carol lo indique. No se generan zips de Netlify por iniciativa propia.
- **Entorno:** todo lo que se trabaja y documenta es la BETA (https://ruso-de-bolsillo.netlify.app/beta/, ruta /beta/ con IS_BETA). La app real (GitHub Pages) no se toca sin indicación de Carol. Cada registro de la base de bugs lleva la columna «Entorno» (Beta por defecto).
