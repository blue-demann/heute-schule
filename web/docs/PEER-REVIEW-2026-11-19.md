# Peer-Review „Der beste Freund“ — Zeitlimit und Tageswechsel in der App (0.4.8)

IDQZZKD · v1 · 2026-11-19 · b00eff79 · gültig

**Zweck:** Unabhängige Gegenprüfung von Version 0.4.8. Geprüft wird, ob das
neue Zeitlimit der App und der Sprung auf „Heute“ am neuen Tag tun, was sie
versprechen, ob die Aussagen über sie stimmen (Commit-Nachrichten,
`OFFEN-naechste-Fixes.md`, `PROJEKT.md`, `proxy/README.md`, `web/README.md`,
`web/ueber.html`, `UEBERGABE.md`) und ob sie neue Fehler, Testlücken oder
Widersprüche einführen. Dazu die Anhebung der Entwicklungswerkzeuge und
Barrierefreiheit nach WCAG 2.2.

**Prüfobjekt:** alles seit 0.4.7, `git log ddd1497..d3efec5`. Schwerpunkt:
- `e217525` „Zeitlimit von 15 s für Abrufe in der App“: `web/index.html`
  (`withRequestLimit`, `REQUEST_LIMIT_MS`, `PROXY_TIMEOUT`, `CCCAMPUS_TIMEOUT`,
  `fetchChild`, `showChildError`, `refreshAll`, `requestInFlight`,
  `fetchCcCampusLunch`, `ccCampusLunchRun`), Tests in `run-tests.mjs`.
- `bbcc4ea` „Seite über Nacht offen springt am neuen Tag auf Heute“:
  `shownDay`, `selectToday`, `showToday`, `checkNewDay` und ihre Verdrahtung
  (`visibilitychange`, `pageshow`, `setInterval`), Tests.
- `c1d3622` Abhängigkeiten: `eslint` 10.15.0, `eslint-plugin-html` 8.2.1,
  `overrides` für `glob`/`minimatch` unter `test-exclude`.
- Die Doku-Commits `e06e8d0`, `3678983`, `eb409e1`, `172f666`, `d3efec5`.

**Prüfer:** unabhängige Runde ohne Vorwissen über die schreibende Sitzung, 19.11.2026.
**Zugriff:**
- Lokal: Quellcode (HEAD = `d3efec5`, Arbeitsbaum sauber), Testsuite, Lint,
  Typprüfung, `npm ls`, `c8`. Alles davon in Kopien im Scratchpad; im
  Projektordner nur gelesen.
- workerd aus `node_modules` (ohne `wrangler`): eigene Sonde auf Basis von
  `tools/probe-workerd.mjs` in einer Kopie (A-1).
- Eingebauter Browser: Kopie von `web/` im Scratchpad, `fetch`-Stub und
  verstellbare Uhr vor dem App-Skript, `sw.js` entfernt, Testdaten in
  `localStorage`. Kein `fetch` verlässt die Seite (der Stub reicht nichts
  durch). Danach `localStorage`, Caches und Tab geleert bzw. geschlossen,
  Server beendet, `launch.json` exakt zurückgesetzt.
- Live: Website 9 GET. Live-Proxy: keine Anfrage. Keine Anfrage an
  WebUntis, Mensamax, sams-on oder ccCampus.
- Web: MDN Browser-Compat-Daten (`AbortController`, `AbortSignal`), ein
  Cloudflare-Changelog, eine Websuche; zwei `npm audit` gegen die
  npm-Registry (nur Paketliste).

**Methode:** Mutanten und Sonden nur in Kopien (`git archive d3efec5`,
`node_modules` als Symlink). Das Auswerteskript liest stdout (Zusammenfassung)
und stderr (rote Tests) und ist geeicht: inhaltsgleicher Austausch
(`15000` → `15e3`) → `411 Tests: 411 ✓ 0 ✗`, stderr leer; sicher roter
Kontrollmutant (`refreshAll` startet nie) → `411 Tests: 399 ✓ 12 ✗`, 28
stderr-Zeilen. Ein dritter, als „sicher rot“ gedachter Kontrollmutant
(Meldungstext „prüfen“ → „pruefen“) blieb grün. Das ist kein Fehler des
Skripts, sondern ein Befund (D-1). Jede eigene Sonde hat eine Gegenprobe
(siehe die jeweilige Stelle).

**Inhalt und Lesehilfe:**
1. Kurzeinschätzung: das Urteil in wenigen Sätzen.
2. Verifikationstabelle: jede Behauptung der Änderungen einzeln (2a),
   danach, ob die Fixes der zwölften Runde gehalten haben (2b).
3. Korrekturen an Doku und Kommentaren (K-1 bis K-6).
4. Zusatzbefunde nach Schwerpunkt (A Security und Betrieb, B
   Datensparsamkeit, C Alltag und WCAG 2.2, D Nerd-Details), mit Schweregrad
   und Beleg. Die Mutanten-Tabelle steht unter D-1.
5. Gewichtungs-Feedback. 6. Fazit. Anhang: Sonden und Anfragen nach außen.

Wer nur die Kurzfassung braucht, liest 1 und 6.

---

## 1. Kurzeinschätzung

Kein 🔴, kein 🟡. Das Zeitlimit tut, was es soll: Im Browser bricht eine
Anfrage, die nie antwortet, nach 15 002 ms ab. Beide Karten zeigen dann
„Server-Timeout …“, und es bleibt bei einer einzigen Anfrage. Elf von zwölf
nachgebauten Mutanten sind rot, wie behauptet. Der zwölfte ist wirklich
gleichwertig, das habe ich nachgerechnet. Auch der Tageswechsel greift über
alle drei Auslöser. Am selben Tag lädt nichts von selbst, mit offenen
Einstellungen ebenfalls nicht. Die Sommerzeit ist kein Problem: 70 080
Viertelstunden über zwei Jahre, keine Abweichung.

Die eine Sache, die ich vor dem Abhaken anschauen würde, ist C-2. Bleibt der
Bildschirm über Nacht an (Küchen-Tablet, Auto-Sperre aus), lädt die App
kurz nach Mitternacht und dann nicht mehr. Um 7 Uhr steht „Heute“ mit
richtigem Datum da, die Daten sind aber von 00:01, und kein Zeitstempel sagt
das. Vorher war das falsche Datum wenigstens ein Warnsignal. Der Rest ist
Feinschliff:
- Das Versprechen „⟳ holt nicht mehr den neuen Tag unter dem alten Datum“
  gilt erst ab der ersten Minutenprüfung (C-1, K-2).
- Zwei Testlücken: Das Lesen der Antwort unter dem Limit ist ungetestet, die
  Meldungstexte sind nicht festgenagelt (D-1).
- Ein paar Doku-Sätze sind einen Tick zu stark (K-3, K-4). Die Übergabe
  hinkt dem Live-Stand hinterher (K-5).

---

## 2. Verifikationstabelle

### 2a. Behauptungen der Änderungen

| Behauptung | Ergebnis | Mein Beleg |
|---|---|---|
| Tests, Lint, Typprüfung grün | ✅ | Kopie von `d3efec5`: `node run-tests.mjs` → `411 Tests: 411 ✓  0 ✗`, stderr leer; `npm run -s lint` Exit 0; `npm run -s typecheck` Exit 0. Zählung je Commit (je eigene Kopie): `ddd1497` 403, `c1d3622` 403, `e217525` 407, `bbcc4ea` 411, also +4 und +4 wie in den Commits |
| e217525: „Jede Anfrage an den Proxy und der ccCampus-Ablauf im Browser enden nach 15 s, Lesen der Antwort eingeschlossen, und werden per AbortController abgebrochen“ | ✅ Code, ⚠️ Test, ⚠️ alte iOS | `withRequestLimit` (`web/index.html:1364-1377`), `resp.json()` liegt innerhalb von `work` (`:1476`), ccCampus als Ganzes (`:1393-1395`). Browser: Abbruch nach 15 002 ms. Aber Mutant T19 (Limit endet schon bei den Headern, gelesen wird danach) bleibt grün (D-1). Unter iOS 11.3 bis 12.0, also innerhalb des erklärten Ziels, bricht `abort()` ein `fetch` nicht ab (K-4) |
| Karte: „Server-Timeout – Netz prüfen, ⟳ tippen.“ bzw. „ccCampus-Timeout – …“ | ✅ Verhalten, ⚠️ Test | Browser: `[data-fehler]` beider Karten = „Server-Timeout – Netz prüfen, ⟳ tippen.“, `aria-busy` danach `false`, Spinner aus. Die Tests vergleichen aber mit der Konstante selbst: Textänderung (K1) und ccCampus mit dem Proxy-Text (K5) bleiben grün (D-1) |
| „Läuft das Limit beim Proxy ab, zeigen die folgenden Kinder die Meldung sofort, ohne eigene Anfrage“ | ✅ | Browser: zwei Kinder, `fetch` hängt → nach 15 s eine einzige Anfrage, beide Karten mit der Meldung. Mutanten T5, T7, T18 rot |
| „Ein ccCampus-Limit betrifft nur dessen Schulessen“ | ✅ | `fetchCcCampusLunch` fängt das Limit und gibt `lunchFehler` zurück (`:1396-1398`). Mutant T14 (ccCampus-Limit wird weitergeworfen) rot |
| „Die eigene Wartezeit von 15 s vor einem neuen Abruf entfällt, weil jede Anfrage nun selbst endet“ | ✅ | `IN_FLIGHT_WAIT_MS` ist weg, die Kette startet auf `requestInFlight` (`:1561`). Browser: hängende Anfrage, nach 3 s neuer Tag → zweite Anfrage bei 15 001 ms, die erste mit `aborted@15001`. Mutant T16 (gar kein Warten) rot |
| „Test-fetch bricht wie das echte ab“ | ✅ | `run-tests.mjs:3256-3259`: Beim `abort` verlässt die Anfrage `pending` und lehnt mit `AbortError` ab, synchron im Ereignis, wie der Abbruch-Algorithmus des Fetch-Standards |
| „Property-Test streng: nie eine Anfrage, solange eine andere offen ist“ | ✅ (Sicht des Browsers) | Gezählt in einer Kopie über die 200 Fälle: 171 Limit-Schritte, davon 96 bei offener Anfrage des letzten Abrufs, 44 bei einer überholten, 31 ohne offene Anfrage; die Kaskade „folgende Kinder sofort“ in 80 Fällen mit 235 Darstellungen. Gut verteilt. „Offen“ heißt dabei offen im Browser; am Proxy kann eine abgebrochene Anfrage weiterlaufen (A-1) |
| „11 von 12 Mutanten rot, der grüne („Abbruch vor der Ablehnung“) ist gleichwertig“ | ✅ | Meine Nachbauten der zwölf in `PROJEKT.md` Abschnitt 9 genannten: T1 bis T11 rot, T12 grün. Gleichwertig, weil `abort()` die Ablehnung des `fetch` zwar sofort auslöst, sie die Kette aber erst über mindestens einen weiteren `then`-Schritt erreicht; die Ablehnung des Limits ist dann schon da. Das trägt, solange zwischen `fetch` und `Promise.race` ein `then` steht, im jetzigen Code überall. Die tatsächliche Reihenfolge (erst ablehnen, dann abbrechen) braucht die Überlegung gar nicht |
| „Im Browser mit hängendem fetch nachgestellt (Abbruch nach 15 007 ms)“ | ✅ selbst nachgestellt | 15 002 ms, eine Anfrage, beide Karten mit der Meldung |
| bbcc4ea: gezeichneter Tag `shownDay`, Prüfung bei `visibilitychange`, `pageshow` und jede Minute | ✅ | `web/index.html:791-826`. Browser mit vorgestellter Uhr: `visibilitychange` (Ereignis ausgelöst, Seite sichtbar) → „Heute“, Datum und Reiter neu, 2 Anfragen; `pageshow` → ebenso; Minutenprüfung echt abgewartet: nach 43 s „Heute“ und 2 Anfragen |
| „Am neuen Tag: Heute, Reiter und Datum neu, Abruf; mit offenen Einstellungen nur Reiter und Datum“ | ✅ | Browser: Einstellungen offen, neuer Tag → Datum neu, 0 Anfragen; Klick auf den Titel → `showDashboard()` → 2 Anfragen für den neuen Tag. Der einzige Weg zurück zur Übersicht ist `showDashboard()` (`:1587-1592`), der immer lädt |
| „Am selben Tag kein automatischer Abruf“ | ✅ | Browser: `visibilitychange` und `pageshow` am selben Tag → 0 Anfragen. Gegenprobe am neuen Tag → 2 |
| „Vier feste Fälle, 9 Mutanten je mindestens ein Test rot“ | ✅ | Meine Nachbauten N1 bis N9 alle rot (D-1). Die Verdrahtung (N10 bis N13) ist grün, wie in `PROJEKT.md` ehrlich vermerkt („liegt außerhalb der Testsuite“) |
| „⟳ holte dann schon den neuen Tag, während oben noch der alte stand, und ein am Vortag gewählter anderer Tag verrutschte um einen Tag“ (als behoben) | ⚠️ | Behoben ab der ersten Prüfung. Vorher bleibt das Fenster: Browser, „Mo 23.11.“ gewählt, Uhr auf 00:00:05, ⟳ → Datumszeile „Montag, 23.11.2026“, Reiter „Mo 23.11.“ aktiv, beide Karten mit den Daten vom **24.11.** Erst 43 s später sprang die Seite auf „Heute“ und lud ein zweites Mal (C-1, K-2) |
| c1d3622: „eslint 10.15.0 bringt minimatch 11 mit“ | ✅ | `node_modules/eslint/package.json`: `"minimatch": "^11.0.5"`; `npm ls`: `minimatch@11.0.9` |
| „overrides hebt nur unterhalb von test-exclude glob auf 14 und minimatch auf 11“ | ✅ | `package.json` `overrides.test-exclude`; `npm ls --all`: `test-exclude@8.0.0` → `glob@14.0.6`, `minimatch@11.0.9`; keine weitere `glob`/`minimatch` im Baum. `test-exclude` selbst verlangt `glob ^13.0.6` und `minimatch ^10.2.2`; die Anhebung geht also über eine Hauptversion (A-2) |
| „npm audit: 0 Lücken“ | ✅ mit Gegenprobe | Kopie von `d3efec5`: `found 0 vulnerabilities`. Gegenprobe Lockfile von `ddd1497`: 6 mittlere, darunter `glob` 9.0.0 bis 14.0.1 (GHSA-3g3m-2fjr-6pw4) und `minimatch` 7.0.0 bis 11.0.0 (GHSA-g3hv-75wg-m249). Die Advisory-Nummern in OFFEN stimmen |
| „eslint-plugin-html 8.2.0 stürzt damit beim Lint der HTML-Dateien ab“ | [ungeprüft] | Hätte den Download von 8.2.0 gebraucht |
| „Coverage-Tabelle vor/nach identisch (auch die nur über all:true gesammelte Datei)“ | ✅ nach, [ungeprüft] vor | `c8 node run-tests.mjs` in der Kopie läuft, `tools/check-live-headers.mjs` erscheint mit 0 %, also über `all: true` gesammelt. Den Stand „vor“ hätte ich nur mit den alten Paketen nachstellen können |
| `PROJEKT.md` Abschnitt 6, Zeile „Zeitlimit für jede Anfrage“ | ✅ bis auf einen Satz | Stimmt mit dem Code überein. „Läuft das Limit beim Proxy ab, liegt es am Netz oder am Proxy, nicht am Anbieter“ ist zu stark (K-3) |
| `PROJEKT.md` Abschnitt 7, Haushaltsausnahme | nicht prüfbar (Tatsache) / ⚠️ (Bedingung) | Dass nur noch der eigene Haushalt die App nutzt, kann ich nicht prüfen. Die Norm ist richtig zitiert (Art. 2 Abs. 2 lit. c DSGVO). Die Bedingung „Link wird nicht weitergegeben“ trifft den Punkt nicht ganz, und ob wieder jemand mitnutzt, kann der Betreiber gar nicht sehen (K-6, B-1) |
| `PROJEKT.md` Abschnitt 9, Testtabelle (zwei Zeilen) | ✅ mit Lücke | Die genannten Fälle und Mutanten gibt es, meine Nachbauten verhalten sich wie beschrieben. Lücken siehe D-1 |
| `PROJEKT.md` Abschnitt 10: „Das Gate bricht erst bei hohen Lücken ab“ | ✅ | `deploy.sh:128`: `npm audit --audit-level=high --include=dev` |
| `PROJEKT.md` Abschnitt 11, Release 0.4.8 | ✅ / ⚠️ ein Satz | Inhalt stimmt; „vorher … ⟳ holte schon heute, während oben noch gestern stand“ liest sich als vollständig behoben (K-2) |
| `proxy/README.md`: „einen neuen Abruf startet sie erst, wenn ihre laufende Anfrage beantwortet ist; jede Anfrage bricht sie nach 15 s ab“ | ✅ | `:1561` und `withRequestLimit`. Die Einschränkung zum Hinweg aus der zwölften Runde steht weiter da |
| `web/README.md`, Abschnitt „Rechtliche Rolle“ | nicht prüfbar / ✅ Form | Tatsachen wie oben; die erledigten Häkchen sind unverändert |
| `web/ueber.html`: Version 0.4.8 | ✅ | `:109`; live `VERSION = '0.4.8'` |
| OFFEN, Erledigt: „entfernte Berichte liefern 404, Gegenprobe 200“ | ✅ | Heute: `/docs/PEER-REVIEW-2026-10-30.md`, `-11-09.md`, `-11-09b.md` je `404`, `-11-09c.md` `200` |
| OFFEN, sams-on „laut User einwandfrei“ | nicht prüfbar | Aussage des Users; ehrlich als „einzeln nachgestellt sind die Fragen nicht“ eingeordnet |
| OFFEN, verbleibende Punkte 1 bis 3 | ✅ / ❌ eine Zahl | Neu nummeriert, Querverweis „passt zu Punkt 2“ stimmt. Punkt 2: „rund 900 Zeilen“, das Inline-Script hat 1 160 (`web/index.html:474-1634`) (K-5) |
| Kopfzeilen HS-PRJ v16, HS-OFF v19, IDNCVVS v5; Kopien byte-gleich | ✅ | `stamp.py check` in der Kopie: alle `OK`. `cmp PROJEKT.md web/docs/PROJEKT.md`, ebenso OFFEN: gleich |
| Live = HEAD | ✅ | `deploy-commit.txt` = `d3efec54…`; `/` SHA-256 gleich `web/index.html` (`f785f4f7…`); `/docs/PROJEKT.md` und `/docs/OFFEN-naechste-Fixes.md` gleich `web/docs/` |
| `UEBERGABE.md` Abschnitt 1: „Live 0.4.7 aus `eb409e1`; 0.4.8 ist gepusht, der Deploy durch User steht aus“ | ❌ | Live ist `d3efec5`, also 0.4.8 (K-5) |

### 2b. Haben die Fixes der zwölften Runde (ID9KS64) gehalten?

| Befund dort | Status in 0.4.8 | Beleg |
|---|---|---|
| A-1 „nie zwei Anmeldungen“ zu stark | **hält** | Die ehrliche Fassung steht weiter in `proxy/README.md` und im Kommentar `web/index.html:1520-1529` |
| C-1 Karte zeigt nach dem Tageswechsel den alten Tag ohne Ladeanzeige | **hält** | Alle Karten sofort auf „Lädt …“ (`:1539`). Browser: neuer Tag bei hängender Anfrage → beide Karten „Lädt …“, bis die neue Antwort kommt |
| C-2 ältere Daten über 👁/🚫 | **hält**, auch für das Limit | `showChildError` löscht `lastDataById` (`:1510-1515`), auch für die Kinder der Kaskade. Mutant T17 (Kaskade ohne Löschen) rot |
| B-1 Löschen über den echten Handler | **hält** | Test unverändert grün. Browser: Löschen während einer hängenden Anfrage → keine Karte, `localStorage` leer, Spinner aus (siehe aber B-2) |
| A-2, D-1, D-2 | unverändert | Proxy und `tools/` sind seit 0.4.7 nicht geändert (`git diff --stat ddd1497..d3efec5 -- proxy/*.js tools` leer) |

---

## 3. Korrekturen

**K-1 (🟢): Kommentar über `shownDay` (`web/index.html:787-790`).** „Every
offset counts from it“ stimmt nicht. Gerechnet wird überall ab `new Date()`:
`dateStrFor` (`:610-614`), `renderDateDisplay` (`:723-728`), `shortDate`,
`schoolDayOffset`. `shownDay` ist nur der Merker, an dem `checkNewDay` den
Wechsel erkennt. Genau diese Lücke zwischen Merker und Rechnung ist C-1.
Vorschlag: „The day the tiles and the date line were drawn for; a new
calendar day is detected against it.“

**K-2 (🟢): „⟳ holte schon den neuen Tag …“ als behoben.** Commit `bbcc4ea`,
OFFEN (Zeile „Aus dem Alltag, 19.11.2026“) und `PROJEKT.md` Abschnitt 11
beschreiben das Fehlerbild als erledigt. Es gibt es weiter, bis zur
nächsten Prüfung, also bis zu 60 s bei sichtbarer Seite (C-1). Entweder
ergänzen („bis zur nächsten Prüfung, höchstens eine Minute“) oder C-1
beheben.

**K-3 (🟢): „Liegt es am Netz oder am Proxy, nicht am Anbieter“
(`PROJEKT.md:274`), ähnlich der Kommentar `web/index.html:1351-1355`.** Die
„rund 13 s“ zählen im Worker ab dem Aufruf der Anbieter. Davor liegen
Rate-Limit-Abfrage, `request.json()` und Cache-Abfrage
(`proxy/worker.js:744, 757, 768-770`), danach die Übertragung der Antwort,
dazu Verbindungsaufbau und Hochladen auf Seiten des Handys. Die Reserve bis
15 s beträgt also 2 s minus Netz. Schöpft WebUntis sein Budget aus (10 s
Abruf, 3 s Abmeldung) und braucht das Mobilnetz mehr als 2 s, endet das
Limit wegen des *Anbieters*. Die folgenden Kinder zeigen dann „Server-Timeout
– Netz prüfen“, obwohl ihre Anbieter liefern würden. Selten und harmlos (⟳
hilft), aber die Aussage ist ein „meistens“, kein „immer“.

**K-4 (🟢): „werden per AbortController abgebrochen“.** Das erklärte Ziel
ist „iOS ab 11.3“ (`eslint.config.mjs:11-13`, `PROJEKT.md:203`). Laut MDN
Browser-Compat-Daten (`api/AbortController.json`) gibt es `AbortController`
in Safari ab 11.1, aber bis 12.1 nur mit dem Hinweis „doesn't really abort
fetch requests“. Die App stürzt dort nicht ab (der Konstruktor existiert),
und die Karte zeigt die Meldung trotzdem, denn das Limit kommt über
`Promise.race`, nicht über den Abbruch. Die Anfrage läuft im Hintergrund
aber weiter, und der nächste Abruf startet daneben. Auf Geräten, die über
iOS 12.1 hinaus nicht aktualisiert sind, ein Randfall. Ein Halbsatz in der
Syntax-Ziel-Entscheidung reicht.

**K-5 (🟢): Übergabe und eine Zahl in OFFEN.** `UEBERGABE.md:10`: „Live 0.4.7
aus `eb409e1`; … der Deploy durch User steht aus“. Live ist `d3efec5`
(`deploy-commit.txt`), Abschnitt 3 („Deploy von 0.4.8“) ist damit ebenfalls
erledigt. OFFEN Punkt 2 (`OFFEN-naechste-Fixes.md:122`): „rund 900 Zeilen“,
es sind 1 160.

**K-6 (🟢): Bedingung der Haushaltsausnahme (`PROJEKT.md` Abschnitt 7).**
„Die Ausnahme hängt deshalb auch daran, dass der Link nicht weitergegeben
wird“: Ein weitergegebener Link verarbeitet noch keine Daten. Es kommt
darauf an, ob jemand außerhalb des Haushalts die App *nutzt*. Das steht im
nächsten Satz auch richtig. Und es ist genau das, was der Betreiber nicht
sieht (B-1). Kein Rechtsrat, nur Präzision.

---

## 4. Zusatzbefunde

### A. Security und Betrieb

**🟢 A-1: Der Abbruch nach 15 s und die WebUntis-Abmeldung.**
Neu ist, dass die App eine Anfrage aktiv beendet. Bisher blieb sie offen.
Erreicht eine Anfrage, die auf dem Hinweg hing, den Proxy spät, kappt die
App die Verbindung, während der Worker noch angemeldet ist. Die zwölfte
Runde hatte gefragt, ob Cloudflare den Worker dann beendet und die Abmeldung
im `finally` (`proxy/worker.js:310-319`) ausfällt [ungeprüft].

Eigene Sonde in workerd (Kopie, Nachbau des Anbieters, `getTimetable`
braucht 3 s):
- Gegenprobe ohne Abbruch: Antwort nach 3 020 ms; der Nachbau sah
  `authenticate | getKlassen | getTimetable | getSubjects | getRooms | logout`.
- Client bricht nach 1 s ab: `AbortError` nach 1 004 ms; der Nachbau sah
  dieselben sechs Aufrufe, `logout` eingeschlossen.

In workerd läuft der Worker also nach dem Abbruch weiter und meldet sich ab.
Für die Produktion bleibt es offen [ungeprüft]. Cloudflares Changelog zu
`Request.signal` (22.05.2025) spricht von Aufräumarbeiten, „before your
Worker's invocation ends“, wenn der Client abbricht; das deutet eher auf ein
Ende hin. Schaden im ungünstigsten Fall: eine Sitzung am Klassenkonto, die
von selbst abläuft. Kein Handlungsbedarf, aber eine Zeile in `PROJEKT.md`
(„in workerd belegt, in Produktion offen“) würde die Frage nicht ein drittes
Mal aufkommen lassen.

**🟢 A-2 (positiv): Abhängigkeiten sauber und eng gehoben.** Die `overrides`
greifen nur unter `test-exclude`, nichts davon wird ausgeliefert, `npm ci` im
Deploy hält sich an den Lockfile. Die Gegenprobe mit dem Lockfile von
`ddd1497` zeigt die beiden Advisories, der neue Stand keine. Zu beachten
bleibt eins: `overrides` hebt über die Hauptversion hinweg, die
`test-exclude` angibt (`glob ^13` → 14, `minimatch ^10` → 11). Ob `c8` damit
richtig sammelt, zeigt nur ein Lauf. Der Lauf ist da (Coverage-Tabelle mit
der `all: true`-Datei), und die Übergabe nennt die Falle, wenn Dependabot
`c8` hebt. Gut gemacht.

Threat Model: unverändert. Keine neue Angriffsfläche, kein neuer Dritter,
keine neue Speicherung. Das Limit ist rein clientseitig.

### B. Datensparsamkeit und Transparenz

**🟢 B-1: Ob wieder jemand mitnutzt, kann der Betreiber nicht sehen, und das ist Absicht.**
Die Haushaltsausnahme hängt jetzt an der Bedingung „nutzt wieder eine Familie
außerhalb des Haushalts die App“ (`PROJEKT.md` Abschnitt 7, `web/README.md`,
`UEBERGABE.md` Abschnitt 5). Die App hat keine Konten und protokolliert keine
Nutzer. Eine ehemalige Familie, deren Einstellungen noch im Browser liegen,
kann morgen wieder tippen, ohne dass es jemand merkt. Datensparsam ist das
richtig. Juristisch heißt es aber: Die Bedingung ist nicht beobachtbar, und
die Prüfung kommt nur zurück, wenn jemand Bescheid sagt. Beobachtbar ist nur
der ccCampus-Fall (die Freischaltung einer neuen Domain,
`CCCAMPUS_ALLOWED_DOMAINS`). Vorschlag: den Auslöser konkret machen („wer
den Link bekommt oder eine Freischaltung erbittet“) und den früheren
Familien einmal sagen, dass sie ihre Daten löschen oder sich melden. Kein
Rechtsrat. Positiv nebenbei: Lehrkräftedaten laufen nicht durch den Proxy,
aus WebUntis wird nur `code === 'irregular'` als `vertretung` übernommen
(`proxy/worker.js:369`).

**🟢 B-2: „Alle Daten löschen“ lässt eine laufende Anfrage noch bis zu 15 s offen.**
Browser: Abruf hängt, nach 1 s Einstellungen und „Alle Daten löschen“ →
Karten weg, `localStorage` leer, Spinner aus, aber die Anfrage endet erst mit
`aborted@15001`. `abandonRefreshes()` (`web/index.html:1571-1575`) erhöht
nur die Laufnummer. Die Antwort wird verworfen, insofern alles richtig. Wer
löscht, will aber auch, dass nichts mehr mit seinen Zugangsdaten unterwegs
ist. Mit dem neuen `AbortController` liegt der Fix nahe: die Controller der
laufenden Anfragen merken und in `abandonRefreshes()` abbrechen (nicht bei
jedem neuen Tipp, da soll der Proxy fertig werden).

### C. Alltag und Barrierefreiheit

**🟢 C-1: In der ersten Minute nach Mitternacht holt ⟳ den neuen Tag unter dem alten Datum.**
`btnRefresh` ruft `refreshAll` direkt auf (`web/index.html:1577`), die
Reiter rufen `selectDayIndex` (`:774-784`). Keiner von beiden fragt
`checkNewDay`. Beleg im Browser (Abschnitt 2a): „Mo 23.11.“ gewählt, Uhr
00:00:05, ⟳ → oben „Montag, 23.11.2026“, Karten mit Daten vom 24.11.; 43 s
später springt die Seite auf „Heute“ und meldet sich ein zweites Mal an. Ein
Tipp auf einen Reiter im selben Fenster rechnet den Abstand ab dem neuen Tag,
die Beschriftung stammt aber vom alten: Wer „Fr 20.11.“ tippt, kann Montag
bekommen. Nur bei sichtbarer Seite und nur bis zur nächsten Minute, deshalb
🟢. Fix, klein: Am Anfang von ⟳ und den Reiter-Handlern
`if (dateStrFor(0) !== shownDay) { showToday(); return; }`. Dazu das Datum
einmal je Abruf in `refreshAll` berechnen statt je Kind in `fetchChild`
(`:1459`). Sonst kann ein Abruf um 23:59:55 Kind 1 für heute und Kind 2 für
morgen holen.

**🟢 C-2: Über Nacht sichtbar → Abruf um Mitternacht, am Morgen veraltet, ohne Hinweis.**
Die Minutenprüfung ist für „a screen left on overnight“ da (`:820-826`). Sie
lädt kurz nach 00:00. Danach lädt die App am selben Tag bewusst nicht mehr
von selbst (Browser: 0 Anfragen bei `visibilitychange` am selben Tag). Auf
einem Küchen-Tablet mit abgeschalteter Auto-Sperre steht um 7 Uhr also
„Heute“, das richtige Datum, die Karten ohne Ladeanzeige, alles mit dem
Stand von 00:01. Einen Zeitstempel zeigt die Karte nicht (`renderChildResult`,
`:1158`ff., keine Uhrzeit). Eine Vertretung, die morgens eingetragen wird,
fehlt. Genau dafür heißt die App „Heute Schule“.

In 0.4.7 war es im selben Fall schlimmer (gestriger Plan), aber das falsche
Datum war ein sichtbares Warnsignal. Dazu kommt eine Anmeldung bei allen
Anbietern um Mitternacht, die niemand angesehen hat. Die eigene Begründung
in `checkNewDay` lautet: „every refresh logs in at the providers, so a fresh
one stays the user's choice“. Vorschläge, User entscheidet:
- a) „Stand hh:mm“ an die Datumszeile, ohne neue Daten;
- b) bei der Minutenprüfung nur Reiter und Datum neu zeichnen und die Karten
  als „⟳ für heute tippen“ markieren, geladen wird beim nächsten
  `visibilitychange` oder Tipp;
- c) beides.

Für Handys mit Auto-Sperre ändert das nichts, dort greift `visibilitychange`
beim Entsperren und lädt frisch.

**🟢 C-3: WCAG 2.2 für die neuen Zustände: kein Verstoß.**
Geprüft im eingebauten Browser (Chromium) an der Kopie, dazu Quelltext:
- 4.1.3 Statusmeldungen, AA: Die Timeout-Meldung erscheint in
  `#childCards` mit `aria-live="polite"` (`web/index.html:228`); `aria-busy`
  geht nach dem Limit auf `false` (gemessen). Erfüllt im DOM; was ein
  Screenreader ansagt, habe ich nicht gehört [ungeprüft].
- 3.3.1 Fehlerkennzeichnung, A: Der Fehler steht als Text auf der Karte
  („⚠ Keine Daten“ und die Meldung). Erfüllt.
- 2.2.1 Zeitbegrenzung anpassbar, A: nicht einschlägig. Die 15 s begrenzen
  das Netz, nicht eine Eingabe des Nutzers.
- 3.2.5 Änderung auf Anfrage, AAA: Der automatische Sprung auf „Heute“
  ändert Inhalt ohne Anfrage. AAA wird nicht verlangt, und der Sprung ist
  hier gewollt. Kein Verstoß gegen 3.2.2 Bei Eingabe, A (keine Eingabe
  beteiligt).
- 2.2.2 Pausieren, Beenden, Ausblenden, A: Der drehende ⟳-Knopf startet jetzt
  auch beim Tageswechsel von selbst und dreht bei mehreren Kindern länger
  als 5 s. Das war beim Start der Seite schon immer so; das Limit begrenzt
  die Dauer jetzt sogar. Ob ein Ladeindikator unter 2.2.2 fällt, ist eine
  Auslegungsfrage, ich lasse es bei dem Hinweis.
- 3.1.5 Leseniveau, AAA: „Server-Timeout“ ist für die nicht-technische
  Verwandtschaft Fachjargon; „Server antwortet nicht – Netz prüfen, ⟳
  tippen.“ wäre klarer. Text vom User entschieden, also nur ein Vorschlag.

Familien-Tablet: Syntax bleibt ES2019 (Lint Exit 0), neue APIs sind
`AbortController` und `Promise.prototype.finally`. Beide gibt es in Safari ab
11.1, also im Ziel ab iOS 11.3. Einschränkung siehe K-4. Sommerzeit siehe D-3.

### D. Nerd-Details

**🟢 D-1: Gute Wächter für das Limit, drei Stellen ohne Wächter.**
Mutanten (Kopien, Auswertung stdout + stderr, Skript geeicht wie oben):

| Mutant | Ergebnis |
|---|---|
| K0 inhaltsgleich `15000` → `15e3` | grün (Kontrolle) |
| K2 `refreshAll` startet nie | 12 rot (Kontrolle) |
| K1 Timeout-Meldung „prüfen“ → „pruefen“ | **grün** |
| K3 Meldung „Keine Verbindung …“ geändert | 1 rot |
| K4 Timeout-Meldung ohne das Wort „Timeout“ | 1 rot |
| K5 ccCampus-Timeout mit dem Text des Proxys | **grün** |
| T1 Proxy ohne Limit | 11 rot |
| T2 Limit 20 s | 3 rot |
| T3 kein Abbruch | 4 rot |
| T4 Zeitgeber nicht aufgeräumt | 2 rot |
| T5 Kette läuft nach dem Limit weiter | 1 rot |
| T6 jeder Fehler gilt als Limit | 2 rot |
| T7 folgende Kinder ohne Meldung | 2 rot |
| T8 ccCampus ohne Limit | 1 rot |
| T9 ccCampus-Speiseplan ohne Signal | 1 rot |
| T10 Proxy-Anfrage ohne Signal | 11 rot |
| T11 Limit-Fehler ohne Namen | 1 rot |
| T12 erst abbrechen, dann ablehnen | grün, gleichwertig (2a) |
| T13 ccCampus-Anmeldung ohne Signal | 1 rot |
| T14 ccCampus-Limit wird weitergeworfen | 1 rot |
| T15 Limit 14 s | 3 rot |
| T16 neuer Abruf wartet nicht auf die laufende Anfrage | 3 rot |
| T17 Kaskade behält die gemerkten Daten | 1 rot (Property-Test) |
| T18 Proxy-Limit gilt nicht als Limit | 1 rot |
| T19 Limit endet bei den Headern, Lesen danach ohne Limit | **grün** |
| N1 Tageswechsel nie erkannt | 3 rot |
| N2 gemerkter Tag nicht nachgeführt | 3 rot |
| N3 gewählter Tag bleibt | 2 rot |
| N4 Fenster bleibt | 2 rot |
| N5 lädt auch bei offenen Einstellungen | 1 rot |
| N6 lädt beim Tageswechsel nicht | 2 rot |
| N7 Reiter nicht neu gezeichnet | 3 rot |
| N8 Datum nicht neu gezeichnet | 3 rot |
| N9 lädt auch am selben Tag | 3 rot |
| N10 kein `visibilitychange` | grün, Verdrahtung (dokumentiert) |
| N11 kein `pageshow` | grün, Verdrahtung (dokumentiert) |
| N12 keine Minutenprüfung | grün, Verdrahtung (dokumentiert) |
| N13 „Heute“-Reiter ruft `selectToday` statt `showToday` (lädt nicht) | grün, Verdrahtung |
| N14 `checkNewDay` ohne `selectToday` | 3 rot |

Die drei Lücken:
- **T19:** „Lesen der Antwort eingeschlossen“ ist die eine Eigenschaft, die
  der Proxy in vier Runden mühsam gelernt hat (Inhalt hängt nach den
  Headern). In der App prüft sie kein Test: Das Test-`fetch` antwortet sofort
  mit fertigem JSON, `ccHangs` hängt nur vor den Headern
  (`run-tests.mjs:3447-3449`). Fix: eine Klasse „Header da, `json()` hängt“
  im Test-`fetch` und im Generator, für den Proxy und den ccCampus-Speiseplan.
- **K1/K5:** Die Tests vergleichen mit `d.page.PROXY_TIMEOUT` bzw.
  `TIMEOUT` aus derselben Seite (`run-tests.mjs:3465, 3484-3490`), dazu
  `includes('Timeout')` und `includes('⟳')`. Ein vom User entschiedener
  Text kann sich so unbemerkt ändern, und ccCampus könnte „Server-Timeout“
  sagen. Einmal den Wortlaut als Literal prüfen genügt. Bei „Keine
  Verbindung …“ geschieht das schon (K3 rot).
- **N13:** Die Handler-Registrierung von „Heute“ ist ungetestet. Vorher
  stand `refreshAll()` im Handler selbst; jetzt reicht ein vertauschter Name,
  und „Heute“ lädt nicht mehr. Gehört zur dokumentierten Grenze
  „Verdrahtung außerhalb der Testsuite“, ist aber der einzige Fall, bei dem
  ein Nutzer-Tipp still nichts mehr täte.

Zur Bindung an die Konstante: Die Test-Zeitgeber feuern nur bei genau
`ms === 15000`, deshalb sind T2 und T15 rot. Wie in den Runden elf und zwölf
vertretbar, weil die 15 s eine dokumentierte Festlegung sind.

**🟢 D-2: Wirft `work` synchron, bleibt der Zeitgeber stehen und lehnt später unbehandelt ab.**
`withRequestLimit` startet den Zeitgeber, bevor es `work(controller.signal)`
aufruft (`web/index.html:1364-1377`). Wirft `work` synchron, kommt
`Promise.race` nicht zustande, der Zeitgeber läuft weiter, und nach 15 s
lehnt `limit` ohne Abnehmer ab. Ein realer, wenn auch exotischer Weg:
`encodeURIComponent` wirft bei einem einzelnen Surrogat-Zeichen in der
ccCampus-Kundennummer (`:1410`). Sonde (Node, Funktionen aus der Seite
geschnitten):
- Gegenprobe `'123'` → Promise.
- `'12\uD800'` → `URIError: URI malformed` synchron.
- Nach Ablauf der Zeitgeber:
  `unhandledRejection: ccCampus-Timeout – Netz prüfen, ⟳ tippen.`

In `fetchChild` bliebe die Karte dann auf „Lädt …“. Das gab es (ohne die
unbehandelte Ablehnung) schon vor 0.4.8. Fix, eine Zeile:
`Promise.resolve().then(function(){ return work(controller.signal); })` im
`race`.

**🟢 D-3 (positiv): klein, richtig herum, und die Sommerzeit passt.**
- `withRequestLimit` lehnt *zuerst* ab und bricht *dann* ab, damit kommt
  „Keine Verbindung“ des abgebrochenen `fetch` nie auf die Karte, ohne
  dass man über Mikroschritte nachdenken muss. `finally` räumt den
  Zeitgeber auf, auch das ist getestet (T4 rot).
- Das Flag `timedOut` statt einer Zustandsmaschine: eine Variable je
  Abruf, keine geteilte Mutation zwischen Läufen.
- `checkNewDay` ist idempotent (`pageshow` und `visibilitychange` beim
  Zurückholen aus dem bfcache laden nur einmal, getestet).
- Sommerzeit: `dateStrFor` rechnet mit `setDate` in Ortszeit. Sonde mit
  `TZ=Europe/Berlin` über jede Viertelstunde 2026 bis 2027 (70 080 Zeitpunkte,
  beide Umstellungen je zweimal): `dateStrFor(0)` und `dateStrFor(1)` gleich
  dem Kalendertag aus `Intl.DateTimeFormat`, 0 Abweichungen. Gegenprobe mit
  einer Variante, die in Millisekunden rechnet: 5 840 Abweichungen. Ein
  Zeitzonenwechsel auf Reisen wird ebenfalls erkannt, weil `checkNewDay` auf
  Ungleichheit prüft, nicht auf „später“.

---

## 5. Gewichtungs-Feedback

- Kein 🟡 in dieser Runde, und das ist ehrlich verdient. Die Änderungen sind
  klein, jede Behauptung über das Verhalten hat sich im Browser bestätigt,
  und die Mutanten-Liste stimmt diesmal mit dem überein, was ich nachbauen
  konnte. Der Punkt aus der zwölften Runde („Mutanten nicht aufgezählt“)
  ist erledigt.
- C-2 ist 🟢, nicht 🟡: Er betrifft nur Bildschirme, die die ganze Nacht an
  sind, und 0.4.8 ist dort besser als 0.4.7. Es ist aber der Befund mit dem
  meisten Alltagswert, weil er den Kernzweck trifft (Vertretungen am Morgen)
  und weil die App jetzt *frischer aussieht, als sie ist*.
- C-1 und K-2 gehören zusammen: kleines Fenster, aber genau das gemeldete
  Fehlerbild, als behoben beschrieben.
- D-1 ist wieder das bekannte Muster: Die Gegenprobe steht dort, wo gebaut
  wurde (hängt vor den Headern), nicht dort, wo der Proxy-Teil der Geschichte
  gelehrt hat, dass es weh tut (hängt im Inhalt). Diesmal nur eine von drei
  Eigenschaften, die übrigen sind dicht bewacht.
- Zustimmung: Limit leicht über dem des Proxys, Kaskade ohne weitere
  Anfragen, kein automatischer zweiter Versuch, am selben Tag kein Abruf.
  Alles Entscheidungen, die Anmeldungen am Klassenkonto sparen.
- Zustimmung: `overrides` eng statt global, mit Ablaufbedingung in Doku
  und Übergabe.

---

## 6. Fazit

0.4.8 macht zwei Dinge, und beide funktionieren: Eine Karte hängt nicht mehr
endlos auf „Lädt …“, und eine über Nacht offene Seite landet am Morgen auf
„Heute“. Belegt im Browser, in Node über die Sommerzeit, mit 34 Mutanten
und in workerd für den Abbruch. Was bleibt, ist klein:
- ein Fenster von bis zu einer Minute nach Mitternacht (C-1);
- Daten von Mitternacht, die am Morgen frisch aussehen (C-2);
- eine ungetestete Eigenschaft und zwei nicht festgenagelte Texte (D-1);
- ein Kommentar und vier Doku-Sätze, die etwas zu viel versprechen
  (K-1 bis K-4), und eine Übergabe, die den Deploy noch nicht kennt (K-5).

Zur Arbeit selbst: sauber und vorsichtig. Die Aussagen über sich selbst sind
diesmal fast durchweg genau so groß wie das Geprüfte. Dass die Verdrahtung
außerhalb der Tests liegt, steht offen da, die Mutanten sind benannt, und
die Grenzen der zwölften Runde wurden nicht wieder überschrieben. Die
juristische Neubewertung ist nachvollziehbar begründet. Ihre Bedingung lässt
sich aber von der App aus nicht beobachten (B-1), das sollte man wissen.

---

### Anhang: Sonden und Anfragen nach außen

Alles im Scratchpad der Prüfsitzung (flüchtig, nicht im Repo), unter
`…/scratchpad/runde13/`:
- `base/`: `git archive d3efec5`, `node_modules` als Symlink.
  `base/tools/probe-abort.mjs`: Abwandlung von `tools/probe-workerd.mjs`
  mit zwei Fällen (A-1). Danach kein `workerd`-Prozess, kein
  `probe-workerd-*` im System-Temp.
- `at-ddd1497/`, `at-c1d3622/`, `at-e217525/`, `at-bbcc4ea/`: je
  `git archive`, für Testzählung und die `npm audit`-Gegenprobe.
- `tools/mutate.py`, `tools/defs.py`, `tools/defs2.py`, `tools/m1.json`,
  `tools/m2.json` und die Logs: Mutanten K0 bis K5, T1 bis T19, N1 bis N14;
  Kopie jeweils unter `mut/`.
- `stats/`: Kopie mit Zählern im Property-Test (2a).
- `tools/dst.mjs`, `index-dstmut.html`: Sommerzeit-Sonde mit Gegenprobe (D-3).
- `tools/syncthrow.mjs`: synchroner Wurf in `withRequestLimit` (D-2).
- `ui/`: Kopie von `web/` mit `fetch`-Stub, verstellbarer Uhr und Testdaten
  in `localStorage`, `sw.js` entfernt; über einen lokalen Server
  (`127.0.0.1:8793`) nur für die Dauer der Messung ausgeliefert. Der Eintrag
  in `~/dev/claude/.claude/launch.json` ist entfernt, die Datei byte-gleich
  zur Sicherung (SHA-256 `043e928b…` vorher und nachher). Danach
  `localStorage` und Caches geleert (0 Einträge, 0
  Service-Worker-Registrierungen), Tab geschlossen, Server beendet. Zwei
  schon vorher offene Tabs des Browsers habe ich nicht angefasst.

Live-Proxy: keine Anfrage. Keine Anfrage an WebUntis, Mensamax, sams-on oder
ccCampus.

Website, 9 GET: `deploy-commit.txt`, `/`, `/ueber`, `/docs/PROJEKT.md`,
`/docs/OFFEN-naechste-Fixes.md`, dazu nur Statuscode
`/docs/PEER-REVIEW-2026-10-30.md`, `-11-09.md`, `-11-09b.md`, `-11-09c.md`.

Sonst: zwei `npm audit` (npm-Registry, nur die Paketliste des Lockfiles),
zwei Abrufe der MDN-Browser-Compat-Daten (`api/AbortController.json`,
`api/AbortSignal.json` auf GitHub), ein Abruf des Cloudflare-Changelogs zu
`Request.signal`, eine Websuche zum Verhalten von Workers beim
Verbindungsabbruch.
