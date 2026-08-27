# Heute Schule — Website (erster Wurf)

Statische PWA, die den täglichen Stundenplan + Schulessen-Status direkt
anzeigt (Alternative zum bisherigen Mail-Versand per Apps Script).

## Lokal ansehen

```bash
cd web
python3 -m http.server 8934
```
→ http://localhost:8934

Ohne konfigurierte Proxy-URL zeigt die Karte "Proxy nicht erreichbar" —
das ist erwartet, solange der Proxy (`../proxy/`) noch nicht deployed ist.

## Tests

Reine Node-Testsuite, keine Abhängigkeiten (`node --test` o. ä. war
absichtlich nicht nötig — ein einfaches Skript reicht für diese Größe):

```bash
cd ..
node run-tests.mjs
```

Deckt ab: die Apps-Script-Logik (`../stundenplan.js`), die Ziel-Host-
Validierung des Proxys (`../proxy/hostcheck.mjs`) und den Cache-Schlüssel
(`../proxy/cachekey.mjs`). Bei den letzten beiden lohnen sich Tests
besonders — das ist der Teil, der Angriffe abwehren soll, und "sieht richtig
aus" reicht bei Sicherheitscode nicht. Der Cache-Schlüssel ist das beste
Beispiel dafür: Dort steckte monatelang eine Lücke hinter einem Kommentar,
der erklärte, warum das so sicher sei.

**Nicht von Hand deployen — `../deploy.sh` benutzen.** Das Skript lässt erst
die Tests laufen und bricht bei einem Fehlschlag ab:

```bash
./deploy.sh          # Tests, dann Proxy + Website
./deploy.sh proxy    # nur Proxy
./deploy.sh web      # nur Website
```

## Deploy-Reihenfolge

1. **Proxy zuerst deployen** — siehe [`../proxy/README.md`](../proxy/README.md).
   Die Worker-URL ist fest im Code hinterlegt (`PROXY_URL` in `index.html`),
   bei einer neuen Proxy-URL dort anpassen.
2. Diese `web/`-Dateien auf Cloudflare Pages deployen:
   `npx wrangler pages deploy web --project-name=heute-schule`
3. Website öffnen → Kinder anlegen (Zugangsdaten) → Speichern.
4. Auf dem Handy: Website öffnen → "Zum Home-Bildschirm hinzufügen" →
   fühlt sich danach wie eine App an, Login bleibt erhalten (localStorage).

## Status: umgesetzt seit MVP

- ✅ Fächer-Filter pro Kind (🚫 an jeder Stunde, "🙈 Ausgeblendet"-Übersicht
  mit 👁 zum Zurückholen, auf Dashboard *und* in den Einstellungen)
- ✅ Proxy-URL fest im Code, kein Nutzer-Setting mehr
- ✅ Kurzzeit-Caching + Timeout im Proxy (schont WebUntis/Mensamax)
- ✅ Tag-Umschalter (Heute + gleitendes Zwei-Tage-Fenster für die Zukunft)
- ✅ Zweiter Essensanbieter: ccCampus (mbs5online), neben Mensamax —
  läuft technisch bedingt direkt im Browser statt über den Proxy (siehe
  Abschnitt "ccCampus läuft NICHT über diesen Proxy" in
  [`../proxy/README.md`](../proxy/README.md))
- ✅ Security-Header (CSP, HSTS, X-Frame-Options u. a.) über `_headers`
- ✅ Ziel-Host-Validierung im Proxy gegen SSRF/Open-Relay-Missbrauch
  (`../proxy/hostcheck.mjs`)
- ✅ Barrierefreiheit: Heading-Struktur korrigiert (kein `role="button"`
  mehr auf der `<h1>`), alle Formularfelder mit `<label for>` verknüpft,
  Mindest-Klickfläche 24×24px für alle Icon-Buttons, `aria-live` auf den
  sich nachladenden Karten
- ✅ Gemeinsames `theme.css` statt vierfach duplizierter Farb-Variablen
- ✅ `robots.txt` (bewusst `Disallow: /`, kein öffentlicher Nutzerkreis)
  und echte `404.html` statt stillem SPA-Fallback mit HTTP 200
- ✅ Knopf „Alle meine Daten auf diesem Gerät löschen" in den Einstellungen
  (vorher nur über die Browser-Einstellungen möglich — für einen Teil der
  Zielgruppe praktisch eine Sackgasse)
- ✅ Wochenenden im Tagesumschalter überspringen (Fr → Mo statt Fr → Sa)
- ✅ Verständliche Meldung statt „Failed to fetch", wenn eine ccCampus-Adresse
  außerhalb der CSP-Allowlist eingetragen wird
- ✅ Test-Gate vor jedem Deploy (`../deploy.sh`)

## Was noch fehlt (bewusst nicht im MVP)

- Wochenplan im Rasterformat statt Listenansicht
- Echte PNG-App-Icons (aktuell nur ein SVG-Platzhalter — reicht für Android/
  Chrome, iOS-Homescreen-Icon ggf. später als PNG nachziehen)
- Getrennte WebUntis-Logins pro Kind werden unterstützt (Formular fragt sie
  pro Kind ab), falls ihr aber weiterhin einen gemeinsamen
  Klassen-Sammellogin nutzt, einfach bei allen Kindern dieselben
  WebUntis-Zugangsdaten eintragen — nur die "Klasse" unterscheidet sich.

### Neue Ideen (25.08., noch nicht bewertet/umgesetzt)

- **Custom-Termine** (Vorschlag von Markus): frei definierbare eigene Termine
  (z. B. "Dienstags Tanzen"), lokal gespeichert und zusammen mit dem
  WebUntis-Stundenplan angezeigt. Björns eigene Einschätzung dazu, die ich
  teile: **einfache** einmalige oder "jeden Wochentag X"-Termine wären
  leicht machbar (localStorage, analog zum Fächer-Ausblenden). Sobald aber
  echte Wiederholungsregeln gefragt sind (z. B. "jeder dritte Mittwoch",
  Ausnahmen, Ferienpausen), nähert sich das echter Kalender-Funktionalität
  an — Scope-Explosionsrisiko, macht die an sich einfache Seite
  unübersichtlicher. Vor Umsetzung bewusst entscheiden, wie weit das gehen
  soll (z. B. hart auf "kein Wiederholungsmuster außer wöchentlich"
  begrenzen, um die Komplexität zu deckeln).

## Rechtstexte (Impressum / Datenschutzerklärung)

Impressum ist frei formuliert. Die Datenschutzerklärung folgt für Abschnitt 2
("Was dieser Dienst macht") einer individuellen Beschreibung des tatsächlichen
Datenflusses; die übrigen Abschnitte (Rechte, Hosting-Formulierungen,
SSL-Hinweis, Server-Log-Dateien) sind an den Standard-Baustein von eRecht24
angelehnt, unter dessen kostenloser Nutzungsbedingung, dass die Herkunft
nicht entfernt werden darf, wenn man ihren Generator direkt nutzt — hier
umgangen, da der Text selbst geschrieben statt generiert wurde. Kein Ersatz
für eine anwaltliche Prüfung im Zweifelsfall — diese Einschätzung ist eine
Projektnotiz für die Weiterentwicklung, gehört nicht auf die Nutzer-Seite
selbst (dort stand sie versehentlich mal drin, wurde entfernt).

## ⚠ Vor weiterer Ausweitung prüfen: rechtliche Rolle ändert sich

**Kein Rechtsrat, sondern ein Merkposten aus dem Peer-Review (27.08.2026).**

Solange „Heute Schule" nur die eigene Familie bedient, greift plausibel die
**Haushaltsausnahme (Art. 2 Abs. 2 lit. c DSGVO)** — ausschließlich
persönliche oder familiäre Tätigkeiten sind vom Anwendungsbereich
ausgenommen. Sobald der Link an befreundete Familien geht, fällt diese
Ausnahme weg: Dann werden personenbezogene Daten *fremder Kinder*
verarbeitet, und der Betreiber ist voll Verantwortlicher im Sinne der DSGVO.

Damit kommen Pflichten dazu, die eine Datenschutzerklärung allein nicht
abdeckt — u. a. ein Verzeichnis von Verarbeitungstätigkeiten (Art. 30) und
dokumentierte technische/organisatorische Maßnahmen (Art. 32).

Zu klären, bevor der Kreis weiter wächst:

- [ ] Einschätzung durch jemanden mit juristischem Hintergrund einholen
- [ ] Prüfen, ob der in der Datenschutzerklärung behauptete **AVV mit
      Cloudflare** tatsächlich geschlossen/akzeptiert ist — eine unbelegte
      Behauptung in einem Rechtstext ist unnötig riskant
- [ ] Überlegen, ob „Demo-Website" die richtige Formulierung bleibt, wenn
      fremde Eltern echte Zugangsdaten ihrer Kinder eingeben

## Sicherheit / Datenschutz

- Zugangsdaten liegen ausschließlich im localStorage des jeweiligen
  Browsers, nicht zentral.
- Der Proxy selbst persistiert nichts, reicht Anfragen nur durch.
- Schulessen-Status wird nur **gelesen**, nichts wird bestellt/storniert.
- **SSRF/Open-Relay im Proxy (gefunden 27.08., behoben 27.08.):** `server`
  (WebUntis) und `base` (Mensamax/ccCampus) kamen unvalidiert aus dem
  unauthentifizierten Client-Request und landeten direkt in `fetch()`-Calls
  — der Proxy ließ sich damit als offener Relay für beliebige https-Ziele
  missbrauchen. Behoben durch Ziel-Host-Validierung in
  `../proxy/hostcheck.mjs` (nur https, kein Zugangsdaten-in-URL-Trick, keine
  privaten/Loopback/Link-lokalen Ziele; `server` zusätzlich hart auf
  `*.webuntis.com` begrenzt). Mit Tests abgesichert, siehe Abschnitt "Tests"
  oben.
- **Security-Header:** CSP, `Strict-Transport-Security`, `X-Frame-Options`
  u. a. über `_headers` (Cloudflare Pages). Die CSP erlaubt `unsafe-inline`
  für Skript/Style, weil die App bewusst als eine Datei ohne Build-Schritt
  gebaut ist — die sauberere Alternative (Hash-basierte CSP) müsste bei
  jeder Code-Änderung neu berechnet werden, das Risiko/Aufwand-Verhältnis
  war dafür schlecht. Der Rest der Policy bleibt eng (siehe Kommentar in
  `_headers`).
- **`ALLOWED_ORIGIN` im Proxy** war lange `*` (jede Website darf den Proxy
  per Browser-JS ansprechen) — jetzt in `../proxy/wrangler.toml` fest auf
  `https://heute-schule.pages.dev` gesetzt. Wichtig zur Einordnung: das ist
  eine CORS-Regel, gilt also nur für Aufrufe aus fremden Websites heraus im
  Browser eines Besuchers (z. B. relevant gegen Phishing-Nachbauten dieser
  Seite) — schützt nicht gegen direkte Skript-/curl-Anfragen an die Proxy-
  API, dafür sorgt die SSRF-Validierung oben.
- **Cache-Umgehung der Authentifizierung (gefunden 27.08. im Peer-Review,
  behoben 27.08.):** Der Cache-Schlüssel des Proxys enthielt keine
  Passwörter, und der Cache-Treffer wurde vor jedem Login ausgeliefert. Wer
  `server`, `user` und `klasse` kannte — beim Klassensammellogin
  schulöffentlich —, bekam innerhalb der 4-Minuten-TTL die Antwort einer
  fremden, legitimen Abfrage ohne Passwort. Behoben: Zugangsdaten sind Teil
  des Schlüsselmaterials (`../proxy/cachekey.mjs`), abgesichert durch
  Regressionstests. Lehrstück: Der Fehler steckte hinter einem Kommentar, der
  ihn als Datensparsamkeit begründete — Kommentare sind Behauptungen, keine
  Prüfungen.
- **Rate-Limit** (30 Anfragen/IP/Minute) im Proxy. Die Host-Allowlist erlaubt
  alle `*.webuntis.com`, nicht nur die eigene Schule — ohne Limit wäre der
  Proxy eine bequeme Vorschaltstufe für massenhafte Login-Versuche gewesen,
  mit unserer IP als Absender. Grenzen der Umsetzung sind im Code
  dokumentiert (Cache-basiert, nicht atomar).
- **Klartext-Einsicht des Proxys ist jetzt in der Datenschutzerklärung
  benannt**: TLS endet bei Cloudflare, der Betreiber *könnte* die
  Zugangsdaten technisch mitlesen. Er tut es nicht (nichts wird geloggt oder
  gespeichert), aber niemand soll sich darauf verlassen müssen — deshalb der
  offene Quellcode. Das gehörte offen gesagt, sobald fremde Familien
  mitnutzen.
- **Zugangsdaten liegen aktuell unverschlüsselt (Klartext-JSON) in
  localStorage.** Geprüft (27.08.): kein `innerHTML` mit externen/dynamischen
  Werten im Code, keine externen JS-Bibliotheken eingebunden — damit kein
  offensichtlicher XSS-Angriffsweg, der laut OWASP/heise sonst das
  Hauptrisiko bei dieser Speicherart wäre. Restrisiko: physischer/eingeloggter
  Gerätezugriff. Für den Anwendungsfall (kein Finanzschaden möglich, nur
  Schulessen-Status lesbar) als vertretbar eingeschätzt — Entscheidung offen,
  ob das noch gehärtet wird (siehe nächster Punkt).

### Idee (27.08., noch nicht umgesetzt): Verschlüsselung ohne Master-Passwort

Statt Klartext: Config vor dem Speichern mit einem **nicht extrahierbaren**
AES-Schlüssel (Web Crypto API, `extractable: false`) verschlüsseln, Schlüssel
selbst in IndexedDB ablegen — gerätegebunden, kein von Nutzer:innen zu
merkendes Passwort nötig (ähnliches Prinzip wie Chromes OS-Keychain-Nutzung
für gespeicherte Passwörter, nur eben Browser-intern statt OS-Ebene).

- **Schützt gut gegen**: Kopie der Browser-/Festplattendaten, Offline-Auslesen
  von localStorage ohne die Seite je auszuführen.
- **Schützt NICHT gegen**: einen live laufenden XSS-Angriff während die Seite
  offen ist — der nicht-extrahierbare Schlüssel ist zwar nicht stehlbar, aber
  von jedem Code nutzbar, der im selben Seitenkontext läuft (also auch von
  eingeschleustem Code).
- **Aufwand**: kein Fünf-Minuten-Fix — der App-Start (`loadConfig()`) müsste
  von synchron auf asynchron umgebaut werden, da Web Crypto/IndexedDB
  asynchrone APIs sind.
- Bewusst **kein** Master-Passwort-Ansatz (klassische Verschlüsselung mit
  einem von Nutzer:innen gemerkten Passwort) — genau das wollten wir
  vermeiden, siehe Chat-Verlauf.
