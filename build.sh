#!/bin/sh
# Bygger zip-filen som laddas upp till Chrome Web Store.
set -e
cd "$(dirname "$0")"
version=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' manifest.json)
mkdir -p dist
out="dist/roughly-righter-$version.zip"
rm -f "$out"
zip -q "$out" manifest.json background.js content.js defaults.js kvar.js options.html options.js rules-default.txt icons/icon16.png icons/icon48.png icons/icon128.png
echo "$out"
