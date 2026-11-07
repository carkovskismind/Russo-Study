# Russo Study Beta · app de Android (APK)

Un envoltorio de [Capacitor](https://capacitorjs.com/) que abre la **beta en vivo**
(`https://carkovskismind.github.io/Russo-Study/beta/`). No lleva los archivos web
dentro: cada mejora de la beta le llega sola a quien ya instaló el APK, y la app sigue
usando el progreso de prueba (`progress_beta`), nunca el real.

## Generar el APK

1. En GitHub abre **Actions → Construir APK → Run workflow** (rama `main`).
2. Espera a que termine (unos 5 a 10 minutos).
3. Entra al run terminado y baja el artifact **russo-study-beta-apk** (es un .zip con `russo-study-beta.apk`). Se guarda 30 días.

Si publicas un *release*, el workflow también adjunta el `.apk` al release.

## Instalar en Android

1. Pasa el `.apk` al teléfono (Drive, correo, cable).
2. Ábrelo. Android pedirá permitir **«Instalar apps desconocidas»** para la app desde la que lo abres (Archivos, Chrome, Drive…). Actívalo solo para instalar esto.
3. Google Play Protect puede mostrar un aviso («app no verificada»). Es normal: el APK es de depuración y no está en Play Store. Elige **Instalar de todos modos**.
4. Necesita internet para abrir. Sin conexión muestra un aviso con el botón «Reintentar».

El botón o gesto de atrás retrocede dentro de la app y solo sale desde el inicio.

## Por qué WhatsApp no deja mandar el .apk

WhatsApp (y a veces el correo) bloquea los archivos `.apk` por seguridad. Alternativas:
mandar el **.zip** del artifact (el que baja GitHub, sin descomprimir) o subir el `.apk` a
Drive y compartir el **enlace**.

## Detalles técnicos

- `capacitor.config.json`: `appId com.carkovskismind.russostudy.beta`, `server.url` de la beta, navegación permitida solo a `carkovskismind.github.io` y `*.supabase.co`.
- `www/index.html`: pantalla «Sin conexión» (solo se usa si la beta no carga).
- `android/`: proyecto Android generado por `npx cap add android` y ajustado (íconos adaptativos fondo `#0B0B0C` + «Я» turquesa `#4AF2D5`, pantalla de arranque oscura, orientación vertical, barra de estado oscura, atrás del sistema ligado a la History API en `MainActivity.java`).
- El APK se firma con la llave de **depuración** que Gradle crea en el runner. No hay llaves secretas en el repositorio. Cada build crea una llave distinta, así que para actualizar una instalación hay que desinstalar la anterior.
- Probar en local (necesita JDK 17 y el SDK de Android): `cd android-app && npm ci && npx cap sync android && cd android && ./gradlew assembleDebug`.
