# Offen — noch nicht umgesetzt (Stand 27.08.2026, nach QA-Runde 2)

Bewusst zurückgestellt, bis das Peer-Review durch ist.

## 1. 🔴 Dunkelmodus-Kontrast (2,44:1 statt 4,5:1)

Weiße Schrift auf `--accent` (`#5fb787`) im Dunkelmodus. Betrifft:
- `.btn-primary` („Speichern & anzeigen", 15,2 px)
- `.tag-btn.active` (Tagesauswahl, 14,1 px)
- `a.uebersicht-btn` (Übersicht-Pille auf allen vier Textseiten, 13,1 px)

Hellmodus ist unauffällig (5,99:1) — reiner Dunkelmodus-Fehler.

**Lösungsansatz:** eigenes Token `--accent-text` einführen, hell = `#fff`,
dunkel = `#141815` (nachgerechnet 7,35:1). Nicht pro Komponente flicken.

## 2. 🟡 CSP blockiert fremde ccCampus-Domains stillschweigend

`connect-src` erlaubt nur `https://*.mbs5online.de`, das Feld
`lunch.cccampus.base` ist aber frei editierbar. Andere Domain → im Browser
verifiziert: `TypeError: Failed to fetch`, für Nutzer:innen nicht von einem
Netzwerkausfall unterscheidbar.

**Lösungsansatz:** Basis-URL im Setup gegen dieselbe Allowlist prüfen und
verständlich melden, statt es erst beim Abruf scheitern zu lassen.

Relevant, bevor weitere Familien den Link bekommen.

---

# Aus dem Peer-Review (27.08.2026) neu dazugekommen

## 3. 🔴 Cache-Treffer ohne Passwortprüfung  ← höchste Priorität

`buildCacheKey()` (`proxy/worker.js:67-79`) enthält kein Passwort, und der
Cache-Treffer wird vor jeder Authentifizierung ausgeliefert
(`worker.js:384-388`). Wer `server`, `user` und `klasse` kennt — beim
Klassensammellogin schulöffentlich — bekommt innerhalb der 4-Minuten-TTL die
gecachte Antwort einer legitimen Abfrage, also den echten Stundenplan.

Empirisch belegt: gleiche Identität, anderes Passwort → 0,043 s statt 0,202 s,
Antwort byte-identisch.

**Fix:** Passwort als HMAC in den Cache-Key aufnehmen (der Key ist ohnehin ein
SHA-256-Digest). Kommentar „bewusst nur nicht-geheime Felder" mit umdrehen.

## 4. 🟡 Kein Rate-Limit im Proxy

Kein `429`/Throttling im Worker. Die Allowlist erlaubt *alle* `*.webuntis.com`
— der Proxy nimmt damit beliebig viele Login-Versuche gegen beliebige Schulen
entgegen und stellt sie mit unserer Cloudflare-IP zu.

## 5. 🔴 Keine Löschfunktion in der App

Kein `removeItem`/`localStorage.clear` im Frontend. Die Datenschutzerklärung
verweist auf „Website-Daten im Browser löschen" — für die nicht-technische
Zielgruppe praktisch unzumutbar. Knopf „Alle Daten auf diesem Gerät löschen"
im Setup, ~10 Zeilen.

## 6. 🟡 Rechtliche Rolle ändert sich mit der Ausweitung

Haushaltsausnahme (Art. 2 Abs. 2 lit. c DSGVO) fällt weg, sobald fremde
Familien mitnutzen → volle Verantwortlichkeit für Daten fremder Kinder.
Vor der Ausweitung juristisch gegenprüfen lassen. Außerdem: AVV-Behauptung
in der Datenschutzerklärung tatsächlich verifizieren.

## 7. 🟡 Transparenz zum Proxy-Klartextzugriff

Der Worker sieht alle Passwörter im Klartext (TLS endet bei Cloudflare).
Sollte in der Datenschutzerklärung explizit stehen, statt nur implizit aus
„reicht sie weiter" ableitbar zu sein.

## 8. Kleinkram

- `.hide-fach` mit `opacity:.35` — schwacher Nicht-Text-Kontrast (WCAG 1.4.11)
- Rechtstexte fehlen im Service-Worker-`SHELL` (offline nicht erreichbar,
  solange nie besucht)
- Wochenendtage im Tagesumschalter
- Tests laufen in keinem Pre-Deploy-Gate
- WCAG-Versionen in den Berichten inkonsistent (durchgängig 2.2 zitieren;
  SC 2.5.3 ist Level A, nicht AA)
