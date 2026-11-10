#!/bin/sh
# Arma la carpeta «sitio» para Netlify: la app en /beta/, portada que redirige,
# y assetlinks.json (verificación del APK) en /.well-known/ por redirección.
set -e
rm -rf sitio
mkdir -p sitio/beta sitio/verificacion
for f in index.html manifest.webmanifest sw.js css js data audio icons img .nojekyll; do
  [ -e "$f" ] && cp -R "$f" sitio/beta/
done
cp netlify/portada.html sitio/index.html
cp netlify/assetlinks.json sitio/verificacion/assetlinks.json
printf '/.well-known/assetlinks.json  /verificacion/assetlinks.json  200!\n' > sitio/_redirects
