# Pinterest Cleaner

Entfernt Werbung und Promo-Pins auf Pinterest, und zwar so, dass die echten Pins
lückenlos zusammenrücken. Beim Scrollen entstehen keine weißen Stellen.

- **Desktop:** Chromium-Extension für Arc (auch Chrome, Dia, Edge, Brave)
- **iPhone:** Userscript für Safari (Arc Search auf dem iPhone kann keine Extensions)

## Wie es funktioniert

Der übliche Ansatz, Werbe-Kacheln per CSS auszublenden, hinterlässt Löcher: Pinterest
hat die Kachel schon vermessen und alle anderen Pins drumherum absolut positioniert.

Der Cleaner setzt deshalb früher an:

1. **Datenfilter (Hauptweg):** `content/cleaner.js` läuft im Seitenkontext vor
   Pinterests eigenem Code und klinkt sich in `XMLHttpRequest`, `fetch` und
   `JSON.parse` ein. Werbe-Pins (`is_promoted`, `promoter`, `campaign_id` …) werden
   aus den API-Antworten entfernt, bevor Pinterest sie überhaupt sieht. Pinterests
   eigenes Masonry-Layout ordnet dann nur echte Pins an, also ohne Lücken.
2. **DOM-Fallback (Sicherheitsnetz):** Erkennt das Skript trotzdem eine Werbe-Kachel
   im Raster (Label „Gesponsert“, Promoted-Marker), blendet es sie aus und zieht die
   Pins darunter in derselben Spalte hoch. In der Konsole erscheint dann eine Warnung
   `[Pinterest Cleaner] Werbung erst im DOM erkannt …` mit den Datenfeldern des Pins.
   Das ist das Signal, dass Pinterest ein neues Werbe-Merkmal eingeführt hat, das in
   `isAdData()` ergänzt werden sollte.

   Die Verschiebung pro Spalte ist auf 60 % der Fensterhöhe begrenzt, weil Pinterest
   nur Pins in Viewport-Nähe rendert. Darüber hinaus bliebe der Bildschirm unten leer,
   deshalb bleibt dort lieber eine einzelne Lücke stehen.

## Installation in Arc (Mac/Windows)

1. `arc://extensions` öffnen
2. **Entwicklermodus** oben rechts aktivieren
3. **Entpackte Erweiterung laden** → diesen Ordner (`pinterest-cleaner`) wählen
4. Pinterest neu laden

Nach Code-Änderungen: auf `arc://extensions` den Reload-Pfeil der Extension klicken
und Pinterest neu laden.

## Installation auf dem iPhone (Safari)

Arc Search für iOS unterstützt keine Erweiterungen. Unter iOS geht das nur in Safari:

1. Die kostenlose App **Userscripts** (von Justin Wasack) aus dem App Store installieren
2. Einstellungen → Apps → Safari → Erweiterungen → **Userscripts** aktivieren und
   für `pinterest.com` (bzw. „Alle Websites“) erlauben
3. In der Userscripts-App einen Skript-Ordner wählen (z. B. in iCloud Drive)
4. `userscript/pinterest-cleaner.user.js` in diesen Ordner legen (AirDrop, iCloud
   Drive oder die Dateien-App)
5. Pinterest **in Safari** öffnen, nicht in der Pinterest-App

Einstellungen fürs iPhone: oben im Userscript im Block `DEFAULTS` anpassen.

Das Userscript wird aus `content/cleaner.js` erzeugt. Nach Änderungen dort neu bauen:

```bash
sh tools/build-userscript.sh
```

## Einstellungen (Popup)

| Einstellung | Wirkung | Standard |
|---|---|---|
| Werbung und Promo ausblenden | Entfernt gesponserte Pins | an |
| Nur echte Pins | Entfernt Karussells, Shopping-Module und Story-Kacheln aus dem Feed | an |
| Suchvorschläge ausblenden | Blendet die Vorschlags-Chips über den Suchergebnissen aus | an |
| Video-Pins ausblenden | Nur noch Bild-Pins | aus |
| Shopping-Pins ausblenden | Filtert Produkt- und Preis-Pins | aus |
| Keyword-Filter | Kommagetrennte Wörter, Treffer in Titel, Beschreibung, Alt-Text oder Link | an (leer) |

Das Popup zeigt außerdem, wie viele Einträge auf der aktuellen Seite entfernt wurden.
Änderungen gelten für alles, was neu geladen wird. Bereits angezeigte Pins
erfasst nur der DOM-Fallback, für ein komplett sauberes Ergebnis die Seite neu laden.

## Aufbau

- `manifest.json`: MV3, nur `storage` und Host-Zugriff auf die Pinterest-Domains
- `content/cleaner.js`: Datenfilter und DOM-Fallback, läuft im Seitenkontext (`world: MAIN`)
- `content/bridge.js`: reicht die Einstellungen aus `chrome.storage` an `cleaner.js` weiter
- `popup/`: Einstellungs-UI
- `tools/build-userscript.sh`: baut `userscript/pinterest-cleaner.user.js`

## Wartung

- **Werbung rutscht durch:** In den DevTools nach der Konsolen-Warnung des Cleaners
  suchen. Sie listet die Datenfelder des Pins auf. Das neue Merkmal in `isAdData()`
  ergänzen.
- **Neue Werbe-Labels im DOM:** `AD_SELECTORS` bzw. `AD_LABEL` in `content/cleaner.js`.
- Danach `sh tools/build-userscript.sh` ausführen, damit das iPhone-Skript mitzieht.
