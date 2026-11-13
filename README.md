# Ruso de bolsillo

App de estudio de ruso para hispanohablantes con tarjetas, frases y repaso espaciado. Enfocada en facilitar el aprendizaje desde el español como primer lengua.

Se instala en el celular como una app (PWA y APK de Android) y guarda tu progreso en la nube para continuar en cualquier dispositivo.

> **Estado:** versión beta en pruebas. **[Pruébala aquí](https://ruso-de-bolsillo.netlify.app/beta/)** y cuéntame qué te parece desde «Reportar falla» dentro de la app.

<!-- Pendiente: agregar 3 o 4 capturas del celular (Inicio, mapa, tarjeta, frases) en claro y oscuro, en docs/capturas/ -->

## Qué puedes hacer

- **Ruta de unidades** con un mapa: cada unidad tiene su vocabulario y su gramática, en el orden sugerido.
- **Aprende a leer:** alfabeto, acento, reducción de О, consonantes suaves y duras, Ь y Ъ.
- **Práctica estilo Chessbook:** la palabra nueva se muestra y luego se pregunta con 4 opciones. Si pides pista o fallas, vuelve al final de la fila del día.
- **Armar frases:** se arma la frase en ruso con fichas, vale cualquier orden correcto y, si hay error, se explica por qué.
- **Mini diálogos, cajas y diccionario** para entender cómo se usan las palabras.
- **Audio en ruso** con voz de RHVoice Elena, en velocidad normal y lenta (botón de tortuga) en las frases completas **Solo se reproducen los cambios de velocidad en el audio con conexion a internet, en caso de no tenerlo se reproduce a la misma velocidad el audio en ambas versiones**
- **Pronunciación escrita** debajo de cada palabra (`sa-BA-ka`, con la sílaba fuerte en mayúsculas): se hace enfasis en la transcripcion desde el como se habla el español, para poder dar un punto de comparacion y facilitar el apendeizaje; se puede ocultar en Ajustes.
- **Repaso espaciado**, listas personales («Mis palabras», «+ Hoy») y notas.
- Tema **oscuro y claro**, y uso **sin conexión** para el contenido ya cargado.

## Cómo está hecha

App web sin compilación: se abre con un servidor estático.

| Parte | Tecnología |
|-------|-----------|
| Pantallas y estudio | HTML, CSS y JavaScript (sin framework) |
| Repaso espaciado | `js/srs.js` |
| Progreso y cuentas | Supabase (inicio de sesión con correo y tablas `progress` y `reportes`) |
| Sin conexión | Service worker (`sw.js`) |
| Publicación | Netlify (beta) y GitHub Pages (versión 2.0) |
| App de Android | APK generado con PWABuilder (TWA) |
| Visitas | GoatCounter, anónimo **NO APLICA EN LA VERSION BETA** |

## Estructura

```
index.html            la app
css/                  estilos
js/                   pantallas, repaso espaciado, progreso y configuración
sw.js                 funcionamiento sin conexión
data/                 mazos, ejercicios y lectura (JSON)
audio/                grabaciones en ruso
img/ icons/           imágenes e íconos
supabase/             tablas de la base de datos
tools/                validación de mazos y armado del sitio
docs/                 guías (contenido, privacidad)
```

## Probarla en tu computadora

```
python3 -m http.server 8000
```

Abre `http://localhost:8000/`. Para revisar los mazos antes de publicar: `node tools/validar.mjs`.

## Documentación

- [Cómo agregar o cambiar contenido](docs/contenido.md)
- [Publicar y sincronizar (GitHub Pages, Netlify, Supabase)](docs/publicar.md)
- [Privacidad](docs/privacidad.md)

## Notas para el asistente de IA

`CLAUDE.md` y la carpeta `.claude/` son instrucciones de trabajo para el asistente de IA que ayuda a desarrollar la app. No forman parte de la app ni hace falta leerlos.

## Créditos y licencia

Desarrollado por **brutus.desiglab** by [carkovskismind](https://github.com/carkovskismind).
Voz en ruso: sintetizador [RHVoice](https://rhvoice.org) (voz Elena), licencia GPL-3; ver `audio/LICENCIA.txt`.

© carkovskismind. **Todos los derechos reservados:** el código y el contenido no se pueden copiar ni reutilizar sin permiso por escrito.
