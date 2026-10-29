# Peer-Review „Der beste Freund“ — sams-on-Anbindung und Folge-Fixes (0.3.4 → 0.4.0)

IDHDKM8 · v1 · 2026-10-29 · 14961c0c · gültig

**Prüfobjekt:** Commits `2c43ec5..993c63a` (neun Commits: Schutz nicht lesbarer
Einstellungen, Folge-Fix der siebten Runde 0.3.4, wrangler 4.153.0 und
Telemetrie, neuer Essensanbieter sams-on 0.4.0, zuschaltbares Guthaben,
Datenschutz-Vorlage, 302-Fix, Doku) und ihre Behauptungen über sich selbst:
Commit-Nachrichten, `OFFEN-naechste-Fixes.md` (Erledigt-Tabelle, Punkt 5),
`PROJEKT.md` (Abschnitte 4, 6, 8, 9, 10, Release-Historie), `proxy/README.md`,
`README.md`, Datenschutzerklärung (Vorlage und live).
**Prüfer:** unabhängige Runde ohne Vorwissen über die schreibende Sitzung, 29.10.2026.
**Zugriff:** Quellcode (HEAD = `993c63a`, Arbeitsbaum sauber), Testsuite, Lint,
Typprüfung, `npm audit` lokal; Live-Website (GET) und eingebauter Browser
(nur Formular, nichts gespeichert, kein Abruf ausgelöst); Live-Proxy
(4 von erlaubten 20 Anfragen, nur Eingaben, die vor jedem Login scheitern);
sams-on nur öffentlich: Startseite, Angular-Bundle (`main-GJXV7WPT.js` plus
11 Chunks), `assets/i18n/de.json`, Instanz-Info `GET /api/instance/<name>`.
Kein Login, keine Anfrage an `/api/login`, `/api/users/…`, `/data/server/…`.
**Methode:** Mutanten und Sonden nur in Kopien (`git archive`, `node_modules`
als Symlink) im Scratchpad. Im Projektordner außer dieser Datei nichts geändert.

**Lesehilfe:** Abschnitt 1 ist die Kurzfassung. Abschnitt 2 prüft jede
Behauptung einzeln, Abschnitt 3 korrigiert Aussagen in der Doku, Abschnitt 4
sind meine eigenen Funde nach Schwerpunkt (A Security, B Datensparsamkeit,
C Alltag, D Nerd-Details). Abschnitt 5 und 6 ordnen ein.

---

## 1. Kurzeinschätzung

Das Sicherheitsgerüst der sams-on-Anbindung ist richtig gebaut, und ich sage
das ohne Höflichkeitsrabatt. Der Instanz-Name kann konstruktiv nur
`*.sams-on.de` erreichen, die `userId` darf nur aus Ziffern bestehen, Cookies
gehen nur RFC-6265-sauber weiter. Jede Antwortprüfung scheitert geschlossen.
Alle 13 Mutanten, die Du in den sams-on-Commits nennst, habe ich nachgestellt, und
jeder wird rot. Was ich Dir vor dem Abhaken trotzdem mitgebe, sind drei Dinge,
und alle drei betreffen Deine Behauptungen, nicht den Code. Erstens: Die
Datenschutzerklärung sagt, ohne Haken frage der Proxy das Guthaben „gar nicht
ab“. Das stimmt nicht. sams-on schickt den Kontostand bei jedem Login mit, der
Proxy empfängt und parst ihn jedes Mal und verwirft ihn nur. Zweitens: Die
„5,00 €, die Schwelle der eigenen sams-on-Warnung“ gibt es so nicht. Die
Schwelle ist pro Schule einstellbar, und für `lessing` ist sie `null`. Drittens:
Der 302-Fix steht in OFFEN als erledigt, läuft aber nicht live. Das ist
dasselbe Muster wie beim SSRF-Fix vom 01.09., diesmal nur mit harmloser Folge.

---

## 2. Verifikationstabelle

| Behauptung | Ergebnis | Mein Beleg |
|---|---|---|
| Tests, Lint, Typprüfung, Audit grün | ✅ | `npm test` → `297 Tests: 297 ✓ 0 ✗`; `npm run lint` und `npm run typecheck` ohne Ausgabe, Exit 0; `npm audit --include=dev` → `found 0 vulnerabilities` |
| e421f25: „34 neue Tests“ | ✅ | Suite in Kopien: `79e2df3` 255, `e421f25` 289 Tests |
| 23b16a0: „8 neue Tests“ | ✅ | `23b16a0` 297 Tests |
| e421f25: acht Mutanten (Label, userId, Tagesfilter, 401, Cookie-Übernahme, Allergen-Zeile, Request-Body, Cache-Schlüssel) je 1–12 rot | ✅ | Nachgestellt: Label-Prüfung weg 10 rot; userId-Regex weg 2; Tagesfilter weg 1; 401 auf `GET /api/login` weg 1; `collectCookies` nach Login weg 8; Allergen-`pop()` weg 2; samson-Block ungefiltert 1; Passwort aus Schlüssel 1 |
| 23b16a0: vier Mutanten (Schalter ignoriert, `<=`, Schlüssel ohne Schalter, Formatprüfung aus) je rot | ✅ | Nachgestellt: 1 / 1 / 1 / 2 rot |
| fd6c353: „Gegenprobe: mit der alten Bedingung rot“ | ✅ | 3xx-Zweig entfernt → `sams-on: an unknown instance is reported by name` rot |
| fd6c353 / OFFEN Punkt 5: „der Proxy meldet dann ‚Instanz … nicht gefunden‘“ (als erledigt) | ❌ live | Live-Proxy, eindeutiger Instanz-Name `zzpruefrundeq7x` (vorher direkt geprüft: sams-on antwortet `302 https://www.sams-on.de/`): Antwort `"lunchFehler":"sams-on: nicht erreichbar (HTTP 302)"`. Das ist die alte Meldung. `deploy-commit.txt` live = `b25425f…`, HEAD = `993c63a…`. Im Repo stimmt die Aussage, live nicht (siehe A-2) |
| 23b16a0: Schalter nur als boolean | ✅ | Live: `"guthabenAnzeigen":"true"` → `400 {"error":"Ungültiger Request-Body"}`; Gegenprobe mit `true` → 200 und `Ungültige sams-on-Instanz`. 23b16a0 ist also live |
| Instanz nur als Name, kein anderer Server erreichbar | ✅ | `hostcheck.mjs:153-160`: Label-Regex, dann `checkSafeHostname` mit fester Endung, dann `httpsUrlForHost`. Live: `a.b` → `Ungültige sams-on-Instanz` ohne Abruf |
| `userId` nur Ziffern, geht in den Pfad | ✅ | `validate.mjs:209-215`; Test mit `8/../admin` bricht vor `/users/` ab |
| Cookies nur mit sicherem Zeichensatz | ✅ | `worker.js:455` (RFC-6265-Cookie-Octet), Test `PHPSESSID=a b` wird verworfen |
| Bestellungen: nur `dayId` und `title` übernommen | ✅ | `validate.mjs:222-231`. Das Bundle bestätigt die Feldnamen: Spalten `['dayId','title','orderNmb']`, Daten aus `t.orders` (`chunk-DjJgNrFO.js`) |
| Ablauf „wie die sams-on-Web-App“ (Instanz, Login, `GET /api/login`, `orders/view`, Logout) | ✅ | Bundle: `getLoginInformation` = `/login?forceUserarea=`, `userOrderView=/users/{id}/orders/view`, `buildUrl` mit `?dateFrom=…&dateTill=…` im Format `YYYY-MM-DD`, Content-Type `/application/vnd.akquinet.samson.v2` (mit Schrägstrich, sic) im `RestService` |
| „Proxy liest `creditAmount` nur bei gesetztem Haken“ (Commit, README) | ⚠️ | Kopiert wird es nur bei gesetztem Haken (`worker.js:539`). Empfangen und per `JSON.parse` gelesen wird es bei jedem Abruf, weil `GET /api/login` es immer enthält (Bundle: `this.creditAmount=e.creditAmount` aus derselben Antwort). Siehe B-1 |
| Datenschutzerklärung: „ohne diese Einstellung fragt er ihn gar nicht ab“ | ❌ | Wie oben. Ebenso die UI (`web/index.html:416-417`) und PROJEKT.md:733 |
| „5,00 €, der Schwelle der eigenen sams-on-Warnung“ | ❌ | Siehe D-1: Schwelle ist `instanceInfo.lowCreditWarning` (Cent), für `lessing` `null`, die sams-on-Warnung erscheint dort also gar nicht |
| Datenschutzerklärung live = Vorlage | ✅ | Textvergleich (Tags entfernt): Unterschiede nur im Vorlagen-Kommentar, in einem CSS-Kommentar und in den Kontaktdaten von Abschnitt 1 |
| Datenschutzerklärung: Empfänger SAMS-ON GmbH, Hamburg | ✅ | Impressum-Block und JSON-LD auf `www.sams-on.de`: `legalName: SAMS-ON GmbH`, Anschrift in Hamburg |
| Datenschutzerklärung: Name, E-Mail, Ausweisnummer kommen mit und werden verworfen | ✅ | Bundle: `accountData.firstName/lastName/identityCardNumber`; `validate.mjs` übernimmt nichts davon. Instanz-Info `lessing`: `userProvidesIdentityCardNumber: '1'` |
| „Die App schickt dem Proxy nur noch die Felder des gewählten Anbieters“ | ✅ Code / ⚠️ Test | `lunchRequestFields` (`index.html` ab Zeile ~1206) ist korrekt. Kein automatischer Test, nur der einmalige Browser-Check (Inline-Script, OFFEN Punkt 3). Siehe A-3 |
| Bereinigung der eingefügten sams-on-Adresse | ✅ | 32 Sonden gegen die extrahierte Funktion, u. a. Dashboard-URL → `lessing`, `account.sams-on.de/login?instance=lessing` → `lessing`, `lessing.sams-on.de.evil.example` / `evil.example/?instance=lessing` / `…@evil.example` / `a.b.sams-on.de` / `www` → `null`. Im Browser (live) nachgestellt: Dashboard-URL wird zu `lessing` plus Toast; Look-alike zeigt den Fehlerhinweis, `aria-invalid="true"` |
| Speichersperre bei unbrauchbarer Adresse | ✅ | Browser, live: „Speichern & anzeigen“ mit Look-alike → Toast, Formular bleibt, `localStorage` leer, 0 Anfragen an `workers.dev` (Resource-Timing). Gegenprobe: gültige Eingabe wird angenommen (oben) |
| c88c9d4: nicht lesbare Einstellungen werden nicht still überschrieben | ✅ | `loadConfig`/`saveConfig` in Node mit Stub-Storage: kaputtes JSON, `{proxyUrl}` ohne `children`, `null`, `children:[null]`, `lunch:"x"` → Hinweis-Flag, Rückfrage, Ablehnen lässt den Wert byte-gleich, Bestätigen überschreibt. Kontrollfälle: nichts gespeichert, leerer String, gültige Konfiguration → keine Rückfrage. `getItem` wirft → Rückfrage (siehe C-3) |
| 79e2df3: Telemetrie aus, Variablennamen aus wrangler 4.153.0 | ✅ | `wrangler-dist/cli.js:25303-25313` (`WRANGLER_SEND_METRICS`, `WRANGLER_SEND_ERROR_REPORTS`); `wrangler telemetry status` mit Variable → `Disabled (set by WRANGLER_SEND_METRICS)`. Ohne Variable bewusst nicht ausgeführt, das hätte selbst Nutzungsdaten gesendet |
| 6c328a0: 4.153.0 ist die älteste Version ohne Befund | [ungeprüft] | Ältere Versionen nicht installiert. `node_modules/wrangler` = 4.153.0, Audit 0 Funde |
| 3d3f12c (0.3.4): Stichproben A-2, A-3, B-1 | ✅ | `validateRooms` im Worker entfernt → 1 rot; `WebUntisRejection`-Unterscheidung weg → 6 rot; `cccampus` wieder in `LUNCH_FIELDS` → 2 rot. CI: `permissions: contents: read`, `npm ci --ignore-scripts`, `npm audit … --include=dev` vorhanden |
| 3d3f12c / OFFEN: A-5 bis A-8 „alle behoben“ | ⚠️ | A-7 empfahl auch Actions per SHA und `github-actions` in `dependabot.yml`. Beides fehlt (`ci.yml`: `actions/checkout@v7`; `dependabot.yml` nur `npm`) und steht nicht unter „bewusst nicht umgesetzt“ |
| 993c63a: erster echter Abruf über den Live-Proxy | [ungeprüft] | Rückmeldung des Users. Kein Widerspruch: Mein Abruf zeigt, dass der Proxy sams-on aus dem Cloudflare-Netz erreicht (echte 302-Antwort) |
| OFFEN Punkt 5: „sams-on läuft mit PHP auf Apache“ | ✅ | `GET /api/instance/lessing`: `Server: Apache/2.4.62 (AlmaLinux)`, `X-Powered-By: PHP/8.2.33` |
| OFFEN Punkt 5: CVE-2026-109618/-109619 | [ungeprüft] | Nicht nachgeschlagen. Siehe K-3 zu „von außen nicht prüfbar“ |
| Kopien unter `web/source/proxy/` und `web/docs/` byte-gleich | ✅ | `cmp` für 5 Proxy-Dateien, 4 Doku-Dateien, 3 Prompts: alle gleich. `deploy.sh` prüft `text.mjs` mit |
| Version 0.4.0 auf `/ueber` | ✅ | Live `ueber.html:109`: `var VERSION = '0.4.0'`. Live `/` byte-gleich zu `web/index.html` aus HEAD |
| Kopfzeilen PROJEKT (HS-PRJ v5) und OFFEN (HS-OFF v5) | ✅ | `stamp.py check` → beide `OK` |

---

## 3. Korrekturen

**K-1 (Datenschutzerklärung, UI, PROJEKT.md): Das Guthaben wird immer übertragen, nur nicht immer weitergegeben.**
`web/datenschutz.example.html:72` (und live): „ohne diese Einstellung fragt er
ihn gar nicht ab“. `web/index.html:417`: „Nur wenn angehakt, fragt der Proxy
das Guthaben überhaupt ab.“ `PROJEKT.md:733`: „liest der Proxy es gar nicht
erst“. Der Code ruft `GET /api/login?forceUserarea=false` bei jedem sams-on-Abruf
auf (`worker.js:533`), weil er dort die `userId` holt. Diese Antwort enthält
laut Bundle immer `creditAmount`. Der Worker parst sie vollständig
(`samsonJson`) und kopiert den Betrag nur bei gesetztem Haken. Ehrlich wäre
etwa: „sams-on schickt bei der Anmeldung immer Kontodaten mit, darunter Name,
E-Mail-Adresse, Ausweisnummer und Kontostand. Der Proxy verwendet davon nur die
Kontonummer und verwirft den Rest sofort. Den Kontostand gibt er nur weiter,
wenn …“. Das ist dieselbe Wahrheit, nur ohne Überversprechen.

**K-2 (Commit 23b16a0, `worker.js:488-490`, PROJEKT.md:732, proxy/README.md): „die Schwelle der eigenen sams-on-Warnung“.**
Die Schwelle ist ein Instanz-Wert. Im Bundle steht
`instanceInfo.lowCreditWarning && parseFloat(this.credit) < parseFloat(instanceInfo.lowCreditWarning)/100`.
Der Text in `de.json` lautet `SNACKBAR.WARNINGS.LOW_CREDIT`, „…weniger als
{{ lowCreditWarning }}…“. Die Instanz-Info von `lessing` (also genau die
Antwort, die der Proxy in Schritt 1 abruft) liefert `"lowCreditWarning": null`.
Damit zeigt sams-on dort gar keine Warnung. 5 € als eigene Produktentscheidung
ist völlig in Ordnung, nur die Begründung stimmt nicht. Ob die Instanz-Info nach
dem Login mehr Felder liefert, kann ich ohne Login nicht prüfen [ungeprüft].

**K-3 (OFFEN Punkt 5): „Ob sams-on das Update eingespielt hat, ist von außen nicht prüfbar“.**
Teilweise prüfbar: sams-on nennt die PHP-Version im Header
(`X-Powered-By: PHP/8.2.33`). Einschränkung: AlmaLinux-Pakete können
Sicherheitsfixes zurückportieren, ohne die Versionsnummer zu ändern. Die
Versionsnummer ist also ein Indiz, kein Beweis. Die beiden CVE-Nummern habe ich
nicht verifiziert [ungeprüft]. Steht so etwas in einem öffentlichen Repo, sollte
die Quelle verlinkt sein.

**K-4 (PROJEKT.md:130, README.md:16, `worker.js:446`): „sams-on sendet keine `Access-Control-Allow-Origin`-Header“.**
`GET /api/instance/lessing` antwortet mit `Access-Control-Allow-Origin: *`. Die
Schlussfolgerung (Proxy nötig) hält trotzdem: Die Sitzung hängt am Cookie
(`withCredentials: true` im Bundle), und mit `*` verweigert der Browser
Anfragen mit Zugangsdaten. Ein Skript kann außerdem `Set-Cookie` nicht lesen.
Die Begründung sollte also „CORS erlaubt keine Anfragen mit Cookies“ heißen,
nicht „keine CORS-Header“. Ob `/api/login` dieselben Header sendet, habe ich
gemäß Auftrag nicht abgefragt.

**K-5 (OFFEN, Erledigt-Zeile 0.3.4): „Alle behoben“ für A-5 bis A-8.** A-7 ist nur zum Teil umgesetzt (siehe Tabelle).
Entweder umsetzen oder unter „bewusst nicht umgesetzt“ aufführen.

**K-6 (Kleinkram Doku).** OFFEN v5 vom 29.10. beginnt im Text mit
„**Stand: 11.10.2026.**“ (`OFFEN-naechste-Fixes.md:5`). Der Kopfkommentar von
`worker.js` (Zeilen 6, 15, 24-31, 105) spricht weiter nur von WebUntis und
Mensamax.

---

## 4. Zusatzbefunde

### A. Security in der Tiefe

**Threat Model, kurz.** Neu ist ein Anbieter mit Kontodaten von Kindern
(Bestellungen, Guthaben, Ausweisnummer im Login-Objekt). Die realistischen
Angreifer sind dieselben wie bisher: Missbrauch des Proxys als Relay oder
Login-Front, und Fehler, die Daten der einen Familie in die Karte der anderen
bringen. Für beides ist der Code gut aufgestellt. Das Instanz-Feld trägt nie
eine Adresse, der Cache-Schlüssel enthält Passwort und Schalter, und die
Antwortprüfung lehnt im Zweifel ganz ab. Ich habe nichts gefunden, über das ein
Eingabefeld oder eine sams-on-Antwort an einen fremden Host, in einen Header,
in einen Pfad oder ungeprüft in die Anzeige käme. Die Anzeige läuft über
`textContent`, das Guthaben ist per Regex auf `-?\d{1,6},\d{2}` begrenzt, und die
Instanz-Info wird nur auf den Status geprüft und nie gelesen.

**🟡 A-1: Logout, Zeitüberschreitung und 403 sind ungetestet, ein Muster, das wir kennen.**
Mutanten, die die Suite grün lässt (`297 ✓ 0 ✗`):
- Logout ohne Session-Cookie (`headers()` durch reinen Content-Type ersetzt,
  `worker.js:553`). Der Logout wird dann zur Leerlauf-Anfrage, und jede Sitzung
  bleibt bei sams-on bis zum Ablauf offen. Der Ablauftest prüft nur den Pfad
  `POST /api/logout`, nicht das Cookie.
- Logout nur im Erfolgsfall (`finally` entschärft, Logout vor das `return`
  verschoben). Bei kaputter Bestellantwort oder Wartungsseite bleibt die
  Sitzung offen.
- `signal: controller.signal` entfernt (`worker.js:121`). Damit ist für keinen
  Anbieter eine Zeitüberschreitung getestet. Das galt schon vorher, wiegt aber
  mit fünf aufeinanderfolgenden sams-on-Abrufen schwerer.
- `403` aus der Login-Prüfung entfernt (`worker.js:528`).

Vorschlag: Der nachgebaute Server merkt sich, ob `POST /api/logout` mit dem
angemeldeten Cookie kam, und das in einem Erfolgs- und einem Fehlerfall. Dazu
ein Timeout-Test mit einem `fetch`, das nie antwortet, und gekürztem
`FETCH_TIMEOUT_MS`, oder mit falschem `setTimeout`.

**🟡 A-2: Committet ist nicht deployed, und die Doku sagt „erledigt“.**
Siehe Tabelle: Der Live-Proxy steht auf dem Stand vor fd6c353, die Website auf
`b25425f`. OFFEN Punkt 5 beschreibt das 302-Verhalten im Präsens als erledigt.
Die Folge ist harmlos (eine Meldung), das Muster ist es nicht: Am 01.09. war es
der SSRF-Fix. `deploy.sh` würde es beim nächsten Lauf auffangen. Die Doku sollte
aber zwischen „im Repo“ und „live“ unterscheiden, zum Beispiel mit dem Zusatz
„(live ab Deploy von `fd6c353`)“.

**🟡 A-3: Die neue Datensparsamkeits-Logik im Browser hat keinen Test.**
`lunchRequestFields` entscheidet, welche Zugangsdaten das Gerät überhaupt
verlassen: keine ccCampus-PIN, keine alten Mensamax-Daten bei einem
sams-on-Kind. `extractSamsonInstance` entscheidet die Speichersperre. Beide
liegen im nicht getesteten Inline-Script (OFFEN Punkt 3). Ein Rückfall auf
`lunch: child.lunch` bliebe unbemerkt, der Proxy würde den Rest zwar verwerfen,
aber erst nach der Übertragung an Cloudflare. Bis `web/app.js` kommt, reicht
ein billiger Zwischenschritt: so wie meine Sonde die Funktion aus der HTML
herausschneiden (`new Function(…)`) und in `run-tests.mjs` mit benannten Klassen
prüfen.

**🟢 A-4: Lange Wartezeit bei hängendem sams-on.**
Fünf aufeinanderfolgende Abrufe mit je 10 s Timeout ergeben im ungünstigsten
Fall rund 50 s pro Kind. Der Logout im `finally` kommt auch auf dem Fehlerpfad
dazu. Weil `refreshAll` die Kinder nacheinander abruft (bewusst, wegen
WebUntis-Sammelkonten), addiert sich das. Vorschlag: Den Logout per
`ctx.waitUntil` nach der Antwort schicken, er blockiert dann niemanden, und
dem sams-on-Ablauf ein Gesamtbudget geben, etwa ein gemeinsames
`AbortSignal.timeout(15000)`.

**🟢 A-5 (Supply Chain, aus der Vorrunde offen):** Die GitHub Actions hängen an
den beweglichen Tags `@v7`, Dependabot beobachtet sie nicht. Siehe K-5.

### B. Datensparsamkeit / CCC

**Datenfluss, wie ich ihn im Code nachvollzogen habe:**
1. Browser → Proxy: WebUntis-Block, `lunch.provider` und nur der Block des
   gewählten Anbieters. Bei sams-on sind das `instanz` (schon zum Namen
   bereinigt), `benutzername`, `passwort` und `guthabenAnzeigen` (boolean). Der
   Proxy übernimmt nur diese Felder (`validate.mjs:242-284`).
2. Proxy → sams-on: Instanz-Name im Pfad, Zugangsdaten im JSON-Body des Logins,
   Session-Cookie, `userId` und Datum im Pfad bzw. in der Query.
3. sams-on → Proxy: Instanz-Info (Firmenname, Einstellungen); bei
   `GET /api/login` das Kontoobjekt mit Name, E-Mail, Ausweisnummer, `userId`
   **und Kontostand**; bei `orders/view` die Bestellungen im Zeitraum (hier ein
   Tag).
4. Proxy → Browser und 4-Minuten-Cache: `lunch`-Text, bei gesetztem Haken
   zusätzlich `guthaben` und `guthabenKnapp`. Der Cache-Schlüssel ist ein
   SHA-256 über alle Zugangsdaten samt Schalter (`cachekey.mjs:54`). Ohne
   Passwort ist ein Treffer also nicht erreichbar.

Das ist sparsam gebaut, und der Schalter mit Standard „aus“ ist die richtige
Voreinstellung. Mutant M0 (Schalter ignoriert) macht den Test „no balance
anywhere in the answer“ rot, die Eigenschaft ist also wirklich geprüft.

**🟡 B-1: Das Versprechen ist größer als die Technik.** Siehe K-1. Für eine
CCC-Lesart ist genau das der Unterschied zwischen „Daten werden nicht erhoben“
und „Daten werden empfangen und verworfen“. Art. 5 Abs. 1 lit. a DSGVO
(Transparenz) verlangt die zweite Formulierung, wenn die zweite zutrifft. Der
Schaden ist klein, weil nichts gespeichert wird. Die Korrektur kostet drei
Sätze.

**🟡 B-2: Das Verarbeitungsverzeichnis kennt sams-on nicht.**
`Verarbeitungsverzeichnis-INTERN.md` (nicht im Repo, Stand 01.09.2026) führt als
Empfänger nur WebUntis, Mensamax/parentsmensa.de und ccCampus. Als Datenkategorie
fehlen die sams-on-Zugangsdaten und der Kontostand. Wenn das Dokument die
Grundlage für das Gespräch mit dem Juristen sein soll (OFFEN Punkt 1), gehört
der neue Empfänger hinein, mit SAMS-ON GmbH, Hamburg, und dem Guthaben als
optionaler Kategorie.

**🟢 B-3: `hideCredit` wird ignoriert.** Jede sams-on-Instanz kann das Guthaben
für Nutzer:innen ausblenden (`hideCredit` in der Instanz-Info, im Bundle
`n.adminArea==!1&&n.hideCredit==!1`). Bei `lessing` ist das `'0'`. Für eine
Schule mit Abrechnung per Rechnung würde die Karte trotzdem „Guthaben: 0,00 € —
bald aufladen“ zeigen, also einen Fehlalarm und einen Wert, den der Anbieter
selbst nicht zeigt. Da die Instanz-Info ohnehin abgerufen wird, wäre es billig,
`hideCredit` und `lowCreditWarning` dort zu lesen (Standardwert 5 €, wenn
`null`).

### C. Alltagsblick (nicht-technische Eltern)

**Gut gelöst:** Die Bereinigung nimmt alles, was Eltern realistisch einfügen:
Dashboard-URL, Login-Seite mit `?instance=`, nackten Namen, Großschreibung.
Fremdes lehnt sie verständlich ab. Die Guthaben-Zeile sagt „bald aufladen“ als
Text und nicht nur in Gelb (WCAG 2.2, 1.4.1 Use of Color, A, erfüllt). Der
Hinweis bei unlesbaren Einstellungen ist in klarer Sprache geschrieben.

**🟢 C-1: „Instanz“ ist Entwicklersprache.** Das Formular sagt „Adresse Deiner
Schule bei sams-on“, die Fehlerkarte aber „sams-on: Instanz „x“ nicht
gefunden“ (`worker.js:519`) bzw. „Ungültige sams-on-Instanz“
(`hostcheck.mjs:156`). Für Eltern besser: „Schule „x“ bei sams-on nicht
gefunden — Adresse in den Einstellungen prüfen“.

**🟢 C-2: Die Speichersperre sagt nicht, welches Kind gemeint ist.** Bei mehreren
Kindern bleibt offen, wo das Problem liegt. Außerdem sagt der Toast
„eintragen“, wenn eine falsche Adresse schon eingetragen ist. Der rote Hinweis
am Feld hilft zwar, liegt bei langen Formularen aber außerhalb des Bildschirms.

**🟢 C-3: Fehlalarm bei gesperrtem Speicher.** Wirft schon `localStorage.getItem`
(z. B. wenn der Browser Website-Daten blockiert), behauptet der Hinweis
„Auf diesem Gerät sind bereits Einstellungen gespeichert“. Das weiß die App in
dem Fall gar nicht (Kommentar `index.html`: „cannot be judged“). Besser ein
eigener Text: „Der Speicher dieses Browsers ist gesperrt, Einstellungen können
nicht gesichert werden.“

**🟢 C-4: Barrierefreiheit am neuen Feld.** Der Fehlerhinweis hat
`role="alert"`, ist aber erst per `hidden` versteckt. Wird ein solches Element
eingeblendet, lesen manche Screenreader es nicht vor (WCAG 2.2, 4.1.3 Status
Messages, AA, Ansage nicht verlässlich). Hinweis und Fehler hängen nicht per
`aria-describedby` am Eingabefeld (live geprüft: `aria-describedby` = `null`,
WCAG 2.2, 1.3.1 Info and Relationships, A). Der Fehler steht aber sichtbar als
Text da, und `aria-invalid` ist gesetzt, 3.3.1 Error Identification (A) ist also
erfüllt. Gleiches Muster wie bei den übrigen Hinweisen, deshalb nur 🟢.

### D. Nerd-Detailblick

**Ausdrücklich gut:** `samsonOrigin` baut den Host selbst, statt einen
eingegebenen Host zu prüfen. Damit verschwindet die ganze Klasse der
Host-Verwechslungen vom 09.10., statt nur abgefangen zu werden. Die Property-Tests
mit acht benannten Angriffsklassen sind genau die Art Test, die zeigt, *warum*
ein Wert gewählt wurde. Auch `samsonCredit`, das bei unerwartetem Format `null`
liefert, statt den Essensstatus mit umzureißen, ist eine saubere Abwägung.

**🟡 D-1: Die Annahmen zur Bestellliste sind nur zur Hälfte belegt.**
Belegt durch das Bundle: Die Liste steht unter `orders`, jeder Eintrag hat
`dayId`, `title`, `orderNmb`, und `title` ist HTML (sams-on rendert es selbst per
`innerHTML`). Nicht belegt, weil das Testkonto nie eine Bestellung hatte und auch
der echte Abruf vom 29.10. „Kein Essen bestellt“ ergab:
- Das **Format von `dayId`**. Das Bundle schickt es nur durch die Angular-Date-Pipe,
  die auch `2026-11-03T00:00:00` oder einen Zeitstempel annähme. Kommt es nicht
  als `YYYY-MM-DD`, sehen am ersten Tag mit Bestellung alle Familien „sams-on:
  unerwartete Antwort auf orders/view (dayId)“. Der Code scheitert also
  geschlossen und nicht mit falschem „Kein Essen bestellt“, und das ist gut so.
  Rechne trotzdem damit.
- Ob **`title`** den Menünamen oder die Kategorie enthält (steht in OFFEN).
- Ob **stornierte Bestellungen** in `orders/view` auftauchen. Indiz dagegen: Die
  sams-on-Tabelle hat keine Status-Spalte, Stornos wären dort selbst nicht
  unterscheidbar [ungeprüft].
- Ob ein **Login über den Proxy eine offene Sitzung der Eltern** im
  sams-on-Browser beendet (das Bundle kennt `/logout/cancel` und
  `userLogoutAfterSeconds`) [ungeprüft]. Beim ersten Test mit echter
  Bestellung gleich mit ansehen.

**🟢 D-2: Allergen-Heuristik.** `CODE_LINE` entfernt auch echte Zeilen mit zwei
Buchstaben: `"Kartoffelsuppe<br/>Ei"` wird zu `"Kartoffelsuppe"`. Codes mit drei
Zeichen bleiben stehen: `"Nudeln<br/>10a, 12"` wird zu `"Nudeln 10a, 12"`.
Kosmetisch. `decodeHtmlEntities("&#99999999;")` wirft `RangeError: Invalid code
point 99999999`. Die Meldung landet in `lunchFehler`, mit einer Zahl aus der
Anbieterantwort, entgegen dem eigenen Grundsatz „nichts vom Anbieter in der
Fehlermeldung“. Trivial, `fromCodePoint` mit Bereichsprüfung kapseln.

**🟢 D-3: Typografie im Toast:** `'„' + instance + '"'` (`index.html:802`, ebenso
`:813`). Öffnendes deutsches, schließendes gerades Anführungszeichen.

**🟢 D-4 (Fundstück):** sams-on vergleicht in der eigenen Guthaben-Warnung
`parseFloat(this.credit)` bei Beträgen mit Komma. `parseFloat("4,99")` ergibt `4`.
Euer `replace(',', '.')` ist also gründlicher als das Original.

---

## 5. Gewichtungs-Feedback

- **Zustimmung:** sams-on in OFFEN Punkt 5 als 🟡 „fertig prüfen“ zu führen,
  ist genau richtig. Dass Du die offenen Annahmen (Titel, Format des Guthabens,
  Erreichbarkeit) selbst benennst, statt sie zu verschweigen, macht diese Runde
  leicht.
- **Zu milde:** Die Datenschutz-Formulierung (B-1) hast Du als „vom User
  freigegebenen Text“ committet. Gerade weil der User das freigibt, muss der
  Text technisch stimmen. Er kann nicht sehen, dass `GET /api/login` den
  Kontostand immer mitliefert. Das sollte vor den nächsten Familien korrigiert
  sein.
- **Zu milde:** „Erledigt“ für etwas, das nicht live ist (A-2). Das Projekt hat
  dafür extra einen Live-vs-HEAD-Check gebaut. Die Doku sollte dieselbe
  Unterscheidung machen.
- **Richtig gewichtet:** Der Folge-Fix 0.3.4 ist in den Stichproben sauber
  (alle drei Mutanten rot). Die Lücke bei A-7 ist 🟢, nicht mehr.
- **Kein 🔴:** Ich habe nichts gefunden, was Zugangsdaten oder Kontodaten an
  Unbefugte bringt oder den Proxy wieder zum Relay macht.

---

## 6. Fazit

Hält 0.4.0, was es verspricht? Bei der Sicherheit ja, ohne Abstriche: Die
sams-on-Anbindung ist konstruktiv gegen Host-Verwechslung, Pfad- und
Header-Injektion gesichert, scheitert bei Unbekanntem geschlossen, und jede
genannte Gegenprobe ließ sich nachstellen. Beim Datenschutz verspricht der
Text mehr, als die Technik leisten kann: Das Guthaben wird nicht „gar nicht
abgefragt“, sondern empfangen und verworfen. Die 5-€-Schwelle hat eine
erfundene Herkunft. Beim Betrieb hinkt der Live-Stand dem Repo einen Fix
hinterher, der als erledigt dokumentiert ist. Alles das lässt sich mit wenig
Aufwand beheben. Die eigentliche Bewährungsprobe kommt mit der ersten echten
Bestellung nach dem 01.11. (D-1).

Zu den Behauptungen selbst: Die Belegdichte ist hoch. Zahlen wie Testanzahl und
Mutanten stimmen exakt, und das ist bei dieser Projektgeschichte keine
Selbstverständlichkeit. Die Schwächen liegen genau dort, wo die Herleitung nicht
aus eigener Messung stammte, sondern aus einer plausiblen Annahme: bei der
sams-on-Schwelle und bei der Frage, was „gar nicht abfragen“ technisch heißt.
