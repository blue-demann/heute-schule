# Heute Schule — Projekt- und Design-Dokumentation

**Stand: 28.08.2026 · Version 0.2.0**

Dieses Dokument bündelt die Gedanken hinter dem Projekt: warum es existiert,
welche Entscheidungen getroffen wurden (und welche bewusst nicht), wie es
aufgebaut ist, und wie es sich bisher entwickelt hat. Es ersetzt nicht die
Einzeldokumente (READMEs, Rechtstexte, Audit-Berichte) — es verweist auf sie
und liefert den Zusammenhang, den keines davon allein liefert.

---

## Inhalt

1. [Use Case](#1-use-case)
2. [Requirements](#2-requirements)
3. [Nicht-Ziele](#3-nicht-ziele)
4. [Architektur & Datenfluss](#4-architektur--datenfluss)
5. [Entscheidungs-Log](#5-entscheidungs-log)
6. [Sicherheitsmodell](#6-sicherheitsmodell)
7. [Rechtliche Grundlagen](#7-rechtliche-grundlagen)
8. [Tools & APIs](#8-tools--apis)
9. [Testkonzept](#9-testkonzept)
10. [Betrieb & Deploy](#10-betrieb--deploy)
11. [Release-Historie](#11-release-historie)
12. [Offene Punkte / Roadmap](#12-offene-punkte--roadmap)
13. [Verantwortlichkeit](#13-verantwortlichkeit)

---

## 1. Use Case

Jeden Morgen stellten sich für Björns Familie dieselben drei Fragen: Wie
sieht der Vertretungsplan der Kinder heute aus? Wann kommen sie nach Hause?
Essen sie etwas, und was? Die Antworten lagen verstreut hinter getrennten
Logins bei WebUntis (Stundenplan) und dem jeweiligen Essensanbieter
(Mensamax oder ccCampus, je nach Schule).

Die erste Lösung war eine tägliche Mail per Google-Apps-Script-Automation
(`stundenplan_agent.gs`) — funktional, aber fragil (Skripteigenschaften als
Konfiguration, kein Testen ohne Produktivlauf) und nur für eine Familie
gedacht. „Heute Schule" ersetzt das durch eine On-Demand-Webseite, die
dieselbe Information zeigt, sobald man sie braucht, statt einmal täglich
per Mail.

Mit der Zeit kam eine zweite Familie dazu (Essensanbieter ccCampus statt
Mensamax), was den Anbieter-Teil der Architektur von „für eine Schule fest
verdrahtet" zu „pro Kind konfigurierbar, zwei Anbieter unterstützt"
weiterentwickelt hat. Die Seite ist inzwischen darauf ausgelegt, den Link an
weitere befreundete Familien weiterzugeben.

## 2. Requirements

- **Ein Blick statt mehrerer Logins.** Stundenplan und Schulessen-Status
  für beliebig viele Kinder auf einer Seite.
- **Heute + nahe Zukunft.** Tagesumschalter für die kommenden Schultage
  (nicht Wochenenden, siehe Entscheidungs-Log).
- **Mehrere Essensanbieter.** Aktuell Mensamax und ccCampus, pro Kind
  wählbar, nicht global für die ganze Seite.
- **Niedrige Einstiegshürde für nicht-technische Eltern.** Einmalige
  Eingabe der Zugangsdaten, danach ein Klick. Funktioniert als installierte
  PWA auf dem Handy.
- **Minimale Datenspur.** Keine zentrale Speicherung von Zugangsdaten, keine
  Analyse-/Tracking-Tools, kein Bestellen/Stornieren — nur Lesen.
- **Funktioniert auf altem Geräte-Bestand.** Familien-Tablets sind selten
  die neueste Hardware; die Seite darf keine moderne Baseline voraussetzen
  (siehe Entscheidungs-Log, ES5).
- **Für die Zielgruppe geeignete Rechtstexte.** Impressum,
  Datenschutzerklärung, die den tatsächlichen Datenfluss ehrlich beschreibt
  statt Textbaustein-Floskeln zu wiederholen.
- **Nachprüfbarkeit.** Offener Quellcode (MIT), damit niemand dem Betreiber
  blind vertrauen muss — relevant, weil der Proxy Zugangsdaten technisch
  sehen könnte (siehe Abschnitt 6).

## 3. Nicht-Ziele

Bewusste Entscheidungen, *nicht* zu bauen — damit sie später nicht als
Vergessenes missverstanden werden:

- **Kein Bestellen/Stornieren von Essen.** Nur Lesen. Reduziert Schaden im
  Fehlerfall auf „falsche Information angezeigt", nie auf „falsche
  Bestellung ausgelöst".
- **Kein Build-Prozess, keine Frameworks.** Eine HTML-Datei mit Inline-CSS/
  JS für die App, kein npm, kein Bundler. Bewusst gegen die Zeit — reduziert
  Angriffsfläche (keine Supply Chain aus Dependencies) und Wartungsaufwand,
  auf Kosten von Entwicklerkomfort.
- **Keine automatisierte CI/CD-Pipeline.** Es gibt `deploy.sh` mit
  Test-Gate, aber keinen angebundenen Cloud-Build. Für ein Ein-Personen-
  Projekt dieser Größe war der Aufwand einer echten CI nicht gerechtfertigt
  — bewusst benannt als Grenze, nicht als Endzustand (siehe Abschnitt 12).
- **Keine automatisierte Lighthouse-/axe-Core-Prüfung.** Beide QA-Runden
  liefen mit manueller Kontrastberechnung und DOM-Inspektion statt Tooling
  — offengelegt in den Audit-Berichten, nicht verschwiegen.
- **Keine Verschlüsselung der Zugangsdaten in localStorage.** Diskutiert
  und bewusst zurückgestellt (siehe Entscheidungs-Log).

## 4. Architektur & Datenfluss

```
┌─────────────┐         ┌──────────────────────┐         ┌─────────────┐
│   Browser    │────────▶│  Cloudflare Worker    │────────▶│  WebUntis    │
│ (web/*.html) │  HTTPS  │  (proxy/worker.js)    │  HTTPS  │  Mensamax    │
│              │◀────────│  löst CORS-Sperre     │◀────────│              │
└──────┬───────┘         └──────────────────────┘         └─────────────┘
       │
       │ HTTPS, direkt — kein Proxy
       ▼
┌─────────────┐
│  ccCampus    │
│ (mbs5online) │
└─────────────┘
```

**Zwei Komponenten:**

- **`web/`** — statische PWA auf Cloudflare Pages. Eine `index.html` für die
  App, drei Rechtstext-Seiten (`impressum.html`, `datenschutz.html`,
  `ueber.html`), `theme.css` als gemeinsames Stylesheet, `sw.js` als Service
  Worker (Network-first mit Cache-Fallback), `_headers` für Security-Header.
- **`proxy/`** — ein Cloudflare Worker (`worker.js`), der WebUntis- und
  Mensamax-Anfragen serverseitig stellt (löst deren fehlende
  CORS-Freigabe), plus `hostcheck.mjs` (Ziel-Host-Validierung) und
  `cachekey.mjs` (Cache-Schlüssel-Bildung) als ausgelagerte, testbare Module.

**Warum zwei verschiedene Wege für strukturell ähnliche Anbieter:**
WebUntis und Mensamax senden keine `Access-Control-Allow-Origin`-Header —
ein Browser darf ihre Antworten also nicht direkt lesen, daher der Proxy.
ccCampus ist strukturell umgekehrt: Es blockiert Anfragen von
Server-Infrastruktur (u. a. Cloudflare Workers) mit HTTP 403, lässt aber
echte Browser-Anfragen mit offenen CORS-Headern durch. ccCampus läuft daher
komplett im Browser, ohne den Proxy zu berühren. Beide Verhaltensweisen
wurden empirisch verifiziert (curl gegen beide Wege, echter Browsertest),
nicht angenommen.

**Datenfluss im Detail:** siehe `web/datenschutz.html` Abschnitt 2 — dort
steht die für Nutzer:innen verständliche Fassung, die hier nicht
dupliziert wird, um kein Auseinanderlaufen zu riskieren.

## 5. Entscheidungs-Log

Architektur beschreibt den Ist-Zustand. Hier steht das *Warum* — inklusive
verworfener Alternativen.

### Proxy statt direkter Zugriff für WebUntis/Mensamax
**Entscheidung:** Cloudflare Worker als Pass-through.
**Alternative verworfen:** Direkter Browser-Zugriff — technisch nicht
möglich, da beide Anbieter keine CORS-Freigabe senden (verifiziert, nicht
angenommen — eine frühere Notiz im Code markierte das lange als
„unverifizierte Annahme", bis der produktive Betrieb es bestätigte).

### Kein Master-Passwort, keine Verschlüsselung von localStorage
**Entscheidung:** Zugangsdaten liegen als Klartext-JSON in localStorage.
**Alternativen erwogen:**
- Klassische Verschlüsselung mit einem von Nutzer:innen zu merkenden
  Master-Passwort — bewusst abgelehnt, das wollte das Projekt explizit
  vermeiden (zusätzliche Hürde für eine nicht-technische Zielgruppe).
- Geräte-gebundene Verschlüsselung über einen nicht-extrahierbaren
  Web-Crypto-Schlüssel (`extractable: false`) in IndexedDB, ohne
  Master-Passwort — technisch durchdacht, aber verworfen: schützt gegen
  Offline-Auslesen der Browserdaten, **nicht** gegen einen live laufenden
  XSS-Angriff (der Schlüssel ist zwar nicht extrahierbar, aber von jedem
  Code im selben Seitenkontext nutzbar). Der Aufwand (asynchroner Umbau von
  `loadConfig()`) stand in keinem guten Verhältnis zum tatsächlichen
  Zugewinn.

**Risikoabwägung:** Ein finanzieller Schaden ist technisch nicht
ausgeschlossen — mit den Mensa-Zugangsdaten lässt sich auf der
Anbieter-Website selbst Essen bestellen, das kostet echtes Geld. Die
Abwägung stützt sich auf mehrere Faktoren zusammen:
- Für Angreifende entsteht dabei **kein eigener finanzieller Vorteil** —
  eine fremde Bestellung auszulösen bringt niemandem etwas ein, die
  Motivation für den dafür nötigen technischen Aufwand ist entsprechend
  gering.
- Eine unerwünschte Bestellung fiele der betroffenen Familie **beim
  nächsten eigenen Login** auf.
- Bestellungen lassen sich bei den Anbietern **rückgängig machen**.
- Die Maßnahmen, die dieses ohnehin kleine Risiko weiter verringern würden
  (Verschlüsselung o. Ä.), stehen im Zielkonflikt zu anderen
  Projektzielen — Komplexität und Wartbarkeit gering zu halten. Die
  Gesamtabwägung fiel deshalb bewusst gegen zusätzliche Verschlüsselung
  aus, nicht weil kein Schaden denkbar wäre, sondern weil Eintritts-
  wahrscheinlichkeit, Entdeckbarkeit und Umkehrbarkeit zusammen den
  Mehraufwand nicht rechtfertigen.

**Zusätzlich umgesetzt** (reduzieren andere Angriffswege, sind kein Ersatz
für diese Abwägung): kein `innerHTML` mit Fremddaten, keine externen
JS-Abhängigkeiten, Löschfunktion in der App.

### Kein Build-Tooling, eine Datei, ES5-Syntax
**Entscheidung:** `index.html` ist eine einzelne Datei mit Inline-`<style>`/
`<script>`, JavaScript durchgängig in ES5-kompatiblem Stil (keine Arrow
Functions, kein `async`/`await`, kein optional chaining — im Peer-Review
gezielt gegengeprüft, nur ein `.finally()` als einziges neueres Feature).
**Warum:** Zielgruppe nutzt teils ältere Familien-Geräte; ein Build-Schritt
hätte zusätzliche Werkzeuge und einen Wartungspfad eingeführt, der für die
Projektgröße nicht gerechtfertigt war. Nebeneffekt: keine
Dependency-Supply-Chain, nichts zu scannen, nichts, das im Hintergrund
veraltet.

### MIT-Lizenz statt eigener Lizenztext
**Entscheidung:** MIT, mit Verweis auf die deutsche Wikipedia-Erklärung
statt eigenem Juristendeutsch.
**Rechtstexte (Impressum/Datenschutz):** Frei formuliert für den Abschnitt,
der den tatsächlichen Datenfluss beschreibt; die übrigen Abschnitte
(Rechte, Hosting, SSL-Hinweis) entstanden auf Basis einer Vorlage von
[eRecht24](https://www.e-recht24.de/). Die Datenschutzerklärung nennt
eRecht24 deshalb explizit als Quelle, mit Link.

### Anonymisierung der Testdaten
**Entscheidung:** In öffentlich sichtbarem Code/Tests werden die echten
Kindernamen durch „Mia" (Top-1-Mädchenname des Geburtsjahrgangs 2011 laut
GfdS) und „Emma" ersetzt statt der echten Namen.

## 6. Sicherheitsmodell

**Bedrohungsmodell:** Kein Ziel für gezielte, aufwändige Angriffe — aber
real angreifbar durch (a) gelegenheitsbasierten Missbrauch, wenn die
Proxy-URL bekannt wird, (b) das geteilte Familien-Tablet (Kinder mit
Entwicklertools-Zugriff), (c) automatisierten Massen-Login-Missbrauch, weil
die Host-Allowlist alle `*.webuntis.com`-Schulen erlaubt, nicht nur die
eigene. Kein klassisches Ziel für Cloud-Metadata-SSRF (Workers-Isolates
haben keine klassische VM-Metadata-Endpoint-Angriffsfläche), aber ein
offener Relay für beliebige https-Ziele war real möglich, bis behoben.

**Umgesetzte Maßnahmen:**

| Maßnahme | Datei | Wogegen |
|---|---|---|
| Ziel-Host-Allowlist (SSRF-Schutz) | `proxy/hostcheck.mjs` | Missbrauch des Proxys als offener Relay für beliebige https-Ziele; blockiert zusätzlich private/Loopback/Link-lokale Ziele |
| Zugangsdaten im Cache-Schlüssel | `proxy/cachekey.mjs` | Auslieferung fremder Daten ohne Authentifizierung — ein Cache-Treffer setzt damit erfolgreiche Anmeldung voraus, nicht nur Kenntnis von Benutzername/Klasse |
| Rate-Limit (30/IP/Minute) | `proxy/worker.js` | Massenhafte Login-Versuche über den Proxy als Relay; Cache-basiert, nicht atomar — bewusste Grenze, siehe Code-Kommentar |
| CORS auf Produktionsdomain eingeschränkt | `proxy/wrangler.toml` (`ALLOWED_ORIGIN`) | Phishing-Nachbauten, die den echten Proxy im Hintergrund ansprechen |
| Security-Header (CSP, HSTS, X-Frame-Options, Permissions-Policy) | `web/_headers` | Clickjacking, Nachladen fremden Codes; CSP mit `unsafe-inline`, weil bewusst kein Build-Schritt existiert (siehe Nicht-Ziele) |
| Kein serverseitiges Logging von Zugangsdaten | `proxy/worker.js` | Verifiziert: kein `console.log` mit Credentials im gesamten Worker-Code |
| Löschfunktion für lokale Daten | `web/index.html` | Betroffenenrechte praktisch ausübbar statt nur theoretisch über Browser-Einstellungen |

**Bewusst akzeptiertes Restrisiko:** Klartext-Zugangsdaten in localStorage
(Risikoabwägung siehe Abschnitt 5, „Kein Master-Passwort …") und die
technische Möglichkeit, dass der Proxy-Betreiber Zugangsdaten mitlesen
könnte (TLS endet bei Cloudflare) — beides in der Datenschutzerklärung
offen benannt statt verschwiegen.

## 7. Rechtliche Grundlagen

- **Impressum** (`web/impressum.html`) — § 5 DDG (nicht mehr TMG, das
  Digitale-Dienste-Gesetz hat es abgelöst).
- **Datenschutzerklärung** (`web/datenschutz.html`) — individuell
  formulierter Abschnitt zum tatsächlichen Datenfluss, TOM-Abschnitt
  (Technische und organisatorische Maßnahmen), eRecht24-Textbausteine für
  die Standardabschnitte.
- **Interne Grenze, technisch relevant:** Die Haushaltsausnahme
  (Art. 2 Abs. 2 lit. c DSGVO) deckt nur rein familiäre Nutzung ab — mit
  der zweiten, familienfremden Familie aus Abschnitt 1 dürfte sie bereits
  heute nicht mehr greifen, nicht erst bei weiterer Ausweitung — mit
  vollen DSGVO-Pflichten als Konsequenz (u. a. Art. 30 Verzeichnis von
  Verarbeitungstätigkeiten, Art. 32 TOMs). **Das ist eine Frage des
  Anwendungsbereichs, keine Frage
  der Sicherheitsqualität** — sie hängt daran, *wessen* Daten verarbeitet
  werden (Personen außerhalb des eigenen Haushalts oder nicht), nicht daran,
  wie gut Cache-Fix, Rate-Limit oder Security-Header inzwischen sind. Die
  seither umgesetzten TOMs und das Verarbeitungsverzeichnis sind die
  richtige *Reaktion* darauf, dass die Ausnahme entfällt — sie machen die
  Frage nicht überflüssig, sondern sind der erste Schritt, sie zu
  beantworten.
- **`Verarbeitungsverzeichnis-INTERN.md`** — Entwurf nach Art. 30, bewusst
  *nicht* Teil von `web/` (wird nicht deployed, nicht öffentlich).
- **Kein Rechtsrat.** Alle rechtlichen Einordnungen in diesem Projekt
  (einschließlich dieses Dokuments) sind Laienarbeit zur Vorbereitung eines
  Gesprächs mit qualifiziertem rechtlichem Beistand, keine geprüfte
  Rechtsauskunft. Offene Punkte dazu: Abschnitt 12.

## 8. Tools & APIs

**Externe APIs (Drittanbieter, nicht selbst kontrolliert):**

| API | Zweck | Integrationsart |
|---|---|---|
| WebUntis JSON-RPC (`/WebUntis/jsonrpc.do`) | Stundenplan-Abfrage | Server-seitig über den Proxy (`authenticate`, `getKlassen`, `getTimetable`, `getSubjects`, `getRooms`, `logout`) |
| Mensamax / parentsmensa.de | Schulessen-Status | Server-seitig über den Proxy — ASP.NET-WebForms-Scraping (`__VIEWSTATE` u. a.), da keine öffentliche API existiert |
| ccCampus / mbs5online.de | Schulessen-Status (Alternativanbieter) | Client-seitig direkt aus dem Browser (siehe Architektur) — `POST /Login/Login`, `GET /Mealplan/Weekplan`, HTML-Statusknoten-Parsing |

**Infrastruktur:**

- **Cloudflare Pages** — Hosting der statischen Website
- **Cloudflare Workers** — Laufzeitumgebung für den Proxy
- **Cloudflare Cache API** — Kurzzeit-Ergebnis-Cache (240 s) und
  Rate-Limit-Zähler, beide ohne Zugangsdaten im Klartext
- **`wrangler` CLI** — Deploy-Werkzeug für beide Komponenten

**Entwicklung:**

- **Node.js** — ausschließlich für die lokale Testsuite, keine
  Laufzeit-Abhängigkeit der ausgelieferten App
- **Git** — lokale Versionsverwaltung seit 27.08.2026 (siehe Abschnitt 11);
  noch kein Remote-Repository angebunden
- Keine Frameworks, kein Bundler, kein Paketmanager-Lockfile — siehe
  Nicht-Ziele (Abschnitt 3)

## 9. Testkonzept

**Ausführung:** `node run-tests.mjs` — reines Node, keine
Testframework-Abhängigkeit (`node --test` wäre möglich gewesen, für die
Projektgröße nicht nötig).

**Umfang, Stand 28.08.2026: 85 Tests, 0 Abhängigkeiten.**

| Testgruppe | Datei unter Test | Fokus |
|---|---|---|
| `pad()`, Cookie-Extraktion, `parseLunchStatus()`, `buildStundenListe()`, `formatStunden()`, `buildEmail()` | `stundenplan.js` | Geerbte Logik aus der ursprünglichen Apps-Script-Automation |
| `istPrivatesOderLokalesZiel()`, `pruefeSicherenHostname()`, `pruefeSichereHttpsUrl()` | `proxy/hostcheck.mjs` | SSRF-Schutz — Loopback/private/Link-lokale Ziele, Allowlist-Grenzen, URL-Normalisierung (inkl. Regressionstest für den aus der Adresszeile kopierten WebUntis-Link) |
| `buildCacheKeyMaterial()` | `proxy/cachekey.mjs` | Cache-Bypass-Regression — jeder Regressionstest hier existiert wegen eines tatsächlich gefundenen Fehlers, nicht vorsorglich |

**Was die Testsuite bewusst nicht abdeckt:** UI-Verhalten im Browser (dafür
wurden in den QA-Runden gezielte, manuelle Browser-Tests gegen echte oder
gemockte Daten gefahren, aber nicht automatisiert), Lighthouse/axe-Core,
Last-/Zeitverhalten des Rate-Limits unter echter Nebenläufigkeit.

**Test-Gate vor Deploy:** `deploy.sh` lässt die Suite vor jedem Deploy
laufen und bricht bei einem Fehlschlag ab (siehe Abschnitt 10) — eingeführt,
nachdem der Cache-Bypass-Fehler zeigte, dass „ich hab's im Kopf" als
Absicherung nicht reicht.

**Verweis auf die Testergebnisse der beiden Audit-Runden:**
- [`QA-Bericht-2026-08-27-v0.1.1.md`](QA-Bericht-2026-08-27-v0.1.1.md) —
  c't-Stil-Analyse, Runde 1 (26 Kritikpunkte über 10 Kategorien) und
  Runde 2 (Verifikation der Fixes gegen die Live-Umgebung, zwei neue Funde)
- [`PEER-REVIEW-2026-08-27.md`](PEER-REVIEW-2026-08-27.md) — unabhängige
  Gegenprüfung dazu, fand den Cache-Bypass-Fehler und weitere Lücken, die
  der erste Bericht übersehen hatte
- [`QA-Bericht-2026-08-31.md`](QA-Bericht-2026-08-31.md) — dritte Runde,
  ausgeführt von einer frischen Sitzung ohne Vorwissen über frühere
  Projektstände; kein 🔴-Befund, bestätigte alle vorherigen 🔴-Fixes live
- [`PEER-REVIEW-2026-08-31.md`](PEER-REVIEW-2026-08-31.md) — ebenfalls
  frische Sitzung, fand die zu enge Mensamax-Domain-Beschränkung (behoben,
  siehe Entscheidungs-Log/Sicherheitsmodell) und die uneinheitliche
  Haushaltsausnahme-Formulierung in vier Dokumenten (ebenfalls korrigiert)

Auf der Website ([`ueber.html`](web/ueber.html), Abschnitt „Technische
Details") sind bewusst nur die beiden aktuellsten Berichte verlinkt — die
Website zeigt den aktuellen Stand, nicht die Historie. Die früheren Runden
bleiben hier im Repository nachvollziehbar.

**Methodik — wichtig für die Einordnung:** Keine der vier Audit-Runden
wurde **von menschlichen Prüfer:innen durchgeführt**, sondern von Claude
(Anthropics KI-Assistent) anhand strukturierter, von Björn selbst
formulierter Prompts — mit echtem Zugriff auf die Live-Website und den
Quellcode, aber ohne die Unabhängigkeit menschlicher Gutachter:innen. Die
Runde vom 31.08. lief zusätzlich über zwei genuin unabhängige, frische
Sitzungen ohne Kontext aus früheren Gesprächen zu diesem Projekt — nicht
nur derselbe Assistent mit neuer Rolle. Alle Prompts liegen unter
[`prompts/`](prompts/) zur Nachvollziehbarkeit, verbatim archiviert:
[`prompts/peer-review-bester-freund.md`](prompts/peer-review-bester-freund.md)
und [`prompts/ct-stil-analyse.md`](prompts/ct-stil-analyse.md) (dessen
ursprünglicher Wortlaut zwischenzeitlich durch eine Kontext-Kompaktierung
verloren war und am 31.08. erneut bereitgestellt wurde — siehe
[`prompts/README.md`](prompts/README.md)).

## 10. Betrieb & Deploy

```bash
./deploy.sh          # Tests, dann Proxy + Website
./deploy.sh proxy    # nur Proxy
./deploy.sh web      # nur Website
```

Bricht bei fehlschlagenden Tests ab, ohne zu deployen.

**Bekannte Stolperfalle (28.08.2026, in `deploy.sh` dokumentiert):** Seit
das Projekt unter Git-Versionsverwaltung steht, erkennt `wrangler pages
deploy` automatisch den lokalen Git-Branch (`main`) und würde ohne
Gegenmaßnahme als Branch-Preview statt auf die Produktionsdomain deployen —
der bei Cloudflare hinterlegte Produktions-Branch heißt tatsächlich
`production`, nicht `main`. `deploy.sh` setzt deshalb `--branch=production`
explizit, unabhängig vom lokalen Branch-Namen.

**Zugriff:** Deploy läuft über Björns eigenes, scoped Cloudflare-API-Token
(`wrangler login`), kein breiter OAuth-Zugriff — Entscheidung aus
Datenschutz-/Sicherheitspräferenz.

**Rollback:** Kein automatisierter Rollback-Mechanismus. Cloudflare hält
eine Historie vergangener Deployments vor (abrufbar über `wrangler pages
deployment list`), auf die im Cloudflare-Dashboard manuell zurückgeschaltet
werden kann; der zugehörige Quellcode-Stand lässt sich seit 27.08.2026
zusätzlich über die Git-Historie nachvollziehen (davor nicht, siehe
Abschnitt 11).

## 11. Release-Historie

**Vor Git (bis 27.08.2026):** Keine Versionsverwaltung — Entwicklung direkt
gegen die Produktivumgebung, mit `wrangler pages deploy`/`wrangler deploy`
als einzigem Zustandswechsel. Die grobe Chronologie, rekonstruiert aus
Projektverlauf und Dateiständen (keine exakten Zeitstempel, da kein Git):

1. **Erster Wurf:** Statische PWA + Proxy als Ersatz für die tägliche
   Mail-Automation, Grundfunktionen (Stundenplan, Mensamax-Status).
2. **Iterative Erweiterungen:** Fächer-Ausblenden mit Legende, Tag-
   Umschalter, persistenter Konfigurationserhalt über Updates hinweg,
   Demo-Hinweis, konsistenter Header/Navigation über alle Seiten.
3. **Zweiter Essensanbieter:** ccCampus-Integration für eine zweite Familie
   — inklusive der Entdeckung der umgekehrten CORS-Blockade (siehe
   Architektur) und der clientseitigen Lösung dafür.
4. **Rechtstexte:** Impressum, Datenschutzerklärung, Über-Seite,
   MIT-Lizenz.
5. **27.08.2026 — QA-Runde 1 (c't-Stil-Analyse):** 26 Kritikpunkte über 10
   Kategorien, davon 10 systematisch behoben (SSRF-Erstversion,
   Barrierefreiheit, Security-Header, Soft-404, u. a.).
6. **27.08.2026 — Peer-Review:** Fand den Cache-Bypass-Fehler (🔴, höchste
   Priorität), fehlendes Rate-Limit, fehlende Löschfunktion, offene
   Rechtsfrage bei Ausweitung — 8 weitere Punkte, alle bis auf die
   juristische Prüfung inzwischen behoben.
7. **27.08.2026 — `git init`:** Erster Commit, Version 0.2.0. Ab hier
   nachvollziehbare Historie.

**Ab Git — Commit-Log (`git log --oneline`):**

```
876d8e4  Heute Schule v0.2.0 — Ausgangsstand unter Versionsverwaltung
e3a229f  Server-Feld-Bereinigung, DSGVO-Ergänzung, Verarbeitungsverzeichnis
ddc875b  deploy.sh: Branch explizit auf production setzen
```

**28.08.2026 — Betatest:** Erste externe Beta-Nutzerin (ccCampus-Familie)
meldet einen Bedienfall — komplette Browser-URL statt Hostname ins
Server-Feld eingefügt. Naheliegende Handlung, kein Nutzerfehler; auf beiden
Ebenen (Client, Proxy) korrigiert.

**Release-Bulletin-Konvention ab hier:** Versionsnummer in `web/ueber.html`
(`VERSION`-Konstante) wird bei sicherheitsrelevanten oder funktionalen
Änderungen erhöht (aktuell `x.y.z` informell, kein festes SemVer-Schema).
Die Commit-Nachrichten selbst dienen als Release-Bulletin — ausführlich
genug gehalten, um ohne Rückfrage zu verstehen, *was* und *warum*.

## 12. Offene Punkte / Roadmap

Wird nicht dupliziert — siehe:

- [`OFFEN-naechste-Fixes.md`](OFFEN-naechste-Fixes.md) — technische und
  rechtliche Punkte, aktuell die juristische Prüfung vor weiterer
  Ausweitung sowie die GitHub-Veröffentlichung des Quellcodes.
- [`web/README.md`](web/README.md), Abschnitt „Neue Ideen" — Feature-
  Vorschläge (z. B. Custom-Termine), noch nicht bewertet.

## 13. Verantwortlichkeit

Ein-Personen-Projekt. Björn Lüdemann ist alleiniger Maintainer und
DSGVO-Verantwortlicher (siehe Impressum/Datenschutzerklärung für
Kontaktdaten). Bus-Factor bewusst benannt statt verschwiegen: Bei Ausfall
gibt es aktuell keine zweite Person mit Zugriff auf Cloudflare-Konto oder
Projektwissen. Teilweise gemildert durch: offenen Quellcode (MIT), dieses
Dokument, und seit 27.08.2026 eine nachvollziehbare Git-Historie — noch
nicht gemildert durch ein Remote-Repository oder eine zweite
zugriffsberechtigte Person.
