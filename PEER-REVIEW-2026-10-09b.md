# Peer-Review „Der beste Freund“ — Wartungs-Vorhaben 0.3.3 (Prüfer, Typprüfung, Validierung)

HS-PRV-007 · v1 · 2026-10-09 · 53711605 · Momentaufnahme

**Prüfobjekt:** Commits `0b825d6..2c43ec5` (neun Commits, Version 0.3.3) und
ihre Behauptungen über sich selbst: Commit-Nachrichten, „Erledigt“-Einträge in
`OFFEN-naechste-Fixes.md`, `PROJEKT.md` (Entscheidungs-Log ES2019, Abschnitte
6, 8, 9, 10, Release-Historie), `README.md`, `proxy/README.md`,
`web/README.md`, `prompts/README.md`.
**Prüfer:** unabhängige Runde ohne Vorwissen über die Sitzung, die die
Änderungen geschrieben hat, 09.10.2026.
**Zugriff:** Quellcode (Git, HEAD = `2c43ec5`), Testsuite, Lint, Typprüfung,
`npm audit` lokal, lokale Workers-Runtime `workerd 2026-10-06` aus
`node_modules` (ohne wrangler, ohne Netz), Live-Website (GET), Live-Proxy
(4 von erlaubten 20 Anfragen, nur `.invalid`-Ziele bzw. Eingaben, die vor
jedem Abruf abgelehnt werden), Web-Recherche zum WebUntis-JSON-RPC.
**Methode:** Mutanten und Sonden ausschließlich in einer Kopie von HEAD im
Scratchpad (`git archive`, `node_modules` als Symlink). Im Projektordner wurde
außer dieser Datei nichts geändert; `git status` war nach jedem Experiment leer.

---

## 1. Kurzeinschätzung

Das ist solide Arbeit. Ich habe die Gegenproben nachgestellt, und die meisten
stimmen exakt: Sprachstand 2022 macht 6 Tests rot, die abgeschaltete
Lizenzprüfung 4, der alte Worker 4, und das Audit-Gate scheitert ohne Registry
tatsächlich geschlossen. Website und Proxy laufen nachweislich auf HEAD. Was
ich dir vor dem Abhaken mitgeben würde: Das Audit-Gate prüft das Lockfile und
nicht das, was `npx --no-install wrangler` wirklich ausführt. Mit
`NODE_ENV=production` sieht es gar nichts mehr, weil per Lizenztest alles
devDependency ist. Und die Behauptung „Strukturfehler werden nicht mehr als
‚Passwort falsch‘ gemeldet“ stimmt nur für JSON-Antworten. Eine HTML-Seite,
eine leere Antwort oder ein 302 auf `authenticate` schicken Eltern weiterhin
zum Passwort-Ändern. Außerdem kehrt das Muster aus der letzten Runde wieder:
Die Tests merken nicht, wenn der Worker einen Validator gar nicht aufruft.

---

## 2. Verifikationstabelle

| Behauptung | Ergebnis | Beleg |
|---|---|---|
| `npm test`, `npm run lint`, `npm run typecheck`, `npm audit --audit-level=high` grün | ✅ | `218 Tests: 218 ✓ 0 ✗`, lint Exit 0, `tsc` Exit 0, `found 0 vulnerabilities` Exit 0. `npm ls --all` Exit 0, das installierte `node_modules` passt also zum Lockfile. |
| Deploy nur aus sauberem Arbeitsbaum, als Erstes, vor dem Schlüsselbund | ✅ | `deploy.sh:31`, vor `security find-generic-password` (`:46`). Mutant „`exit 0` am Skriptanfang“: `214 ✓ 4 ✗` (geändert, gestagt, neue Datei, kein Git-Repo). Du nennst 3 rot. Vermutlich war dein Mutant ein anderer (nur die Statusprüfung entfernt), kein Widerspruch. Lücken siehe A-6. |
| `npm audit` als Gate „fail closed“, auch ohne Registry | ✅ mit Einschränkung | Eigene Gegenprobe im Scratchpad mit Lockfile `minimist@1.2.0`: Exit 1. Mit `--registry=http://127.0.0.1:9/`: Exit 1. Ohne Netz bricht es also wirklich ab. Es gibt aber zwei andere Wege zu falschem Grün, siehe A-1. |
| Gegenprobe Audit: `minimist@1.2.0` Exit 1, `1.2.8` Exit 0 | ✅ | nachgestellt, identisch |
| wrangler exakt gepinnt, mit Lockfile-Prüfsumme, für Audit sichtbar | ✅ | `package.json`: `"wrangler": "4.149.0"`. Lockfile: alle 228 Pakete von `registry.npmjs.org`, alle mit `integrity`. `node_modules/wrangler` = 4.149.0. |
| „ohne `npm ci` gibt es keinen Deploy“ (README, Kommentar `deploy.sh:36-39`) | ⚠️ | `--no-install` verhindert nur den Ad-hoc-Download. Ob `node_modules` zum Lockfile passt, prüft nichts (siehe A-1). Außerdem laufen `npx c8` (`:74`) und `npx eslint` (`:82`) ohne `--no-install`. |
| ESLint: `no-eval`, `no-implied-eval`, `no-new-func`, `innerHTML` & Co., `no-console` im Proxy | ✅ mit Grenzen | Positivkontrollen in `index.html`: `innerHTML = …`, `['innerHTML'] = …`, `eval(…)`, `setTimeout('…')` werden gemeldet. Mutant „eval-Regeln entfernt“: 3 rot. Nicht erfasst werden `Object.assign(el, {innerHTML})`, `el['inner'+'HTML']`, `createContextualFragment`, `DOMParser.parseFromString`, `setHTMLUnsafe`, `setAttribute('on…')`, `a.href = fremd`, `window['ev'+'al']`. Das ist eine Eigenschaft der Regeln und kein Konfigurationsfehler. Siehe D-1. |
| Die fünf `innerHTML = ''` sind jetzt `textContent = ''`, keine Ausnahme nötig | ✅ | `git show d48b461 -- web/index.html`: 5 Ersetzungen. `grep -c innerHTML` in `index.html`, `ueber.html`, `sw.js`: 0, 0, 0. Fürs Leeren sind beide Varianten gleichwertig. |
| Syntax-Ziel ES2019, per `ecmaVersion: 2019` durchgesetzt; „läuft ab iOS 11.3 / Chrome 66“ | ⚠️ | Für die meiste Syntax stimmt das. `?.`, `1_000`, Regex-Flags `d`/`v` sind Parse-Fehler (Positivkontrolle). **Regex-Lookbehind `(?<=…)` ist aber ES2018, geht also durch, und Safari kann es erst ab 16.4.** Mutant `ecmaVersion 2022`: genau 6 rot ✅. Siehe D-2. |
| Header-Test der Pflichtteile plus Live-Vergleich nach dem Deploy | ✅ mit Lücken | `node tools/check-live-headers.mjs https://heute-schule.pages.dev/` Exit 0, Live-Header per `curl -sI` identisch mit `web/_headers`. Der Live-Vergleich warnt nur, nach dem Deploy (so dokumentiert). Mutanten, die die Prüfung **nicht** findet: `script-src-elem … https://cdn.example`, `connect-src 'self' https:`, `img-src https:`. Siehe A-5. |
| Lizenztest über das Lockfile, LGPL-Ausnahme nur `@img/sharp-*` | ✅ mit Randfehler | Mutant „lässt alles durch“: genau 4 rot. Die Ausnahme greift auf 14 Pakete (`sharp-libvips-*`, `sharp-wasm32`, `sharp-win32-*`), alle nur Werkzeug, nichts davon wird ausgeliefert. Die Begründung ist sauber. Präzedenzfehler bei Klammern siehe D-3. |
| `tsc --checkJs` strict über `proxy/*`, `stundenplan.js`, `web/sw.js`, `typescript@7.0.2` exakt | ✅ | `tsconfig.json`. Gegenprobe `requiredSuffix: 42` → `TS2322`, nachgestellt. Positiv: `webuntisRpc()` liefert `Promise<unknown>`. Wer einen Validator naiv entfernt, fällt deshalb bei `tsc` durch (`TS18046 'subjects' is of type 'unknown'`). |
| „Inline-Script nicht typgeprüft“ als offener Punkt | ✅ | ehrlich dokumentiert (OFFEN Punkt 3, `tsconfig.json`-Kommentar) |
| `sw.js`: offline ohne Cache-Treffer nicht mehr `undefined` an `respondWith()` | ✅ | `web/sw.js:53`. Für Nutzer:innen ändert sich nichts: Beide Varianten enden als Netzwerkfehler. „Unschärfe“ ist das richtige Wort, „Bug“ wäre zu viel. |
| Laufzeitvalidierung Request-Body: nur bekannte Felder als Text, sonst 400 | ✅ | Live: `klasse: 5` → `{"error":"Ungültiger Request-Body"}` HTTP 400. Ebenso 1001-Zeichen-Feld und `cccampus: "x"`. Kontrolle mit Strings → 200 mit Hostcheck-Meldung. Der alte Worker kannte nur „Ungültiger Request-Body (JSON erwartet)“. Die Antworten belegen also den neuen Code. |
| WebUntis-Antworten je Methode validiert; Strukturfehler → „unerwartete Antwort“, nicht mehr „Passwort prüfen“ | ⚠️ teilweise | Bei JSON mit falscher Form stimmt es. **Nicht-JSON (HTML, leer, 302) auf `authenticate` ergibt weiterhin „Benutzername oder Passwort prüfen“**, siehe A-2. |
| `sessionId` nur Token-Zeichen, „weil sie in den Cookie-Header geht (kein CR/LF, kein `;`)“ | ✅ als Härtung | Den CR/LF-Teil hätte die Runtime ohnehin verhindert, siehe K-1. |
| Gegenprobe: neue Worker-Tests gegen alten Worker 4 rot | ✅ exakt | `214 ✓ 4 ✗`: malformed answer, CR/LF, broken timetable entry, non-string field |
| Fünf Mutanten der Validierung je 1–3 rot | ✅ | nachgestellt: Uhrzeit egal 1, sessionId beliebig 3, Envelope-Fehlerform egal 1, `code`-Typ egal 3, `webuntis`-Teil ungeprüft 4 (über 3, aber eigener Mutant). Überlebende Mutanten siehe A-3. |
| Coverage „rund 96 %“ | ✅ | `c8`: All files 97,17 % Statements |
| Frontend-Server-Feld schneidet auch am Backslash ab | ✅ | `web/index.html:525` `value.split(/[/\\#?]/)[0]` |
| Hinweistext an allen drei Stellen ersetzt | ✅ | `index.html:225`, `:243`, `ueber.html:98`. Live 2 Treffer auf `/`. Kein „Demo“ mehr in Rechtstexten (auch nicht in den lokalen, nicht versionierten). |
| `web/docs/` und `web/source/proxy/` byte-gleich zum Original | ✅ | `cmp` für alle 7 Doku- und 4 Quellcode-Paare gleich |
| Live-Stand = HEAD | ✅ | `deploy-commit.txt` = `2c43ec5c…` = HEAD. `/ueber`: `VERSION = '0.3.3'`. `/`, `sw.js`, alle `source/proxy/*` und `docs/PROJEKT.md`/`OFFEN` SHA-gleich zu HEAD (`/index.html` liefert 308 nach `/`). Proxy: neue 400-Meldung live, siehe oben. |
| README: „nur, wenn Tests, Lint und `npm audit` durchgehen“ | ⚠️ veraltet | Die Typprüfung fehlt in der Aufzählung (`README.md:47`, `proxy/README.md:16`), siehe K-3 |

---

## 3. Korrekturen (an den Behauptungen, nicht am Code)

**K-1: CR/LF in der `sessionId` war nie ein Header-Injection-Weg.** In
`PROJEKT.md` Abschnitt 9 steht als Regressionstest „eine `sessionId` mit
CR/LF erreicht nie einen `Cookie`-Header“. Gegen den alten Worker ist dieser
Test nur rot, weil `mockFetch` ein nacktes Objekt annimmt. Die echte Runtime
lehnt solche Header selbst ab:

```
workerd 2026-10-06:  Headers "JSESSIONID=a\r\nX-Evil: 1": TypeError: Invalid header value.
Node 24:             TypeError: Headers.append: "JSESSIONID=a\r\nX-Evil: 1" is an invalid header value.
Kontrolle:           Headers "JSESSIONID=ok": akzeptiert   |   "JSESSIONID=a;b=c": akzeptiert
```

Die Regex ist trotzdem richtig. Sie verhindert `;`, also zusätzliche Cookies
an denselben WebUntis-Host, und liefert eine klare Meldung statt „Invalid
header value.“. Das ist aber Härtung und keine geschlossene Lücke. Dasselbe
Muster hatte ich dir letztes Mal bei Leerraum und Prozent-Kodierung
angemerkt (K-1 vom 09.10.).

**K-2: „Strukturfehler werden nicht mehr als ‚Passwort prüfen‘ fehlgedeutet“
gilt nur für JSON** (Commit `2388aaf`, OFFEN, PROJEKT Abschnitt 6). Beleg und
Folgen siehe A-2.

**K-3: Doku-Reste.**
- `CLAUDE.md:18-20` zählt beim Deploy weiter nur „Tests, Lint,
  Coverage-Info, Datei-Dump-Konsistenz-Gate und Live-vs-HEAD-Check“ auf. Es
  fehlen sauberer Arbeitsbaum, Typprüfung, Audit und Header-Vergleich. Gerade
  diese Datei lädt jede künftige Claude-Sitzung automatisch.
- `README.md:47` und `proxy/README.md:16`: Die Typprüfung fehlt, obwohl sie
  ein Gate ist (`deploy.sh:91`).
- `proxy/README.md:25`: „Diese URL trägst du in der Website unter
  ‚Einstellungen → Proxy-URL‘ ein“. Laut `web/index.html:417-418` ist die
  Proxy-URL fest und keine Einstellung mehr. `proxy/README.md:106` erklärt
  weiterhin, `wrangler login` lege ein Konto an. Der Commit `d48b461` nennt
  „veraltetes ‚wrangler login‘ ersetzt“. Ersetzt ist es nur im Deploy-Abschnitt.
- `PROJEKT.md` Abschnitt 6 (Validierung) sagt „jede WebUntis-Antwort“.
  Mensamax-HTML bleibt regex-basiert. Das ist vertretbar, sollte aber dort
  stehen, weil OFFEN als Problem „Antworten der Upstream-Dienste ungeprüft“
  nennt (Plural).

---

## 4. Zusatzbefunde

### A — Security in der Tiefe, Supply Chain, Betriebsrealität

**🟡 A-1: Das Audit-Gate hat zwei Wege zu falschem Grün.**

(a) *Es prüft das Lockfile, nicht das, was ausgeführt wird.* `npm audit`
bewertet den Baum aus `package-lock.json`. `npx --no-install wrangler` startet
dagegen, was in `node_modules` liegt. Gegenprobe im Scratchpad:

```
Lockfile minimist 1.2.8, node_modules/minimist 1.2.0:  npm audit Exit 0
ohne Lockfile (Ist-Baum 1.2.0):                        npm audit Exit 1
npm ls --all (Drift-Probe):                            Exit 1  | im echten Projekt: Exit 0
```

Ein `npm install` an falscher Stelle, ein liegengebliebener Stand oder ein
manipuliertes `node_modules` fällt dem Gate also nicht auf. `npm ls --all`
erkennt die Abweichung, positiv wie negativ belegt, und kostet eine Zeile in
`deploy.sh`.

(b) *Es wird blind, sobald dev-Abhängigkeiten ausgelassen werden.* Der
Lizenztest erzwingt, dass **alle** Pakete devDependencies sind.
`NODE_ENV=production` oder `omit=dev` in einer `.npmrc` blenden genau diese
aus:

```
minimist 1.2.0 (verwundbar), normal:                   Exit 1
NODE_ENV=production npm audit --audit-level=high:      "found 0 vulnerabilities", Exit 0
npm_config_omit=dev npm audit --audit-level=high:      Exit 0
NODE_ENV=production … --include=dev:                   Exit 1
```

Bei dir ist das derzeit nicht gesetzt (`npm config get omit` ist leer,
`NODE_ENV` ebenfalls). Ein Gate, das per Umgebungsvariable still grün wird,
ist aber kein „fail closed“. Abhilfe: `npm audit --audit-level=high
--include=dev` in `deploy.sh:103` und in der CI.

**🟡 A-2: Nicht-JSON-Antworten auf `authenticate` heißen weiter „Passwort prüfen“.**
`worker.js:202` erzeugt `WebUntis authenticate: keine gültige JSON-Antwort
(HTTP …)`, und `worker.js:231` deutet jedes Präfix `WebUntis authenticate:`
als abgelehntes Login. Sonde gegen den echten `fetch()`-Handler (Scratchpad,
`probes/auth-misread.mjs`):

```
JSON-RPC-Fehler (Positivkontrolle)        -> WebUntis-Login fehlgeschlagen — Benutzername oder Passwort prüfen.
result ohne sessionId (Strukturfehler)    -> WebUntis: unerwartete Antwort auf authenticate
HTML-Wartungsseite (503)                  -> WebUntis-Login fehlgeschlagen — Benutzername oder Passwort prüfen.
Weiterleitung 302                         -> WebUntis-Login fehlgeschlagen — Benutzername oder Passwort prüfen.
leere Antwort 200                         -> WebUntis-Login fehlgeschlagen — Benutzername oder Passwort prüfen.
```

Das Verhalten ist älter als 0.3.3. Seit 0.3.2 (`redirect: 'manual'`) landet
aber jede Weiterleitung hier, etwa wenn WebUntis eine Schule auf einen anderen
Server umzieht [ungeprüft, ob das so vorkommt]. Die Meldung wird zudem 4
Minuten gecacht. Die Folge im Alltag: Eltern ändern ein Passwort, das in
Ordnung war, oder sperren sich mit Wiederholungen aus. Abhilfe: Den
JSON-Fehler und Status ≠ 200 mit eigenem Präfix werfen („WebUntis: keine
gültige Antwort …“), dazu ein Worker-Test je Fall.

**🟡 A-3: Die Tests merken nicht, wenn der Worker einen Validator nicht aufruft.**
Das ist dasselbe Muster wie letzte Runde (A-3: fehlender
`checkSafeHttpsUrl`-Aufruf blieb unbemerkt). Mutanten in `worker.js`:

```
validateSubjects-Aufruf durch Cast ersetzt   → 218 ✓ 0 ✗
validateRooms-Aufruf durch Cast ersetzt      → 218 ✓ 0 ✗
validateClasses-Aufruf durch Cast ersetzt, Import entfernt
                                              → Tests 218 ✓ 0 ✗, tsc Exit 0, eslint Exit 0
```

Gegenprobe zur Methode: Nur den Aufruf zu entfernen, ohne Cast und ohne
Import-Bereinigung, fangen `tsc` (`TS18046`) und ESLint (unbenutzter Import).
Ein „Aufräumen“ mit einem JSDoc-Cast fängt dagegen kein Gate. Fehlt
`validateClasses`, führt `name: 5` wieder zu `k.name.toLowerCase is not a
function` in der App. Genau diese Art interner Meldung soll die Validierung
verhindern. Abhilfe: ein Worker-Test je Methode, z. B. „getKlassen mit
`name: 5` → ‚unerwartete Antwort auf getKlassen‘“. Für `authenticate` und
`getTimetable` gibt es solche Tests schon. Dass sie greifen, zeigt der Mutant
„authenticate nicht validiert“ (2 rot).

**🟡 A-4: Der Live-vs-HEAD-Check sieht nur die Website, nicht den Proxy.**
Der saubere Arbeitsbaum wird damit begründet, dass der Check am Ende „HEAD“
als Live-Stand nennt (`deploy.sh:27-29`). `deploy-commit.txt` entsteht aber nur
im Website-Zweig (`:162`). Nach `./deploy.sh proxy` wird nichts geprüft. Nach
`./deploy.sh web` meldet der Check „entspricht HEAD“, auch wenn der Proxy auf
einem alten Stand läuft. `/source/proxy/` zeigt dann Code, der gar nicht läuft.
Das ist genau die Klasse des bisher schwersten Befunds (🔴 01.09., A-1:
SSRF-Fix nie auf dem Proxy). Diesmal habe ich den Proxy-Stand nur indirekt
über eine neue Fehlermeldung belegen können. Abhilfe: Der Worker antwortet auf
`GET /api/version` mit einer Konstanten, die `deploy.sh` vor
`wrangler deploy` aus `git rev-parse HEAD` setzt (z. B. per `--var`), und
prüft sie danach wie die Website.

**🟢 A-5: Die CSP-Prüfung kennt Wildcards nur als `*`.**
`tools/headers.mjs:81-84` prüft `*` und `script-src`. Ohne Meldung gehen
durch (Mutanten an `web/_headers`, jeweils `218 ✓ 0 ✗`):
`script-src-elem 'self' 'unsafe-inline' https://cdn.example` (überschreibt
`script-src` für `<script>`-Elemente), `connect-src 'self' https:` (jedes Ziel,
also ein Exfiltrationsweg) und `img-src https:`. Positivkontrolle: Dieselbe
Prüfung meldet `script-src … https://cdn.example` (1 rot). Abhilfe: Scheme-
Quellen (`https:`, `http:`, `data:` außerhalb von `img-src`) wie `*`
behandeln, `script-src-elem`/`-attr` wie `script-src`.

**🟢 A-6: Randfälle des Arbeitsbaum-Gates.**
(1) `git update-index --skip-worktree` versteckt Änderungen vor `git status`.
Wegwerf-Repo: geänderte Datei → Exit 1 (Kontrolle), mit skip-worktree → Exit
0, Inhalt „zwei“. (2) Zeitfenster: Das Gate läuft am Anfang, hochgeladen wird
der Arbeitsbaum Sekunden später. In eurem Ablauf („Claude committet, Björn
deployt“) kann eine parallele Sitzung genau dazwischen committen. Dann sind
Tests und Upload verschiedene Stände, und `deploy-commit.txt` nennt den neuen.
Abhilfe für beides: HEAD am Start merken und unmittelbar vor jedem
`wrangler`-Aufruf Gate und HEAD-Gleichheit wiederholen.

**🟢 A-7: Supply Chain: Was das Lockfile jetzt bedeutet.**
Das Lockfile wuchs von 119 auf 228 Pakete, `node_modules` liegt bei 250 MB,
davon 129 MB `workerd` und 18 MB `@img`. Drei Pakete haben Install-Skripte:
`esbuild`, `workerd`, `fsevents`. Sie laufen jetzt bei jedem `npm ci`, auch in
der CI, die vorher wrangler nie installiert hat. wrangler 4.149.0 zieht
`miniflare 5.20261006.1-alpha`, eine Alpha-Version, die Cloudflare selbst
pinnt. Die Abwägung „Prüfsumme und Audit statt `npx --yes`“ halte ich trotzdem
für richtig. Vorher lief das Werkzeug mit dem Konto-Token ohne Lockfile, und
das Audit hat sofort eine echte hohe Lücke gefunden. Billige Härtungen:
`npm ci --ignore-scripts` in der CI (Tests, Lint und `tsc` brauchen keine
Install-Skripte, die tsc-7-Binärdatei kommt als optionale Abhängigkeit),
`permissions: contents: read` im Workflow (fehlt bisher), Actions per SHA
statt `@v7` und `github-actions` in `dependabot.yml`. Dazu `npx --no-install`
auch für `c8` und `eslint` (`deploy.sh:74`, `:82`). Fehlen diese in
`node_modules`, holt npm sie laut eigener Doku ad hoc und ungepinnt nach. Das
habe ich nicht ausgeführt, um nichts herunterzuladen [ungeprüft].

**🟢 A-8: Fehlerdiagnose bei strenger Validierung.**
Die Validierung lehnt eine ganze Tagesantwort ab, wenn ein einzelner Eintrag
nicht passt. Der Proxy loggt nichts (`no-console`, mit gutem Grund). Ändert
WebUntis eine Form, sehen alle Familien „unerwartete Antwort auf
getTimetable“, und du hast keinen Hinweis, welches Feld schuld ist. Vorschlag:
Den Feldnamen ohne Inhalt in die Meldung aufnehmen
(„… auf getTimetable (startTime)“).

**Zur Strenge gegenüber echten WebUntis-Antworten:** Die offizielle
JSON-RPC-Spezifikation ist nicht öffentlich. Die python-webuntis-Maintainer
verweisen dafür auf die Untis-Hotline, die offiziellen PDF-Anhänge auf
help.untis.at lieferten 404. Die geprüften Felder decken sich mit dem, was
Community-Clients voraussetzen. python-webuntis liest `id` aus `su`/`ro`/`kl`
ohne Fallback, `code` ∈ {`cancelled`, `irregular`, None}, Zeiten als
`startTime`/`endTime`. Beispiele zeigen ganze Zahlen im Format HHMM
(`1210`, `745`), Zusatzfelder wie `lsnumber`, `activityType` und `orgid`
sind erlaubt. Das deckt sich mit `validate.mjs`. Offen [ungeprüft]: ob
WebUntis je negative oder fehlende Stunden-`id`s oder Zeiten ab `2400` liefert.
Eine konkrete, normbasierte Lockerung empfehle ich für die `sessionId`
(`validate.mjs:98`). `[A-Za-z0-9._-]` schließt `+`, `/` und `=` aus, die in
Cookie-Werten nach RFC 6265 Abschnitt 4.1.1 (`cookie-octet`) erlaubt sind.
Stellt WebUntis auf Base64-Tokens um, wären alle Familien gleichzeitig
ausgesperrt. Die Allowlist sollte deshalb `cookie-octet` sein. Das schließt
`;`, `,`, `"`, `\`, Leerraum und Steuerzeichen weiterhin aus.

### B — CCC-Perspektive

**🟢 B-1: Der Validator ist der natürliche Ort für Datensparsamkeit und lässt
ihn ungenutzt.** Für Mensamax-Kinder schickt das Frontend `lunch: child.lunch`
mit (`index.html:1106`), einschließlich `cccampus.kundennummer`/`pin`, falls
die Familie früher ccCampus eingetragen hatte. `validateRequestBody` behält
genau diese Felder (`CCCAMPUS_FIELDS`), obwohl der Proxy ccCampus nie abfragt.
Sie fließen nur noch gehasht in den Cache-Schlüssel. Vorschlag: `cccampus` im
Validator verwerfen und im Frontend für Mensamax nicht mitsenden.

### C — Familienvater-/Alltagsblick

**🟢 C-1: Eine 400-Antwort zeigt den Eltern nur „HTTP 400“.**
`index.html:1111` verwirft den Body. Die verständliche Meldung („Ungültiger
Request-Body“) erreicht also niemanden. Mit echten, über das Formular
gespeicherten Konfigurationen kommt das nicht vor. Alle Werte stammen aus
`input.value` und sind Text, unbekannte Felder fallen weg. Es betrifft nur
Altlasten oder Handarbeit. Gespeicherte Konfigurationen bricht 0.3.3 nach
meiner Durchsicht von `loadConfig`/`fetchChild` nicht.

### D — Nerd-Detailblick

**🟢 D-1: Was „kein HTML aus Strings“ nicht abdeckt.** Siehe Tabelle. Real
relevant ist im Code eine URL-Senke, keine HTML-Senke: `index.html:806/810`
setzt `lunchLink.href` aus der selbst eingegebenen Basis-URL. Mit
`javascript:…` wäre das Self-XSS. Die CSP stoppt das nicht:
`'unsafe-inline'` erlaubt `javascript:`-URLs. Weil es keinen Import- oder
Teilen-Weg für Konfigurationen gibt, ist das Risiko gering. Ein
`https:`-Check vor dem Setzen kostet aber eine Zeile.

**🟢 D-2: ES2019 ist nicht gleich „iOS 11.3“, und `sw.js` wird gegen ES2022
typgeprüft.** (1) Regex-Lookbehind ist ES2018 und besteht `ecmaVersion: 2019`
ohne Meldung. Safari kann ihn erst ab 16.4, ein einziger Lookbehind im
Inline-Script wäre auf älteren iPhones ein Syntaxfehler, also eine leere App.
Heute steht keiner im Code. (2) `tsconfig.json:14,17` (`target`/`lib
es2022`) gilt auch für `sw.js`. Probe: `Object.hasOwn(sw, 'x')` in `sw.js`
ergibt `tsc` 0, `eslint` 0 und `218 ✓`. Abhilfe: eine `no-restricted-syntax`-
Regel gegen `(?<=`/`(?<!` in Regex-Literalen und ein eigenes `tsconfig` mit
`lib: ["es2019", "webworker"]` für `sw.js`.

**🟢 D-3: Der Lizenztest ignoriert die SPDX-Klammern.**
`licenseAllowed` entfernt `(` und `)` und teilt danach zuerst an `OR`:

```
"(MIT OR GPL-3.0-only) AND LGPL-3.0-only"   akzeptiert   (richtig wäre: abgelehnt)
"MIT AND GPL-3.0-only"                      abgelehnt    (Kontrolle)
"Apache-2.0 WITH LLVM-exception"            abgelehnt    (scheitert geschlossen, ok)
```

Kein aktuelles Paket hat diese Form. Es ist ein latentes Fail-open.

**Was mir gefallen hat:** `webuntisRpc()` gibt `unknown` zurück statt `any`,
dadurch wird `tsc` zum zweiten Netz für die Validierung. Die ESLint-Regeln
werden mit der echten Konfiguration selbst getestet
(`run-tests.mjs:1716 ff.`), was einen Tippfehler im Regelnamen oder Glob
sichtbar macht. Die Fehlermeldung in `validate.mjs:27-33` vermeidet bewusst
das Präfix, das als Login-Fehler gelesen würde, und der Kommentar sagt warum.
Die Casts in `validate.mjs` folgen alle unmittelbar auf eine Prüfung, die sie
rechtfertigt. Die `types/heute-schule.d.ts` mit drei Cloudflare-Typen statt
eines weiteren Pakets passt zum Projekt. Und dass das Audit beim Umzug ins
Lockfile sofort eine echte hohe Lücke in der bisher gepinnten wrangler-Version
fand, ist der beste Beleg, dass der Umzug richtig war.

---

## 5. Gewichtungs-Feedback

- Die Einordnung der neuen Prüfer als 🟡-Wartung statt als Sicherheitsfix finde
  ich richtig. Keiner meiner Befunde ist 🔴. Nichts davon ist heute ausnutzbar
  oder trifft heute Familien.
- **Zu optimistisch** ist „fail closed“ für das Audit-Gate (A-1) und „nicht
  mehr als Passwort falsch fehlgedeutet“ (A-2). Beides stimmt im getesteten
  Fall und kippt an einer Stelle, die niemand angesehen hat. Genau das ist das
  „Stichprobe statt Verteilung“-Muster.
- A-3 würde ich ernster nehmen, als es aussieht. Es ist die zweite Runde in
  Folge, in der „Prüffunktion korrekt, aber Aufruf im Worker nicht
  abgesichert“ auffällt. Ein generischer Test „jede Methode mit kaputter Form →
  generische Meldung“ beendet die Klasse.
- Ausdrücklich zustimmen will ich dir bei der ES2019-Entscheidung. Ein
  ehrliches Ziel, das durchgesetzt wird, ist besser als ein ES5-Ziel, das nur
  auf dem Papier stand. Ebenso bei der LGPL-Ausnahme: benannt, eng gefasst,
  begründet.

---

## 6. Fazit

0.3.3 hält im Kern, was es verspricht. Die Prüfer existieren, greifen
nachweislich, die Gegenproben stimmen fast aufs Komma, und Website und Proxy
laufen auf HEAD. Die Lücken liegen an den Rändern der Gates und der
Validierung: Das Audit sieht das Lockfile statt des installierten Baums und
wird mit `omit=dev` blind. Der Live-Check kennt den Proxy nicht. Nicht-JSON
von WebUntis heißt weiterhin „Passwort prüfen“. Ein Validator-Aufruf im
Worker kann ohne roten Test verschwinden. Das sind alles kleine, billige
Fixes.

Zur Qualität der Selbstauskunft: Die Belegdichte in Commits und Doku ist
hoch. Gegenproben werden benannt und lassen sich reproduzieren, Grenzen wie
das nicht typgeprüfte Inline-Script stehen offen in der Doku. Abzüge gibt es
für zwei Behauptungen, die weiter reichen als ihr Beleg (A-1, A-2), für die
erneut als „Regression“ gezählte Härtung (K-1) und für Doku-Reste in
`CLAUDE.md` und `proxy/README.md`.
