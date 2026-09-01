# Doku-Konsistenz-Check — „Heute Schule"

**Datum:** 01.09.2026
**Durchgeführt von:** einer frischen, unabhängigen Prüf-Sitzung ohne Vorwissen über frühere Projektstände oder frühere Prüfrunden dieses Projekts. Alle Funde unten wurden aktiv nachgeprüft (`diff`, `grep`, `node run-tests.mjs`, `npx eslint .`, `git log`, tatsächliches Lesen des referenzierten Codes) — nicht aus der Doku übernommen.

Geprüft: alle `.md`- und `.html`-Dateien, `proxy/*.js`/`*.mjs`, `run-tests.mjs`, `deploy.sh`, `.gitignore`, `eslint.config.mjs`, `package.json`/`package-lock.json`, `web/_headers`, sowie `web/docs/`/`web/source/` gegen ihre Originale.

---

## Funde

### 1. 🔴 Reale private E-Mail-Adresse des Betreibers öffentlich deployt

**Fundstelle:** `prompts/ct-stil-analyse.md`, Zeile 18 — identisch dupliziert nach `web/docs/prompts/ct-stil-analyse.md`, Zeile 18 (Dateien sind laut `diff` byte-identisch).

**Beleg (Adresse hier bewusst redigiert, um sie nicht in einer weiteren
Datei zu wiederholen):**
```
- Quellcode/Repo: lokal vollständig vorhanden unter
  `/Users/bjoern/Library/CloudStorage/GoogleDrive-[REDIGIERT: echte
  private Google-Drive-Kontoadresse]/Meine Ablage/Claude/Stundenplan`
```
Der lokale Google-Drive-Synchronisationspfad auf macOS enthält standardmäßig
die Konto-E-Mail-Adresse — hier war das Björns private Adresse, eingebettet
im lokalen Pfad. Sie taucht in keiner anderen Datei im Repo auf (gezielt
gegengeprüft) — das ist also kein bewusst offengelegter Kontaktweg wie in
Impressum/Datenschutz, sondern ein übersehener Nebeneffekt beim Archivieren
des Prompts.

**Warum das zählt:** `web/docs/` wird 1:1 auf die öffentliche Cloudflare-Pages-Website deployt (`web/ueber.html` → `docs/PROJEKT.md` → verlinkt `prompts/ct-stil-analyse.md`, was sich unter `web/docs/prompts/ct-stil-analyse.md` auflöst und dort tatsächlich existiert). Die Datei ist bereits committet (Commits `eb53d1a`, `abb4c87`) und Teil des aktuellen `git`-`HEAD` — also auch Teil des für den finalen Deploy vorgesehenen Stands. Genau die Art Fund, die die Website in früheren Runden schon einmal hatte („Code-Kommentare enthielten die reale Schul-Subdomain der zweiten Familie" laut `PROJEKT.md` Abschnitt 11) — nur diesmal mit der E-Mail-Adresse des Betreibers selbst statt einer Schul-Subdomain.

**Vorschlag:** In `prompts/ct-stil-analyse.md` Zeile 18 den Pfad kürzen/anonymisieren (z. B. `.../Stundenplan` ohne den vollen Google-Drive-Kontonamen) oder durch eine generische Pfadangabe ersetzen, danach die Kopie in `web/docs/prompts/` nachziehen und neu deployen.

---

### 2. 🔴 Code behauptet „unverifiziert", Projekt-Doku behauptet „verifiziert" — Widerspruch am selben Sachverhalt

**Fundstelle:** `proxy/worker.js`, Zeilen 15–19 (identisch in `web/source/proxy/worker.js`) vs. `PROJEKT.md`, Abschnitt 5, „Proxy statt direkter Zugriff …".

**Beleg, Code (aktueller Stand, nicht nur Live-Dump):**
```js
 * ⚠ Unverifizierte Annahme aus der Architektur-Diskussion: WebUntis und
 * Mensamax senden vermutlich keine Access-Control-Allow-Origin-Header
 * (deswegen der Proxy). War zum Zeitpunkt der Konzeption nicht empirisch
 * getestet — falls sich das als falsch herausstellt, wäre der Proxy
 * eigentlich gar nicht nötig gewesen, schadet aber auch nicht.
```
**Beleg, `PROJEKT.md`:**
> „Direkter Browser-Zugriff — technisch nicht möglich, da beide Anbieter keine CORS-Freigabe senden (**verifiziert, nicht angenommen** — eine **frühere** Notiz im Code markierte das lange als „unverifizierte Annahme", **bis der produktive Betrieb es bestätigte**)."

`PROJEKT.md` beschreibt die „unverifizierte Annahme"-Notiz explizit als etwas Vergangenes, das durch den produktiven Betrieb widerlegt/bestätigt wurde. Der Code selbst wurde aber nie angepasst — er behauptet wortwörtlich weiterhin, die Annahme sei „nicht empirisch getestet" und formuliert offen, dass sich das noch als falsch herausstellen könnte. Ein Code-Reviewer, der nur `worker.js` liest (ohne `PROJEKT.md`), bekommt eine andere — veraltete — Einschätzung des Verifikationsstands als jemand, der nur die Projekt-Doku liest.

Nebeneffekt: Dieser Kommentar ist selbst ein „Journal Comment" im Sinne der eigenen Projektregel (er referenziert explizit „Zeitpunkt der Konzeption", also einen historischen Wissensstand, statt den aktuellen Stand zu beschreiben) — er entgeht aber dem automatisierten Test in `run-tests.mjs` (Zeile 594), weil dessen Signalwort-Liste (`vorher|Korrektur \(|Fix vom|Betatest \(|Versehen|monatelang|Passiert seit|bestätigt \(\d|verifiziert \(\d|wurde behoben|nachträglich geändert`) diese Formulierung nicht erfasst.

**Vorschlag:** Kommentar in `worker.js` aktualisieren — entweder ganz entfernen (die Architekturentscheidung ist in `PROJEKT.md` dokumentiert) oder auf den verifizierten Stand umschreiben, ohne den „vielleicht stimmt's ja nicht"-Vorbehalt.

---

### 3. 🟡 Tote interne Links in der öffentlich deployten Doku-Kopie

**Fundstelle:** `web/docs/PROJEKT.md` und `web/docs/OFFEN-naechste-Fixes.md` (beide Teil des Live-Deploys).

**Beleg (automatisiert per Skript gegen das Dateisystem geprüft, relativ zum jeweiligen Speicherort):**
- `web/docs/PROJEKT.md` verlinkt `QA-Bericht-2026-08-27-v0.1.1.md` und `PEER-REVIEW-2026-08-27.md` — beide existieren nicht unter `web/docs/` (bewusst nicht mitkopiert, siehe `PROJEKT.md` Abschnitt 9: „nur die beiden aktuellsten Berichte verlinkt"). Von `web/docs/` aus gelesen: 404.
- `web/docs/PROJEKT.md` verlinkt `web/ueber.html` und `web/README.md` — diese Pfade sind relativ zur Repo-Wurzel gedacht (funktionieren dort), lösen sich aber von `web/docs/` aus zu `web/docs/web/ueber.html` bzw. `web/docs/web/README.md` auf — beide existieren nicht.
- `web/docs/OFFEN-naechste-Fixes.md` hat dieselben zwei toten Verweise auf die 08-27-Berichte plus einen toten Verweis auf `web/README.md`.

Alle betroffenen Links funktionieren einwandfrei am Original-Speicherort (Repo-Wurzel) — sie brechen ausschließlich, weil `web/docs/` eine wortgleiche, aber pfadmäßig versetzte Kopie ist (das manuelle Kopierverfahren gleicht nur den *Inhalt* ab, siehe `deploy.sh`-Kommentar „kein automatischer Abgleich", nicht die *Auflösbarkeit* relativer Links).

**Vorschlag:** In der `web/docs/`-Kopie entweder auf absolute GitHub-Links umstellen oder die betroffenen Verweise auf die 08-27-Berichte/`web/README.md`/`web/ueber.html` beim Kopieren pfadkorrekt anpassen (z. B. `../ueber.html`, `../README.md`, GitHub-Link für die 08-27-Berichte).

---

### 4. 🟡 Testanzahl in `PROJEKT.md` veraltet — auch innerhalb des Dokuments selbst

**Fundstelle:** `PROJEKT.md`, Abschnitt 9 (Testkonzept): „**Umfang, Stand 28.08.2026: 85 Tests, 0 Abhängigkeiten.**"

**Beleg:** `node run-tests.mjs` liefert aktuell **92 Tests: 92 ✓ 0 ✗**. Selbst der im selben Dokument (Abschnitt 9/11) zitierte Prüfstand vom 31.08. nennt bereits 87 Tests (`PEER-REVIEW-2026-08-31.md`: „87/87 Tests grün"; `QA-Bericht-2026-08-31.md`: „87 Tests, 0 fehlgeschlagen"). `PROJEKT.md` selbst trägt oben „**Stand: 01.09.2026**" — die „85 Tests"-Zahl in Abschnitt 9 wurde bei keiner der beiden seitherigen Aktualisierungen (31.08., 01.09.) mitgezogen.

**Vorschlag:** Zahl in Abschnitt 9 auf den aktuellen Wert (92, per `node run-tests.mjs`) aktualisieren oder das Datum dort explizit als eigenständigen historischen Stand kennzeichnen (wie bei den Audit-Berichten selbst gehandhabt).

---

### 5. 🟡 Verschlüsselungs-Idee: „verworfen" vs. „noch nicht bewertet" — zwei Dokumente, ein Sachverhalt, unterschiedlicher Status

**Fundstelle:** `PROJEKT.md`, Abschnitt 5 vs. `web/README.md`, Abschnitt „Idee (27.08., noch nicht umgesetzt): Verschlüsselung ohne Master-Passwort".

**Beleg:**
- `PROJEKT.md`: „Geräte-gebundene Verschlüsselung über einen nicht-extrahierbaren Web-Crypto-Schlüssel … **technisch durchdacht, aber verworfen**: … Der Aufwand … stand in keinem guten Verhältnis zum tatsächlichen Zugewinn."
- `web/README.md`: „### **Idee** (27.08., **noch nicht umgesetzt**): Verschlüsselung ohne Master-Passwort" — beschreibt dieselbe Lösung (nicht-extrahierbarer AES-Schlüssel, Web Crypto, IndexedDB) mit Vor-/Nachteilen, aber ohne Hinweis, dass die Sache bereits entschieden (und zwar dagegen) wurde.

Ein Leser, der beide Dokumente vergleicht (genau die Aufgabe der beiden Zielgruppen dieses Doku-Pakets), bekommt zwei widersprüchliche Aussagen zum Bearbeitungsstand derselben Idee: „erledigt/entschieden" vs. „offen/zu bewerten".

**Vorschlag:** `web/README.md`-Abschnitt umbenennen (z. B. „Geprüft und verworfen: …") und auf `PROJEKT.md` Abschnitt 5 verweisen, statt ihn als offene Idee stehen zu lassen.

---

### 6. 🟡 Zwei „Journal Comments" im aktuellen `web/index.html` — trotz eigener Regel und eigenem automatisiertem Test

**Fundstelle:** `web/index.html`, Zeilen 66–69 und Zeilen 163–164.

**Beleg:**
```css
/* opacity war .35 — zurückhaltend gemeint, aber für eingeschränktes
   Sehvermögen kaum auffindbar (WCAG 2.2 SC 1.4.11 verlangt 3:1 für
   Bedienelemente). .6 bleibt dezent, ist aber sichtbar; bei Hover/Fokus
   voll deckend. */
```
```css
/* min-width/height 24px: WCAG 2.5.8 (AA) fordert mindestens 24×24 CSS-Pixel
   für Bedienelemente — die Chips waren vorher deutlich kleiner. */
```
Beide beschreiben explizit einen früheren Zustand („war .35", „waren vorher … kleiner") statt nur den aktuellen — genau das Anti-Pattern, das `run-tests.mjs` (Test „keine Datums-/Historie-Signalwörter in Code-Kommentaren", Zeile 588 ff.) verhindern soll und das laut `PROJEKT.md`/Release-Historie bereits „bereinigt" wurde. Beide Stellen entgehen dem Test aus rein technischen Gründen: Die Fortsetzungszeilen des mehrzeiligen `/* … */`-Kommentars beginnen nicht mit `*`, `//` oder `#` (Zeile 67, 164 selbst — der Regex prüft nur den Zeilenanfang), bzw. das konkrete Wort „vorher" steht zwar in Zeile 164 im Kommentartext, aber eben nicht am Zeilenanfang, wo die Prüfung ansetzt.

**Vorschlag:** Beide Kommentare auf reine Ist-Zustand-Beschreibung kürzen (die Begründung fürs *Warum* reicht, die Werte-Historie gehört in die Commit-Nachricht/`PROJEKT.md`). Optional: den Test in `run-tests.mjs` so erweitern, dass er ganze mehrzeilige Kommentarblöcke statt nur Zeilenanfänge prüft.

---

### 7. 🟡 `package-lock.json` stimmt in Name, Version und Lizenz nicht mit `package.json` überein

**Fundstelle:** `package-lock.json`, Zeilen 2–12 vs. `package.json`.

**Beleg:**
| Feld | `package.json` | `package-lock.json` |
|---|---|---|
| `name` | `heute-schule` | `stundenplan` |
| `version` | `0.3.0` | `1.0.0` |
| `license` | `MIT` | `ISC` |

Das Lockfile stammt erkennbar aus einer sehr frühen Projektphase (vor der Umbenennung zu „heute-schule", vor Festlegung von Version und MIT-Lizenz) und wurde seither nie neu erzeugt (`npm install`/`npm ci` hätte diese Top-Level-Felder automatisch nachgezogen). Funktional harmlos (betrifft nur Metadaten, nicht die aufgelösten Abhängigkeiten), aber genau die Art Detail, die einem mitlesenden Entwickler beim Code-Review als Unsauberkeit auffällt.

**Vorschlag:** `npm install` einmal lokal laufen lassen (aktualisiert die Metadaten im Lockfile automatisch) und die Änderung committen.

---

### 8. 🟢 Empfehlung aus QA-Bericht-2026-08-31 zur Live/HEAD-Drift-Erkennung nicht in `OFFEN-naechste-Fixes.md` nachverfolgt

**Fundstelle:** `QA-Bericht-2026-08-31.md`, Handlungsempfehlung 3 („Erkennbarkeit von Deployment-Drift verbessern … Aufwand: klein bis mittel") vs. `OFFEN-naechste-Fixes.md`, Abschnitt „Noch offen".

**Beleg:** `OFFEN-naechste-Fixes.md` listet unter „Noch offen" nur zwei Punkte (juristische Prüfung, WCAG-Versionsangaben-Kosmetik). Die eigens für dieses Ziel formulierte Empfehlung aus dem aktuellsten QA-Bericht — eine automatisierte Prüfung, ob der live deployte Stand mit dem aktuellen Git-HEAD übereinstimmt (z. B. Commit-Hash-Kommentar im HTML) — taucht dort nicht auf. `deploy.sh` (geprüft) enthält aktuell nur Test-Gate, Lint-Gate und den lokalen `web/docs`/`web/source`-Konsistenz-Check, aber keine Live-vs-HEAD-Prüfung. Kein Widerspruch, eher eine Lücke: `OFFEN-naechste-Fixes.md` erhebt implizit den Anspruch, offene Punkte aus den Audit-Runden zu bündeln, tut das hier aber nicht vollständig.

**Vorschlag:** Empfehlung entweder unter „Noch offen" aufnehmen oder bewusst als „nicht verfolgt, weil …" begründen.

---

### 9. 🟢 „Stand: 28.08.2026" in `web/datenschutz.html` nicht mit dem finalen Release-Durchgang (01.09., Version 0.3.0) mitgezogen

**Fundstelle:** `web/datenschutz.html`, Zeile 23.

**Beleg:** Andere zentrale Dokumente (`PROJEKT.md`, `OFFEN-naechste-Fixes.md`, `Verarbeitungsverzeichnis-INTERN.md`) wurden beim finalen Durchgang auf „Stand: 01.09.2026" gezogen; die Datenschutzerklärung blieb bei „28.08.2026". Inhaltlich wurde nichts Falsches gefunden (die Beschreibung passt weiterhin zum tatsächlichen technischen Stand, auch nach der Mensamax-Domain-Einschränkung vom 31.08. — die Formulierung dort ist generisch genug), aber ein Datenschutzexperte, der explizit auf Stand-Angaben achtet, könnte nachfragen, warum dieses Dokument beim „Schlussdurchgang vor dem Release" (siehe Commit-Nachricht `aecfafb`) nicht mit aktualisiert wurde.

**Vorschlag:** Datum bewusst prüfen/bestätigen und ggf. auf 01.09.2026 heben, wenn inhaltlich nichts nachzuziehen ist.

---

## Was geprüft wurde und sauber war (positiv, zur Einordnung)

- **`web/docs/` und `web/source/` stimmen inhaltlich exakt** mit ihren Originalen überein (`diff` auf allen 10 Datei-Paaren aus `deploy.sh`s eigener Prüfliste: `PROJEKT.md`, `OFFEN-naechste-Fixes.md`, `QA-Bericht-2026-08-31.md`, `PEER-REVIEW-2026-08-31.md`, `prompts/README.md`, `prompts/ct-stil-analyse.md`, `prompts/peer-review-bester-freund.md`, `proxy/worker.js`, `proxy/hostcheck.mjs`, `proxy/cachekey.mjs` — alle byte-identisch).
- **Versionsnummer 0.3.0** konsistent in `package.json`, `PROJEKT.md`-Kopfzeile und `web/ueber.html`-`VERSION`-Konstante.
- **`node run-tests.mjs`**: 92/92 Tests grün. **`npx eslint .`**: sauber, keine Verstöße.
- **Haushaltsausnahme-Formulierung** (in der letzten Runde als vierfach uneinheitlich gefunden) ist jetzt in `PROJEKT.md`, `web/README.md`, `OFFEN-naechste-Fixes.md` und `Verarbeitungsverzeichnis-INTERN.md` durchgängig als bereits eingetretener Zustand formuliert, nicht mehr als Zukunftsbedingung.
- **Cache-Key-Hashing-Behauptung** (`Verarbeitungsverzeichnis-INTERN.md`: „Cache-Schlüssel enthält die Zugangsdaten (gehasht)") stimmt exakt mit `proxy/cachekey.mjs` + `proxy/worker.js` (`sha256Hex`) überein.
- **SSRF-/Domain-Allowlist-Behauptungen** in `proxy/README.md` und `web/README.md` stimmen mit dem tatsächlichen Code in `hostcheck.mjs`/`worker.js` überein (WebUntis hart auf `.webuntis.com`, Mensamax wachsbare Liste `MENSAMAX_ERLAUBTE_DOMAINS = ['.parentsmensa.de']`).
- **Reale PII außerhalb der vorgesehenen Dateien**: keine gefunden außer Fund 1 oben (gezielt nach E-Mail-Mustern, Telefonnummern, Adress-Mustern über das gesamte Repository gesucht, `web/impressum.html`/`web/datenschutz.html`/`Verarbeitungsverzeichnis-INTERN.md` ausgenommen).
- **`.gitignore`** funktioniert wie dokumentiert: keine der als sensibel markierten Dateien (`impressum.html`, `datenschutz.html`, `Verarbeitungsverzeichnis-INTERN.md`, `stundenplan_agent.gs`, `Cloudflare-*.pdf`, `diagnose-*.html`) ist tatsächlich in `git ls-files` gelandet.
- **`robots.txt`/`404.html`/`sw.js`** stimmen mit den Behauptungen in `web/README.md`/`PROJEKT.md` überein (Cache-Name `heute-schule-v4`, `noindex`, `Disallow: /`).

---

## Fazit

**9 Funde:** 2× 🔴, 4× 🟡, 3× 🟢.

Die beiden 🔴-Funde sind real und sollten vor dem finalen Deploy behoben werden:

1. Die private Gmail-Adresse des Betreibers steckt in einer Datei, die bereits Teil des für den Deploy vorgesehenen `git`-Stands ist und über `web/docs/prompts/ct-stil-analyse.md` öffentlich erreichbar würde — ein Datenschutzexperte würde das sofort als Datenleck einstufen, unabhängig davon, wie klein es wirkt.
2. Der Widerspruch zwischen dem Code-Kommentar in `worker.js` („unverifizierte Annahme, könnte falsch sein") und der Projekt-Doku („verifiziert, produktiv bestätigt") ist genau die Art Inkonsistenz, die ein Software-Reviewer beim Gegenlesen von Code und Doku sofort bemerkt und die das Vertrauen in die restliche Doku unnötig untergräbt.

Die 🟡-Funde sind überwiegend Nebeneffekte des gewählten, bewusst manuellen Kopiermechanismus (`web/docs/`, `web/source/`) und punktueller „vergessener" Aktualisierungen bei sonst sehr sorgfältig geführten Dokumenten — nichts davon ist sicherheitsrelevant, aber in Summe das Muster, das der Betreiber schon vermutet hat: Jede Prüfrunde findet noch etwas, weil frühere Fixes (Journal-Comment-Test, Doku-Dump-Konsistenz-Check) selbst Lücken haben, die erst beim genauen Hinsehen auffallen.

**Ehrliche Einschätzung für die beiden Zielgruppen:** Für das Code-Review mit befreundeten Informatiker:innen ist die Doku in sehr gutem Zustand — die Selbstkritik-Kultur (offene Restrisiken, dokumentierte Kompromisse, Testabdeckung, Lint-Gate) ist ungewöhnlich hoch für ein Ein-Personen-Projekt und würde positiv auffallen. Für das Gespräch mit dem Datenschutzexperten sollte **Fund 1 zwingend vorher behoben** werden — alles andere in `Verarbeitungsverzeichnis-INTERN.md`/`datenschutz.html` ist inhaltlich sauber und ehrlich genug für ein Beratungsgespräch, auch mit offener juristischer Kernfrage (Haushaltsausnahme). Mit Fund 1 und Fund 2 behoben ist die Doku nach dieser Prüfung tatsächlich in einem Zustand, der beiden Zielgruppen ohne Fremdscham vorgelegt werden kann — nicht perfekt (die 🟡/🟢-Funde bleiben Lehrstücke fürs nächste Mal), aber ohne verbleibenden echten Widerspruch oder Datenschutzproblem.
