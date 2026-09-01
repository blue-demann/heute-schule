# QA-Bericht „Heute Schule" — c't-Stil-Analyse

**Live-URL:** https://heute-schule.pages.dev
**Datum:** 31.08.2026
**Erstellt von einer frischen, unabhängigen Claude-Sitzung ohne Vorwissen über frühere Projektstände oder frühere Audit-Ergebnisse dieses Projekts.**

Geprüft wurde gegen den lokalen Git-HEAD (`eb53d1a`) unter
`/Users/bjoern/.../Claude/Stundenplan` sowie die tatsächlich live erreichbare
Website. Ein zentraler eigener Befund dieser Runde: **HEAD und Live-Stand
sind zum Prüfzeitpunkt nicht identisch** — Details in Abschnitt „Code-Qualität".

---

## Zugriffslage

Ich hatte: Live-Browsing inkl. mobiler Emulation, HTTP-Header-Abruf,
POST-Requests gegen den Proxy, vollständigen lokalen Quellcode- und
Git-Historien-Zugriff, `node`/`npm`/`eslint` lokal ausführbar. Ich hatte
**nicht**: echte WebUntis-/Mensamax-/ccCampus-Zugangsdaten, Lighthouse/axe-Core
oder vergleichbares Performance-/A11y-Tooling, Zugriff auf das
Cloudflare-Dashboard des Betreibers (kann die dort behauptete AVV-Bestätigung
nicht selbst nachvollziehen), und ich habe den Proxy-Rate-Limiter bewusst
**nicht** mit vielen Anfragen belastet, um WebUntis/Mensamax nicht real zu
strapazieren — dazu nur Code-Review. Entsprechend markierte Punkte sind
`[ungeprüft]`. Ein einzelner Testkind-Datensatz mit erfundenen Zugangsdaten
wurde live angelegt, um Fehlerzustände zu prüfen (Klarname des realen
Schul-Hostnamens `lg-norderstedt.webuntis.com` stammt aus dem im Code
vorausgefüllten Default-Wert des Betreibers selbst, keine fremden Daten).

---

## 1. Kurzfazit-Kasten

**Heute Schule** ist ein technisch überdurchschnittlich sauber gebautes
Ein-Personen-Projekt: gute Security-Grundlagen (SSRF-Schutz, harte
Cache-Schlüssel-Authentifizierung, Rate-Limit, vollständige Security-Header —
alle live verifiziert), gute Barrierefreiheit (Kontraste, Fokus-Ringe,
Klickflächen ≥24×24px — live nachgemessen), ehrliche, unaufgeregte
Rechtstexte. Schwächen liegen weniger im sichtbaren Produkt als im
Prozess: Der deployte Live-Stand weicht nachweisbar vom aktuellen Git-HEAD ab
(tote Funktion `pad()` läuft noch produktiv, mehrere Kommentar-Bereinigungen
fehlen live), und die eigene Rechts-Einschätzung spricht von der
Haushaltsausnahme, die „bei weiterer Ausweitung" wegfalle — obwohl laut
Projekt-Doku bereits *heute* eine zweite, familienfremde Familie aktiv
mitnutzt. Kein Ausfall, kein Datenleck, aber zwei Punkte, die vor dem
nächsten Nutzerkreis-Wachstum echte Priorität verdienen.

---

## 2. Bewertungstabelle

| Kategorie | Ampel | Kernaussage |
|---|---|---|
| 1. Zweck & Nutzen | 🟢 | Löst das beschriebene Problem nachweislich, Value Proposition steht im ersten Absatz der Setup-Seite. |
| 2. Usability/UX | 🟢 | Klar, live getestet inkl. Fehlerzustand — verständliche deutsche Fehlermeldung statt Absturz. |
| 3. Barrierefreiheit | 🟢 | Kontrast, Fokus-Ringe, Zielgrößen, Labels, Landmarks — alle Stichproben live bestätigt. |
| 4. Security | 🟡 | Starke, verifizierte Maßnahmen; verbleibende bewusste Restrisiken (Klartext-Credentials, `unsafe-inline`-CSP) bleiben real. |
| 5. Recht & Compliance | 🟡 | Impressum/Datenschutz vollständig und ehrlich; aber Haushaltsausnahme ist nach eigener Doku wohl schon heute hinfällig, nicht erst „bei Ausweitung". |
| 6. Design | 🟢 | Ein gemeinsames Token-System, alle vier Seiten wirken aus einem Guss. |
| 7. Code-Qualität & Wartbarkeit | 🟡 | Sehr gute Praxis (Tests, Lint, Doku) — aber Live-Deployment hinkt dem Git-HEAD nachweisbar hinterher. |
| 8. Performance | 🟢 | Kein Messtool verfügbar [ungeprüft für Core Web Vitals], aber sehr schlanke Bytes: 49,7 KB HTML (14,8 KB gzip), keine Fremd-Assets. |
| 9. SEO & Auffindbarkeit | 🟢 | Bewusst nicht auffindbar (`Disallow: /`), sauber begründet und konsequent umgesetzt (auch `noindex` auf 404). |
| 10. Content-Qualität & Quellenarbeit | 🟢 | Quellen (eRecht24, Wikipedia/MIT) sauber verlinkt, keine unbelegten Sachaussagen gefunden. |

---

## 3. Detailbefunde

### 1. Zweck & Nutzen 🟢

Der Betreiber-Zweck (ein Blick statt mehrerer Logins) wird direkt erfüllt.
Der erste Absatz der Setup-Seite formuliert die Value Proposition sofort,
ohne Scrollen: *„Zeigt den täglichen Stundenplan & Schulessen-Status Deiner
Kinder an einer Stelle an, ohne dass Du Dich überall einzeln einloggen
musst."* (live gesehen beim ersten Aufruf ohne Konfiguration). Live mit
Test-Zugangsdaten geprüft: Dashboard, Tag-Umschalter, Fehleranzeige
funktionieren wie beschrieben. Keine überflüssigen Funktionen gefunden — der
Funktionsumfang ist bewusst auf Lesen begrenzt (kein Bestellen/Stornieren,
`PROJEKT.md` Abschnitt 3 „Nicht-Ziele"), was zum Zweck passt.

### 2. Usability/UX 🟢

- Setup → Dashboard-Fluss ist selbsterklärend, ohne Anleitung bedienbar
  (eigener Test: Kind anlegen, Speichern, Dashboard erscheint automatisch).
- **Fehlerzustand live getestet:** Mit erfundenem WebUntis-Passwort erschien
  eine klare deutsche Meldung: *„⚠ Stundenplan: WebUntis-Login
  fehlgeschlagen — Benutzername oder Passwort prüfen. · Schulessen:
  Mensamax-Konfiguration unvollständig (base/username/password)"* — kein
  Absturz, kein unübersetzter Stacktrace, kein Dead-End; die Karte bleibt
  bedienbar (Tag-Umschalter, Einstellungen weiter erreichbar).
- Mobile Ansicht (375×812, live emuliert): Layout bricht sauber um, Touch-Ziele
  wirken großzügig, FAB-Refresh-Button unten rechts kollidiert mit nichts.
- 🟢 Kleinigkeit: Kein `<noscript>`-Hinweis für den Fall deaktivierten
  JavaScripts — bei einer vollständig JS-getriebenen Seite ohne serverseitiges
  Rendering zeigt sich sonst nur eine leere Seite ohne Erklärung.

### 3. Barrierefreiheit 🟢

Gegen WCAG 2.2 AA geprüft, mehrere Behauptungen aus dem Code selbst live
nachgerechnet statt nur gelesen:

- **Kontrast Dunkelmodus** (`.btn-primary` u. a.): Live per JS gemessen:
  `background-color: rgb(95, 183, 135)`, `color: rgb(20, 24, 21)` — exakt die
  im Code dokumentierten `#5fb787`/`#141815`, rechnerisch ~7,35:1, klar über
  dem AA-Minimum 4,5:1 (SC 1.4.3).
- **Zielgrößen** (SC 2.5.8, AA, min. 24×24 CSS-Pixel): Live per
  `getBoundingClientRect()` gemessen — Zahnrad-Button 38,4×38,4 px,
  Refresh-FAB 54,4×54,4 px. Beide deutlich über dem Minimum.
- **Tastaturbedienbarkeit:** Zwei `Tab`-Drücke live getestet — sichtbarer
  grüner Fokusring auf dem Zahnrad-Icon-Button, entspricht
  `outline:2px solid var(--accent)` aus `theme.css`.
- **Formular-Labels:** `web/index.html` verknüpft jedes Feld per generierter
  `id`/`for`-Zuordnung (`feldId = 'feld-' + child.id + '-' + ...`), im Code
  bestätigt (Zeilen 615–630) — verhindert Kollisionen bei mehreren Kindern.
- **Semantik:** `role="banner"`/`main`/`contentinfo`-Landmarks vorhanden,
  Überschriftenfolge h1 → h2 ohne Sprung (Accessibility-Tree live geprüft).
  `aria-live="polite"` auf den nachladenden Karten, `aria-pressed` auf dem
  Tag-Umschalter, `aria-busy` während des Refreshs — alles im Code vorhanden
  und im DOM live bestätigt.
- **BFSG-Hinweis:** Das Barrierefreiheitsstärkungsgesetz (BFSG) trifft primär
  bestimmte Verbraucherverträge/E-Commerce-Dienstleistungen. Für ein
  unentgeltliches, an einen kleinen bekannten Kreis gerichtetes Familientool
  ist eine BFSG-Pflicht nach meiner Einschätzung eher nicht einschlägig —
  das ist aber keine Rechtsauskunft, nur eine Einordnung; bei echter
  kommerzieller Öffnung wäre das neu zu bewerten.
- 🟢 Kein `alt`-Text-Problem gefunden, da keine inhaltstragenden `<img>`
  existieren (nur das SVG-Icon, dekorativ).

### 4. Security 🟡

Sehr solide, mehrfach live verifiziert — mit einigen bewusst akzeptierten
Restrisiken, die eine strengere Bewertung als „durchweg grün" verhindern:

- **HTTPS/HSTS:** `curl -I https://heute-schule.pages.dev/` liefert
  `strict-transport-security: max-age=31536000; includeSubDomains`; HTTP→HTTPS
  live per 301 bestätigt.
- **Security-Header vollständig, live gemessen:**
  `content-security-policy: default-src 'self'; script-src 'self'
  'unsafe-inline'; ... object-src 'none'; base-uri 'self'; form-action
  'none'; frame-ancestors 'none'`, dazu `x-frame-options: DENY`,
  `x-content-type-options: nosniff`, `referrer-policy:
  strict-origin-when-cross-origin`, `permissions-policy: geolocation=(),
  camera=(), microphone=(), payment=(), usb=()`. Deckt sich exakt mit
  `web/_headers`.
- 🟢 Kleinigkeit: Auf den statischen Seiten liefert Cloudflare Pages
  `access-control-allow-origin: *` (Cloudflare-Pages-Standard, nicht
  projektspezifisch gesetzt). Da hier keine sitzungsgebundenen/geheimen
  Inhalte ausgeliefert werden, ist die praktische Auswirkung gering — aber
  bei einer sonst so eng gefassten Policy fällt der Kontrast auf.
- **CORS des Proxys korrekt eingeschränkt:** `curl -X OPTIONS -H "Origin:
  https://evil.example" .../api/status` liefert weiterhin
  `access-control-allow-origin: https://heute-schule.pages.dev` — der Wert
  wird nicht reflektiert, sondern ist statisch aus `wrangler.toml`
  (`ALLOWED_ORIGIN`). Fremde Seiten können den Proxy per Browser-JS nicht im
  Namen eines Besuchers ansprechen.
- **SSRF-Schutz** (`proxy/hostcheck.mjs`): Code-Review + 87/87 grüne Tests
  (`node run-tests.mjs`, lokal ausgeführt) decken Loopback, RFC1918,
  Link-lokal/Cloud-Metadata (`169.254.169.254`), Zugangsdaten-in-URL und
  Suffix-Tricks (`webuntis.com.angreifer.example`) ab.
- **Cache-Key-Authentifizierung** (`proxy/cachekey.mjs`): Zugangsdaten sind
  Teil des SHA-256-Schlüsselmaterials — Code-Review bestätigt, dass ein
  Cache-Treffer ohne korrektes Passwort keinen anderen Schlüssel trifft;
  8 Regressionstests dafür vorhanden und grün.
- **Rate-Limit:** `RATE_LIMIT_PRO_MINUTE = 30`, Cache-API-basiert pro
  gehashter IP/Minute (`proxy/worker.js` Zeile 49–88). Nicht selbst
  stresstestet (siehe Zugriffslage) — die Grenzen (nicht atomar, pro
  Cloudflare-Rechenzentrum) sind im Code selbst offen benannt, keine
  Übertreibung.
- **Keine Secrets im Client-Code:** Die im Code sichtbare `PROXY_URL`
  (`stundenplan-proxy.bluedemann.workers.dev`) ist bewusst öffentliche
  Infrastruktur-Adresse, kein Geheimnis — SSRF-Allowlist und CORS sichern die
  eigentliche Angriffsfläche ab.
- **`unsafe-inline` in der CSP** (script-src/style-src): Nachvollziehbar
  begründet (keine Build-Pipeline, siehe Kommentar in `web/_headers`) — aber
  in der Konsequenz bedeutet das: Die CSP bietet **keinen** Schutz mehr gegen
  eingeschleusten Inline-Code, sollte je eine XSS-Lücke gefunden werden. Die
  einzige verbleibende Verteidigungslinie ist Code-Disziplin. Diese Disziplin
  ist aktuell tatsächlich eingehalten — `grep innerHTML web/index.html`
  zeigt ausschließlich `.innerHTML = ''` (Leeren), nirgends wird
  Fremd-/Nutzerdaten per `innerHTML` gesetzt; alle dynamischen Werte laufen
  über `textContent`/`createElement` (z. B. Zeile 890 `span.textContent =
  s.fach + ' · ' + s.raum`). Das ist eine echte Stärke — sie ändert aber
  nichts daran, dass die CSP selbst als Netz unter dieser Disziplin nicht
  mehr trägt.
- **Klartext-Zugangsdaten in `localStorage`:** Bewusste, in `PROJEKT.md`
  Abschnitt 5 ausführlich begründete Entscheidung. Das Risiko ist real (mit
  Mensa-Zugangsdaten lässt sich echtes Geld ausgeben), die Risikoabwägung
  nachvollziehbar, aber es bleibt ein Restrisiko, das bei geteilten
  Familien-Geräten (Kinder mit DevTools-Zugriff) am ehesten zum Tragen kommt.
- `npm audit` (lokal ausgeführt): **0 Schwachstellen** — plausibel, da
  `package.json` keine Produktions-Abhängigkeiten listet (nur `eslint`,
  `@eslint/js`, `globals` als Dev-Tooling, nicht Teil der ausgelieferten
  Seite).

### 5. Recht & Compliance 🟡

- **Impressum** (live unter `/impressum`): Vollständig ausgefüllt gemäß § 5
  DDG (Name, Anschrift, Telefon, E-Mail, Haftungshinweis zu
  Drittanbieter-Daten) — korrekt der aktuelle Rechtsbegriff (DDG statt des
  seit 2024 abgelösten TMG).
- **Datenschutzerklärung** (live unter `/datenschutz`): Inhaltlich stimmig
  zum tatsächlichen Datenfluss — beschreibt explizit, dass der Proxy
  Zugangsdaten technisch im Klartext sehen *könnte*, auch wenn er nichts
  loggt; das ist ungewöhnlich offen für einen Rechtstext und positiv
  hervorzuheben. Keine Cookies, keine Tracking-Tools — im Code bestätigt
  (keine `document.cookie`-Setzung, kein Analytics-Skript, kein externer
  `<script src>`).
- **AVV mit Cloudflare:** Wird in Abschnitt 3 behauptet und verlinkt
  (Cloudflare Data Processing Addendum), mit Verweis auf eine
  Dashboard-Prüfung vom 28.08.2026. **[ungeprüft]** — ich habe keinen Zugriff
  auf das Cloudflare-Konto des Betreibers und kann diese Behauptung nicht
  selbst verifizieren.
- 🟡 **Haushaltsausnahme — eigener Befund, Kernpunkt dieses Berichts:** Die
  Datenschutz-Doku (`OFFEN-naechste-Fixes.md`, Punkt 1; `PROJEKT.md`
  Abschnitt 7) formuliert die volle DSGVO-Verantwortlichkeit durchgängig als
  *zukünftige* Bedingung: „Haushaltsausnahme … fällt weg, **sobald** weitere
  fremde Familien mitnutzen" bzw. „**Vor** weiterer Ausweitung prüfen"
  (`web/README.md`). Dieselbe Projekt-Dokumentation hält in `PROJEKT.md`
  Abschnitt 1 aber fest: „**Mit der Zeit kam eine zweite Familie dazu**
  (Essensanbieter ccCampus statt Mensamax)" — also bereits *heute* eine
  aktive, familienfremde Nutzerin. Die Haushaltsausnahme (Art. 2 Abs. 2
  lit. c DSGVO) deckt ausschließlich rein persönliche/familiäre Tätigkeiten
  ab; sie kennt keine Zwischenstufe für „nur eine befreundete Familie ist
  schon ok". Nach meiner — unverbindlichen, laienhaften — Lesart der eigenen
  Projektfakten ist der Betreiber damit bereits jetzt voller
  DSGVO-Verantwortlicher für die Daten der zweiten Familie, nicht erst bei
  einer *weiteren* Ausweitung. Die Konsequenz ist nicht zwangsläufig
  dramatisch (TOMs und eine verständliche Datenschutzerklärung liegen ja
  bereits vor), aber die **Dringlichkeits-Einstufung** der offenen
  juristischen Prüfung sollte entsprechend höher angesetzt werden, als die
  aktuelle Formulierung „vor weiterer Ausweitung" nahelegt.
- **Lizenzen:** MIT (`LICENSE`, live bestätigt), keine externen JS-Bibliotheken
  oder Web-Fonts gefunden (`font-src 'self'` in der CSP, keine
  `fonts.googleapis.com`-Einbindung) — keine Attributionspflichten verletzt.
  Quelle für Rechtstext-Bausteine (eRecht24) korrekt mit Link genannt.
- `robots.txt` mit `Disallow: /` bewusst gewählt, um u. a. zu verhindern,
  dass das Impressum mit Privatanschrift in Suchtreffern landet — sinnvolle,
  im Kommentar selbst erklärte Maßnahme.

### 6. Design 🟢

Ein gemeinsames Token-System (`theme.css`) für Farben/Typografie über alle
vier Seiten (App, Impressum, Datenschutz, Über) hinweg, live auf allen
Seiten mit identischer Kopfzeile/Navigation bestätigt. Die App-spezifischen
Regeln bleiben bewusst inline in `index.html` (dokumentierte
Architekturentscheidung) — wirkt konsistent, nicht wie zusammengesetzt.
Farbpalette ruhig (Grün als Akzent, kein visuelles Rauschen), Icon ist ein
einfaches Emoji-in-SVG (📚) — funktional, aber ohne eigene Bildsprache; für
den Umfang des Projekts angemessen.

### 7. Code-Qualität & Wartbarkeit 🟡

Insgesamt überdurchschnittlich für ein Ein-Personen-Projekt — mit einem
konkreten, hier erstmals dokumentierten Abweichungsbefund:

- **87 Tests, 0 fehlgeschlagen** (`node run-tests.mjs`, selbst ausgeführt).
  Abdeckung reicht von reiner Geschäftslogik bis zu sicherheitskritischen
  Regressionstests (SSRF, Cache-Bypass) — ungewöhnlich gut für dieses
  Projektvolumen.
- **ESLint sauber** (`npx eslint .`, keine Ausgabe = keine Verstöße), Regeln
  eigenständig am Google-JS-Styleguide ausgerichtet, mit begründeter
  Ausnahme für `web/index.html` (bewusst ES5 für Altgeräte-Kompatibilität).
- **Dokumentation** außergewöhnlich ausführlich: `PROJEKT.md` mit
  Entscheidungs-Log inkl. verworfener Alternativen, `OFFEN-naechste-Fixes.md`
  als lebendige Aufgabenliste, Kommentare im Code erklären *Warum*, nicht nur
  *Was* (z. B. der zitierbare Kommentar zum Cache-Key-Fehler in
  `cachekey.mjs`).
- 🟡 **Live-Deployment weicht vom Git-HEAD ab (eigener Fund).** Der Prüfauftrag
  geht davon aus, „HEAD entspricht dem Live-Stand" — das stimmt zum
  Prüfzeitpunkt nicht mehr durchgängig:
  - `web/index.html` (live) vs. lokal: zwei Kommentarblöcke unterscheiden
    sich wörtlich (ältere, vor der Commit `0247bb4`
    „Journal-Comment-Aufräumung" geschriebene Fassungen laufen noch live,
    z. B. „Aus dem Betatest bestätigt (28.08.), dass …" statt der
    bereinigten Fassung ohne Datumsbezug).
  - `proxy/worker.js` (live über `/source/proxy/worker.js` einsehbar) enthält
    noch eine **tote Funktion** `function pad(n) { return
    String(n).padStart(2, '0'); }`, die im aktuellen lokalen Code gar nicht
    mehr existiert (`grep -n "pad(" proxy/worker.js` liefert lokal keinen
    Treffer) — sowie ältere `catch (e) { … }`-Syntax statt der aktuellen
    `catch { … }`/`{ cause: e }`-Fassungen.
  - `proxy/hostcheck.mjs` und `proxy/cachekey.mjs` zeigen dieselbe Art
    Drift — funktional unverändert, aber nicht identisch mit dem, was im
    Repo als „aktuell" geführt wird.
  - Sicherheitsrelevant ist das nicht (alle Unterschiede sind Stilbereinigung
    oder toter Code), aber es zeigt eine Lücke im eigenen Prozess: Das in
    Commit `e1110de` eingeführte Konsistenz-Gate in `deploy.sh` prüft nur, ob
    `web/source/`/`web/docs/` mit den lokalen Originaldateien
    übereinstimmen — **nicht**, ob der zuletzt deployte Live-Stand mit dem
    aktuellen Git-HEAD übereinstimmt. Genau diese Lücke lässt sich mit
    einfachen Mitteln nicht schließen (Cloudflare Pages liefert von sich aus
    keinen Hash des deployten Commits nach außen) — wert, das nächste Mal
    beim Deploy-Tooling mitzudenken (z. B. einen Kommentar mit Commit-Hash im
    HTML selbst).
- **Bus-Factor** offen und ehrlich in `PROJEKT.md` Abschnitt 13 benannt (Ein-
  Personen-Projekt) — keine Beschönigung.
- **GitHub-Spiegelung** verifiziert: `https://github.com/blue-demann/heute-schule`
  liefert unauthentifiziert `404 Page not found` — bestätigt, dass das Repo
  tatsächlich privat ist, wie im Prüfauftrag behauptet.

### 8. Performance 🟢

**[ungeprüft für Core Web Vitals]** — kein Lighthouse/axe-Zugriff in dieser
Umgebung, siehe Zugriffslage. Qualitative/strukturelle Belege sprechen aber
für gute Werte:

- `web/index.html`: 49.696 Bytes unkomprimiert, 14.800 Bytes gzip (selbst
  gemessen, `gzip -c web/index.html | wc -c`) — eine komplette App inkl.
  Setup-Formular, Dashboard-Logik und Fehlerbehandlung in unter 15 KB
  komprimiert ist sehr schlank.
- Keine Web-Fonts (System-Font-Stack in `theme.css`), keine
  Drittanbieter-Skripte, kein Bild außer einem 279 Byte kleinen Inline-SVG.
- Cloudflare Pages als CDN-Hosting (Edge-Auslieferung), `cache-control:
  public, max-age=0, must-revalidate` auf der Startseite plus Service-Worker
  mit Network-first-Strategie — vernünftige Kombination für eine PWA, die
  aktuelle Daten *und* Offline-Fallback will.

### 9. SEO & Auffindbarkeit 🟢

Bewusste Entscheidung *gegen* Auffindbarkeit, sauber umgesetzt und live
bestätigt: `robots.txt` liefert `User-agent: *\nDisallow: /`, mit
Begründung im Kommentar (Impressum mit Privatanschrift soll nicht in
Suchtreffern landen). Die 404-Seite trägt zusätzlich `<meta name="robots"
content="noindex">`. Für ein Tool, das laut eigenem Anspruch nur „vorsichtig"
im Bekanntenkreis wachsen soll, ist das konsequent — keine widersprüchliche
Signalisierung gefunden (z. B. keine Sitemap trotz Indexierungsverzicht,
ebenfalls im Kommentar begründet).

### 10. Content-Qualität & Quellenarbeit 🟢

Wenig Fließtext-Content abseits der Rechtstexte, dafür sauber belegt: Die
Datenschutzerklärung nennt eRecht24 explizit mit Link als Basis für
Standardabschnitte, die Über-Seite verlinkt MIT-Lizenz-Erklärung auf
Wikipedia statt sie zu behaupten. Technische Aussagen im Code/den Docs
(„ccCampus blockiert Cloudflare Workers mit HTTP 403", „ASP.NET_SessionId
taugt nicht als Erfolgssignal") sind an mehreren Stellen ausdrücklich als
empirisch verifiziert statt angenommen gekennzeichnet — genau die Art
Beleg-Disziplin, die man sich auch in Testberichten selbst wünscht.

---

## 4. Priorisierte Handlungsempfehlungen (Top 5)

1. **🟡 Rechtliche Einstufung korrigieren und Prüfung beschleunigen.** Die
   eigene Doku sollte die Formulierung „vor weiterer Ausweitung" durch etwas
   wie „bereits jetzt, da eine zweite Familie aktiv mitnutzt" ersetzen, und
   die seit dem Peer-Review offene juristische Einschätzung entsprechend
   priorisieren — nicht weil die vorhandenen TOMs schlecht wären, sondern
   weil die Doku selbst gerade eine falsche zeitliche Entwarnung gibt.
   Aufwand: gering (Textkorrektur) plus die ohnehin schon geplante externe
   Beratung.
2. **🟡 Live-Deployment auf aktuellen Stand bringen.** `./deploy.sh` (bzw.
   `./deploy.sh web` und `./deploy.sh proxy`) einmal durchlaufen lassen, damit
   die tote `pad()`-Funktion und die veralteten Kommentare nicht länger
   produktiv liegen. Aufwand: minimal, da laut `PROJEKT.md` bereits
   Tooling dafür existiert — es muss nur ausgeführt werden.
3. **🟡 Erkennbarkeit von Deployment-Drift verbessern.** Ergänzend zum
   bestehenden Konsistenz-Gate in `deploy.sh` (das nur `web/source`/`web/docs`
   gegen die lokalen Originale prüft) einen Mechanismus einführen, der auch
   den *live* ausgelieferten Stand gegen den Git-HEAD abgleichen kann — z. B.
   ein Kommentar mit Commit-Hash im HTML-Head, den ein Skript nach dem
   Deploy gegen `git rev-parse HEAD` prüft. Aufwand: klein bis mittel.
4. **🟢 CSP langfristig ohne `unsafe-inline`.** Kein akuter Handlungsbedarf,
   aber als Fernziel im Hinterkopf behalten (z. B. bei einer künftigen
   größeren Überarbeitung Hash-basierte CSP statt `unsafe-inline`
   einführen) — die aktuelle Begründung (kein Build-Schritt) ist
   nachvollziehbar, aber die CSP verliert dadurch ihre Funktion als
   zweite Verteidigungslinie gegen XSS.
5. **🟢 Kosmetik nachziehen:** `<noscript>`-Hinweistext ergänzen und die
   selbst als offen erkannten PNG-App-Icons für iOS-Homescreens nachliefern
   (beides bereits im eigenen `web/README.md` als bekannte Lücke geführt,
   hier nur bestätigt und priorisiert eingeordnet).

---

## 5. Gesamturteil

„Heute Schule" ist ein Beispiel dafür, wie viel handwerkliche Sorgfalt ein
Ein-Personen-Projekt in einen kleinen, klar begrenzten Nutzerkreis stecken
kann: Die Security-Grundlagen halten einer eigenständigen Nachprüfung stand
(SSRF-Schutz, Cache-Authentifizierung, Rate-Limit, vollständige
Security-Header, saubere CORS-Eingrenzung — alles live verifiziert, nicht
nur behauptet), die Barrierefreiheit ist mit echten Messwerten statt bloßer
Behauptung belegt, und die Rechtstexte sind ungewöhnlich ehrlich formuliert,
inklusive einer offenen Aussage darüber, was der Betreiber technisch
mitlesen *könnte*. Die Fehlerbehandlung ist im Live-Test tatsächlich
nutzerfreundlich, nicht nur auf dem Papier.

Die beiden echten Lücken, die diese Prüfung beisteuert, sind kein
Sicherheitsproblem, sondern Prozess- und Framing-Fragen: Erstens läuft die
Live-Website nicht mehr exakt auf dem Stand des Git-HEAD, was zwar aktuell
nur kosmetische und tote Codeteile betrifft, aber zeigt, dass das
bestehende Konsistenz-Gate eine Lücke hat. Zweitens — und das wiegt
schwerer — beschreibt die eigene Projektdokumentation die volle
DSGVO-Verantwortlichkeit als Zukunftsfrage, obwohl laut derselben
Dokumentation bereits heute eine zweite, familienfremde Familie aktiv
mitnutzt; die Haushaltsausnahme dürfte damit schon jetzt nicht mehr greifen,
nicht erst „vor weiterer Ausweitung". Nichts davon deutet auf Nachlässigkeit
hin — im Gegenteil, das Projekt hat in früheren Runden bereits einen echten
Auth-Bypass und mehrere A11y-Mängel gefunden und behoben, und die Dokumentation
ist bemerkenswert transparent über offene Punkte. Für den aktuellen, sehr
kleinen und vertrauten Nutzerkreis erfüllt die Seite ihren Zweck zuverlässig
und mit überdurchschnittlicher technischer Sorgfalt; vor einem weiteren
Wachstum des Nutzerkreises sollten aber genau die zwei hier genannten Punkte
zuerst geschlossen werden.
