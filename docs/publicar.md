# Publicar y sincronizar

Notas de cómo se publica la app y cómo se conecta con Supabase. La versión 2.0 se publica con GitHub Pages; la beta con Netlify (ver `netlify.toml` y `tools/netlify-build.sh`).

## Publicar la app (GitHub Pages)

1. En el repositorio, ve a **Settings → Pages**.
2. En **Source** elige **Deploy from a branch**.
3. En **Branch** elige `main` y la carpeta `/ (root)`. Guarda.
4. En uno o dos minutos la app queda en `https://carkovskismind.github.io/Russo-Study/`.

**Instalarla en el celular:** abre ese enlace. En iPhone (Safari): Compartir → *Agregar a pantalla de inicio*. En Android (Chrome): menú ⋮ → *Instalar app*.

## Sincronizar el progreso (Supabase)

Sin este paso la app funciona, pero el progreso solo se guarda en el dispositivo donde estudias.

1. Crea una cuenta gratis en [supabase.com](https://supabase.com) y un proyecto nuevo.
2. Abre **SQL Editor → New query**, pega el contenido de `supabase/schema.sql` y presiona **Run**. Eso crea las tablas (tu progreso y los reportes de «Mi respuesta también es correcta») y las reglas para que solo tú veas tu progreso. Si ya lo habías corrido antes, córrelo otra vez: solo agrega lo nuevo.
3. En **Authentication → Sign In / Providers → Email**, deja **Email** activado y apaga **Confirm email** para poder entrar en cuanto creas la cuenta.
4. En **Project Settings → API Keys** copia la **Publishable key** (o la **anon public** de *Legacy API keys*) y pégala junto con el **Project URL** en `js/config.js` (en tu proyecto ya están puestos).

La *anon key* es pública y está hecha para ir dentro de la app. **Nunca** pongas en el repositorio la llave `service_role`.

Después, en la app: **Ajustes → Cuenta y sincronización → ¿No tienes cuenta? Crea una**. Escribe tu correo y una contraseña. En cada dispositivo entra con los mismos datos.
