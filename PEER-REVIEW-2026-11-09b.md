# Peer-Review „Der beste Freund“ — Folge-Fix der zehnten Prüfrunde (0.4.5)

ID9ZBJZ · v1 · 2026-11-09 · 731d0302 · gültig

**Zweck:** Unabhängige Gegenprüfung von Version 0.4.5. Geprüft wird, ob der
Fix die Befunde aus dem Prüfbericht der zehnten Runde (IDBRBGB) wirklich
behebt, ob seine Aussagen über sich selbst stimmen (Commit-Nachricht,
`OFFEN-naechste-Fixes.md`, `PROJEKT.md`, `proxy/README.md`, `web/ueber.html`)
und ob er neue Fehler, Testlücken oder Widersprüche einführt. Dazu das neue
Kartenlayout (Guthaben-Zeile, rechter Block höchstens halbe Breite) nach
WCAG 2.2.

**Prüfobjekt:** Commit `b7e62fa` („Folge-Fix der zehnten Pruefrunde“, 0.4.5):
`proxy/worker.js`, `web/index.html`, `run-tests.mjs`, das neue Werkzeug
`tools/probe-workerd.mjs`, `.c8rc.json`, `deploy.sh` sowie die Aussagen in
Commit-Nachricht, `OFFEN-naechste-Fixes.md` (drei neue Erledigt-Zeilen,
Punkte 6 und 7), `PROJEKT.md` (Sicherheits- und Testtabelle,
Coverage-Absatz, Release-Historie 0.4.5), `proxy/README.md` und
`web/ueber.html`.
**Prüfer:** unabhängige Runde ohne Vorwissen über die schreibende Sitzung, 09.11.2026.
**Zugriff:**
- Lokal: Quellcode (HEAD = `b7e62fa`, Arbeitsbaum sauber), Testsuite, Lint,
  Typprüfung, `tools/probe-workerd.mjs` im Projektordner; Coverage (`c8`)
  und alles Weitere nur in Kopien.
- workerd aus `node_modules` (ohne `wrangler`): das Werkzeug des Fixes
  selbst, dasselbe gegen den Code von 0.4.4 und eine erweiterte Fassung mit
  sieben eigenen Szenarien und mitprotokolliertem Cache-Verkehr.
- Eingebauter Browser: lokale Kopie von `web/` mit Testdaten in
  `localStorage` und `fetch`-Stub, danach `localStorage` geleert. Keine
  Anfrage an den Proxy (Netzwerkprotokoll des Tabs: keine an `workers.dev`).
- Live: Website (8 GET), Live-Proxy (2 von erlaubten 20 Anfragen, beide
  scheitern vor jedem Login). Keine Anfrage an sams-on, WebUntis oder
  Mensamax.

**Methode:** Mutanten und Sonden nur in Kopien (`git archive`,
`node_modules` als Symlink) im Scratchpad der Prüfsitzung. Das
Auswerteskript liest stdout und stderr und ist an zwei Kontrollmutanten
geeicht: Limit 20 s → `387 Tests: 360 ✓ 27 ✗`, inhaltsgleicher Austausch →
`387 ✓ 0 ✗`. Im Projektordner nichts geschrieben.

**Inhalt und Lesehilfe:**
1. Kurzeinschätzung: das Urteil in wenigen Sätzen.
2. Verifikationstabelle: jede Behauptung des Fixes einzeln (2a), danach der
   Status jedes Befunds der zehnten Runde (2b).
3. Korrekturen an Doku und Kommentaren (K-1 bis K-5).
4. Zusatzbefunde nach Schwerpunkt (A Security und Betrieb, B
   Datensparsamkeit, C Alltag, D Nerd-Details), mit Schweregrad und Beleg.
   Die Mutanten-Tabelle steht unter A-1, die workerd-Szenarien unter 2a.
5. Gewichtungs-Feedback. 6. Fazit. Anhang: Sonden und Live-Anfragen.

Wer nur die Kurzfassung braucht, liest 1 und 6.

---

## 1. Kurzeinschätzung

Diesmal stimmt die Kernaussage, und zwar auch im ungünstigsten Fall. Ich
habe in workerd das Schlimmste gebaut, was mir einfiel: `getRooms` hängt im
Inhalt, das Limit läuft ab, und dann hängt auch noch die Abmeldung im
Inhalt. Antwort nach 13 017 ms, mit der richtigen Meldung, kein Cache-Eintrag.
Die drei Mutanten, die bei mir in der zehnten Runde grün blieben, sind jetzt
rot. Und `tools/probe-workerd.mjs` macht gegen 0.4.4 genau die drei
Abmelde-Fälle rot, wie behauptet. Kein 🔴. Das eine 🟡 (C-1) hat der Fix
nicht eingebaut, es liegt in der Web-App: Wer während einer langsamen
Antwort den Tag wechselt, sieht danach den Stundenplan des *falschen* Tages
unter dem gewählten Reiter. Ich habe es im Browser nachgestellt. Mit 13 s
Wartezeit und ungecachten Zeitüberschreitungen ist das kein exotischer Fall
mehr. Der Rest ist Feinschliff: zwei Testlücken beim Nicht-Cachen, ein
Aufräumfehler im neuen Werkzeug, fünf Doku-Stellen.

---

## 2. Verifikationstabelle

### 2a. Behauptungen des Fixes

| Behauptung | Ergebnis | Mein Beleg |
|---|---|---|
| Tests, Lint, Typprüfung grün | ✅ | Im Projektordner: `node run-tests.mjs` → `387 Tests: 387 ✓  0 ✗`; `npm run -s lint` Exit 0; `npm run -s typecheck` Exit 0 |
| „Jede Anfrage läuft unter einem Limit, das auch das Lesen umfasst“ | ✅ | `grep` über `proxy/worker.js`: Der einzige ausgehende `fetch` steht in `budgetedFetch` (`worker.js:131-137`), und `budget` ist dort Pflicht. Alle sechs Aufrufer übergeben ein Budget (`252, 412, 426, 506, 626, 689`). Jedes Lesen eines Anbieter-Inhalts hängt damit am Signal seiner Anfrage. Das gilt auch für das eine Lesen ohne `readText` (`worker.js:648`, Instanz-Info). Die übrigen `.text()`/`.json()` lesen Cache oder Client (`107, 757, 772`) |
| „Abruf 10 s gemeinsam, WebUntis-Abmeldung eigene 3 s vor der Antwort und auch nach Fehlern, sams-on-Abmeldung eigene 5 s nach der Antwort“ | ✅ | Code: `worker.js:58-62, 282, 308-320, 688-692`. workerd (Werkzeug des Fixes): Abmeldung hängt im Inhalt → 3 018 ms, Abmeldung ohne Header → 3 011 ms, jeweils mit Stundenplan. Fehler nach dem Login → Abmeldung als letzte Anfrage (Tests `run-tests.mjs:2387`, Mutant N6 rot) |
| „Höchstens rund 13 s“ (README, PROJEKT, OFFEN) | ✅ für die Proxy-Antwort, ⚠️ „je Karte“ | workerd, eigene Szenarien: getRooms hängt im Inhalt **und** Abmeldung hängt im Inhalt → **13 017 ms**; getRooms 9,9 s langsam, dann Abmeldung ohne Header → 12 917 ms; alle Anfragen je 4 s → 13 014 ms. Länger geht es nicht: Die Abmeldung startet spätestens bei 10 s und endet nach eigenen 3 s. „Je Karte“ stimmt nicht für ccCampus-Kinder und nicht fürs Dashboard (K-3) |
| „Zeitüberschreitungen werden nicht gecacht“ | ✅ Code, ⚠️ Tests | workerd mit protokolliertem Cache-Verkehr: Normalfall `GET /__cache/… | PUT /__cache/…`, jede Zeitüberschreitung nur `GET /__cache/…` ohne `PUT`. Aber zwei Mutanten bleiben grün (A-1) |
| „Ein falsches Passwort weiter gecacht (Test und Gegenprobe)“ | ✅ | `run-tests.mjs:2428`; Mutant N8 („jeder abgelehnte Abruf ungecacht“) → 2 rot |
| „Das Einzel-Zeitlimit je Anfrage fällt weg (A-4)“ | ✅ | `FETCH_TIMEOUT_MS` und „>10s“ kommen im Repo außerhalb der Berichte nicht mehr vor (`git grep`) |
| „Test-Uhr mit `advance()` unterscheidet gemeinsames und Einzel-Limit“ | ✅ | Mutant N10 (jede WebUntis-Anfrage eigenes 10-s-Budget) → 2 rot, darunter `WebUntis: requests that are each slow … the answer comes after 13 s`. Die Uhr ist nicht auf die Anzahl der Event-Loop-Runden der Implementierung zugeschnitten: Drei inhaltsgleiche Mutanten mit 2 bzw. 6 zusätzlichen `setImmediate`-Runden je Anfrage oder vor dem Ablauf bleiben grün (D-2) |
| „Zeitlimit-Fälle prüfen wieder die Abmeldung“ | ✅ | `run-tests.mjs:2289`. Mutant N9 (sams-on-Abmeldung auch am gemeinsamen Limit) → 4 rot; N4 (WebUntis-Abmeldung auch am gemeinsamen Limit) → 8 rot |
| „16 Mutanten, darunter die drei beim Prüfer grünen, je mindestens ein Test rot“ | ✅ für die drei, [ungeprüft] für die übrigen 13 | Meine Nachbauten der drei grünen aus der zehnten Runde: M1 → N10 rot, M4 → N11 rot (10), M10 → N9 rot (4). Die Liste der 16 im Einzelnen habe ich nicht nachgebaut, dafür eigene (A-1) |
| `tools/probe-workerd.mjs`: „7 Szenarien grün; gegen 0.4.4 schlagen genau die drei Abmelde-Fälle an“ | ✅ | HEAD: `Alle 7 Szenarien wie erwartet.` Gegen eine Kopie von `90c01e0`: `3 von 7 Szenarien nicht wie erwartet`, nämlich „getRooms: Inhalt hängt“ (keine Abmeldung), „Abmeldung: Inhalt hängt“ (Client gibt nach 30 008 ms auf), „Abmeldung: keine Header“ (10 015 ms) |
| Werkzeug: „reaches no real provider“, keine Zugangsdaten | ✅ | `globalOutbound = "provider"` zeigt auf den lokalen Nachbau, `cacheApiOutbound` auf einen zweiten. Ohne `globalOutbound` gäbe es keinen Weg ins Internet. Zugangsdaten sind Platzhalter (`password: 'p'`) |
| Werkzeug: Aufräumen | ⚠️ | Auf dem Weg mit Exit-Code 2 bleiben workerd und das Temp-Verzeichnis zurück (D-1) |
| „takes about a minute and a half“ / „rund anderthalb Minuten“ | ⚠️ | Gemessen: 60,0 s (`time`). Kleinkram, K-4 |
| `.c8rc.json`, Coverage-Absatz „`worker.js` bei 100 % der Anweisungen“ | ✅ | `npx c8 node run-tests.mjs` (Kopie): `worker.js | 100 | 90.23 | 100 | 100`. Das Werkzeug ist ausgenommen, wie beschrieben |
| Karte: „💶 Guthaben 12,40 €“, „bald aufladen“ in eigener Zeile, rechter Block höchstens halbe Breite | ✅ | Browser, 375 px: Kopfbreite 306 px, rechter Block höchstens 153 px. Text „💶 Guthaben 3,20 € bald aufladen“ in zwei Zeilen, Hinweis als eigener Block (`web/index.html:1161-1171`) |
| „Kopf 48 statt 76 px auf 375 px“ | ✅ 48 / [ungeprüft] 76 | Karte mit „Guthaben nicht abrufbar“: Kopf 48 px. Den alten Wert von 0.4.4 habe ich nicht nachgemessen |
| `deploy.sh`, `ueber.html`, Dump: Bericht der zehnten statt der neunten Runde | ✅ | Pflicht-Paar in `deploy.sh:150` umgestellt; kein relativer Link auf den entfernten Bericht mehr in `web/` |
| Kopfzeilen HS-PRJ v10, HS-OFF v10; Kopien byte-gleich | ✅ | `stamp.py check`: beide `OK`, IDBRBGB v2 ebenfalls. `cmp` für `PROJEKT.md`, `OFFEN-…`, den Bericht der zehnten Runde und `worker.js` gegen `web/docs/` bzw. `web/source/proxy/`: gleich |
| Live 0.4.5 | ✅ Website / [ungeprüft] Proxy | `deploy-commit.txt` = `b7e62fa8…` = HEAD; `/ueber`: `VERSION = '0.4.5'`; `/source/proxy/worker.js` SHA-256 `6da74af5…` = HEAD; drei Dokumente byte-gleich; `/` enthält `child-balance-hint`. Ob der Worker selbst 0.4.5 ausführt, ist von außen ohne hängenden Anbieter nicht unterscheidbar |
| OFFEN Punkt 7: entfernter Bericht liefert nach einer Woche `404` | offen, wie angekündigt | Heute `/docs/PEER-REVIEW-2026-10-30.md` → `200`. Das ist der dokumentierte Cloudflare-Cache, Kontrolle ab 16.11. ist richtig terminiert |
| „Nicht übernommen: Abbrüche über Worker-Logs zählen — der Proxy protokolliert bewusst nichts“ | ✅ | Kein `console.*` in `worker.js`, kein `[observability]` in `proxy/wrangler.toml`. Die Begründung ist schlüssig und datensparsam |

### 2b. Status der Befunde der zehnten Runde (IDBRBGB)

| Befund | Status | Beleg |
|---|---|---|
| A-1 WebUntis-Abmeldung unbegrenzt | **behoben** | workerd: 3 011 / 3 018 ms statt 10 015 ms bzw. ≥ 30 s; schlechtester Fall 13 017 ms. Tests `run-tests.mjs:2360` (beide Hängeklassen) |
| A-2 Wächter „sams-on-Abmeldung nach Ablauf“ verloren | **behoben** | `run-tests.mjs:2289`; Mutant N9 → 4 rot |
| A-3 „gemeinsam“ ungetestet | **behoben** | Test-Uhr `advance()` (`run-tests.mjs:1869`), `SLOW_CASES` (`2318`); Mutant N10 → rot |
| A-4 Meldung „(>10s)“ unerreichbar | **behoben** (entfernt) | Einzel-Timer und Meldung gibt es nicht mehr |
| C-1 Zeitüberschreitungen 4 min gecacht | **behoben** im Code, Test **teilweise** | workerd: kein `PUT` nach Zeitüberschreitung. Zwei Mutanten bleiben grün (A-1) |
| C-2 Wort „Guthaben“ fehlte | **behoben** | `web/index.html:1163`; im Browser „💶 Guthaben 3,20 € bald aufladen“ |
| D-1 Abmeldung fehlte nach Fehlern | **behoben** | `finally` in `worker.js:310-320`; Tests `run-tests.mjs:2387, 2397`; Mutant N6 → 8 rot |
| D-2 workerd-Prüfung nicht im Repo | **behoben** | `tools/probe-workerd.mjs`, läuft und unterscheidet 0.4.4 von 0.4.5. Aufräumfehler siehe D-1 |
| K-1 fünf veraltete Doku-Stellen | **behoben** | Alle fünf korrigiert (`PROJEKT.md` sams-on-Zeile, `worker.js:32-35`, `56-57`, README, OFFEN Punkt 6). Eine neue veraltete Stelle in derselben Tabelle: K-1 unten |
| K-2 „jede Anfrage-Position“ zu weit | **behoben** | Testtabelle: „Jede Abruf-Anfrage einzeln (WebUntis 5 ohne die Abmeldung …)“ |

---

## 3. Korrekturen

**K-1 (🟢): `PROJEKT.md:266`, Sicherheitstabelle, Zeile „Ziel-Host-Allowlist“:**
„`redirect: 'manual'` zentral in `fetchWithTimeout`“. Die Funktion heißt
jetzt `budgetedFetch`. Das ist die *geltende* Sicherheitstabelle, keine
Momentaufnahme (anders als OFFEN Zeile 67, die darf so bleiben).
`proxy/README.md` ist an derselben Stelle schon korrigiert.

**K-2 (🟢): `PROJEKT.md:524`:** „Keine der neun Audit-Runden …“. Die Liste
direkt darüber endet jetzt mit der zehnten Runde. Steht seit 0.4.4 so, ist
aber genau jetzt beim Anfügen des zehnten Eintrags durchgerutscht.

**K-3 (🟢): „Höchstens rund 13 s je Karte“ (`PROJEKT.md`
Sicherheitstabelle, OFFEN Erledigt-Zeile der zehnten Runde).**
Richtig ist: höchstens rund 13 s je *Proxy-Antwort*. Für ein
ccCampus-Kind wartet `fetchChild()` zusätzlich auf den Browser-Abruf ohne
Limit (`web/index.html:1398-1404`). OFFEN Punkt 6 sagt das selbst, zwei
Abschnitte tiefer, nur eben im Widerspruch zur Zeile oben. Und fürs
Dashboard gilt n × 13 s, weil die Kinder nacheinander laufen. Bei drei
Kindern am selben hängenden WebUntis steht die letzte Karte rund 39 s auf
„Lädt …“, bei jedem Aktualisieren erneut. `proxy/README.md` formuliert es
schon vorsichtiger („hält die Karte … auf“, im Kontext des Proxys). Vorschlag:
„höchstens rund 13 s je Antwort des Proxys“.

**K-4 (🟢): Laufzeit des Werkzeugs.** „about a minute and a half“
(`tools/probe-workerd.mjs:6`) und „rund anderthalb Minuten“ (`PROJEKT.md`,
Coverage-Absatz): gemessen 60 s. Die Summe der Szenarien plus 7 × 1,5 s
Nachlauf ergibt auch rechnerisch rund eine Minute.

**K-5 (🟢): `web/ueber.html:89`:** „die früheren Runden … stehen auf GitHub“
verlinkt genau eine Datei (`PEER-REVIEW-2026-10-29.md`). Für „die früheren
Runden“ wäre ein Link auf das Repository oder auf `PROJEKT.md` Abschnitt
„Berichte“ ehrlicher.

---

## 4. Zusatzbefunde

### A. Security und Betrieb

**🟢 A-1: „Nicht cachen“ ist nur für einen von vier Wegen abgesichert.**
Der Code ist richtig: `worker.js:802` prüft beide Ergebnisse, und
`asTimeoutError` erzeugt für Header- und Lese-Abbruch dieselbe Klasse. Der
einzige Test dazu (`run-tests.mjs:2406`) lässt aber nur WebUntis
*vor den Headern* hängen. Zwei naheliegende Regressionen bleiben grün:

| Mutant | Ergebnis | Bewertung |
|---|---|---|
| N1 nur `lessonsResult` geprüft (Essens-Zeitüberschreitungen werden wieder 4 min gecacht) | **grün** (387/387) | Lücke |
| N2 `readText` macht aus dem Abbruch einen einfachen `Error` mit gleichem Text (Lese-Zeitüberschreitungen gecacht) | **grün** | Lücke |
| N3b WebUntis-Abmeldung nicht abgewartet | 4 rot | ✅ |
| N4 WebUntis-Abmeldung zusätzlich am gemeinsamen Limit | 8 rot | ✅ |
| N5 WebUntis-Abmeldung 9 s | 3 rot | ✅ |
| N6 Abmeldung nur, wenn das gemeinsame Limit noch läuft | 8 rot | ✅ |
| N7 Fehler der Abmeldung nicht abgefangen | 2 rot | ✅ |
| N8 jeder abgelehnte Abruf ungecacht | 2 rot | ✅ |
| N9 sams-on-Abmeldung zusätzlich am gemeinsamen Limit | 4 rot | ✅ |
| N10 jede WebUntis-Anfrage eigenes 10-s-Budget | 2 rot | ✅ |
| N11 WebUntis-Abmeldung am gemeinsamen Limit statt eigenem | 10 rot | ✅ |
| N15 sams-on-Abmeldung 50 s | 1 rot | ✅ |
| N12 Instanz-Info über `readText` gelesen | grün | inhaltsgleich, siehe unten |

N12 ist kein echter Mutant: Der Abbruch landet in beiden Fassungen im
`catch` (`worker.js:649`), und die nächste Anfrage scheitert sofort am
abgebrochenen Signal. In workerd nachgesehen (Szenario X6: 10 010 ms, richtige
Meldung, kein `PUT`). Fix für N1/N2: Den Cache-Test über eine kleine Matrix
laufen lassen, Anbieter × Hängeklasse, so wie die `BUDGET_CASES` es schon
vormachen. Zwei zusätzliche Fälle (Mensamax-Plan mit hängendem Inhalt,
sams-on-Bestellungen ohne Header) würden beide Mutanten fangen.

**🟢 A-2: Eine Zeitüberschreitung bei einem Anbieter verhindert das Cachen auch des anderen.**
`worker.js:802-808` cacht das ganze Ergebnis oder nichts. workerd, Szenario
X4: Mensamax hängt, WebUntis liefert sauber. Antwort nach 10 011 ms, kein
`PUT`. Beim nächsten Aktualisieren gehen wieder alle sechs WebUntis-Anfragen
raus, samt Login am womöglich geteilten Klassenkonto. Und die alte
Begründung für das Cachen von Fehlern („especially with wrong credentials“,
`worker.js:797-799`) greift nicht mehr, sobald der *andere* Anbieter hängt:
Ein falsches Mensamax-Passwort geht dann bei jedem Klick erneut an
Mensamax. Das Rate-Limit (30 je IP und Minute) begrenzt es. Ein Drama ist
das nicht, aber es ist eine Nebenwirkung, die nirgends steht. Vorschlag:
Ergebnisse mit Zeitüberschreitung kurz cachen (etwa 30 s) statt gar nicht.
Dann hilft „Aktualisieren“ nach einer halben Minute, und Doppelklicks
treffen den Cache. Oder bewusst so lassen und es in `PROJEKT.md`
festhalten.

**🟢 A-3: Läuft das Limit beim Lesen der `authenticate`-Antwort ab, gibt es keine Abmeldung.**
workerd, Szenario X7: Anfragen `WU authenticate`, sonst nichts. Ohne
`sessionId` kann der Proxy sich nicht abmelden, das ist folgerichtig, und
der Test „rejected login opens no session“ (`run-tests.mjs:2397`) deckt den
ehrlichen Teil ab. Ob WebUntis zu diesem Zeitpunkt schon eine Sitzung
angelegt hat, weiß ich nicht [ungeprüft]. Dann begänne der Login fürs
nächste Kind bei offener Sitzung, also genau der Fall, den die sequentielle
Abfrage vermeiden soll. „Auch nach Fehlern“ in Commit und Doku heißt genauer
„nach Fehlern, sobald die Anmeldung gelesen ist“. Nur zur Einordnung, kein
Änderungsbedarf.

Was ausdrücklich passt: Alle Fehler im `finally` sind gefangen
(`worker.js:317-319`), N7 beweist, dass ein Test das bewacht. workerd gab bei
keinem Szenario eine Warnung oder einen unbehandelten Fehler auf stderr aus,
auch nicht bei der hängenden sams-on-Abmeldung nach der Antwort (X5: Antwort
nach 11 ms, Abmeldung im `waitUntil` nach 5 s beendet).

### B. Datensparsamkeit und Transparenz

Keine neuen Befunde. Die neuen Meldungen nennen nur den Host. Das Werkzeug
spricht keinen echten Anbieter an und enthält keine Zugangsdaten. Die
Entscheidung, Abbrüche nicht über Worker-Logs zu zählen, ist konsequent
datensparsam. Dann bleibt das 10-s-Limit eben eine Festlegung ohne
Messgrundlage, und das ist in Ordnung, solange es so dasteht.

### C. Alltag

**🟡 C-1: Tageswechsel während einer langsamen Antwort zeigt den Stundenplan des falschen Tages.**
`refreshAll()` (`web/index.html:1421-1438`) hat keine Sperre gegen
gleichzeitige Läufe, und `fetchChild()` prüft beim Eintreffen nicht, ob die
Antwort noch zum gewählten Tag passt. Das Datum wird beim Start gelesen
(`web/index.html:1380`), gerendert wird beim Eintreffen in dieselbe Karte.
Ein Tageswechsel (`web/index.html:781-784, 789-791`) und ein zweiter Klick
auf ⟳ starten jeweils sofort eine zweite Kette.

Beleg im eingebauten Browser, lokale Kopie, ein Kind, `fetch`-Stub: Die
erste Anfrage (heute, 20261109) antwortet nach 3 s, jede weitere nach 0,1 s.
Gleich nach dem Laden Klick auf „Di 10.11.“:
- nach 1 s: Reiter „Di 10.11.“ aktiv, Karte `Fach fuer 20261110` (richtig);
- nach 4,5 s: Reiter „Di 10.11.“ weiter aktiv, Karte **`Fach fuer 20261109`**.

Die späte Antwort von heute überschreibt also den Dienstag, ohne jeden
Hinweis. Sie landet auch in `lastDataById` und wird beim Wiedereinblenden
eines Fachs erneut gezeichnet. Im Alltag heißt das: Am Abend auf „morgen“
tippen, während „heute“ noch lädt, und das Kind packt nach dem falschen
Plan. Mit dem Fix ist das wahrscheinlicher geworden, ohne dass er es
eingebaut hätte: Eine langsame Antwort dauert jetzt bis 13 s, und weil
Zeitüberschreitungen nicht mehr gecacht werden, ist „nochmal tippen“ die
natürliche Reaktion. Derselbe Mechanismus macht aus einem ungeduldigen
Doppeltipp auf ⟳ zwei parallele Logins am selben Klassenkonto. Den Effekt
auf WebUntis habe ich nicht geprüft [ungeprüft], die Begründung der
sequentiellen Abfrage im Code behauptet ihn. Fix: ein Lauf-Zähler (`var
run = ++refreshRun`), `fetchChild` rendert nur, wenn `run` noch aktuell ist,
und die Kette bricht ab, sobald ein neuer Lauf begonnen hat. Dazu ein Test
mit genau diesem Stub.

**🟢 C-2: Kartenkopf nach WCAG 2.2, kein Verstoß; ein realistischer Name bricht mitten im Wort.**
Gemessen im eingebauten Browser, lokale Kopie, fünf Testkinder (langer
Doppelname, sehr langer Schul-Host, ein 33-Zeichen-Wort, „Bartholomäus“,
alle vier Guthaben-Varianten), helles und dunkles Theme aus
`web/theme.css`.
- 1.4.3 Kontrast (Minimum), AA: selbst gerechnet gegen `--card`. Hell:
  `--warn` 5,93:1, `--muted` 6,17:1, `--danger` 6,54:1, Link 9,35:1.
  Dunkel: 9,67 / 6,40 / 7,01 / 8,28:1. Erfüllt.
- 1.4.1 Benutzung von Farbe, A: „bald aufladen“ steht als Text da, nicht nur
  als Farbe. Erfüllt.
- 1.3.1 Info und Beziehungen, A: „💶 Guthaben 3,20 € bald aufladen“ ist ein
  zusammenhängender Text, der Hinweis ein `span` darin. Der Screenreader
  bekommt jetzt das Wort „Guthaben“ (Befund C-2 der zehnten Runde). Erfüllt.
- 1.4.10 Umbruch (Reflow), AA: bei 320 px `scrollWidth` = 320, kein
  Kartenkopf läuft über, nichts wird abgeschnitten. Erfüllt.
- 1.4.12 Textabstand, AA: mit den Werten aus dem Kriterium (Zeilenhöhe 1,5,
  Buchstabenabstand 0,12 em, Wortabstand 0,16 em) bei 320 px kein Verlust
  von Inhalt. Aber der Login-Link (`white-space:nowrap`) ist dann breiter
  als sein Block: 139 px Link in 125 px Block, er ragt 14 px nach links in
  den Spaltenabstand. Keine Überdeckung von Text, also kein Verstoß.
- 2.5.8 Zielgröße (Minimum), AA: Login-Link 102 × 15 px, also unter 24 px
  hoch. Erfüllt über die Abstandsausnahme, denn im Umkreis liegt kein
  anderes Ziel (die Guthaben-Zeile darunter ist keins). Unverändert zu
  vorher.

Darstellung bei langen Namen: Die linke Spalte hat `flex:1 1 0; min-width:0`
und das `h2` `overflow-wrap:anywhere` (`web/index.html:44, 50`). Weil der
rechte Block nicht mehr unter den Namen rutscht, bleibt dem Namen bei 320 px
nur rund 113 px. „Bartholomäus“ wird dann zu „Bartholomäu“ + „s“ in der
zweiten Zeile (gemessene Zeilenboxen 104 px und 9 px). Bei 375 px passt es.
Ein 33-Zeichen-Wort zerfällt in drei Stücke, das ist synthetisch. Lange
Schul-Hosts brechen an den Bindestrichen, gut. Vorschlag: der linken Spalte
eine Mindestbreite geben (etwa `min-width:8em`) und `flex-wrap` wieder
wirken lassen, oder `hyphens:auto` mit `lang="de"` am `h2`. Rein kosmetisch.

### D. Nerd-Details

**🟢 D-1: `tools/probe-workerd.mjs` räumt auf dem Fehlerweg nicht auf.**
`process.exit(2)` steht *innerhalb* des `try` (`tools/probe-workerd.mjs:150`).
`process.exit` beendet Node sofort, der `finally`-Block (`:179`) läuft nicht.
Nachgestellt in einer Kopie, Startwartezeit auf 1 ms verkürzt: Ausgabe
`workerd startet nicht.`, Exit 2. Danach lief der workerd-Prozess weiter
(`pgrep`), und das Verzeichnis `probe-workerd-…` mit `config.capnp` und
Modulkopien lag noch im System-Temp. Beides habe ich danach beseitigt. Im
System-Temp lag schon vorher ein solches Verzeichnis von 14:12 Uhr, also vor
dem Commit, nur mit `config.capnp`. Herkunft [ungeprüft], vermutlich ein
früher Lauf der schreibenden Sitzung, und nicht von mir gelöscht. Zwei
Kleinigkeiten dazu: Der Port wird zufällig gewählt (`:120`), und die
Startprüfung (`:146`) akzeptiert *jeden* HTTP-Server auf diesem Port. Läuft
dort zufällig etwas anderes, gehen die Testanfragen mit den
Platzhalter-Zugangsdaten dorthin. Und eine Ausnahme vor dem Start (etwa
`listen`) endet mit Exit 1 statt 2. Fix: `failed = -1; return`-artig aus dem
`try` heraus, und `process.exit` nur ganz am Ende. Für den Port: `0` an
workerd geht mit capnp nicht direkt, aber man kann vor dem Start prüfen,
dass der Port frei ist.

**🟢 D-2 (positiv, mit einer Anmerkung): Die Test-Uhr taugt.**
`advance()` (`run-tests.mjs:1869-1882`) feuert fällige Zeitgeber in
Reihenfolge und lässt dazwischen die Arbeit laufen. Ich habe versucht, sie
mit inhaltsgleichen Mutanten zu brechen, die nur mehr Event-Loop-Runden
brauchen (2 bzw. 6 `setImmediate` je Anfrage, 6 vor dem Ablauf): alle grün,
und die Gegenprobe „6 × 1 500 ms = 9 000 ms“ bleibt exakt. Die Uhr ist also
nicht auf die Implementierung zugeschnitten. Die Schranke `answeredAt <=
13000` sitzt genau auf dem Sollwert, deshalb fängt sie auch eine Abmeldung
mit 3,5 s. Anmerkung: Die übrigen Zeitlimit-Tests feuern weiter mit
`fire(ms)` nach exakter Dauer (`run-tests.mjs:2360` ff. mit 3 000). Das fängt
jede Änderung einer Konstante, auch eine harmlose Verkürzung, und macht die
Tests an genau diese Zahlen gebunden. Zu streng ist besser als zu lasch,
aber `advance()` wäre hier die ehrlichere Form.

**🟢 D-3 (positiv): sauber gebaut.**
`budgetedFetch` mit Pflicht-Budget ist eine gute Wahl: Eine Anfrage ohne
Limit lässt sich jetzt nicht mehr versehentlich schreiben, die Typprüfung
würde es melden. `ProviderTimeout` als eigene Klasse statt Textvergleich
passt zum Muster von `WebUntisRejection`. Das Herausziehen von
`timetableForSession` macht das `try/finally` lesbar. Und dass das Werkzeug
gegen den alten Code genau die erwarteten drei Fälle rot macht, ist die
richtige Art, ein Prüfwerkzeug zu belegen.

---

## 5. Gewichtungs-Feedback

- C-1 ist 🟡, obwohl der Fix es nicht verursacht hat. Es ist der einzige Fund,
  bei dem die App einer Familie etwas *Falsches* zeigt statt nur etwas
  Langsames, und der Fix verlängert genau das Zeitfenster, in dem es
  passiert. Wenn Du es lieber als eigenen Punkt in OFFEN führst statt als
  Folge-Fix: einverstanden, aber dann mit 🟡.
- A-1 ist 🟢: Der Code ist richtig, in workerd belegt. Es fehlt der Wächter
  für zwei von vier Wegen. Das Muster kennen wir aus der zehnten Runde (A-2),
  diesmal ist es aber keine gelöschte Absicherung, sondern eine nie
  gebaute.
- Zustimmung: Abmeldung vor der Antwort mit eigenem kurzem Limit, auch nach
  Fehlern, ist die richtige Lösung. Sie kostet im schlechtesten Fall 3 s und
  hält die Entscheidung für geteilte Klassenkonten ein.
- Zustimmung: den Einzel-Timer zu streichen statt ihn zu kürzen. Eine
  Schicht, die nie greift, war nur Dokumentationslast.
- Zustimmung: keine Logs zum Zählen. Dann aber K-3 sauber formulieren, damit
  „13 s“ nicht als Wartezeit fürs ganze Dashboard gelesen wird.
- Kein Fund ist 🔴. Nichts leakt, keine neue Angriffsfläche.

---

## 6. Fazit

Der Proxy hält mit 0.4.5, was er verspricht: Jede ausgehende Anfrage samt
Lesen läuft unter einem Limit, der ungünstigste Fall endet nach rund 13 s,
Zeitüberschreitungen landen nicht im Cache, und beide Abmeldungen gehen
auch nach Ablauf des gemeinsamen Limits raus. Belegt in der echten
Laufzeit, nicht nur in Attrappen. Die verbleibende Schwäche liegt eine
Schicht höher: Die Web-App verwirft späte Antworten nicht und lässt
parallele Läufe zu (C-1). Daneben zwei ungetestete Wege beim
Nicht-Cachen (A-1), ein Aufräumfehler im neuen Werkzeug (D-1) und fünf
kleine Doku-Stellen.

Zum Fix als Arbeit: Das ist die beste der drei Runden zum Zeitlimit. Jeder
Befund der zehnten Runde ist in der Sache behoben, die drei grünen Mutanten
sind rot, und das Werkzeug macht die zentrale Annahme endlich nachprüfbar.
Die Aussagen über sich selbst sind diesmal fast deckungsgleich mit dem
Stand. Ausnahme ist „je Karte“, wo „je Proxy-Antwort“ gemeint ist. Was bleibt,
ist die bekannte Gewohnheit, die Gegenprobe dort zu bauen, wo der Fix
gebaut hat (WebUntis vor den Headern), und nicht über alle Wege, die
dieselbe Eigenschaft tragen.

---

### Anhang: Sonden und Live-Anfragen

Alles im Scratchpad der Prüfsitzung (flüchtig, nicht im Repo):
- `base/`, `old/`: `git archive` von `b7e62fa` bzw. `90c01e0`, `node_modules`
  als Symlink.
- `tools/mutate.py`, `tools/m0.json` (Eichung), `tools/m1.json`,
  `tools/m2.json`: Mutanten; Kopien unter `mut/`.
- `old/tools/probe-workerd.mjs`: Werkzeug des Fixes gegen 0.4.4.
- `probe/extra.mjs`: erweiterte Fassung mit Szenarien X1–X7 und Protokoll
  des Cache-Verkehrs; Ausgabe in `probe/extra-head.log`.
- `exit2/`: Nachstellung des Aufräumfehlers (D-1).
- `ui/index-test.html` (Layout, fünf Testkinder), `ui/race-test.html`
  (Tageswechsel, C-1): lokale Kopien von `web/index.html` mit
  `localStorage`-Testdaten und `fetch`-Stub vor dem App-Skript; über einen
  lokalen Server nur für die Dauer der Messung ausgeliefert, `localStorage`
  danach geleert.

Live-Proxy, 2 Anfragen, keine erreicht einen Anbieter:
1. `OPTIONS /api/status` → 200 (0,09 s).
2. `POST /api/status` mit leerer WebUntis- und leerer sams-on-Konfiguration
   → 200, `WebUntis-Konfiguration unvollständig …`,
   `sams-on-Konfiguration unvollständig …` (0,07 s).

Website, 8 GET: `deploy-commit.txt`, `/ueber`, `/source/proxy/worker.js`,
`/docs/PROJEKT.md`, `/docs/OFFEN-naechste-Fixes.md`,
`/docs/PEER-REVIEW-2026-11-09.md`, `/docs/PEER-REVIEW-2026-10-30.md`
(Statuscode), `/`.
