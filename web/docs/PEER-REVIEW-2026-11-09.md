# Peer-Review „Der beste Freund“ — Zeitlimit je Anbieter (0.4.4)

IDBRBGB · v2 · 2026-11-09 · b5f9785f · gültig

**Zweck:** Unabhängige Gegenprüfung von Version 0.4.4. Geprüft wird, ob der
Fix den Fund A-3 aus dem Prüfbericht der neunten Runde (ID3UKZT) wirklich
behebt, ob seine Aussagen über sich selbst stimmen und ob er neue Fehler oder
Lücken in der Testabsicherung einführt. Nebenbei: kurzer Blick auf die
kompakteren Karten aus 0.4.3.

**Prüfobjekt:** Commit `90c01e0` („gemeinsames Zeitlimit je Anbieter, auch
beim Lesen“, 0.4.4): `proxy/worker.js`, `run-tests.mjs` und die Aussagen in
Commit-Nachricht, `OFFEN-naechste-Fixes.md` (neue Erledigt-Zeile, neuer
Punkt 6), `PROJEKT.md` (Sicherheits- und Testtabelle, Release-Historie 0.4.4)
und `proxy/README.md`. Nebenbei Commit `69d709a` (0.4.3, `web/index.html`).
**Prüfer:** unabhängige Runde ohne Vorwissen über die schreibende Sitzung, 09.11.2026.
**Zugriff:**
- Lokal: Quellcode (HEAD = `90c01e0`, Arbeitsbaum sauber), Testsuite, Lint,
  Typprüfung, Coverage (`c8`, nur in einer Kopie), `stamp.py check`.
- workerd 2026-10-23 (Binary aus `node_modules`, ohne `wrangler`) mit eigener
  capnp-Konfiguration: der echte `proxy/worker.js` von `90c01e0`, alle
  ausgehenden Anfragen an einen lokalen Node-Nachbau der Anbieter.
- Live: Website (5 GET), Live-Proxy (3 von erlaubten 20 Anfragen, alle
  scheitern vor jedem Login). Keine Anfrage an sams-on, WebUntis oder
  Mensamax.

**Methode:** Mutanten und Sonden nur in Kopien (`git archive`, `node_modules`
als Symlink) im Scratchpad. Im Projektordner nichts geschrieben.

**Inhalt und Lesehilfe:**
1. Kurzeinschätzung: das Urteil in wenigen Sätzen.
2. Verifikationstabelle: jede Behauptung des Fixes einzeln, danach der Status
   von A-3.
3. Korrekturen an Doku und Kommentaren.
4. Zusatzbefunde nach Schwerpunkt (A Security und Betrieb, B Datensparsamkeit,
   C Alltag, D Nerd-Details), mit Schweregrad und Beleg. Die Mutanten-Tabelle
   steht unter A-2.
5. Gewichtungs-Feedback. 6. Fazit.

Wer nur die Kurzfassung braucht, liest 1 und 6.

---

## 1. Kurzeinschätzung

Der Kern sitzt, und das habe ich nicht nur gelesen, sondern laufen lassen: In
workerd beendet ein Abbruch-Signal tatsächlich das Lesen eines hängenden
Inhalts. Mit dem echten `worker.js` ist bei jeder Budget-Position nach rund
10 s Schluss, mit der richtigen Meldung. Zwei Sachen würde ich vor dem
Abhaken trotzdem fixen. Erstens: Die WebUntis-Abmeldung ist die sechste
Anfrage *vor* der Antwort, und genau die hast Du draußen gelassen. Hängt ihr
Inhalt, hängt der Proxy weiter unbegrenzt (in workerd nachgestellt: nach 40 s
noch offen). Weil die App Kinder nacheinander abfragt und selbst kein
Zeitlimit hat, bleibt dann das ganze Dashboard stehen. A-3 ist damit für
fünf von sechs WebUntis-Anfragen behoben, nicht für „jede Anfrage“.
Zweitens: Du hast den Test gelöscht, der seit 0.4.2 den Logout nach
Budget-Ablauf bei sams-on absicherte. Der Mutant „Logout am Budget“ ist
wieder grün, und in workerd geht dann wirklich kein Logout mehr raus. Kein 🔴,
zwei 🟡, der Rest ist Feinschliff.

---

## 2. Verifikationstabelle

### 2a. Behauptungen des Fixes

| Behauptung | Ergebnis | Mein Beleg |
|---|---|---|
| Tests, Lint, Typprüfung grün | ✅ | Im Projektordner: `node run-tests.mjs` → `376 Tests: 376 ✓  0 ✗`; `npm run -s lint` Exit 0; `npm run -s typecheck` Exit 0 |
| Testzahl | ✅ | 351 auf `9f9e83b` (Kopie), 376 auf HEAD: 24 neue Fälle in der Schleife plus 3 Einzeltests, 2 alte sams-on-Tests gelöscht |
| „10 s gemeinsam je Anbieter-Ablauf (`withBudget`)“ | ⚠️ | Für WebUntis-Abruf bis `getRooms`, Mensamax und sams-on bis zur Antwort ✅ (`worker.js:176-184, 283, 467, 593`). Für die WebUntis-Abmeldung nicht (`worker.js:333`, ohne `budget`). Siehe A-1 |
| „das Lesen der Antworten hängt am selben Signal (`readText`)“ | ✅ mit Ausnahme | Gilt für jede gebudgetete Anfrage, weil der Inhalt am `signal` des `fetch` hängt (`worker.js:132-134`). Die Abmeldung liest mit `readText(resp, url, undefined)` (`worker.js:261`), ihr Einzel-Timer ist da schon gelöscht (`worker.js:138`). Dieses Lesen hat also gar kein Limit |
| „Vorab in Node und workerd gegen einen echten hängenden Server geprüft … (Gegenprobe ohne Abbruch: hängt weiter)“ | ✅ in der Sache, ⚠️ nicht nachvollziehbar | Selbst nachgestellt. **workerd**, Node-Server schickt Header und `{"teil`, dann nichts: ohne Abbruch `STILL HANGING` nach 3 s; mit `AbortSignal.any` und Abbruch nach 800 ms → `AbortError`, `DOMException`, `instanceof Error` = `true`, nach 804 ms. **Node 24**: ohne Abbruch hängt es weiter, mit Abbruch `AbortError` nach 806 ms. Die Prüfung selbst liegt nicht im Repo (D-2) |
| „Meldung beim Lesen wie vor den Headern statt ‚keine gültige JSON-Antwort‘“ | ✅ | workerd, echter `worker.js`, `orders/view` hängt im Inhalt: nach 10 031 ms `lunchFehler="Zeitüberschreitung beim Zugriff auf lessing.sams-on.de (Gesamtzeit überschritten)"`. Mutant „Lesen im Parse-`try`“ → 2 rot |
| „Tests über jede Anfrage-Position in zwei Klassen mit Gegenprobe“ | ⚠️ | WebUntis-Liste in `run-tests.mjs:2190` hat 5 Methoden, `logout` fehlt. Abmeldung in der Kopie ergänzt → `the answer did not settle` (A-1). Die Gegenprobe „vorher noch offen“ ist gut gemacht |
| „12 Mutanten je mindestens ein Test rot“ | ✅ für die Stichprobe | Nachgebaut: Mensamax ohne Budget → 6 rot; Zeitgeber nicht gelöscht → 1 rot; sams-on-Lesen im Parse-`try` → 2 rot; `readText` übersetzt nicht → 10 rot; Mensamax-Plan ohne `readText` → 1 rot; Budget 12 s → 23 rot. Aber eigene Mutanten bleiben grün (A-2, A-3) |
| Neue Tests erkennen den alten Fehler | ✅ | Neue `run-tests.mjs` gegen den Code von `9f9e83b`: `376 Tests: 353 ✓  23 ✗`, alle 23 rot in der neuen Budget-Schleife |
| „WebUntis-Abmeldung bleibt vor der Antwort (geteilte Klassenkonten)“ | ✅ Verhalten / ⚠️ Begründung | Test `run-tests.mjs:2248`; Mutant „Abmeldung entfernt“ → rot. Die Begründung deckt nur den Erfolgsfall (D-1). Dass sie *außerhalb* des Limits bleibt, pinnt kein Test: Mutant „Abmeldung mit `budget`“ bleibt grün |
| „Zeitüberschreitung … (Gesamtzeit überschritten)“ in allen Fällen | ✅ | workerd: WebUntis `getRooms`, Mensamax `PlanForm.aspx`, sams-on Instanz-Info, `GET /api/login`, `orders/view` mit hängendem Inhalt → jeweils 10 007 bis 10 031 ms, Meldung mit dem richtigen Host |
| „Ein Server, der mitten in der Antwort hängen bleibt, hält die Karte damit höchstens 10 s auf“ (`proxy/README.md:110-113`) | ❌ | workerd: WebUntis-Abmeldung ohne Header → Antwort nach 10 012 ms. `getRooms` 9 s langsam plus Abmeldung ohne Header → **19 014 ms**. Abmeldung mit hängendem Inhalt → nach **40 005 ms** noch keine Antwort (Client gibt auf) |
| „Der Proxy selbst antwortet seit 0.4.4 innerhalb von rund 10 s je Anbieter“ (OFFEN Punkt 6) | ❌ | wie oben |
| `PROJEKT.md`: Testtabelle „Jede Anfrage vor der Antwort einzeln (WebUntis 5 …)“ | ❌ | WebUntis schickt 6 Anfragen vor der Antwort, die sechste ist die Abmeldung (`worker.js:333`). Der Kommentar `worker.js:57` sagt ebenfalls „five before the answer“ |
| `PROJEKT.md` Sicherheitstabelle, neue Zeile „10 s je Anfrage bis zu den Headern, 10 s gemeinsam …“ | ⚠️ | Die alte sams-on-Zeile direkt darüber sagt weiter „gemeinsames Zeitlimit (15 s)“ (`PROJEKT.md:269`). Siehe K-1 |
| Langsamer Inhalt innerhalb des Limits wird gelesen; kein Zeitgeber bleibt übrig | ✅ | Tests `run-tests.mjs:2267, 2290`; Mutant „Zeitgeber nicht gelöscht“ → rot |
| Inhalt, den der Proxy nie liest (sams-on-Login), hält nichts auf | ✅ | Test mit `bodyUnread`, und in workerd: Der Login-Inhalt wird nicht angefasst |
| Kopfzeilen HS-PRJ v9, HS-OFF v9; Kopien byte-gleich | ✅ | `stamp.py check` → beide `OK`. `cmp` für `PROJEKT.md`, `OFFEN-…`, `worker.js` gegen `web/docs/` bzw. `web/source/proxy/`: gleich |
| Live 0.4.4 | ✅ Website / [ungeprüft] Proxy | `deploy-commit.txt` = `90c01e04…` = HEAD. `/ueber`: `VERSION = '0.4.4'`. `/source/proxy/worker.js`: SHA-256 `194870e6…` = HEAD. `/docs/PROJEKT.md` und `/docs/OFFEN-…` byte-gleich. Ob der Worker selbst 0.4.4 ausführt, ist von außen ohne hängenden Anbieter nicht unterscheidbar. `deploy.sh` deployt den Proxy vor der Website (`deploy.sh:171-206`), aber nur bei `TARGET=alles` |

### 2b. Status von A-3 (neunte Runde)

| Befund | Status | Beleg |
|---|---|---|
| A-3: Einzel-Timeout endet mit den Headern, hängender Inhalt hält WebUntis und Mensamax unbegrenzt fest | **teilweise behoben** | Mensamax: vollständig. sams-on: vollständig, jetzt mit richtiger Meldung. WebUntis: fünf von sechs Anfragen. Die Abmeldung ist weiter unbegrenzt (A-1). Der schlechteste Fall ohne hängenden Inhalt sinkt von rund 60 s auf rund 20 s |

---

## 3. Korrekturen

**K-1 (Doku und Kommentare, 🟢): Fünf Stellen beschreiben einen anderen Stand als den Code.**
- `PROJEKT.md:269` (sams-on-Zeile der Sicherheitstabelle): „gemeinsames
  Zeitlimit (15 s)“. Seit 0.4.4 sind es 10 s, und zwei Zeilen tiefer steht das
  auch so.
- `worker.js:32-34` (Kopfkommentar): „the sams-on sequence also has one
  shared time limit“. Das gilt jetzt für alle drei. Und „a hung request
  doesn't keep running indefinitely“ stimmt für die WebUntis-Abmeldung nicht (A-1).
- `worker.js:56-58`: „WebUntis up to five before the answer“. Es sind sechs.
  Dasselbe steht in der Testtabelle von `PROJEKT.md` („WebUntis 5“).
- `proxy/README.md:113` „höchstens 10 s“ und OFFEN Punkt 6 „innerhalb von
  rund 10 s je Anbieter“: falsch, siehe 2a.
- OFFEN, Erledigt-Zeile der neunten Runde A-1 (Zeile 77): „Logout mit dem
  Signal des Zeitlimits macht genau diesen Test rot“. Diesen Test gibt es seit
  0.4.4 nicht mehr (A-2). Die Zeile ist eine Momentaufnahme, das ist in
  Ordnung. Dann sollte aber die neue Zeile sagen, dass der Schutz gewandert ist
  oder fehlt.

**K-2 (Commit-Nachricht und OFFEN, 🟢): „jede Anfrage-Position“ ist enger gemeint, als es klingt.**
Gemeint sind offenbar die Anfragen *innerhalb* des Budgets. Das ist eine
Definition, die die eine Lücke wegdefiniert. Besser: „jede Anfrage vor der
Antwort außer der WebUntis-Abmeldung (bewusst, siehe …)“. Dann wäre A-1
wenigstens ein bekannter Rest und kein blinder Fleck.

---

## 4. Zusatzbefunde

### A. Security und Betrieb

**🟡 A-1: Die WebUntis-Abmeldung hängt weiter unbegrenzt, wenn ihr Inhalt stockt, und blockiert dann alle folgenden Kinder.**
`fetchTimetable` ruft `webuntisRpc(server, cookie, 'logout', {})` ohne Budget
auf (`worker.js:333`). Der Einzel-Timer in `fetchWithTimeout` endet mit den
Headern (`worker.js:138`). Danach liest `readText(resp, url, undefined)`
(`worker.js:261`) ohne jedes Signal. Das ist genau das Muster aus A-3, nur an
der einen Stelle, die Du bewusst ausgenommen hast.

Beleg in workerd, echter `worker.js` von `90c01e0`, Nachbau des Anbieters
lokal (`probe/full.mjs`):
- Abmeldung schickt Header und 5 Bytes, dann nichts: `after 40005 ms: CLIENT:
  TimeoutError` (mein Client gibt nach 40 s auf, der Proxy hätte weiter gewartet).
- Abmeldung schickt gar keine Header: Antwort nach 10 012 ms. Das ist der
  Einzel-Timer, er greift hier noch.
- `getRooms` 9 s langsam, dann Abmeldung ohne Header: 19 014 ms.

Beleg in der Testsuite (Kopie): `'logout'` in die Liste
`run-tests.mjs:2190` aufgenommen → `WebUntis, logout — headers, then a stalled
body … ✗ the answer did not settle`. Coverage hilft hier nicht:
`c8` meldet für `worker.js` 100 % Statements. Die Zeile läuft ja, nur nie mit
hängendem Inhalt.

Warum 🟡 und nicht 🟢 wie A-3: Erstens ist es genau der Fall, den der Fix
schließen sollte, und Doku sowie Commit erklären ihn für erledigt
(„höchstens 10 s“). Zweitens ist die Folge im Alltag größer, als sie aussieht:
`refreshAll()` fragt Kinder strikt nacheinander ab (`web/index.html:1410-1425`),
und `fetchChild()` hat kein eigenes Limit (OFFEN Punkt 6). Eine hängende
Abmeldung beim ersten Kind lässt also *alle* Karten auf „Lädt …“ stehen, bis
Browser oder Cloudflare aufgeben. Wann das in Produktion geschieht, habe ich
nicht geprüft [ungeprüft]. Wie wahrscheinlich ein Server ist, der genau bei
`logout` mitten im Inhalt hängen bleibt, weiß niemand. Es ist dieselbe
Seltenheit wie bei A-3.

Vorschlag, der Deine Entscheidung „vor der Antwort“ nicht antastet: Die
Abmeldung bekommt ein eigenes, kurzes Limit samt Inhalt, etwa
`withBudget(work, ms)` mit Parameter und `await withBudget((b) =>
webuntisRpc(server, cookie, 'logout', {}, b), 3000)`. Noch einfacher:
den Inhalt der Abmeldung gar nicht lesen. Wenn die Header da sind, hat
WebUntis die Anfrage angenommen [ungeprüft, ob WebUntis die Sitzung vor den
Headern beendet]. Dazu ein eigener Testfall „Abmeldung hängt → Antwort mit
Stundenplan nach dem eigenen Limit“.

**🟡 A-2: Der Schutz „Logout geht auch nach Budget-Ablauf raus“ (Fix der neunten Runde A-1) ist mit 0.4.4 wieder weg.**
Gelöscht wurde der Test `sams-on: the whole sequence has one shared time limit;
the logout still goes out` (Diff von `run-tests.mjs`, in `9f9e83b` ab Zeile 1952).
Genau er war in 0.4.2 die Gegenprobe für „Logout am Budget-Signal“. Die neuen
Budget-Fälle feuern danach zwar noch einmal die Zeitgeber
(`run-tests.mjs:2238`), prüfen aber nicht, ob der Logout überhaupt
rausgeht.

Mutant M10 (`fetchWithTimeout(…/api/logout…, …, budget)`, `worker.js:672`):
`376 Tests: 376 ✓  0 ✗`. In workerd mit dem echten Mutanten, `orders/view`
hängt im Inhalt: Der unveränderte Code schickt nach 10 036 ms
`POST /api/logout`. Beim Mutanten kommt **kein** Logout beim Anbieter an,
die Antwort ist sonst identisch. In Wirklichkeit bliebe also nach jeder
Zeitüberschreitung bei sams-on die Sitzung offen, und die Suite merkt es nicht.
Der Code von 0.4.4 ist richtig, nur der Wächter fehlt. Fix: In den sams-on-Fällen
nach dem Login (`GET /api/login`, `orders/view`) prüfen, dass der letzte
Aufruf `POST /api/logout` mit `PHPSESSID=angemeldet` ist.

Meine Mutanten im Überblick (alle in Kopien, `tools/mutate.py`, Original und
Kopie in `web/source/proxy/` gleich mutiert):

| Mutant | Ergebnis | Bewertung |
|---|---|---|
| M1 WebUntis: eigenes Budget je Anfrage statt eines gemeinsamen | **grün** (376/376) | A-3 |
| M2 Header nur am Einzel-Timer, Budget erst nach den Headern angehängt | 1 rot (nur `sams-on, GET /api/instance/lessing — headers, then a stalled body`) | erkannt, aber eher zufällig |
| M3 Meldung immer „Gesamtzeit überschritten“ | **grün** | A-4 |
| M4 WebUntis-Abmeldung *mit* Budget | **grün** | Entscheidung „außerhalb“ nicht gepinnt, für sich harmlos |
| M5 WebUntis-Abmeldung entfernt | 1 rot | ✅ |
| M6 Einzel-Timeout 20 s | 1 rot (`sams-on: the answer does not wait for the logout`) | ✅, hängt an einem einzigen Test |
| M7 Budget 12 s | 23 rot | ✅ |
| M8 Mensamax-Plan ohne `readText` | 1 rot | ✅ |
| M10 sams-on-Logout am Budget | **grün** | A-2 |

**🟢 A-3: Dass das Limit *gemeinsam* ist, prüft kein Test.**
Mutant M1 gibt jeder WebUntis-Anfrage ihr eigenes 10-s-Budget und bleibt
grün. In workerd mit dem Mutanten und fünf Anfragen à 4 s antwortet der
Proxy nach **20 051 ms** mit Stundenplan. Der unveränderte Code bricht nach
**10 029 ms** mit „Gesamtzeit überschritten“ ab. Der Grund liegt in der
Testtechnik: `fakeTimers().fire(ms)` feuert *alle* Zeitgeber mit genau dieser
Dauer (`run-tests.mjs:1859`). Weil `FETCH_TIMEOUT_MS` und
`PROVIDER_BUDGET_MS` beide 10 000 sind, feuert `timers.fire(BUDGET_MS)`
Einzel- und Gesamtlimit zugleich. Kein Test kann dann unterscheiden, welches
gegriffen hat. Vorschlag: Im Test nur den Zeitgeber feuern, der *vor* der
ersten Anfrage gesetzt wurde (Momentaufnahme der wartenden Zeitgeber beim
ersten `fetch`). Mit M1 gibt es den nicht, und der Test wird rot.

**🟢 A-4: Die Meldung „(>10s)“ ist ungetestet und praktisch unerreichbar.**
Seit der alte Test „a request that hangs ends after its own timeout“ gelöscht
ist, prüft kein Test mehr den Text `>10s` (Mutant M3 grün). Erreichbar ist er
auch kaum noch: Bei jeder gebudgeteten Anfrage startet das Budget früher und
läuft gleich lang, es läuft also immer zuerst ab. Der Einzel-Timer wirkt nur
noch bei den beiden Abmeldungen, und deren Fehler werden verschluckt
(`worker.js:333`, `672-673`). Die Doku verkauft „10 s je Anfrage, dazu 10 s
gemeinsam“ als zwei Schichten, in Wahrheit ist es für die Abrufe eine. Das
ist kein Fehler. Aber entweder den Einzel-Timer nur noch für die Abmeldungen
erklären oder ihn kürzer wählen, damit er etwas bedeutet.

### B. Datensparsamkeit und Transparenz

Keine neuen Befunde. Der Fix ändert nichts daran, welche Daten fließen. Die
neuen Meldungen nennen nur den Host, keine Inhalte des Anbieters. Positiv:
Der unbenutzte sams-on-Login-Inhalt bleibt ungelesen, mit eigenem Test.

### C. Alltag

**🟢 C-1: 10 s für alles plus 4 Minuten Cache für Fehler. Ein langsamer Morgen wird zur Fehlermeldung, die beim Neuladen bleibt.**
Das Limit ist „vom User festgelegt“, aber nirgends mit gemessenen
Antwortzeiten der Anbieter begründet. Bei WebUntis sind es fünf Anfragen
nacheinander, also im Schnitt 2 s je Anfrage. Wie schnell WebUntis und
Mensamax zur Stoßzeit um 7:30 Uhr wirklich sind, habe ich nicht gemessen
[ungeprüft]. Ohne Zugangsdaten ginge das auch nicht sinnvoll. Der Haken:
Auch Teilfehler werden 240 s gecacht (`worker.js:779-785`, `CACHE_TTL_SECONDS`
in Zeile 61). Ein Anbieter, der kurz 3 s je Anfrage braucht, zeigt dann
vier Minuten lang „Zeitüberschreitung … (Gesamtzeit überschritten)“, und
„Aktualisieren“ hilft nicht. Vorschlag: Zeitüberschreitungen nicht oder
deutlich kürzer cachen. Danach die Abbrüche ein paar Wochen über die
Worker-Logs zählen [Logging-Stand ungeprüft], bevor man das Limit für richtig
erklärt.

**🟢 C-2 (0.4.3, kompaktere Karten): Barrierefreiheit hält, nur das Wort „Guthaben“ fehlt.**
- 1.4.3 Kontrast (Minimum), AA: Selbst aus `web/theme.css:25-36` gerechnet,
  gegen `--card`. Hell: `--muted` 6,17:1, `--warn` 5,93:1, `--danger` 6,54:1.
  Dunkel: 6,40 / 9,67 / 7,01:1. Die Angabe „≥ 5,9:1“ im Commit stimmt.
- 1.4.1 Benutzung von Farbe, A: erfüllt. „knapp“ trägt den Text
  „· bald aufladen“, „nicht abrufbar“ steht als Wort da.
- 2.5.8 Zielgröße (Minimum), AA: Die Aufklappzeile behält `min-height:24px`
  (`web/index.html:96`). Der Login-Link ist klein, aber die neue
  Guthaben-Zeile darunter ist kein Ziel. Die Abstandsausnahme bleibt also
  wie vorher [nicht im Browser gemessen].
- Kein WCAG-Verstoß, aber ein Verständnisverlust: Aus „💶 Guthaben: 12,40 €“
  wurde „💶 12,40 €“ (`web/index.html:1156-1159`). Sehend erschließt sich das
  über Emoji und Lage. Ein Screenreader liest den Namen des Emojis und einen
  Betrag direkt nach dem Link „sams-on-Login“. Ob das ein Preis oder ein
  Kontostand ist, sagt die Zeile nicht mehr. Vorschlag: „Guthaben 12,40 €“
  oder ein `aria-label` am Element. Die Warnung „bald aufladen“ ist außerdem
  von einem farbigen Kasten zu 12-px-Text geschrumpft. Das ist Geschmack,
  aber es ist die einzige Zeile auf der Karte, die zum Handeln auffordert.
- „rund 79 px weniger je Karte“: nicht nachgemessen [ungeprüft]. Aus dem CSS
  überschlagen (7 × 3,2 px Zeilenabstand, rund 11 px beim Ausblende-Bereich,
  die weggefallene `.lunch`-Zeile) ist die Zahl plausibel.

### D. Nerd-Details

**🟢 D-1: Die Begründung für „Abmeldung vor der Antwort“ gilt nur im Erfolgsfall.**
Läuft das Budget nach `authenticate` ab, gibt es überhaupt keine Abmeldung.
Sie steht nicht in einem `finally` (`worker.js:312-333`). Die Antwort geht
sofort raus, und der nächste Login für das nächste Kind beginnt, während die
erste Sitzung offen ist. Das war schon vor 0.4.4 so, wird mit einem strengeren
Limit aber häufiger. Ob sich Sitzungen eines geteilten Klassenkontos
wirklich stören, ist im Repo nur als Kommentar belegt
(`web/index.html:1414-1418`) [ungeprüft]. Die Entscheidung ist trotzdem
schlüssig: Sie kostet im Normalfall nur eine Anfrage-Laufzeit. Sie sollte nur
nicht ohne Limit sein (A-1).

**🟢 D-2: Die workerd-Prüfung, auf der die Tests ruhen, liegt nicht im Repo.**
`hangingBody` (`run-tests.mjs:1877-1888`) bildet nach, dass der Inhalt am
Signal der Anfrage hängt. Die Attrappe implementiert damit genau die
Eigenschaft, um die es geht. Das ist legitim, weil sie stimmt (siehe 2a, ich
habe es selbst in workerd und Node gesehen). Aber „(geprüft)“ in `PROJEKT.md`
ist für die nächste Runde nur eine Behauptung. workerd liegt ohnehin in
`node_modules`. Ein kleines manuelles Werkzeug unter `tools/` (Node-Server,
der hängt, plus `workerd serve` mit capnp-Konfiguration, ohne `wrangler`)
würde es nachprüfbar machen und bei jedem workerd-Update wiederholbar. Meine
Fassung liegt unter `review10/probe/` (siehe unten).

Was mir ausdrücklich gefällt: `withBudget` und `readText` sind klein und
lesbar. `asTimeoutError` gibt es nur einmal statt dreimal kopiert. Die
Gegenprobe „vorher ist die Antwort noch offen“ (50 ms echte Zeit) in jedem
Budget-Fall macht die Tests ehrlich: Eine Attrappe, die gar nicht hängt, würde
rot. Und die neue Suite macht gegen den alten Code genau die 23 erwarteten
Fälle rot. So sieht eine gute Gegenprobe aus.

---

## 5. Gewichtungs-Feedback

- A-3 der neunten Runde war 🟢, und das bleibt für den Grundfall richtig. Die
  Restlücke A-1 stufe ich trotzdem höher ein. Nicht weil sie wahrscheinlicher
  ist, sondern weil die Doku jetzt „höchstens 10 s“ verspricht und die
  sequentielle Abfrage aus einem Kind alle Karten macht.
- A-2 ist 🟡, obwohl der Code stimmt. Es ist schon das zweite Mal, dass
  genau dieser Logout-Wächter fehlt (neunte Runde A-1). Diesmal ist er beim
  Aufräumen verschwunden. Wer Tests ersetzt, sollte die Mutanten der Tests
  mitnehmen, die er löscht.
- Zustimmung: 10 s als bewusste Festlegung des Users ist in Ordnung. C-1 ist
  ein Hinweis zur Messung und zum Cache, keine Kritik an der Zahl.
- Zustimmung: Die Abmeldung vor der Antwort zu lassen, ist richtig. Sie
  braucht nur ihr eigenes Limit.
- Kein Fund ist 🔴. Nichts davon leakt Daten oder öffnet Angriffsfläche. Ein
  Angreifer müsste WebUntis selbst kontrollieren, um A-1 auszulösen, und hätte
  dann größere Hebel.

---

## 6. Fazit

Die Website bzw. der Proxy ist mit 0.4.4 messbar robuster. Mensamax und
sams-on halten jetzt in jeder Lage nach 10 s an, WebUntis bei fünf von sechs
Anfragen. Die zentrale technische Annahme, dass ein Abbruch das Lesen in
workerd beendet, stimmt, belegt mit dem echten Worker in der echten Laufzeit.
Offen bleiben die WebUntis-Abmeldung (A-1) und ein verlorener Test-Wächter
(A-2). Beides ist mit wenigen Zeilen behoben.

Zum Fix als Arbeit: Plan, Code und die Testmatrix sind sorgfältig, die
Gegenproben vorbildlich. Die Schwäche ist die übliche: Die Aussagen über sich
selbst sind runder als der Stand. „Jede Anfrage-Position“ und „höchstens
10 s“ stimmen nur, wenn man die eine ausgenommene Anfrage vergisst. Und die
12 Mutanten prüfen, was der Fix gebaut hat, nicht was er weggenommen hat.

---

### Anhang: Sonden und Live-Anfragen

Alles im Scratchpad der Prüfsitzung (flüchtig, nicht im Repo):
- `probe/prim.mjs`, `probe/prim-worker.mjs`: workerd-Grundsonde (Abbruch beim Lesen).
- `probe/node-prim.mjs`: dasselbe in Node 24.
- `probe/full.mjs`: echter `worker.js` in workerd, Anbieter-Nachbau, Szenarien
  (Aufruf `node full.mjs <Kopie> [Filter]`); Ausgaben in `probe/full-*.log`.
- `tools/mutate.py`, `tools/mutants1.py`, `tools/mutants2.py`: Mutanten;
  Kopien unter `mut/`.
- `probe-logoutcase/`: Testsuite mit `logout` in der Budget-Liste.
- `oldcode-newtests/`: neue Tests gegen den Code von `9f9e83b`.

Live-Proxy, 3 Anfragen, keine erreicht einen Anbieter:
1. `OPTIONS /api/status` → 200 (0,11 s).
2. `POST /api/status` mit `{"webuntis":{"server":123}}` → 400
   `{"error":"Ungültiger Request-Body"}`.
3. `POST /api/status` mit unvollständiger Konfiguration (ohne Benutzername und
   Passwort) → 200, `WebUntis-Konfiguration unvollständig …`,
   `Mensamax-Konfiguration unvollständig …` (0,06 s).

Website: `GET` auf `deploy-commit.txt`, `/ueber`, `/source/proxy/worker.js`,
`/docs/PROJEKT.md`, `/docs/OFFEN-naechste-Fixes.md`.
