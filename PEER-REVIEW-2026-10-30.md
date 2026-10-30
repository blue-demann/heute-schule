# Peer-Review „Der beste Freund“ — Folge-Fix der achten Prüfrunde (0.4.1)

ID3UKZT · v1 · 2026-10-30 · c5a2d8e7 · gültig

**Zweck:** Unabhängige Gegenprüfung von Version 0.4.1. Geprüft wird, ob der
Folge-Fix die Befunde aus dem Prüfbericht der achten Runde (IDHDKM8) wirklich
behebt, ob seine Aussagen über sich selbst stimmen und ob er neue Fehler
einführt.

**Prüfobjekt:** Commit `886b5af` („Folge-Fix der achten Prüfrunde“, 0.4.1),
dazu `fd6c353` (unbekannte sams-on-Schule), der erst mit diesem Deploy live
ging. Ebenfalls geprüft: die Aussagen in Commit-Nachricht,
`OFFEN-naechste-Fixes.md` (Erledigt-Tabelle, Punkt 5), `PROJEKT.md`,
`README.md`, `proxy/README.md`, `web/ueber.html`, `types/heute-schule.d.ts` und
die Datenschutzerklärung (Vorlage und live).
**Prüfer:** unabhängige Runde ohne Vorwissen über die schreibende Sitzung, 30.10.2026.
**Zugriff:**
- Lokal: Quellcode (HEAD = `886b5af`, Arbeitsbaum sauber), Testsuite, Lint,
  Typprüfung, `npm audit`, Coverage (`c8`).
- Live: Website (GET), eingebauter Browser (nur Formular; `fetch` und
  `localStorage.setItem` vorher blockiert, nichts gespeichert, kein Abruf),
  Live-Proxy (4 von erlaubten 20 Anfragen, alle scheitern vor einem Login).
- sams-on nur öffentlich: Startseite, `main-GJXV7WPT.js` und 11 Chunks,
  Instanz-Info `GET /api/instance/lessing`, eine Instanz-Info einer nicht
  existierenden Schule. Kein Login, keine Anfrage an `/api/login`,
  `/api/logout`, `/api/users/…` oder `/data/server/…`.
- Öffentlich: GitHub (Tags der Actions, CI-Lauf), php.net-Changelog, Unit-42-Brief.

**Methode:** Mutanten und Sonden nur in Kopien (`git archive`, `node_modules`
als Symlink) im Scratchpad. Im Projektordner außer dieser Datei nichts geändert.

**Inhalt und Lesehilfe:**
1. Kurzeinschätzung: das Urteil in fünf Sätzen.
2. Verifikationstabelle: jede Behauptung des Fixes einzeln, danach je eine
   Zeile pro Befund der achten Runde (behoben / teilweise / nicht).
3. Korrekturen an Doku und Behauptungen.
4. Zusatzbefunde nach Schwerpunkt (A Security, B Datensparsamkeit, C Alltag,
   D Nerd-Details), mit Schweregrad und Beleg.
5. Gewichtungs-Feedback. 6. Fazit.

Wer nur die Kurzfassung braucht, liest 1 und 6. Die Mutanten-Tabelle steht in 4 unter A-1.

---

## 1. Kurzeinschätzung

Das ist ein sauberer Folge-Fix, und das sage ich ohne Höflichkeitsrabatt.
Alle 🟡-Befunde der achten Runde sind in der Sache behoben. Der neue
Datenschutztext stimmt jetzt Wort für Wort mit dem Code überein, live und in
der Vorlage. Das Zeitbudget, der Logout per `ctx.waitUntil` und das Lesen von
`hideCredit` sind richtig gebaut und laufen live (`AbortSignal.any` geht im
Workers-Laufzeitsystem, sonst wäre meine Anfrage an einer `TypeError`
gescheitert). Die eine Sache, die ich vor dem Abhaken noch fixen würde, ist
ein Test: „the logout still goes out“ prüft nur, dass `fetch` *aufgerufen*
wird. Dein Mock ignoriert ein schon abgebrochenes Signal. Hängt jemand den
Logout aus DRY-Gründen an `samsonFetch` (und damit ans abgelaufene Budget),
bleibt die Suite grün, und in Wirklichkeit geht nach jeder Zeitüberschreitung
kein Logout mehr raus. Ansonsten: kein 🔴, ein 🟡, der Rest ist Feinschliff.

---

## 2. Verifikationstabelle

### 2a. Behauptungen des Fixes

| Behauptung | Ergebnis | Mein Beleg |
|---|---|---|
| Tests, Lint, Typprüfung, Audit grün | ✅ | `npm test` → `333 Tests: 333 ✓ 0 ✗`; `npm run lint` Exit 0; `npm run typecheck` Exit 0; `npm audit --include=dev` → `found 0 vulnerabilities`. CI auf GitHub für `886b5af`: `CI completed success` |
| „297 → 333 Tests“ | ✅ | 333 auf HEAD; 297 bestätigte die achte Runde für `993c63a` |
| „Gegenprobe: 19 Mutanten, jeder rot“ | ⚠️ nicht nachprüfbar | Die 19 Mutanten sind nirgends aufgelistet (anders als in `e421f25`, das seine acht nannte). Ich habe 27 eigene Mutanten für die neuen Pfade gebaut: 18 erkannt, 9 bleiben grün (Tabelle in A-1). Die grünen betreffen genau die Stellen, die Commit und Doku als erledigt nennen: Logout nach Budget-Ablauf, Speichersperre, Anzeige „nicht geführt“, `aria-describedby` |
| Logout mit der angemeldeten Session, auch nach kaputter Antwort | ✅ | Mutant „Logout ohne Cookie“ → 1 rot; „Logout nur im Erfolgsfall“ → 2 rot |
| „Antwort wartet nicht auf Logout“ | ✅ | Mutant `ctx.waitUntil(` → `await (` → rot (`sams-on: the answer does not wait for the logout`) |
| „Logout … weiter mit Session-Cookie“, auch nach Zeitüberschreitung („the logout still goes out“) | ⚠️ Code ✅ / Test ⚠️ | Code: Der Logout läuft ohne Budget-Signal (`worker.js:592-595`), geht also auch nach Ablauf des Budgets raus. Test: Der Mutant „Logout mit `budget.signal`“ bleibt grün. Mit einem Mock, der wie echtes `fetch` bei abgebrochenem Signal sofort wirft, wird er rot. Siehe A-1 |
| Gemeinsames Zeitlimit 15 s | ✅ | `worker.js:506, 535, 540`. Mutant „Budget-Signal weg“ → rot, `15000` → `15001` → rot. Live: Anfrage 1 (unten) durchlief `AbortSignal.any` ohne Fehler |
| Zeitüberschreitung je Anfrage getestet | ✅ | Mutant `FETCH_TIMEOUT_MS = 10001` → 2 rot. Mutant „`signal` ganz weg“ → Suite endet mit `unsettled top-level await` (Exit ≠ 0, also erkannt, nur als Hänger statt als roter Test) |
| 403 beim Login = „Login fehlgeschlagen“ | ✅ | Mutant `|| loginResp.status === 403` weg → 1 rot |
| `hideCredit`: „Guthaben wird bei dieser Schule nicht geführt“, ohne Betrag | ✅ mit Einschränkung | Proxy: `validate.mjs:212-218`, `worker.js:513-517`; Mutanten „`hidden` ignoriert“, „unbekannt als `false`“, „nur `'1'`“, Feld weggelassen → alle rot. Live-Instanz-Info `lessing`: `hideCredit: '0'` (String). Abweichung von der sams-on-Semantik bei `null`/fehlendem Feld: siehe D-1. Anzeige im Browser ungetestet (Mutant grün) |
| `dayId` darf eine Uhrzeit tragen, mit Zeitzone abgelehnt | ✅ | `validate.mjs:236`; Mutanten „Zeitzone erlaubt“ und „Uhrzeit nicht abgeschnitten“ → rot. Bundle (`chunk-DjJgNrFO.js`): sams-on zeigt `dayId` mit der Angular-Date-Pipe `EEEE, dd.MM.yyyy` ohne Zeitzonen-Argument. Eine Angabe ohne Zone liest sams-on also selbst als Ortszeit. Deine Regel passt damit zum Original |
| Allergen-Zeile: „Ei“ bleibt; ungültige Zeichenreferenzen werfen nicht | ✅ | Mutant „alte `CODE_LINE`“ → 2 rot; „`fromCodePoint` ungeprüft“ → 1 rot. Laufzeit der neuen Regex bei 2000 Zeichen, die erst am Ende scheitern: 0,07 ms (kein ReDoS) |
| „Allergen-Codes und Zeichenreferenzen als Property-Tests“ | ⚠️ | Allergen-Codes: ja, zwei `forAll` mit benannten Klassen. Zeichenreferenzen: feste Beispielliste (`run-tests.mjs`, Test „numeric character references“). Die Klassen sind benannt, aber nicht generiert |
| Meldungen „Schule … nicht gefunden“ statt „Instanz“ | ✅ live | Live-Proxy, Anfrage 1 (Name vorher direkt bei sams-on geprüft: `302 → https://www.sams-on.de/`): `"lunchFehler":"sams-on: Schule „zzpruefrundek3v9x“ nicht gefunden — Adresse in den Einstellungen prüfen"`. Anfrage 2 (`a.b`): `Ungültige sams-on-Adresse der Schule`. Anfrage 3 (Passwort fehlt): `… (Schuladresse/Benutzername/Passwort)`. Den Wortlaut pinnt kein Test (Mutant „alte Meldung“ grün, 🟢) |
| `fd6c353` live (302 = „nicht gefunden“) | ✅ | Anfrage 1 oben. Die achte Runde bekam an derselben Stelle noch `nicht erreichbar (HTTP 302)` |
| Speichersperre nennt das Kind und springt zum Feld | ✅ live | Browser: zwei Kinder „Anna“ (gültige Adresse) und „Ben“ (`lessing.sams-on.de.evil.example`) → Toast `⚠ Die sams-on-Adresse bei „Ben“ ist keine gültige Adresse, bitte prüfen.`, Fokus auf `feld-…-lunch-samson-instanz` von Ben, 0 Anfragen, 0 Schreibversuche. Leere Adresse → `⚠ Bei „Ben“ fehlt die sams-on-Adresse der Schule …`. Gegenprobe: Annas Dashboard-URL wurde zu `lessing` bereinigt. Kein Test für die Sperre selbst (Mutant „Sperre aus“ grün, siehe A-2) |
| Eigener Hinweis bei gesperrtem Browser-Speicher | ✅ | Test `storage that cannot be opened: its own notice, and saving asks first`; Mutant „`storageBlocked` nicht gesetzt“ → rot |
| Fehlertext als dauerhafte `role="alert"`-Region, Hinweise per `aria-describedby` | ✅ live | Browser: Feld trägt `aria-describedby="feld-<id>-lunch-samson-instanz-info0 …-info1"`, beide IDs existieren. `info1` ist `role="alert"`, nicht versteckt, leer bei gültiger Eingabe, mit Text bei ungültiger. `aria-invalid` wechselt korrekt. Checkbox: `aria-describedby` auf den Guthaben-Hinweis. Ungetestet (Mutanten grün). Lücke im Fall „Adresse fehlt“: siehe C-1 |
| Typografische Anführungszeichen im Toast | ✅ live | `sams-on-Adresse bereinigt: „lessing“` |
| `extractSamsonInstance` und `lunchRequestFields` mit benannten Klassen geprüft | ✅ | Mutant „`lunchRequestFields` gibt alles zurück“ → 5 rot. Herausschneiden per Klammerzählung funktioniert und meldet laut, wenn eine Definition fehlt |
| Datenschutzerklärung: „sams-on schickt bei der Anmeldung immer auch Kontodaten mit … Der Proxy gibt davon nur den Kontostand weiter, und den nur, wenn …“ | ✅ | Code: Kopiert wird nur `userId` (für die nächste Anfrage) und bei Haken `creditAmount` (`worker.js` ab 573); bei `hideCredit` gar nichts. Test „no balance anywhere in the answer“ grün, Mutant „Schalter ignoriert“ in der achten Runde rot. Kleine Unschärfen: K-1 |
| Datenschutzerklärung live = Vorlage | ✅ | Textvergleich (Tags, Kommentare und `<style>` entfernt): einziger Unterschied ist der Kontaktblock in Abschnitt 1 |
| Formular-Hinweis „Nur wenn angehakt, gibt der Proxy das Guthaben an diese Seite weiter.“ | ✅ | Entspricht dem Code. Bei `hideCredit` gibt er trotz Haken nichts weiter, auch das deckt „nur“ ab |
| 4-Minuten-Cache: „nur das Abfrage-Ergebnis (… und, falls eingeschaltet, das sams-on-Guthaben)“ | ✅ | `worker.js:687-709`: Ergebnisobjekt inkl. `guthabenGefuehrt`; Schlüssel ist SHA-256 über Datum und alle Zugangsdaten samt Schalter (`cachekey.mjs:54`) |
| CORS-Begründung für sams-on (K-4) | ✅ | Selbst abgerufen: `GET /api/instance/lessing` → `Access-Control-Allow-Origin: *`, Sitzung per `Set-Cookie: PHPSESSID=…; HttpOnly`. Begründung in PROJEKT, README, proxy/README und Kopfkommentar `worker.js` stimmt |
| Actions auf Commit-SHAs gepinnt, Dependabot für `github-actions` | ✅ | `git ls-remote`: `actions/checkout` `refs/tags/v7.0.1` = `3d3c42e5…`, `actions/setup-node` `refs/tags/v7.1.0` = `949feb24…`. Beide sind Lightweight-Tags, also echte Commit-SHAs. GitHub zeigt einen Dependabot-Lauf `github_actions … success` |
| `deploy-commit.txt` = HEAD, Version 0.4.1 auf `/ueber` | ✅ | Live `deploy-commit.txt` = `886b5affecaddcd7…` = `git rev-parse HEAD`. `/ueber`: `var VERSION = '0.4.1'`. Live `/` byte-gleich zu `web/index.html` |
| Kopien unter `web/source/proxy/` und `web/docs/` byte-gleich, neuer Bericht verlinkt | ✅ lokal und live / ⚠️ Altlast | `cmp`: 5 Proxy-Dateien, 7 Doku-Dateien gleich. Live: `source/proxy/*` und `docs/PROJEKT.md`, `docs/OFFEN-…`, `docs/PEER-REVIEW-2026-10-29.md` byte-gleich zu HEAD; `/ueber` verlinkt den neuen Bericht. Aber: Der entfernte Bericht der siebten Runde wird live weiter ausgeliefert (siehe A-4) |
| Kopfzeilen HS-PRJ v6, HS-OFF v6 | ✅ | `stamp.py check` → beide `OK` |
| PROJEKT: „~99 %“ für `worker.js` | ✅ | `c8`: `proxy/` 99,92 % Statements. „Gesamt rund 96 %“ ist inzwischen 98,08 %, also veraltet, aber in die günstige Richtung |
| OFFEN Punkt 5: PHP-Lücken „im 8.2-Zweig erst ab 8.2.35 behoben ([Unit 42])“, „Fixes seit 21.10.2026“ | ⚠️ | Die Quelle nennt keine Versionsnummer. Siehe K-2 |

### 2b. Befunde der achten Runde (IDHDKM8)

| Befund | Status | Beleg |
|---|---|---|
| K-1 / B-1 Datenschutztext „fragt gar nicht ab“ | **behoben** | Neuer Text live = Vorlage = Code (2a). Restunschärfen in K-1 sind 🟢 |
| K-2 5-€-Schwelle falsch begründet | **behoben** | `worker.js:497-500`, PROJEKT, proxy/README: „eigene Festlegung“, mit `lowCreditWarning` korrekt erklärt |
| K-3 PHP-Version „von außen nicht prüfbar“ | **teilweise** | Indiz mit Header und Backport-Vorbehalt steht drin. Quelle und Datum stimmen nicht ganz (K-2 unten) |
| K-4 CORS-Begründung | **behoben** | 2a |
| K-5 „Alle behoben“ für A-5 bis A-8 | **behoben** | Erledigt-Zeile 0.3.4 nennt jetzt die Ausnahme A-7; mit 0.4.1 erledigt |
| K-6 Stand-Datum, Kopfkommentar | **behoben** | OFFEN „Stand: 29.10.2026“; Kopfkommentar `worker.js` nennt sams-on |
| A-1 Logout/Timeout/403 ungetestet | **teilweise** | Logout mit Session, Erfolgs- und Fehlerpfad, 403, beide Timeouts: getestet, Mutanten rot. Logout *nach* Budget-Ablauf: nur scheinbar getestet (A-1 unten) |
| A-2 Committet ≠ deployed | **behoben** | OFFEN unterscheidet „im Repo seit“ / „live ab Deploy von 0.4.1“; live bestätigt |
| A-3 Browser-Datensparsamkeit ungetestet | **behoben** (für die beiden Funktionen) | Mutant rot. Die Verdrahtung der Speichersperre selbst ist weiter ungetestet (A-2 unten, 🟢) |
| A-4 bis 50 s Wartezeit | **behoben** | Budget 15 s, Logout außerhalb. WebUntis hat weiter kein Budget (A-3 unten) |
| A-5 Actions an beweglichen Tags | **behoben** | 2a |
| B-1 | siehe K-1 | |
| B-2 Verarbeitungsverzeichnis kennt sams-on nicht | **[ungeprüft]** | Nicht in Commit oder OFFEN erwähnt. Die Datei habe ich auftragsgemäß nicht gelesen. Ihr Änderungsdatum (29.10. 17:38, fünf Minuten nach dem Commit) deutet auf eine Bearbeitung hin, belegt sie aber nicht |
| B-3 `hideCredit` ignoriert | **behoben**, mit Randfall | D-1 unten |
| C-1 „Instanz“ | **behoben** | Live-Meldungen in 2a |
| C-2 Speichersperre ohne Kindnamen | **behoben** | Live im Browser |
| C-3 Fehlalarm bei gesperrtem Speicher | **behoben** | Eigener Text, eigene Rückfrage, Test |
| C-4 Barrierefreiheit am Feld | **behoben** am Feld | `aria-describedby` und dauerhafte Alert-Region live geprüft. Das alte Muster lebt im neuen Hinweis `#storageBlocked` und im Toast weiter (C-1 unten) |
| D-1 `dayId`-Format unbelegt | **teilweise** (wie erwartet) | Uhrzeit ohne Zone erlaubt, mit Zone abgelehnt; die echte Form bleibt offen und steht so in OFFEN |
| D-2 „Ei“, `RangeError` | **behoben** | Mutanten rot |
| D-3 Anführungszeichen | **behoben** | live |
| D-4 `parseFloat("4,99")` (Fundstück) | entfällt | kein Handlungsbedarf |

---

## 3. Korrekturen

**K-1 (Datenschutzerklärung, 🟢): zwei kleine Unschärfen, kein Überversprechen mehr.**
(a) „… alles andere verwirft er sofort“: Die Kontonummer (`userId`) verwirft er
nicht, er schickt sie im Pfad der Bestellabfrage an sams-on zurück. Das ist
harmlos, weil sie von dort kommt, steht aber nicht da. Vorschlag: „verwendet
davon nur die Kontonummer für die Bestellabfrage“.
(b) Der Absatz „Was das technisch bedeutet“ sagt, TLS werde „zu WebUntis bzw.
Mensamax neu aufgebaut“. sams-on fehlt dort, steht aber zwei Sätze weiter
unten. Für einen Text, der gerade erst auf Genauigkeit gebürstet wurde, lohnt
sich das eine Wort.

**K-2 (OFFEN Punkt 5, 🟢): Die Quelle trägt die Versionsaussage nicht.**
`OFFEN-naechste-Fixes.md:133-134`: „im 8.2-Zweig erst ab 8.2.35 behoben
([Unit 42](…cve-2026-109618-cve-2026-109619.md?lg=en&pdf=print))“. Der
Unit-42-Brief (Markdown-Export und HTML-Seite, beide durchsucht) nennt keine
PHP-Versionsnummer. Er verweist auf die PHP-Gruppe. Die Version steht im
php.net-Changelog: „Version 8.2.35 22 Oct 2026 — Core: Fixed GHSA-w8hw-w9fx-j79w,
GHSA-6wmf-4rv5-p3rp (Avoid state corruption via bailout)“, zeitgleich mit
8.3.36, 8.4.27 und 8.5.12. Dass diese GHSAs die beiden CVEs sind, passt zur
Beschreibung (`longjmp`/Bailout), steht dort aber nicht ausdrücklich
[ungeprüft]. Drei Korrekturen:
1. php.net als Quelle der Version nennen.
2. Datum 22.10. statt 21.10. (21.10. ist das Datum der Palo-Alto-Signaturen).
3. Den Link auf die kanonische Seite ohne `.md?…&pdf=print` setzen.

Und inhaltlich wichtiger: Unit 42 meldet im Update vom 29.10. aktive
Ausnutzung („actively ex[ploited]“). Das gehört in den Satz, weil es die
Dringlichkeit für den Hinweis an den Betreiber ändert.

**K-3 (PROJEKT, Testtabelle, 🟢):** `loadConfig()/saveConfig() (Property-Tests)`:
Das sind drei benannte Klassen mit festen Werten, keine generierten Fälle.
Ebenso die Zeichenreferenzen (siehe 2a). Ich finde die Tests gut, nur das
Etikett stimmt nicht. Bei Deiner eigenen Regel („Property-based mit benannten
Äquivalenzklassen“) sollte das Etikett genau sein.

**K-4 (Commit, OFFEN, 🟢): „19 Mutanten, jeder rot“ ohne Liste.** Ohne Liste
lässt sich das nicht gegenprüfen. Die grünen Mutanten aus A-1 zeigen, dass die
Auswahl die interessantesten Stellen ausgelassen hat. Bitte künftig die
Mutanten auflisten, wie in `e421f25`.

**K-5 (PROJEKT, 🟢):** „Gesamt rund 96 % Statement-Coverage“: gemessen 98,08 %.
„Links zu den beiden älteren Berichten (27.08.) zeigen bewusst auf GitHub“:
Inzwischen sind es drei (auch `PEER-REVIEW-2026-10-09b.md`).

---

## 4. Zusatzbefunde

### A. Security in der Tiefe

**Threat Model, kurz.** An der Angriffsfläche ändert 0.4.1 nichts
Grundsätzliches. Neu sind ein Zeitgeber, ein nachgelagerter Logout und ein
zusätzlich gelesenes Feld der Instanz-Info. Alle Wege habe ich noch einmal
durchgesehen: Eingabefelder (Schuladresse, Benutzername, Passwort, Schalter)
und sams-on-Antworten (Cookies, `userId`, `dayId` mit Uhrzeit, `title`,
`creditAmount`, `hideCredit`, 3xx). Nichts davon erreicht einen anderen Host,
einen Header außer dem RFC-6265-gefilterten Cookie, einen URL-Pfad außer der
Ziffern-`userId` oder ungeprüft die Anzeige:
- `dayId` wird nur noch als per Regex herausgeschnittenes Datum
  weiterverwendet (`day[1]`), und das nur zum Vergleich.
- `hideCredit` wird auf `boolean | null` reduziert.
- Weiterleitungen werden nie verfolgt.
- `web/index.html` enthält kein einziges `innerHTML`.

Jede sams-on-Anfrage endet: die vier vor der Antwort nach 10 s einzeln bzw.
15 s gemeinsam, der Logout nach seinen eigenen 10 s. Hängt der Logout, hält er
weder die Antwort auf noch bleibt er offen (Test mit hängendem Logout und
`fire(10000)` ist korrekt gebaut).

**🟡 A-1: „The logout still goes out“ ist nur zur Hälfte getestet: der Mock ignoriert abgebrochene Signale.**
`mockFetch` (`run-tests.mjs:1258-1265`) ruft den Handler auf, egal ob
`options.signal` schon abgebrochen ist. Echtes `fetch` wirft dann sofort und
schickt nichts. Der Test `the whole sequence has one shared time limit; the
logout still goes out` (`run-tests.mjs:1923`) prüft nur, dass der letzte
*Aufruf* ein Logout war.

Gegenprobe:
- Mutant M01: Logout mit `budget.signal` (genau das, was ein Refactoring
  „Logout auch über `samsonFetch`“ ergäbe). Mit dem Original-Mock:
  `333 Tests: 333 ✓ 0 ✗`.
- Derselbe Mutant, Mock um eine Zeile ergänzt
  (`if (options.signal?.aborted) throw options.signal.reason;`):
  `332 ✓ 1 ✗`, rot ist genau dieser Test.
- Positivkontrolle: unveränderter Code mit ergänztem Mock → `333 ✓ 0 ✗`.

Im heutigen Code ist alles richtig (`worker.js:592-595` übergibt kein Budget).
Die Eigenschaft, die der Testname verspricht, ist aber nicht abgesichert.
Fix: die eine Zeile in `mockFetch` übernehmen. Das macht alle Worker-Tests
realistischer, nicht nur diesen.

Meine Mutanten für die neuen Pfade (je eigene Kopie, `node run-tests.mjs`):

| Mutant | Ergebnis |
|---|---|
| Logout `await` statt `ctx.waitUntil` | rot (1) |
| Logout ohne Session-Cookie | rot (1) |
| Logout nur im Erfolgsfall | rot (2) |
| **Logout mit Budget-Signal** | **grün** |
| Budget-Signal in `fetchWithTimeout` weg | rot (1) |
| Budget 15000 → 15001 / Einzel-Timeout 10000 → 10001 | rot (1) / rot (2) |
| `signal` ganz weg | erkannt (Suite hängt, Exit ≠ 0) |
| 403 nicht als Login-Fehler | rot (1) |
| `hidden` für den Betrag ignoriert | rot (1) |
| unbekanntes `hideCredit` als `false` / nur `'1'` als versteckt | rot (2) / rot (2) |
| `guthabenGefuehrt` nicht in der Antwort | rot (3) |
| `hideCredit` auch ohne Haken gelesen | grün (harmlos, aber die Zusage „only looked at when …“ ist ungepinnt) |
| `dayId` mit Zeitzone erlaubt / Uhrzeit nicht abgeschnitten | rot (1) / rot (2) |
| alte `CODE_LINE` / `fromCodePoint` ungeprüft | rot (2) / rot (1) |
| `storageBlocked` nicht gesetzt | rot (1) |
| `lunchRequestFields` gibt alles zurück | rot (5) |
| Budget-Timer nicht gelöscht | grün (harmlos) |
| alte Meldung „Instanz … nicht gefunden“ | grün |
| **Speichersperre aus** (`&& false`) | **grün** |
| Anzeige „nicht geführt“ aus | grün |
| `aria-describedby` nicht gesetzt | grün |
| Toast ohne Kindnamen | grün |
| Fehlerregion wieder per `hidden` statt Text | grün |

Ein weiterer Mutant (Budget beim 401-Pfad abbrechen) war äquivalent und zählt
nicht. Bilanz: 18 von 27 erkannt.

**🟢 A-2: Die Speichersperre selbst ist ungetestet.** Getestet ist die
Entscheidungsfunktion `extractSamsonInstance`, nicht ihre Verdrahtung
(`index.html:917-936`). Der Mutant „Sperre aus“ bleibt grün. Das Risiko ist
klein, weil der Proxy eine unbrauchbare Adresse ohnehin ablehnt (`samsonOrigin`,
Property-Tests). Gespeichert würde dann aber eine Adresse, die nie
funktioniert. Das gehört in den Topf „Inline-Script testbar machen“ (OFFEN
Punkt 3).

**🟢 A-3: Der Einzel-Timeout endet mit den Headern, nicht mit dem Body.**
`fetchWithTimeout` löscht den Zeitgeber im `finally`, sobald die Header da
sind (`worker.js:135-137`). Ein Server, der Header schickt und den Body nie
beendet, hält also jeden *WebUntis*- und *Mensamax*-Abruf unbegrenzt fest.

Nachgestellt mit der wörtlich kopierten Funktion gegen einen lokalen
Node-Server, Timeouts verkürzt:
- Positivkontrolle (Body vollständig): `ok (18 ms)`.
- Body hängt, nur Einzel-Timeout: `STILL HANGING after 3s`.
- Body hängt, mit Budget: `rejected … (806 ms)`.

Für sams-on fängt das neue Budget den Fall also ab, jedenfalls in Node. Ob
Workers einen Abbruch auch auf den laufenden Body überträgt, habe ich nicht
geprüft [ungeprüft]. Die Meldung lautet dann allerdings „keine gültige
JSON-Antwort“ statt „Zeitüberschreitung“. Der Kopfkommentar verspricht
„a hung request doesn't keep running indefinitely“. Das stimmt für sams-on,
für die beiden anderen Anbieter nicht. Vorschlag: dasselbe Budget-Muster für
WebUntis (fünf Abrufe plus Logout nacheinander in `getTimetable`, also im
ungünstigsten Fall rund 60 s bei hängenden Antworten) und Mensamax. Das war schon vor
0.4.1 so, deshalb 🟢.

**🟢 A-4: Live wird der entfernte Bericht der siebten Runde weiter ausgeliefert.**
`GET /docs/PEER-REVIEW-2026-10-09b.md` → `HTTP/2 200`, `cf-cache-status: HIT`,
`age: 96657`, `cache-control: public, s-maxage=604800`, 25 769 Bytes alter
Bericht. Gegenprobe mit Cache-Buster (`?x=…`) → `HTTP/2 404`. Die Datei ist
also nicht mehr im Deployment, die Cloudflare-Kante hält die Kopie aber bis zu
sieben Tage. Alle aktuellen Dateien kommen dagegen mit
`max-age=0, must-revalidate`. Woher das `s-maxage` kommt, habe ich nicht
geklärt [ungeprüft]. `web/_headers` setzt es nicht. Inhaltlich harmlos, der
Bericht ist öffentlich auf GitHub. Als Betriebslehre gilt aber: „Aus dem
Deploy entfernt“ heißt nicht „offline“. Sollte je eine Datei versehentlich
live gehen, die nicht dorthin gehört (`impressum.html`,
`Verarbeitungsverzeichnis…`), reicht ein neuer Deploy nicht, dann braucht es
einen Cache-Purge. Das gehört als Satz in den Deploy-Abschnitt von PROJEKT.

**🟢 A-5: Kein Logout, wenn der Login selbst in die Zeitüberschreitung läuft.**
Der Logout hängt am inneren `try` nach dem Login (`worker.js:562-597`). Bricht
das Budget den `POST /api/login` ab, nachdem sams-on ihn schon verarbeitet hat,
bleibt diese Sitzung bis zum Ablauf offen. Selten und folgenarm, aber für die
offene Frage „beendet ein Proxy-Login die Sitzung der Eltern?“ (OFFEN 5) wäre
es gut, den Fall zu kennen.

### B. Datensparsamkeit / CCC

**Datenfluss 0.4.1, nachvollzogen im Code:**
1. Browser → Proxy: wie in 0.4.0, nur der Block des gewählten Anbieters
   (jetzt getestet, Mutant rot).
2. Proxy → sams-on: unverändert. Neu ist nur, dass der Logout nach der Antwort
   kommt; er trägt dieselbe Session.
3. sams-on → Proxy: Instanz-Info (bei Haken wird jetzt `hideCredit` daraus
   gelesen, sonst bleibt der Body ungelesen), Kontoobjekt mit Name, E-Mail,
   Ausweisnummer und Kontostand (immer), Bestellungen des Tages.
4. Proxy → Browser und Cache: `lunch`, bei Haken `guthaben`, `guthabenKnapp`,
   `guthabenGefuehrt`; bei `hideCredit` nur `null/false/false`, ohne Betrag
   (Test mit `987,65`, der nirgends in der Antwort auftaucht).

Text und Technik stimmen jetzt überein. So sieht ehrliche Transparenz aus,
genau so wollte ich das haben.

**🟢 B-1: `hideCredit` wird nur bei Haken gelesen, das ist ungepinnt.**
Der Mutant „immer lesen“ bleibt grün. Er ist datenschutzrechtlich egal (die
Instanz-Info enthält keine Personendaten). Nenne es aber im Kommentar nicht
als Eigenschaft, wenn kein Test darauf achtet, oder schreib den Test (ein
`text()`-Spion auf der Instanz-Antwort reicht).

**🟢 B-2 (Kontext): sams-on läuft mit einer PHP-Version unterhalb des Fixes einer aktiv ausgenutzten RCE.**
Selbst abgerufen: `X-Powered-By: PHP/8.2.33`, `Server: Apache/2.4.62 (AlmaLinux) OpenSSL/3.5.8`.
php.net: 8.2.35 vom 22.10. (siehe K-2). Der Backport-Vorbehalt in OFFEN ist
richtig. Für Familien heißt das aber: Bei jedem „Aktualisieren“ (höchstens
einmal pro 4 Minuten) gehen Benutzername und Passwort des Kinderkontos an
einen Server, dessen Versionskennung auf eine ungepatchte, laut Unit 42 seit
29.10. aktiv ausgenutzte Lücke deutet. Die App macht das nicht schlimmer als
ein Login von Hand. Ein Satz in OFFEN mit Empfehlung an die Familien
(eigenes Passwort, das nirgends sonst verwendet wird) wäre aber ehrlich.
Der Hinweis an den Betreiber steht schon drin.

### C. Alltagsblick (nicht-technische Eltern) und Barrierefreiheit

**Gut gelöst:** Die Toasts sind jetzt klar und nennen das Kind („Bei „Ben“
fehlt die sams-on-Adresse der Schule …“). Der Sprung zum Feld funktioniert
live. „Schule … nicht gefunden — Adresse in den Einstellungen prüfen“ sagt
Eltern, was zu tun ist. Der neue Hinweis bei gesperrtem Speicher ist ehrlich
formuliert („lässt sich so nicht prüfen“). Gleichzeitig behauptet er nicht
mehr, es *gäbe* gespeicherte Einstellungen. Für Mensamax- und
ccCampus-Familien habe ich keinen Kollateralschaden gefunden. Die
`aria-describedby`-Schleife greift nur bei Elementen mit `data-describes`,
und die gibt es nur im sams-on-Block.

**🟢 C-1: Fehlt die Adresse ganz, erfahren Screenreader-Nutzer:innen nicht, warum gespeichert wird und doch nicht.**
Live geprüft: leere Adresse, „Speichern“ → Fokus springt aufs Feld,
`aria-invalid="false"`, Fehlerregion leer, Text nur im Toast. Der Toast
(`index.html:1434-1443`) ist ein `div` ohne `role="status"`/`aria-live`,
verschwindet nach 3,2 s und wird nicht angesagt. Das verletzt WCAG 2.2,
4.1.3 Status Messages (AA). Im Fall „Adresse ungültig“ ist es dagegen
gelöst, weil der künstliche `blur` die Alert-Region füllt (live geprüft).
Vorschlag: Bei fehlender Adresse dieselbe Region mit „Bitte die Adresse
Deiner Schule bei sams-on eintragen“ füllen und `aria-invalid="true"`
setzen. Dann deckt das Feld beide Fälle ab, auch für 3.3.1 Error
Identification (A). Zusätzlich dem Toast-Container `role="status"` geben,
das hilft der ganzen App.

**🟢 C-2: Das gerade behobene Muster steckt im neuen Hinweis.** `#storageBlocked`
(`index.html:256`) hat `role="alert"` und wird per `hidden` umgeschaltet,
wie `#configUnreadable`. Beim Seitenstart ist das ohne Folgen. Da die Region
schon beim Laden sichtbar ist, sagt sie ohnehin kaum ein Screenreader an.
Konsistenter wäre ein statischer Hinweis ohne `role="alert"`.

**🟢 C-3: „Guthaben wird bei dieser Schule nicht geführt“ sagt mehr, als `hideCredit` weiß.**
`hideCredit` heißt im Bundle nur, dass die Nutzeroberfläche den Betrag nicht
zeigt (`n.adminArea==!1&&n.hideCredit==!1`). Ob die Schule ein Guthaben
*führt*, sagt das Feld nicht. „Diese Schule zeigt das Guthaben bei sams-on
nicht an“ wäre genau. Dasselbe gilt für den Kommentar in `types/heute-schule.d.ts`
(„when the school keeps no balance“).

### D. Nerd-Detailblick

**Ausdrücklich gut:**
- `fakeTimers()` mit `fire(ms)` statt echter Wartezeit, dazu `settlesWithin`
  als Hänger-Wächter mit dem *echten* `setTimeout`. Ein sauberes Muster.
- Das Herausschneiden der Inline-Funktionen per Klammerzählung, mit lauter
  Meldung, falls eine Definition verschwindet. Billig und wirksam.
- `budget?.aborted` unterscheidet die beiden Zeitüberschreitungen in der
  Meldung.
- `codePoint()` lässt Ungültiges als Text stehen, statt zu raten.
- Die neue `CODE_LINE` braucht auch bei 2000 Zeichen nur 0,07 ms.

**🟢 D-1: Bei fehlendem `hideCredit` weicht der Proxy von sams-on ab, und der Test schreibt die Abweichung fest.**
sams-on zeigt den Betrag nur, wenn `hideCredit == false` (lose Gleichheit).
Ich habe das mit der echten Funktion gegen die Bundle-Bedingung verglichen:

| `hideCredit` | sams-on zeigt | Proxy |
|---|---|---|
| `'0'`, `0`, `false` | ja | Betrag |
| `'1'`, `1`, `true` | nein | „nicht geführt“ |
| `null`, fehlt | **nein** | **Betrag** |
| `''` | ja | „nicht abrufbar“ |

`run-tests.mjs:1132` legt `null` und `undefined` als „nicht versteckt“ fest.
Das ist eine Klasse nach der Implementierung, nicht nach dem Original. Bei
`lessing` kommt `'0'`, praktisch also folgenlos. Aber genau dieser Randfall
erzeugt das Szenario aus B-3 der achten Runde: „0,00 € — bald aufladen“ bei
einer Schule, die das Guthaben nicht zeigt. Vorschlag: `null`/fehlend als
`null` werten (dann „nicht abrufbar“). Das ist sicher, weil es nichts
behauptet.

**🟢 D-2: Doppeltes Dekodieren.** `decodeHtmlEntities('&#38;lt;b&#38;gt;')` →
`"<b>"`, der Browser zeigt `&lt;b&gt;`. Grund: erst numerisch, dann benannt.
Wegen `textContent` folgenlos, aber falsch. Ein einziger Durchlauf mit
`/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi` behebt es. Nebenbei: `&#X41;` (großes X,
im HTML erlaubt) bleibt stehen.

**🟢 D-3: Robustheit der offenen Annahmen (OFFEN 5), was passiert, wenn sie nicht stimmen:**
- `dayId` mit Zeitzone oder als Zahl: Die Karte zeigt
  „unerwartete Antwort auf orders/view (dayId)“ statt eines falschen Status.
  Das ist geschlossen gescheitert, richtig so. Ohne Zone als Ortszeit gelesen,
  passend zur Date-Pipe von sams-on.
- Stornierte Bestellungen in `orders/view`: Der Code liest kein Statusfeld,
  er würde „Essen bestellt: …“ zeigen. Das wäre der einzige offene Fall, der
  *falsch positiv* statt geschlossen scheitert. Indiz dagegen: Die
  sams-on-Tabelle hat nur die Spalten `dayId`, `title`, `orderNmb`
  [ungeprüft]. Beim ersten Storno gezielt ansehen.
- `creditAmount` mit Tausenderpunkt (`1.234,00`) oder als Zahl: „nicht
  abrufbar“, scheitert also sicher. Negative Beträge sind erlaubt, passend
  zum Feld `userCreditLimit` in der Instanz-Info.
- Instanz-Info ohne die Header der App: Mit `Accept: application/json` allein
  liefert sams-on einen **leeren Body** (`Content-Length: 0`, Typ `…v1+json`).
  Erst mit dem Content-Type `/application/vnd.akquinet.samson.v2` kommt das
  JSON (1299 Bytes). Der Worker sendet ihn, das passt also. Wer die Header
  mal „aufräumt“, verliert aber still `hideCredit` und sieht dann
  „Guthaben nicht abrufbar“. Ein Kommentar an `SAMSON_CONTENT_TYPE` wäre gut:
  „ohne ihn antwortet sams-on leer“.

---

## 5. Gewichtungs-Feedback

- **Zustimmung:** Die Reihenfolge stimmt. Zuerst der Datenschutztext (vom User
  freigegeben, diesmal technisch korrekt), dann die Testlücken, dann der
  Komfort. Dass Du D-1 der Vorrunde nicht „behoben“ nennst, sondern die drei
  offenen Fragen in OFFEN stehen lässt, ist genau die Ehrlichkeit, die dieses
  Projekt trägt.
- **Zu großzügig:** „19 Mutanten, jeder rot“ klingt nach Vollabdeckung. Ohne
  Liste und mit neun grünen Mutanten auf denselben Pfaden ist das eine
  Stichprobe, keine Gegenprobe. Benenne künftig die Mutanten und auch die,
  die grün bleiben dürfen (Kosmetik, UI).
- **Zu großzügig:** Die Erledigt-Zeile nennt A-1 („Logout … Zeitüberschreitung“)
  vollständig erledigt. Für den Logout *nach* Zeitüberschreitung stimmt das
  nur im Code, nicht im Test (A-1). Ein Mock, der Abbrüche ignoriert, ist die
  Art Prüfung, die wie eine Bestätigung aussieht.
- **Richtig gewichtet:** Kein 🔴 in der achten Runde, keins in dieser. Die
  Speichersperre und die UI-Texte als 🟢-Testlücke zu führen, nicht als 🟡,
  finde ich angemessen: Der Proxy ist die eigentliche Grenze, und die ist
  property-getestet.
- **Höher hängen:** Den PHP-Hinweis bei sams-on (K-2/B-2). Nicht weil die App
  etwas falsch macht, sondern weil „aktiv ausgenutzt“ für Eltern eine andere
  Nachricht ist als „kritisch“.

---

## 6. Fazit

Hält 0.4.1, was es verspricht? Ja, mit einer Einschränkung im Testnetz. Alle
Befunde der achten Runde sind in der Sache behoben. Der Datenschutztext sagt
jetzt live und in der Vorlage genau, was der Code tut. Zeitbudget, Logout nach
der Antwort und `hideCredit` funktionieren und laufen nachweislich live auf
HEAD `886b5af`. Die Einschränkung: Der Logout nach Zeitüberschreitung ist
richtig programmiert, aber nicht wirksam getestet (🟡 A-1, eine Zeile im
Mock). Der Rest ist 🟢: die Speichersperre und die neuen UI-Texte ohne Test,
ein `hideCredit`-Randfall gegen die sams-on-Semantik, ein Toast ohne
Live-Region, eine Quellenangabe, die die Versionsnummer nicht trägt, und ein
alter Bericht im Kanten-Cache.

Zur Qualität der Behauptungen: Zahlen, die sich messen lassen (Tests,
Coverage, SHAs, Live-Stand), stimmen exakt. Schwächer wird es dort, wo die
Behauptung eine Zusammenfassung ist („19 Mutanten“, „Property-Tests“, „laut
Unit 42“). Das ist dasselbe Muster wie in der Vorrunde, nur eine Stufe
kleiner: Die Fakten stimmen, die Etiketten sind etwas zu großzügig.
