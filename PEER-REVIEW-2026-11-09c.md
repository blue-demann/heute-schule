# Peer-Review „Der beste Freund“ — Folge-Fix der elften Prüfrunde (0.4.6)

ID9KS64 · v1 · 2026-11-09 · 4aaac538 · gültig

**Zweck:** Unabhängige Gegenprüfung von Version 0.4.6. Geprüft wird, ob der
Fix die Befunde aus dem Prüfbericht der elften Runde (ID9ZBJZ) wirklich
behebt, ob seine Aussagen über sich selbst stimmen (Commit-Nachricht,
`OFFEN-naechste-Fixes.md`, `PROJEKT.md`, `proxy/README.md`, `web/ueber.html`)
und ob er neue Fehler, Testlücken oder Widersprüche einführt. Schwerpunkt ist
die neue Abruf-Logik der Web-App (Laufnummer, Warten auf die laufende
Anfrage, 15-s-Grenze), dazu die Silbentrennung bei Namen nach WCAG 2.2.

**Prüfobjekt:** Commit `44a1c13` („Folge-Fix der elften Pruefrunde“, 0.4.6):
`web/index.html` (`refreshAll`, `fetchChild`, `refreshRun`,
`requestInFlight`, `IN_FLIGHT_WAIT_MS`, `abandonRefreshes`, Kartenkopf-CSS),
`proxy/worker.js` (Kommentar), `run-tests.mjs` (neuer Abschnitt „Dashboard:
overlapping refreshes“, geänderte Zeitlimit- und Cache-Tests),
`tools/probe-workerd.mjs`, `deploy.sh` sowie die Aussagen in
Commit-Nachricht, `OFFEN-naechste-Fixes.md` (drei neue Erledigt-Zeilen,
Punkte 6 und 7), `PROJEKT.md` (Sicherheits- und Testtabelle,
Release-Historie 0.4.6), `proxy/README.md` und `web/ueber.html`.
**Prüfer:** unabhängige Runde ohne Vorwissen über die schreibende Sitzung, 09.11.2026.
**Zugriff:**
- Lokal: Quellcode (HEAD = `44a1c13`, Arbeitsbaum sauber), Testsuite, Lint,
  Typprüfung und `tools/probe-workerd.mjs` im Projektordner; alles Weitere
  nur in Kopien.
- workerd aus `node_modules` (ohne `wrangler`): das Werkzeug des Fixes
  selbst, dazu vier Fehlerweg-Varianten in einer Kopie.
- Eingebauter Browser: lokale Kopie von `web/index.html` mit Testdaten in
  `localStorage` und `fetch`-Stub vor dem App-Skript, Service Worker
  abgeschaltet; danach `localStorage`, Caches und Viewport zurückgesetzt.
  Netzwerkprotokoll des Tabs: keine Anfrage an `workers.dev`.
- Live: Website (10 GET). Live-Proxy: keine Anfrage. Keine Anfrage an
  sams-on, WebUntis oder Mensamax.

**Methode:** Mutanten und Sonden nur in Kopien (`git archive 44a1c13`,
`node_modules` als Symlink) im Scratchpad der Prüfsitzung. Das
Auswerteskript liest stdout (Zusammenfassung) und stderr (rote Tests) und
ist an zwei Kontrollmutanten geeicht: inhaltsgleicher Austausch
(`15000` → `15e3`) → `395 Tests: 395 ✓ 0 ✗`; geänderter Meldungstext im
Proxy → `395 Tests: 369 ✓ 26 ✗`. Im Projektordner nichts geschrieben.

**Inhalt und Lesehilfe:**
1. Kurzeinschätzung: das Urteil in wenigen Sätzen.
2. Verifikationstabelle: jede Behauptung des Fixes einzeln (2a), danach der
   Status jedes Befunds der elften Runde (2b).
3. Korrekturen an Doku und Kommentaren (K-1, K-2).
4. Zusatzbefunde nach Schwerpunkt (A Security und Betrieb, B
   Datensparsamkeit, C Alltag, D Nerd-Details), mit Schweregrad und Beleg.
   Die Mutanten-Tabelle steht unter D-1.
5. Gewichtungs-Feedback. 6. Fazit. Anhang: Sonden und Live-Anfragen.

Wer nur die Kurzfassung braucht, liest 1 und 6.

---

## 1. Kurzeinschätzung

Der Kern von C-1 ist behoben: Eine späte Antwort für den vorher gewählten
Tag landet nicht mehr auf der Karte und nicht mehr in `lastDataById`. Das
habe ich im Browser nachgestellt, und elf von dreizehn echten Mutanten der
Abruf-Logik sind rot. Kein 🔴. Zwei Dinge stimmen aber nicht so, wie sie
dastehen. Erstens (C-1 unten): Das neue Warten hat ein neues Fenster
aufgemacht, in dem die App den falschen Tag zeigt. Bei zwei Kindern steht
nach dem Tipp auf „Di 10.11.“ die Karte des ersten Kindes bis zu 13 s mit
dem Stundenplan von *heute* da, in voller Deckkraft und ohne „Lädt …“. In
0.4.5 wurde sie sofort abgeblendet. Zweitens (A-1): „So überschneiden sich
nie zwei Anmeldungen am selben Klassenkonto“ ist zu stark. Die Begründung
„eine länger offene Anfrage hängt im Netz und hält keine Sitzung mehr“
denkt nur an die hängende *Antwort*. Hängt die *Anfrage* auf dem Hinweg,
beginnt ihre Anmeldung erst später, womöglich gleichzeitig mit der neuen.
Und euer eigener 15-s-Test prüft genau zwei offene Anfragen. Der Rest ist
Feinschliff: eine Testlücke beim Ganz-oder-gar-nicht-Cachen, ein
ungetesteter Aufruf beim Löschen, alte Daten, die über 👁 zurückkommen, die
Versionszeile in `PROJEKT.md`.

---

## 2. Verifikationstabelle

### 2a. Behauptungen des Fixes

| Behauptung | Ergebnis | Mein Beleg |
|---|---|---|
| Tests, Lint, Typprüfung grün | ✅ | Im Projektordner: `node run-tests.mjs` → `395 Tests: 395 ✓  0 ✗`, stderr leer; `npm run -s lint` Exit 0; `npm run -s typecheck` Exit 0. 395 = 387 + 3 Cache-Gegenproben + 5 Dashboard-Tests |
| „sieht nur noch die Antwort des letzten Abrufs“, „eine Antwort wird nur angezeigt und gespeichert, solange ihr Abruf der letzte ist“ | ⚠️ | Für die *späte Antwort* ✅: Prüfung `run !== refreshRun` auf Erfolgs- und Fehlerweg (`web/index.html:1405, 1421`), `lastDataById` erst danach (`:1417`). Browser: Die späte Antwort für 20261109 wird verworfen, am Ende zeigen beide Karten 20261110. Aber die Karte zeigt bis zum Start des neuen Abrufs weiter die Antwort des *alten* Abrufs (C-1), und eine ältere Antwort kommt über `lastDataById` zurück (C-2) |
| „ein überholter Abruf startet kein weiteres Kind“ | ✅ | `web/index.html:1457`; Mutant W1 → 4 rot |
| „wartet auf die laufende Anfrage, höchstens 15 s“ | ✅ | `:1450-1453` (`Promise.race` aus laufender Anfrage und 15-s-Zeitgeber); Mutanten W4, W8, W9, W14 je rot |
| „Der Proxy ist nach rund 13 s fertig und abgemeldet, so überschneiden sich nie zwei Anmeldungen am selben Klassenkonto“ | ❌ | Die 13 s zählen ab dem Lesen des Request-Bodys im Worker (`proxy/worker.js:757`, das Budget beginnt erst in `getTimetable`), die 15 s ab dem Tipp im Browser. Eine Anfrage, die auf dem Hinweg hängt, meldet sich später an als gedacht. Dazu Neuladen der Seite, zweites Gerät, andere Familien am selben Klassenkonto. Der eigene Test erwartet zwei offene Anfragen (`run-tests.mjs:3279`). Siehe A-1 |
| „eine im Netz hängende Anfrage blockiert nicht dauerhaft“ | ✅ | Test `run-tests.mjs:3273`; Mutant W8 (60 s) → rot. Jeder weitere Tipp startet seine eigenen 15 s, Dauertippen verlängert also das Warten. Harmlos |
| „,Alle Daten löschen‘ verwirft eine laufende Antwort“ | ✅ Code, ⚠️ Test | `web/index.html:1007` ruft `abandonRefreshes()`. Der Test ruft aber `abandonRefreshes()` direkt auf, nicht den Lösch-Handler: Mutant W7 (Aufruf entfernt) bleibt grün (B-1) |
| „Property-Test über 200 zufällige Tipp-Abfolgen aus benannten Klassen“ | ✅ mit Lücke | Seed fest (`20260901`), 200 Fälle. Gezählt in einer Kopie: 436 Tipps bei offener Anfrage, 205 späte Antworten. Die Klasse „15 s laufen ab“ kommt im Generator nicht vor, und „anderer Tag“ trifft in 31 von 228 Fällen denselben Tag (D-1) |
| „10 Mutanten, je mindestens ein Test rot“ | [ungeprüft] für deren Liste, ⚠️ für die Aussage | Die zehn sind nirgends aufgezählt, anders als bei den früheren Einträgen in OFFEN. Meine eigenen: 11 von 13 echten Mutanten rot, W7 und W12 grün (D-1) |
| „Im Browser mit einer Attrappe nachgestellt“ | [ungeprüft] / selbst nachgestellt ✅ | Eigene Nachstellung im eingebauten Browser: zwei Kinder, Anfrage 2 braucht 8 s. Die späte Antwort für heute erscheint nicht, beide Karten enden bei 20261110, Spinner danach aus. Das neue Fenster mit falschem Tag zeigt sich dabei auch (C-1) |
| A-1: „Jeder Zeitlimit-Fall (jeder Anbieter, beide Hängeklassen) prüft, dass nichts gecacht wird; Gegenprobe ohne Stocken wird gecacht“ | ✅ mit Lücke | `run-tests.mjs:2293` in jedem `BUDGET_CASES`-Fall, Gegenproben `:2435` (je Anbieter einmal, `resultKeys().length === 1`). Meine Nachbauten der Mutanten der elften Runde: P1 (nur `lessonsResult`) → 13 rot, P2 (Lese-Abbruch als einfacher `Error`) → 10 rot. In allen Fällen ist aber der *andere* Anbieter unkonfiguriert, siehe A-2 |
| A-2: „Ganz-oder-gar-nicht-Cachen bleibt bewusst, ist jetzt dokumentiert“ | ✅ Doku / ❌ Test | Kommentar `proxy/worker.js:801-803`, `PROJEKT.md` Sicherheitstabelle, `proxy/README.md`. Mutant P5 („trotz Zeitüberschreitung cachen, wenn der andere Anbieter geliefert hat“) bleibt grün (A-2) |
| A-3: „die Abmeldung nach Fehlern gilt, sobald die Anmeldung gelesen ist“ | ✅ | `PROJEKT.md` Sicherheits- und Testtabelle, `proxy/README.md`. Der Code-Kommentar (`proxy/worker.js:310-316`) steht im `finally` hinter der Anmeldung und war schon richtig |
| D-1: Werkzeug „beendet sich erst nach dem Aufräumen“, „Fehlerweg nachgestellt: Exit 2, nichts bleibt zurück“ | ✅ / ⚠️ „auf jedem Weg“ | `return 2` statt `process.exit` im `try`, `process.exit` erst nach `main()` (`tools/probe-workerd.mjs:165-168, 208-214`). In einer Kopie nachgestellt: Startprüfung schlägt fehl → Exit 2; fremder Server auf dem Port → Exit 2; Ausnahme nach dem Start → Exit 2. Jedes Mal danach kein workerd (`pgrep`), kein Temp-Ordner. Ausnahme: Strg+C lässt den Temp-Ordner liegen (D-2) |
| „nimmt einen freien Port und erkennt den eigenen Proxy an dessen Antwort“ | ✅ | `freePort()` (`:116-121`) und Prüfung auf `Access-Control-Allow-Origin` = `PROBE_ORIGIN` (`:160-164`). Kopie mit fremdem Server auf dem Port: Der bekommt nur drei `OPTIONS /api/status`, keine Platzhalter-Logins. Restrisiko siehe D-2 |
| Werkzeug läuft, „rund eine Minute“ | ✅ | Im Projektordner: `Alle 7 Szenarien wie erwartet.`, Exit 0, `real 59.85`. Danach kein workerd, kein `probe-workerd-*` im System-Temp |
| C-2: „Namen auf der Karte mit Silbentrennung“ | ✅ | `web/index.html:44` (`hyphens:auto`, `-webkit-hyphens:auto`), `<html lang="de">`. Browser (Chromium): „Bartholomä-“ / „us“ statt „Bartholomäu“ / „s“. WCAG siehe C-3 |
| K-1 bis K-5 der elften Runde korrigiert | ✅ | `budgetedFetch` (`PROJEKT.md`), „Keine der Audit-Runden“, „je Antwort des Proxys“ (PROJEKT, OFFEN, README), „rund eine Minute“, Link auf die Projekt-Doku (`web/ueber.html:89`, Abschnitt 9 Testkonzept existiert und enthält die Liste) |
| `deploy.sh`, `web/docs` führen den Bericht der elften statt der zehnten Runde | ✅ | `deploy.sh:150`; `web/docs/` enthält `PEER-REVIEW-2026-11-09b.md`, nicht mehr `…-09.md`; Links auf die zehnte Runde zeigen jetzt auf GitHub |
| Kopfzeilen HS-PRJ v11, HS-OFF v11; Kopien byte-gleich | ✅ | `stamp.py check`: beide `OK`, ID9ZBJZ v1 ebenfalls. `cmp` für `PROJEKT.md`, `OFFEN-…`, den Bericht der elften Runde und `worker.js` gegen `web/docs/` bzw. `web/source/proxy/`: gleich |
| Version 0.4.6 | ✅ / ❌ eine Stelle | `package.json`, `web/ueber.html:109`. Aber `PROJEKT.md:5`: „Stand: 09.11.2026 · Version 0.4.5“ (K-1) |
| Live 0.4.6 | ✅ Website | `deploy-commit.txt` = `44a1c13c…` = HEAD; `/ueber`: `VERSION = '0.4.6'`; `/` SHA-256 gleich `web/index.html` (`86aafc42…`); `/source/proxy/worker.js`, `/docs/PROJEKT.md`, `/docs/OFFEN-…`, `/docs/PEER-REVIEW-2026-11-09b.md` je gleich HEAD |
| OFFEN Punkt 7: entfernte Berichte liefern ab 16.11. `404` | offen, wie angekündigt | Heute liefern `/docs/PEER-REVIEW-2026-10-30.md` und `/docs/PEER-REVIEW-2026-11-09.md` beide `200`. Das ist der dokumentierte Cloudflare-Cache, der Termin ist richtig gewählt |
| OFFEN Punkt 6: „Ein neuer Abruf wartet seit 0.4.6 höchstens 15 s auf eine solche Anfrage“ | ✅ | Stimmt. Die Karte selbst wartet weiter unbegrenzt, wie dort beschrieben |

### 2b. Status der Befunde der elften Runde (ID9ZBJZ)

| Befund | Status | Beleg |
|---|---|---|
| A-1 „Nicht cachen“ nur für einen von vier Wegen | **behoben** | P1 → 13 rot, P2 → 10 rot. Die nächste Lücke liegt eine Ebene weiter (A-2 unten) |
| A-2 Zeitüberschreitung verhindert auch das Cachen des anderen Anbieters | **behoben** (bewusst so, dokumentiert) | Code-Kommentar, `PROJEKT.md`, `proxy/README.md`. Getestet ist die Entscheidung nicht (A-2 unten) |
| A-3 Keine Abmeldung, wenn das Limit beim Lesen der Anmeldung abläuft | **behoben** (Doku präzisiert) | „sobald die Anmeldung gelesen ist“ in PROJEKT und README |
| C-1 Tageswechsel zeigt den Stundenplan des falschen Tages; Doppeltipp startet zwei Logins | **teilweise** | Die späte Antwort wird verworfen (Browser, Tests, Mutanten W1-W3, W11 rot). Neues Fenster mit falschem Tag ohne Ladeanzeige (C-1 unten). „Nie zwei Logins“ gilt nur, solange nichts auf dem Hinweg hängt und nur eine App-Instanz läuft (A-1 unten) |
| C-2 Kartenkopf, „Bartholomäus“ bricht mitten im Wort | **behoben** (zweiter Vorschlag umgesetzt) | Bricht jetzt mit Trennstrich: „Bartholomä-us“. Die enge Namensspalte bleibt (C-3 unten) |
| D-1 Werkzeug räumt auf dem Fehlerweg nicht auf; jeder Server auf dem Port gilt als eigener | **behoben** | Drei Fehlerwege nachgestellt, jedes Mal sauber. Rest: Strg+C (D-2 unten) |
| D-2 (Anmerkung) übrige Zeitlimit-Tests mit `fire(ms)` statt `advance()` | nicht umgesetzt | War eine Anmerkung, keine Forderung. Unverändert in Ordnung |
| D-3 (positiv) | — | — |
| K-1 bis K-5 | **behoben** | siehe 2a |

---

## 3. Korrekturen

**K-1 (🟢): `PROJEKT.md:5`, Versionszeile.** „**Stand: 09.11.2026 · Version
0.4.5**“, obwohl Kopfzeile (v11), Release-Historie und `package.json` 0.4.6
führen. Diese Zeile liest man als Erstes. Live identisch unter
`/docs/PROJEKT.md`.

**K-2 (🟢): `PROJEKT.md:370`, Testtabelle „Überlappende Abrufe“.** „nie sind
zwei Anfragen zugleich unterwegs“ prüft der Property-Test nur ohne
abgelaufene Wartezeit, denn die Klasse „15 s laufen ab“ erzeugt sein
Generator nicht. Der Einzeltest zur 15-s-Grenze erwartet genau das
Gegenteil: `assertEqual(…, 'a day0,a day1')` (`run-tests.mjs:3279`), also
zwei offene Anfragen. Vorschlag: „solange keine Anfrage länger als 15 s
offen ist“. Dazu die „10 Mutanten“ an derselben Stelle und in OFFEN:
Anders als bei den Einträgen zu 0.4.4 und 0.4.5 steht nirgends, welche es
waren, nachprüfen lässt sich das so nicht.

Die falsche Begründung im Kommentar `web/index.html:1434-1436` und in der
OFFEN-Zeile der elften Runde („eine länger offene Anfrage hängt im Netz“)
gehört zu A-1, „räumt auf jedem Weg auf“ (`PROJEKT.md:845-846`,
`tools/probe-workerd.mjs:124-125`) zu D-2.

---

## 4. Zusatzbefunde

### A. Security und Betrieb

**🟡 A-1: „So überschneiden sich nie zwei Anmeldungen am selben Klassenkonto“ stimmt nicht.**
Die Aussage steht in Commit-Nachricht, `PROJEKT.md:842`, OFFEN (Erledigt-Zeile
der elften Runde), `proxy/README.md` und als Begründung im Code
(`web/index.html:1434-1436`): „A request still open after that hangs in the
network and holds no WebUntis session any more“. Das gilt nur, wenn die
Anfrage auf dem *Rückweg* hängt. Vier Wege, auf denen es trotzdem zu zwei
gleichzeitigen Anmeldungen kommt:

1. **Die Anfrage hängt auf dem Hinweg.** Der Worker startet sein Budget erst
   nach `request.json()`, Rate-Limit und Cache-Abfrage
   (`proxy/worker.js:744-775`). Die 15 s der App laufen ab dem Tipp. Rechnung
   für einen Doppeltipp: Anfrage 1 geht bei t = 0 raus und erreicht den Proxy
   nach u1; der Proxy ist bis u1 + 13 s angemeldet. Anfrage 2 geht bei
   t = 15 s raus und meldet sich bei 15 s + u2 an. Überlappung, sobald
   u1 > u2 + 2 s. Im Mobilfunk mit kurzem Funkloch ist das kein exotischer
   Fall: TCP wiederholt einen verlorenen Verbindungsaufbau erst nach
   1 s, dann nach weiteren 2 s (Anfangswert der Retransmission-Zeit nach
   RFC 6298). Und bei HTTP/2 über eine stockende Verbindung kommen beide
   Anfragen nach dem Funkloch praktisch gleichzeitig an. Genau dann tippt
   ein Elternteil ein zweites Mal.
2. **Neuladen.** `requestInFlight` lebt im Speicher der Seite. Wer die Seite
   im Browser neu lädt, während eine Anfrage läuft, startet sofort eine neue
   Anfrage. Die alte läuft im Proxy weiter, sofern Cloudflare sie beim
   Abbruch durch den Client nicht beendet [ungeprüft]. Beendet Cloudflare
   sie, fällt womöglich die Abmeldung im `finally` weg [ungeprüft], und
   die Sitzung bleibt offen.
3. **Zweite Instanz.** Zwei Tabs, App und Browser, zwei Elternteile: Jede
   Instanz hat ihren eigenen `refreshRun`.
4. **Das Klassenkonto ist klassenweit.** Ein Klassenkonto teilen sich per
   Definition alle Familien der Klasse. Wenn um 7 Uhr eine andere Familie
   (mit dieser App oder der WebUntis-App) nachsieht, überlappen die
   Anmeldungen ohnehin. Die App kann nur ihre *eigenen* Abrufe
   nacheinander schicken.

Punkt 4 stellt auch die Prämisse in Frage. Dass sich gleichzeitige
Sitzungen eines Kontos „stören“, behauptet der Code seit Langem, belegt ist
es nirgends [ungeprüft]. Wäre es so, müssten Familien derselben Klasse
morgens regelmäßig Fehler sehen. Das spricht entweder gegen die Prämisse
oder für ein Problem, das sich in der App gar nicht lösen lässt.

Kein 🔴: Es leakt nichts, und das Warten ist für den Normalfall (eine
Instanz, Doppeltipp, Tageswechsel) eine echte Verbesserung. Aber es ist ein
Sicherheits- bzw. Korrektheitsversprechen in der geltenden Doku, das nicht
stimmt. Vorschlag: ehrlich formulieren („die App startet keine eigene
zweite Anfrage, solange ihre letzte offen ist, höchstens 15 s lang; andere
Geräte und Familien am selben Klassenkonto kann sie nicht steuern“) und den
Kommentar in `index.html` auf „hängt auf dem Rückweg“ eingrenzen. Wer mehr
will, bräuchte eine Sperre je Konto im Proxy (etwa ein Durable Object).
Das halte ich für dieses Projekt für überdimensioniert, solange die
Prämisse nicht belegt ist.

**🟢 A-2: Ganz-oder-gar-nicht-Cachen ist dokumentiert, aber nicht getestet.**
In jedem `BUDGET_CASES`-Fall ist der jeweils andere Anbieter unkonfiguriert
(`lunch: {}` bzw. `webuntis: {}`, `run-tests.mjs:2231, 2238, 2249`), sein
Ergebnis also `rejected` mit „Konfiguration unvollständig“. Der
realistische Fall, dass der andere Anbieter sauber liefert, kommt nicht
vor. Mutant P5:

```js
if (!timedOut || lessonsResult.status === 'fulfilled' || lunchResult.status === 'fulfilled') {
```

cacht ein Ergebnis mit Zeitüberschreitung 4 Minuten lang, sobald einer der
beiden geliefert hat. Das ist genau der Fehler C-1 der zehnten Runde für
die normale Konfiguration (jedes Kind hat Stundenplan *und* Essen) und
eine naheliegende „Optimierung“. Ergebnis: **grün** (395/395). Fix: ein Fall
„Mensamax hängt, WebUntis liefert“ (und umgekehrt) mit
`resultKeys().length === 0`. Der Code selbst ist richtig, das hat die elfte
Runde in workerd belegt (Szenario X4).

### B. Datensparsamkeit und Transparenz

**🟢 B-1: Dass „Alle Daten löschen“ laufende Antworten verwirft, prüft kein Test.**
Der Test „deleting all data drops the answer still on its way“
(`run-tests.mjs:3285`) ruft `abandonRefreshes()` direkt auf. Mutant W7
entfernt den Aufruf im Lösch-Handler (`web/index.html:1007`): **grün**.
Ohne den Aufruf würde eine nach dem Löschen eintreffende Antwort wieder
in `lastDataById` geschrieben, also Stundenplan und Essensstatus eines
gerade gelöschten Kindes im Speicher der Seite, bis zum Neuladen. Für eine
Funktion, die „Alle Daten löschen“ heißt, ist das genau die Stelle, die
einen Wächter verdient. Fix: den Klick-Handler im Test auslösen (wie bei
den Speichertests), oder das Löschen als Funktion herausziehen und diese
testen.

Sonst nichts Neues: Der Fix fügt weder Anfragen noch Speicher hinzu. Die
Laufnummer lebt nur im Speicher.

### C. Alltag

**🟡 C-1: Nach dem Tageswechsel zeigt eine Karte bis zu 13 s den alten Tag, jetzt ohne Ladeanzeige.**
`setCardLoading()` (`web/index.html:1062`) läuft erst, wenn der neue Abruf
das Kind erreicht (`:1380`). Der neue Abruf wartet aber zuerst auf die
laufende Anfrage (`:1450-1456`). Bei mehreren Kindern heißt das: Die Karten,
die der alte Abruf schon gefüllt hat, zeigen weiter den alten Tag, in
voller Deckkraft, bis die laufende Anfrage fürs *nächste* Kind fertig ist.
Das sind im ungünstigsten Fall rund 13 s, bei einer im Netz hängenden
Anfrage 15 s.

Beleg im eingebauten Browser (lokale Kopie, zwei Kinder, `fetch`-Stub:
Anfrage 2 braucht 8 s, alle anderen 0,3 s), Klick auf „Di 10.11.“ bei
1 070 ms:

| Zeit | Reiter | Karte 1 | Deckkraft |
|---|---|---|---|
| 1 070 ms (vor Klick) | Heute | Fach fuer 20261109 | 1 |
| 2 136 ms | **Di 10.11.** | **Fach fuer 20261109** | **1** |
| 4 329 ms | Di 10.11. | Fach fuer 20261109 | 1 |
| 7 607 ms | Di 10.11. | Fach fuer 20261109 | 1 |
| 8 704 ms | Di 10.11. | Fach fuer 20261109 | 0,55 (jetzt „Lädt …“) |
| 9 800 ms | Di 10.11. | Fach fuer 20261110 | 1 |

Gegenprobe gegen 0.4.5 (`b7e62fa`) in einem Node-Nachbau, der mitschreibt,
was jede Karte *zeigt*: gleich nach dem Tipp in 0.4.5
`{"a":"day0 (Lädt)", …}`, in 0.4.6 `{"a":"day0", …}`. In 0.4.5 war die Karte
also sofort abgeblendet mit „Lädt …“ (`.fetching{opacity:.55}`,
`web/index.html:90`). 0.4.6 nimmt das weg. Das ist genau der Effekt aus C-1
der elften Runde, „unter dem gewählten Reiter steht der Plan eines anderen
Tages, ohne Hinweis“, nur diesmal vorübergehend. Am Abend auf „morgen“
tippen, kurz hinsehen, Handy weglegen: Das geht schneller als 13 s.

Fix, klein: in `refreshAll()` gleich nach `++refreshRun` alle Karten auf
`setCardLoading()` setzen. Mutant W13 macht genau das und bleibt grün.
Die Tests können also weder den Fehler noch den Fix sehen (D-1).

**🟢 C-2: Ältere Daten kommen über 👁 und 🚫 zurück.**
`lastDataById` wird nur bei Erfolg geschrieben (`web/index.html:1417`) und
beim Tageswechsel nicht geleert. Scheitert der neue Abruf, bleibt die
Antwort des *vorigen* Tages liegen. Der 👁-Knopf zeichnet die Karte aus
diesem Speicher neu (`:1105-1107`), der 🚫-Knopf ebenso (`:1230`).
Beleg im Browser, dieselbe Kopie: Fach auf heute ausblenden, Netz weg
(`fetch` lehnt ab), „Di 10.11.“ tippen → Karte zeigt „Load failed“. Dann 👁
zum Wiedereinblenden → Reiter „Di 10.11.“, Karte **„Fach fuer 20261109“**,
und die Fehlermeldung ist verschwunden. Das gab es schon vor 0.4.6, aber
es widerspricht wörtlich der neuen Aussage „eine Antwort wird nur …
gespeichert, solange ihr Abruf der letzte ist“: Gespeichert bleibt eben
auch die des vorletzten. Fix: `delete lastDataById[child.id]` beim Start
von `fetchChild()` oder im Fehlerweg.

**🟢 C-3: Silbentrennung bei Namen, WCAG 2.2 ohne Verstoß, Ergebnis typografisch mäßig.**
Gemessen im eingebauten Browser (Chromium), 320 × 700 px, lokale Kopie.
- 1.4.10 Umbruch (Reflow), AA: `scrollWidth` = 320, auch mit den Werten aus
  1.4.12. Erfüllt.
- 1.4.12 Textabstand, AA: Zeilenhöhe 1,5, Buchstabenabstand 0,12 em,
  Wortabstand 0,16 em, Absatzabstand 2 em: kein Element im Kartenkopf
  abgeschnitten, „Bartholomäus“ dann dreizeilig (85/8/52 px). Erfüllt.
- 1.3.1 Info und Beziehungen, A, und 4.1.2 Name, Rolle, Wert, A: Die
  Trennung ist rein visuell, `textContent` bleibt „Bartholomäus“, ein
  Screenreader liest den Namen am Stück. Erfüllt.
- 3.1.2 Sprache von Teilen, AA: Die deutsche Trennregel trifft auch
  nicht-deutsche Namen. Das Kriterium nimmt Eigennamen ausdrücklich aus,
  also kein Verstoß.

Darstellung: In einer auf 104 px verengten Namensspalte (der Wert aus der
elften Runde) wird aus „Bartholomäu“ + „s“ jetzt „Bartholomä-“ + „us“.
Bei 80 px bzw. 70 px brechen auch „Maximiliane“ und „Konstantin“ jetzt
mit Trennstrich (Zeilen 58/8/38 px und 31/8/56 px, die 8 px sind der
Strich); ohne `hyphens:auto` bliebe in der zweiten Zeile nur ein Rest von
20 bzw. 21 px stehen. Das ist besser, aber ein abgetrenntes „us“ bleibt
unschön. Mit der Konfiguration ohne Guthaben ist die Spalte bei 320 px
125 px breit, „Bartholomäus“ passt dann in eine Zeile. Die Ursache, eine
Namensspalte ohne Mindestbreite neben einem rechten Block von bis zu halber
Breite, ist geblieben. `hyphenate-limit-chars` (etwa `6 3 3`) würde das
„us“ verhindern; ob Safari es unterstützt, habe ich nicht geprüft
[ungeprüft], ebenso wenig die Trennung in Safari auf dem iPhone selbst
[ungeprüft]. Rein kosmetisch.

### D. Nerd-Details

**🟢 D-1: Die neuen Tests prüfen die Eigenschaft, sehen aber nicht, was die Karte zeigt.**
Erst das Positive: Die Invarianten sind richtig gewählt (jede Darstellung
gehört zum letzten Tipp, gezeigter Tag = gewählter Tag, Spinner an, solange
eine Anfrage läuft, der letzte Abruf füllt jede Karte genau einmal). Der
Seed ist fest, die Klassen sind benannt, die Fehlerklassen (HTTP, Netz)
sind dabei. Gezählt in einer Kopie über die 200 Fälle: 436 Tipps bei
offener Anfrage, 205 späte Antworten, 55 „Antwort“-Schritte ohne offene
Anfrage (übersprungen). Das ist gut verteilt. Mutanten (Kopien,
Auswertung stdout + stderr):

| Mutant | Ergebnis |
|---|---|
| W1 Kette prüft Laufnummer nicht | 4 rot |
| W2 Erfolgsweg prüft Laufnummer nicht | 4 rot |
| W3 Fehlerweg prüft Laufnummer nicht | 1 rot (Property-Test) |
| W4 kein Warten auf die laufende Anfrage | 3 rot |
| W5 `finally` ohne Laufprüfung (alter Lauf schaltet Spinner aus) | 1 rot |
| W6 `abandonRefreshes` zählt nicht hoch | 1 rot |
| W7 Lösch-Handler ruft `abandonRefreshes` nicht auf | **grün** (B-1) |
| W8 Wartegrenze 60 s | 1 rot |
| W9 Wartegrenze 5 s | 1 rot |
| W10 nur das erste Kind setzt `requestInFlight` | 1 rot |
| W11 `lastDataById` vor der Laufprüfung geschrieben | 2 rot |
| W12 `setCardLoading` entfernt (Karte zeigt nie „Lädt …“) | **grün** |
| W13 neuer Lauf setzt alle Karten sofort auf „Lädt …“ (Fix für C-1) | grün, erwartungsgemäß (Verhalten, kein Fehler) |
| W14 Wartezeitgeber startet erst nach Ende der laufenden Anfrage | 1 rot |
| W15 Datum anders gelesen | grün, inhaltsgleich, verworfen |
| P1 nur `lessonsResult` auf Zeitüberschreitung geprüft | 13 rot |
| P2 Lese-Abbruch als einfacher `Error` | 10 rot |
| P3 Zeitüberschreitung 30 s cachen | 24 rot |
| P4 `every` statt `some` | 24 rot |
| P5 trotz Zeitüberschreitung cachen, wenn der andere Anbieter lieferte | **grün** (A-2) |

Drei Lücken:
- `setCardLoading` ist im Testaufbau ein No-op (`run-tests.mjs:3178`), und
  `renderChildResult` wird nur protokolliert. Die Tests wissen, was
  *gerendert* wird, nicht, was die Karte *zeigt*. Deshalb sind W12 und W13
  grün, und C-1 ist für die Suite unsichtbar. Ein kleines Kartenmodell
  („zeigt Tag X“, „lädt“) wie in meinem Nachbau würde reichen, dazu die
  Invariante „nach jedem Tipp zeigt keine Karte ohne Ladeanzeige einen
  anderen als den gewählten Tag“.
- Die Klasse „die 15 s laufen ab“ fehlt im Generator. Der
  Property-Test sagt also nichts über den Fall, in dem die Begründung aus
  A-1 trägt oder nicht trägt.
- „another day while a request is on its way“ wählt den Tag zufällig aus
  1-3, unabhängig vom aktuellen. In 31 von 228 Fällen ist es derselbe Tag,
  also eigentlich ein Doppeltipp. Kein Schaden, aber die Klasse heißt
  anders, als sie ist.

Zur Frage „Eigenschaft oder Implementierung“: Die Test-Zeitgeber feuern nur
Zeitgeber mit genau `ms === 15000` (`timeOut(15000)`). W9 (5 s) ist nur
deshalb rot. Wie in der elften Runde (D-2) bindet das den Test an die
Konstante. Hier ist es vertretbar, weil die 15 s eine dokumentierte
Festlegung sind.

**🟢 D-2: Das Prüfwerkzeug ist jetzt sauber, bis auf Strg+C.**
Drei Fehlerwege in einer Kopie nachgestellt (Startprüfung schlägt fehl,
fremder Server auf dem Port, Ausnahme nach dem Start): jedes Mal Exit 2, kein
workerd, kein Temp-Ordner. Bei Strg+C (SIGINT an die Prozessgruppe, wie im
Terminal) endet workerd zwar mit, aber `probe-workerd-…` mit
`config.capnp` und Kopien der Proxy-Module bleibt im System-Temp liegen.
Node beendet sich bei SIGINT ohne `finally`. Den Ordner aus meinem
Versuch habe ich gelöscht. „Räumt auf jedem Weg auf“
(`PROJEKT.md:845-846`) und „cleans up on every way out“
(`tools/probe-workerd.mjs:124-125`) stimmen damit nicht ganz. Fix: ein
`process.once('SIGINT', …)`, das aufräumt, oder die Aussage auf „auf jedem
Fehlerweg“ eingrenzen. Inhaltlich harmlos, die Dateien enthalten nur
öffentlichen Code.

Zum Port: Zwischen `freePort()` und dem Start von workerd bleibt ein
Zeitfenster (TOCTOU). Die Startprüfung fängt das. Der fremde Server bekam in
meinem Versuch nur `OPTIONS`. Durchrutschen würde nur ein Dienst, der genau
`https://heute-schule.pages.dev` als erlaubten Origin meldet, also ein
lokal laufender `wrangler dev` dieses Proxys (`proxy/wrangler.toml:12`).
Der läuft auf 8787, `freePort()` vergibt Ports aus dem kurzlebigen Bereich
des Systems. Praktisch ausgeschlossen, gut gelöst.

**🟢 D-3 (positiv): kleiner, lesbarer Fix.**
Die Laufnummer ist das einfachste Mittel, das hier wirkt, ohne
`AbortController` und ohne Zustandsmaschine. `requestInFlight` wird ersetzt,
nicht verkettet, die Promise-Kette wächst also nicht. Jeder Tipp hinterlässt
genau einen 15-s-Zeitgeber, der sich selbst erledigt; bei Dauertippen sind
das ein paar Closures, kein Leck, das sich bemerkbar macht. Fehler können
`requestInFlight` nicht vergiften, weil `fetchChild()` alles fängt und das
Rennen ohnehin mit `then(…, …)` abfängt. Und die Prüfung steht auf Erfolgs-
*und* Fehlerweg sowie vor jedem weiteren Kind. Das sind genau die drei
Stellen, die man vergessen kann (W1-W3 rot).

---

## 5. Gewichtungs-Feedback

- C-1 ist 🟡, obwohl das Fenster nur Sekunden dauert. Es ist derselbe Fehler,
  den die elfte Runde als 🟡 gemeldet hat (falscher Tag unter dem
  gewählten Reiter, ohne Hinweis), und diesmal hat der Fix ihn eingeführt:
  0.4.5 blendete die Karte sofort ab. Der Fix ist eine Zeile.
- A-1 ist 🟡, nicht 🔴: Für die eigene Instanz ist das Warten eine echte
  Verbesserung, und ob überlappende Anmeldungen WebUntis überhaupt stören,
  ist unbelegt. 🟡, weil „nie“ als Begründung in Commit, PROJEKT, OFFEN,
  README und Code steht und die vier Gegenwege keine Exoten sind.
- A-2, B-1 und D-1 sind 🟢: Der Code ist jeweils richtig, es fehlt der
  Wächter. Aber es ist die dritte Runde in Folge mit demselben Muster: Die
  Gegenprobe steht dort, wo der Fix gebaut hat (eine Konfiguration, die
  Hilfsfunktion statt des Handlers, das Rendern statt der Anzeige), und
  nicht dort, wo die Eigenschaft im Alltag gilt.
- Zustimmung: Laufnummer statt Abbruch der alten Anfrage. Ein Abbruch im
  Browser hält den Proxy ohnehin nicht an.
- Zustimmung: Ganz oder gar nicht cachen, als bewusste Entscheidung
  festgehalten. Mit dem Test aus A-2 ist sie dann auch geschützt.
- Kein Fund ist 🔴. Nichts leakt, keine neue Angriffsfläche, keine neue
  Anfrage an Dritte.

---

## 6. Fazit

0.4.6 behebt, was die elfte Runde als Kern gemeldet hat: Späte Antworten
werden verworfen, ein Doppeltipp startet keine zweite Kette mehr, und die
Proxy-Seite (nicht cachen, Abmeldung, Werkzeug) ist in Ordnung. Belegt mit
Mutanten, im Browser und in workerd. Zwei Aussagen tragen aber nicht: Die
App zeigt nach dem Tageswechsel weiter bis zu 13 s den falschen Tag, jetzt
sogar ohne Ladeanzeige (C-1). Und „nie zwei Anmeldungen am selben
Klassenkonto“ kann eine einzelne App-Instanz nicht versprechen (A-1). Beides
ist mit einer Zeile Code bzw. einer ehrlicheren Formulierung erledigt.

Zum Fix als Arbeit: sauberer Code, sorgfältige Doku-Pflege, alle K-Punkte
erledigt, das Werkzeug jetzt robust. Die Aussagen über sich selbst sind
aber wieder einen Tick größer als das Geprüfte: „nie“, wo der eigene Test
das Gegenteil erwartet, „auf jedem Weg“, wo Strg+C fehlt, „gespeichert nur
für den letzten Abruf“, wo der vorletzte liegen bleibt. Und die Tests sehen
das Rendern, nicht das, was ein Elternteil auf dem Bildschirm sieht.

---

### Anhang: Sonden und Live-Anfragen

Alles im Scratchpad der Prüfsitzung (flüchtig, nicht im Repo):
- `base/`: `git archive` von `44a1c13`, `node_modules` als Symlink. Darin
  `tools/e1.mjs`, `e2.mjs`, `e3.mjs`: Fehlerweg-Varianten des Werkzeugs
  (D-2); den Strg+C-Versuch habe ich über eine eigene Prozessgruppe
  gestartet.
- `tools/mutate.py`, `tools/m1.json`, `tools/m1.log`: Mutanten K0, K1, W1-W15,
  P1-P5; Kopie jeweils unter `mut/`.
- `stats/`: Kopie mit Zählern im Property-Test (Klassenverteilung).
- `probe/window.mjs` mit `index-045.html` (`b7e62fa`) und
  `index-046.html`: Node-Nachbau, der festhält, was jede Karte zeigt (C-1).
- `ui/index.html`: lokale Kopie von `web/index.html` mit Testdaten in
  `localStorage` und `fetch`-Stub vor dem App-Skript, Service Worker
  abgeschaltet; über einen lokalen Server nur für die Dauer der Messung
  ausgeliefert. Danach `localStorage` und Caches geleert (0 Einträge, 0
  Service-Worker-Registrierungen), Viewport zurückgesetzt, Tab und Server
  beendet.

Live-Proxy: keine Anfrage. Keine Anfrage an sams-on, WebUntis oder Mensamax.

Website, 10 GET: `deploy-commit.txt`, `/ueber`, `/` (zweimal: Suche nach
`abandonRefreshes`, Hash), `/source/proxy/worker.js`, `/docs/PROJEKT.md`,
`/docs/OFFEN-naechste-Fixes.md`, `/docs/PEER-REVIEW-2026-11-09b.md`,
`/docs/PEER-REVIEW-2026-11-09.md` und `/docs/PEER-REVIEW-2026-10-30.md`
(nur Statuscode).
