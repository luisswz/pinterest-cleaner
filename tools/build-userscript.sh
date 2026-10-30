#!/bin/sh
# Baut das iPhone-Userscript aus content/cleaner.js.
# Aufruf aus dem Projektordner: sh tools/build-userscript.sh
set -e
cd "$(dirname "$0")/.."

VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json | head -n 1)
OUT=userscript/pinterest-cleaner.user.js

{
  cat <<HEADER
// ==UserScript==
// @name         Pinterest Cleaner
// @namespace    pinterest-cleaner
// @version      $VERSION
// @description  Entfernt Werbung und Promo-Pins auf Pinterest, bevor sie gerendert werden – die echten Pins rücken lückenlos zusammen.
HEADER
  for tld in com de at ch co.uk fr es it nl se dk pt ie ca com.au nz com.mx; do
    echo "// @match        *://*.pinterest.$tld/*"
  done
  cat <<'HEADER'
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

// Automatisch erzeugt aus content/cleaner.js. Code-Änderungen bitte dort machen.
// Hier nur die Einstellungen (DEFAULTS, ein paar Zeilen weiter unten) anpassen.

HEADER
  cat content/cleaner.js
} > "$OUT"

echo "Geschrieben: $OUT (v$VERSION)"
