# Peer-Review — „Der beste Freund" (gegen QA-Bericht-2026-08-31.md)

**Geprüfter Bericht:** `QA-Bericht-2026-08-31.md`
**Live-URL:** https://heute-schule.pages.dev
**Quellcode:** lokal, Git-HEAD `6894bb83a079a7d620693de49fba55e80fa7b7b2` (Stand 01.09.2026, 13:56 Uhr) — zusätzlich gespiegelt unter `github.com/blue-demann/heute-schule` (privat)
**Datum dieser Prüfung:** 01.09.2026

**Erstellt von einer frischen, unabhängigen Claude-Sitzung ohne Vorwissen über frühere Projektstände oder frühere Audit-Ergebnisse dieses Projekts.** Ich habe `DOKU-KONSISTENZ-CHECK-2026-09-01.md` bewusst nicht gelesen, um bei Teil 2 unabhängig zu bleiben.

---

# Teil 1 — Peer-Review des Berichts

## 1. Persönliche Kurzeinschätzung

Hey — dein Bericht vom 31.08. ist sauber gearbeitet: Du hast wirklich live gemessen statt behauptet (Kontrastwerte, Zielgrößen, Header, CORS-Verhalten), und dein Kernfund — die Haushaltsausnahme-Formulierung widerspricht der eigenen Projekt-Doku — war zum Zeitpunkt deiner Prüfung (31.08., 16:07 Uhr) exakt richtig und hat tatsächlich zu einem Fix geführt (Commit `7b739a6`, 16:57 Uhr, 40 Minuten später). Das ist die Art Befund, für die dieser ganze Prüfprozess existiert. **Aber:** In der Zwischenzeit ist etwas passiert, das dein Bericht naturgemäß nicht sehen konnte, das ich aber sehr wohl sehen kann, und das schwerer wiegt als deine beiden Top-Findings zusammen — die SSRF-Härtung, die dein eigener Bericht (über den Peer-Review vom selben Abend) angestoßen hat, ist zwar in Git und lokal getestet, aber **nie tatsächlich auf den produktiven Cloudflare-Worker deployt worden**. Wenn du „vor Abgabe" nur eine Sache fixen könntest, wäre es nicht an deinem Text — der ist für seinen Zeitpunkt in Ordnung —, sondern die Erwartungshaltung, dass „Commit + lokale Tests grün" gleichbedeutend mit „live" ist. Ist es hier nachweislich nicht.

## 2. Verifikationstabelle

| Kernaussage aus dem Bericht | Ergebnis | Beleg |
|---|---|---|
| HSTS `max-age=31536000; includeSubDomains` live | ✅ bestätigt | eigener `curl -I https://heute-schule.pages.dev/` |
| Vollständige Security-Header (CSP, X-Frame-Options, Permissions-Policy etc.) exakt wie beschrieben | ✅ bestätigt | eigener Header-Abruf, Wortlaut identisch |
| CORS des Proxys reflektiert Fremd-Origin nicht, bleibt auf `https://heute-schule.pages.dev` | ✅ bestätigt | eigener `curl -X OPTIONS -H "Origin: https://evil.example"` gegen den Proxy |
| `access-control-allow-origin: *` auf den statischen Pages-Seiten (Cloudflare-Standard) | ✅ bestätigt | eigener Header-Abruf |
| SSRF-Schutz in `hostcheck.mjs`, 87/87 Tests grün (Stand 31.08.) | ⚠️ teilweise | Code und Testsuite existieren, **aber**: 92 Tests inzwischen (Mensamax-Erweiterung kam nach deiner Prüfung dazu — kein Fehler deinerseits) — und, gravierender: der SSRF-Schutz für Mensamax ist zwar lokal getestet, aber **nicht live**, siehe Teil 2 A-1 |
| Cache-Key-Authentifizierung über SHA-256 inkl. Zugangsdaten, 8 Regressionstests | ✅ bestätigt | `proxy/cachekey.mjs` gelesen, Tests laufen, Logik nachvollzogen |
| Rate-Limit 30/IP/Minute, Cache-API-basiert, nicht atomar (offen benannt) | ✅ bestätigt | `proxy/worker.js` Zeile 46, 65–85 |
| `unsafe-inline`-CSP als bewusstes Restrisiko, kompensiert durch Code-Disziplin (kein `innerHTML` mit Fremddaten) | ✅ bestätigt | eigener `grep innerHTML web/index.html` — ausschließlich `.innerHTML = ''` |
| Klartext-Zugangsdaten in `localStorage`, bewusste Entscheidung | ✅ bestätigt | eigene Inspektion via `localStorage.getItem(...)` im Live-Browser — Passwörter liegen tatsächlich im Klartext-JSON |
| `npm audit`: 0 Schwachstellen | ✅ bestätigt | selbst ausgeführt |
| Impressum vollständig nach § 5 DDG, korrekter aktueller Rechtsbegriff (DDG statt TMG) | ✅ bestätigt | eigener Seitenaufruf; externe Recherche bestätigt TMG→DDG-Wechsel zum 14.05.2024, § 5 DDG ist die korrekte, aktuelle Fundstelle |
| Datenschutzerklärung inhaltlich stimmig, offene Aussage zum technischen Mitlese-Potenzial des Proxys | ✅ bestätigt | eigener Seitenaufruf, Wortlaut wie beschrieben |
| AVV mit Cloudflare verifiziert | [ungeprüft] | wie du selbst schreibst — kein Zugriff auf das Cloudflare-Konto; das interne `Verarbeitungsverzeichnis-INTERN.md` dokumentiert den Beleg plausibel, bleibt aber für mich ebenso unverifizierbar |
| 🟡 **Haushaltsausnahme greift wohl schon heute, nicht erst „bei Ausweitung"** (dein Kernfund) | ✅ bestätigt, und mit Wirkung | Zum Zeitpunkt deiner Prüfung exakt so in `PROJEKT.md`/`OFFEN-naechste-Fixes.md`/`web/README.md` vorgefunden; 40 Minuten später in Commit `7b739a6` in genau die von dir vorgeschlagene Richtung korrigiert („dürfte bereits heute nicht mehr greifen") |
| ESLint sauber, Regeln an Google-JS-Styleguide ausgerichtet, „begründete Ausnahme für web/index.html" | ⚠️ teilweise | ESLint läuft tatsächlich sauber durch — aber „Ausnahme" ist zu schwach formuliert: `eslint.config.mjs` Zeile 67 schließt `web/**` **komplett** von jeder Regelprüfung aus, nicht nur von der `var`-Regel. Das ist mehr als eine Stil-Ausnahme für eine Datei, siehe Teil 2 D-1 |
| Live-Deployment weicht vom Git-HEAD ab (dein eigener Fund, Abschnitt 7) | ✅ bestätigt, und **schlimmer als von dir beschrieben** | Du hast das korrekt als kosmetisch/tot eingestuft. Meine eigene Prüfung (Teil 2) zeigt: dieselbe Drift betrifft inzwischen auch sicherheitsrelevanten Code, nicht nur Kommentare |
| GitHub-Spiegelung privat, liefert 404 unauthentifiziert | ✅ bestätigt | eigener `curl` gegen `github.com/blue-demann/heute-schule` |
| 49.696 Bytes / 14.800 Bytes gzip für `index.html` | [ungeprüft] | von mir nicht nachgemessen (Datei hat sich seither leicht verändert, Zahl wäre ohnehin nicht mehr exakt vergleichbar) — plausibel, keine Auffälligkeit |

## 3. Korrekturen

Keine falsch zitierten Standards oder Gesetze gefunden — TMG/DDG korrekt, WCAG-Bezüge korrekt (2.2, mit Level). Eine **Präzisierung**, keine Falschaussage: Deine Formulierung „begründete Ausnahme für web/index.html" beim ESLint-Befund suggeriert eine gezielte, eng gefasste Abweichung. Tatsächlich ist es ein kompletter Ausschluss der größten Codedatei des Projekts (1167 Zeilen) von jeder automatisierten Stilprüfung — das ist eine andere Kategorie Aussage und gehört in die Bewertung von Kategorie 7, nicht nur als Randnotiz.

## 4. Zusatzbefunde (nach A–D)

**A. Security in der Tiefe**
- 🔴 Du konntest es nicht wissen (dein Bericht ist älter als der Fix-Commit), aber die Konsequenz betrifft die Bewertung direkt: Die Mensamax-SSRF-Härtung, die dein Peer-Review-Gegenstück vom selben Abend angestoßen hat, läuft **nicht** auf dem produktiven Proxy. Details, eigener Live-Test: Teil 2, A-1.
- 🟡 Du hast Rate-Limit und CORS korrekt als „nicht stresstestbar ohne echte Anbieter zu belasten" eingeordnet — richtige Zurückhaltung. Ich habe stattdessen gezielt harmlose, nicht-anbieterbelastende Sonden gegen den Proxy selbst gefahren (private IPs, `http://`, Credentials-in-URL, fremde Domain) — das geht, ohne WebUntis/Mensamax zu berühren, und hätte den A-1-Fund schon in deiner Runde möglich gemacht.

**B. CCC-Perspektive**
- 🟢 Dein Befund zur `unsafe-inline`-CSP und der kompensierenden Code-Disziplin ist genau die richtige Tiefe — zustimmend nichts hinzuzufügen.
- 🟡 Nicht behandelt: Die „Technische Details"-Transparenz-Sektion auf `ueber.html` verspricht, dass der dort gedumpte Proxy-Quellcode dem tatsächlich laufenden entspricht. Das stimmt aktuell nicht (siehe A-1) — ein Nutzer, der dem Transparenzversprechen vertraut und den Dump liest, sieht zufällig sogar den *falschen* (weniger sicheren) Stand, der zufällig mit der Realität übereinstimmt, aber nicht mit dem, was die Projekt-Doku behauptet.

**C. Familienvater-/Alltagsblick**
- 🟢 Dein Usability-Abschnitt mit dem echten Fehlerzustand-Test ist genau der richtige Maßstab — sauber gemacht.
- 🟡 Nicht behandelt: `manifest.webmanifest`/`apple-touch-icon` verweisen beide nur auf `icon.svg`. Für „Zum Home-Bildschirm hinzufügen" auf iOS ist SVG als `apple-touch-icon` nicht zuverlässig unterstützt — PNG ist Stand 2026 weiterhin die empfohlene/nötige Form (externe Recherche, mehrere aktuelle Quellen). Das ist im Projekt selbst als bekannte Lücke geführt, du hast es korrekt als 🟢-Kosmetik eingestuft — ich würde angesichts der Zielgruppe (Eltern, die die Seite aufs Handy pinnen sollen) eher 🟡 vergeben, weil „Icon fehlt auf dem Homescreen" für eine nicht-technische Zielgruppe direkt sichtbar und verwirrend ist, nicht rein kosmetisch im Hintergrund.

**D. Nerd-Detailblick**
- 🟡 Siehe Korrektur oben: `eslint.config.mjs` ignoriert `web/**` vollständig statt nur eine Regel zu lockern — wert, in Kategorie 7 explizit zu erwähnen, nicht nur als Fußnote.
- 🟢 Der Cache-Key-Kommentar in `cachekey.mjs" ("Muss rein — siehe Kommentar oben. Nicht 'aufräumen'.") ist tatsächlich, wie du schreibst, vorbildliche Dokumentation von *Warum*, nicht nur *Was* — stimme voll zu.

## 5. Gewichtungs-Feedback

- **Zu milde:** Kategorie 7 (Code-Qualität) mit 🟡 für „Live-Deployment weicht vom HEAD ab" war für den 31.08.-Stand angemessen (reine Kommentar-/Totcode-Drift). Würde ich *heute* neu vergeben, wäre dieselbe Kategorie 🔴, weil dieselbe Drift-Klasse inzwischen sicherheitsrelevanten Code betrifft (A-1). Das ist kein Vorwurf an dich — nur ein Hinweis, dass „harmlose Doku-Drift" und „Drift bei Sicherheitscode" unterschiedliche Ampeln verdienen, falls dir das Muster nochmal begegnet.
- **Zu Recht 🟡, nicht 🔴:** Deine Einstufung bei Kategorie 5 (Recht) trifft es gut — echtes Problem, aber kein akuter Schaden, TOMs liegen vor. Zustimmung.
- **Zu Recht 🟢 überall sonst:** Barrierefreiheit, Design, SEO, Content — deine Live-Messungen (Kontrast, Zielgrößen, Tab-Reihenfolge) halten meiner Stichprobe stand, siehe Verifikationstabelle. Keine Korrektur nötig.

## 6. Fazit

Mein eigenes Gesamturteil zur Website weicht **nicht** grundsätzlich von deinem ab, ist aber strenger, weil ich einen Stand nach dir sehen konnte: Die Website selbst ist weiterhin solide gebaut, aber der **Betrieb** zeigt jetzt einen echten Riss zwischen „was Git und die Projekt-Doku behaupten" und „was tatsächlich auf dem produktiven Proxy läuft" — nicht mehr nur kosmetisch (Kommentare, tote Funktionen), sondern an der Stelle, die dein eigener Peer-Review-Gegenpart als sicherheitsrelevant markiert hatte. Das ist keine Kritik an deiner Prüfung — die konnte das zeitlich nicht sehen —, sondern an der Praxis, „Commit gemacht, Tests grün, Doku aktualisiert" mit „live" gleichzusetzen, ohne es nachzuprüfen.

Zur Qualität deines Artikels selbst: Recherche-Tiefe und Belegdichte sind gut — du misst nach, statt zu behaupten (Kontrastrechner, `getBoundingClientRect()`, echte curl-Header), und dein Haushaltsausnahme-Fund zeigt echte Quellenarbeit über mehrere Dokumente hinweg statt oberflächliches Abhaken. Fair im Ton, keine Übertreibung, ehrliche `[ungeprüft]`-Kennzeichnung wo nötig. Einziger struktureller Kritikpunkt: Du hast dich (nachvollziehbarerweise) auf Code-Review verlassen, wo ein zusätzlicher, harmloser Live-Sondentest gegen den Proxy selbst (nicht gegen WebUntis/Mensamax) den A-1-Fund schon am 31.08. sichtbar gemacht hätte.

---

# Teil 2 — Eigenständiges Projekt-Audit (Stand: 01.09.2026, unabhängig vom Bericht)

Eigene Prüfung des Projekts, so als läge mir kein Vorbericht vor. Live-Website besucht (Desktop + Mobile-Emulation 375×812), Formulare/Fehlerzustände getestet, kompletter lokaler Quellcode gelesen, `node run-tests.mjs` und `npx eslint .` selbst ausgeführt, `git log` geprüft, gezielte Live-Sonden gegen den produktiven Proxy gefahren (keine echten WebUntis-/Mensamax-Requests mit echten Daten, keine Belastung der Drittanbieter).

## A. Security in der Tiefe

**🔴 A-1. Die dokumentierte Mensamax-SSRF-Härtung läuft nicht auf dem produktiven Proxy — Open-Relay-Verhalten für beliebige HTTPS-Ziele weiterhin live.**

Git-HEAD (`proxy/hostcheck.mjs`, `proxy/worker.js`) und alle 92 lokalen Tests erzwingen für die Mensamax-`base`-URL eine Domain-Allowlist (`MENSAMAX_ERLAUBTE_DOMAINS = ['.parentsmensa.de']`). `OFFEN-naechste-Fixes.md` und `PROJEKT.md` führen das als „erledigt" unter Commit `7b739a6`.

Eigener Black-Box-Test gegen den echten Proxy-Endpunkt (harmlos, ohne echte Zugangsdaten, ohne Belastung von WebUntis/Mensamax):

```
curl -X POST https://stundenplan-proxy.bluedemann.workers.dev/api/status \
  -H "Content-Type: application/json" -H "Origin: https://heute-schule.pages.dev" \
  -d '{"datum":"20260901","webuntis":{},"lunch":{"provider":"mensamax","base":"https://example.com","username":"t","password":"t"}}'
→ {"...":"...","lunch":"Schulessen: Login fehlgeschlagen","lunchFehler":null}
```

Keine Ablehnung — der Worker hat tatsächlich versucht, `https://example.com/login.aspx` anzusprechen, statt mit „Server-Hostname muss auf '.parentsmensa.de' enden" abzubrechen. Zum Vergleich, dieselbe Sonde gegen eine private/interne Adresse wird korrekt geblockt:

```
base: https://127.0.0.1  → lunchFehler: "Server-Hostname zeigt auf ein internes/lokales Ziel — nicht erlaubt"
base: https://169.254.169.254 → dieselbe Ablehnung (Cloud-Metadata-Schutz aktiv)
base: http://example.com → "Nur https:// als Basis-URL erlaubt"
base: https://user:pass@example.com → "Ungültige Basis-URL (keine Zugangsdaten in der URL selbst)"
```

Das bestätigt präzise: Der **Grundschutz** (Loopback/RFC1918/Link-lokal, Protokollzwang, keine Credentials in der URL) ist live und funktioniert. Nur die **neue** Domain-Allowlist-Prüfung für Mensamax fehlt — exakt der Aufruf `pruefeSichereHttpsUrl(base, { pflichtSuffixe: MENSAMAX_ERLAUBTE_DOMAINS })` aus dem aktuellen `worker.js`. Ein Diff des über die Website selbst einsehbaren Quellcode-Dumps (`/source/proxy/worker.js`, s. Abschnitt D) gegen die lokale Datei bestätigt die exakte Ursache: Live läuft noch `pruefeSichereHttpsUrl(base);` ohne zweites Argument — der Stand *vor* Commit `7b739a6`.

**Einordnung:** Kein „Fremde-Zugangsdaten-Diebstahl"-Risiko (Angreifer bräuchte ohnehin eigene Zugangsdaten für den Zielserver). Aber ein echtes Open-Relay-Problem: Jede:r, der/die die (nicht wirklich geheime, im Client-Code sichtbare) Proxy-URL kennt, kann den Cloudflare-Worker per direktem HTTP-Request — **CORS greift hier nicht**, das ist reiner Browser-Schutz und für `curl` irrelevant — zwingen, beliebige öffentliche HTTPS-Ziele anzufragen. Nutzbar u. a. für IP-Reputations-Missbrauch (Anfragen erscheinen mit Cloudflares IP), einfaches Aufspüren, ob interne Ziele erreichbar sind (Timing-/Fehlerunterschiede), oder als kostenlose Anfrage-Weiterleitung gegen Rate-Limits Dritter — gedeckelt nur durch das 30/Minute-Rate-Limit und den 10-Sekunden-Timeout. **Genau das** ist der Angriffsvektor, den `PROJEKT.md` selbst als „bis behoben" beschreibt — er ist nicht behoben, nur der Code dafür ist geschrieben und ungenutzt.

**Vermutliche Ursache:** `deploy.sh` hat ein Konsistenz-Gate, das lokale Originaldateien gegen die *statischen Website-Kopien* in `web/source/`/`web/docs/` vergleicht — das prüft nur, ob man vergessen hat, `cp` auszuführen. Es prüft **nicht**, ob `./deploy.sh proxy` (bzw. `wrangler deploy` für den Worker) tatsächlich seit der letzten Code-Änderung gelaufen ist. Genau diese Lücke hat sich hier materialisiert.

**Mögliche Neuheit dieses Fundes:** Da Commit `7b739a6` erst nach beiden Berichten vom 31.08. entstand, konnten diese ihn nicht finden. Ob die vierte Runde (`DOKU-KONSISTENZ-CHECK-2026-09-01.md`) dies bereits entdeckt hat, kann ich nicht einsehen — ich habe die Datei bewusst nicht gelesen, um für Teil 2 unabhängig zu bleiben. Der Titel deutet auf einen Doku-Konsistenz-, nicht Live-Sicherheits-Fokus hin, ein Live-Black-Box-Test gegen den Proxy wäre für dieses Thema untypisch. Es spricht also einiges dafür, dass dies ein neuer Fund ist — mit Sicherheit lässt sich das von mir aus nicht sagen.

**🟡 A-2. Threat-Model-Realitätscheck:** Das in `PROJEKT.md` Abschnitt 6 explizit formulierte Bedrohungsmodell (Gelegenheitsmissbrauch, geteiltes Familien-Tablet, Massen-Login über die breite `*.webuntis.com`-Allowlist) ist realistisch und die vorhandenen Maßnahmen (Rate-Limit, Cache-Key-Auth) passen dazu — kein Overengineering, keine übersehene offensichtliche Angriffsfläche, abgesehen von A-1. Positiv hervorzuheben: SSRF-Schutz ist testbar in eigene `.mjs`-Module ausgelagert statt inline im Worker — genau die Holy-Grail-Praxis für sicherheitskritischen Code, die man sich wünscht (auch wenn A-1 zeigt, dass „getestet" und „deployt" zwei verschiedene Dinge sind).

**🟢 A-3. Supply Chain:** Keine Produktions-Abhängigkeiten (`package.json` enthält nur Dev-Tooling: ESLint, `@eslint/js`, `globals`), keine CDN-Einbindungen, kein Bundler. `npm audit`: 0 Schwachstellen, selbst nachvollzogen. Für dieses Projekt praktisch keine Supply-Chain-Angriffsfläche — die bewusste „kein Build-Schritt"-Entscheidung zahlt sich hier aus.

## B. CCC-Perspektive

**🟢 B-1. Datensparsamkeit vorbildlich für den Zweck:** Keine Analytics, keine Cookies, keine Tracking-Pixel — selbst nachgeprüft (kein `document.cookie`, keine Drittanbieter-`<script src>`, CSP mit `default-src 'self'`). IP-Adresse fürs Rate-Limit wird gehasht, nicht im Klartext gespeichert (`sha256Hex` in `worker.js`).

**🟢 B-2. Digitale Souveränität / Transparenz:** MIT-Lizenz, offener Quellcode, sogar ein manueller Quellcode-Dump direkt auf der Website ohne GitHub-Account-Zwang. Vorbildlich für ein Ein-Personen-Projekt.

**🟡 B-3. Transparenzversprechen aktuell nicht eingelöst:** Direkte Folge von A-1 — der auf `ueber.html` verlinkte Quellcode-Dump zeigt derzeit zufällig den Stand *vor* der SSRF-Härtung, exakt passend zum tatsächlich laufenden (ungehärteten) Worker, aber im Widerspruch zur eigenen Projekt-Doku, die den Fix als erledigt führt. Wer dem Transparenzversprechen vertraut und den Dump als Beleg für die Sicherheit liest, bekommt zufällig ein ehrliches, aber von der eigenen Doku widersprochenes Bild.

**🟢 B-4. Kein Lock-in:** Cloudflare-Abhängigkeit ist real (Pages + Workers + Cache API), aber technisch austauschbar (Standard-Fetch-API-Code, kein Cloudflare-spezifisches Feature außer Cache API/Workers-Runtime-Globals) — im Ernstfall migrierbar, nicht in einem proprietären Format gefangen.

## C. Familienvater-/Alltagsblick

**🟢 C-1. Mobile Ansicht (375×812, live geprüft):** Layout bricht sauber um, keine Überlappungen, FAB-Button kollidiert mit nichts, Touch-Ziele wirken großzügig. Würde ich meiner nicht-technischen Verwandtschaft zeigen, ohne mich zu schämen.

**🟡 C-2. „Demo-Website"-Hinweis sitzt an der falschen Stelle im Erwartungsmanagement.** Die Seite zeigt sowohl im Dashboard als auch auf `ueber.html` den Text „⚠ Hinweis: Dies ist eine Demo-Website. Sie kann jederzeit geändert oder abgeschaltet werden." Laut Projekt-Doku ist das aber kein Demo im Sinne von „unecht/zum Ausprobieren" — es ist das echte, von zwei Familien täglich genutzte Produktivtool. Für eine Familie, die überlegt mitzumachen, klingt „Demo" nach „nicht ernst zu nehmen, könnte jederzeit verschwinden" — was inhaltlich sogar stimmt (kein SLA, Ein-Personen-Projekt), aber die Wortwahl „Demo" ist missverständlich für den eigentlich gemeinten Haftungsausschluss. Ein Text wie „Hobby-Projekt ohne Garantie, kann jederzeit geändert werden" träfe die Absicht klarer.

**🟡 C-3. Apple-Touch-Icon zeigt aktuell wahrscheinlich kein Icon auf iOS-Homescreens** (bereits im Projekt als offen geführt, hier live bestätigt): `<link rel="apple-touch-icon" href="icon.svg">` — iOS/Safari unterstützt SVG als Homescreen-Icon nicht zuverlässig, PNG (z. B. 180×180) ist weiterhin der empfohlene Standard. Besonders relevant, weil der Betreiber selbst in den kommenden Monaten von Android auf iPhone wechseln will — der Effekt wird beim eigenen Alltagstest direkt sichtbar werden.

**🟢 C-4. Fehlerzustand ehrlich und verständlich:** Selbst mit Test-Zugangsdaten (`testpasswort123`, aus einer früheren Prüfsitzung noch im Browser-Speicher vorhanden — kein Website-Fehler, sondern Zustand des Testbrowsers) reproduziert: klare deutsche Fehlermeldung statt Absturz oder technischem Stacktrace, Karte bleibt bedienbar.

## D. Nerd-Detailblick

**🟡 D-1. Live-Stand des `web/`-Verzeichnisses ist ebenfalls hinter Git-HEAD zurück — sichtbar für jeden Besucher.** Zwei konkrete, für Endnutzer:innen sichtbare Symptome:
- `ueber.html` zeigt live „Version 0.2.0 (Beta)", während Git-HEAD (`VERSION = '0.3.0'`) und `PROJEKT.md`-Kopfzeile bereits 0.3.0 führen.
- Der eigene „Technische Details"-Dump verlinkt u. a. auf `docs/QA-Bericht-2026-08-31.md` und `docs/PEER-REVIEW-2026-08-31.md` — beide liefern live **404**, obwohl sie lokal existieren und laut `deploy.sh`-Konsistenz-Gate mit dem Original übereinstimmen sollten (`docs/PROJEKT.md`, `docs/OFFEN-naechste-Fixes.md`, `docs/prompts/peer-review-bester-freund.md` liefern dagegen live 200 — kein einheitliches „alles fehlt", sondern ein uneinheitlicher Zwischenzustand). Ob das an einer unvollständigen Deployment-Ausbreitung über Cloudflares Edge-Netzwerk liegt oder an einem tatsächlich unvollständigen Deploy, kann ich ohne Cloudflare-Dashboard-Zugriff nicht abschließend klären — **[ungeprüft]**, welcher der beiden Mechanismen greift. Fakt ist aber: Der Zustand ist seit meinem Testzeitpunkt (mehrere Stunden nach dem letzten Commit) live reproduzierbar, tote Links inklusive.
- Der neue, extra für dieses Problem gebaute Mechanismus in `deploy.sh` (`web/.deploy-commit`, verglichen gegen `git rev-parse HEAD`) funktioniert **nicht**: `curl https://heute-schule.pages.dev/.deploy-commit` liefert 404 (die Soft-404-Seite der App, nicht den Commit-Hash) — Cloudflare Pages liefert Dateien/Ordner, die mit einem Punkt beginnen, standardmäßig nicht aus (bekanntes, dokumentiertes Verhalten, u. a. an der `.well-known`-Problematik in der Cloudflare-Community nachvollziehbar). Da `deploy.sh` bei einer Abweichung nur eine Warnung ausgibt und den Deploy nicht abbricht, hätte der Check ohnehin nicht verhindert, dass etwas Falsches live bleibt — aber er hätte es wenigstens sichtbar gemacht. Aktuell tut er das nicht: Er würde bei **jedem** Deploy fälschlich „weicht ab" meldest, selbst wenn alles synchron wäre — was auf Dauer zu Alarm-Müdigkeit führt und das eigentliche Signal (wie bei A-1) verschluckt.

**🟡 D-2. ESLint prüft `web/index.html` überhaupt nicht, nicht nur mit gelockerten Regeln.** `eslint.config.mjs` Zeile 67: `ignores: ['web/**', ...]` — vollständiger Ausschluss. Das betrifft die mit Abstand größte JS-Codebasis des Projekts (1167 Zeilen `index.html` vs. insgesamt ca. 600 Zeilen `proxy/`). Kompensiert wird das nur durch den textbasierten „Keine Journal Comments"-Test in `run-tests.mjs` — der deckt genau ein Anti-Pattern ab (Datums-/Historie-Kommentare), keine der übrigen Google-Style-Regeln (`eqeqeq`, `no-var` wäre hier zwar bewusst falsch, aber auch keine Prüfung auf unbenutzte Variablen, doppelte Deklarationen etc.). Die Ausgabe „✓ sauber" in `deploy.sh` suggeriert mehr Abdeckung, als tatsächlich stattfindet.

**🟢 D-3. Sauberer Umgang mit einer selbst erkannten Testlücke:** Commit `6894bb8` beschreibt, wie der eigene Journal-Comment-Test blinde Flecken hatte (mehrzeilige `/* */`-Blöcke wurden nur an der ersten Zeile geprüft) — und wurde dafür *erweitert*, mit einer bewussten Gegenprobe („künstlich wiederhergestellter Journal Comment wird jetzt erkannt"). Genau die Iterationsdisziplin, die man sich bei einem Ein-Personen-Projekt wünscht.

**🟢 D-4. Ordentliche Trennung von Sicherheitslogik und Worker-Boilerplate:** `hostcheck.mjs`/`cachekey.mjs` sind bewusst Node-testbar ausgelagert, mit Kommentaren, die exakt erklären, welcher Angriff durch welche Zeile verhindert wird — liest sich wie Dokumentation, nicht wie nachträglich hingeworfener Kommentar.

**🟢 D-5. `.gitignore` sauber durchdacht:** Echte PII (`web/impressum.html`, `web/datenschutz.html`, `Verarbeitungsverzeichnis-INTERN.md`, Cloudflare-Vertrags-PDFs) ist konsequent von der Versionierung ausgeschlossen, mit nachvollziehbarer Begründung pro Zeile — selbst geprüft: Keine dieser Dateien ist im Git-Repo (`git ls-files` liefert für alle vier keinen Treffer), das GitHub-Spiegel-Repo bleibt damit PII-frei, während das gesetzlich vorgeschriebene Impressum live trotzdem korrekt ausgeliefert wird.

---

## Gesamturteil (unabhängig vom Bericht)

Das Produkt selbst — Code-Qualität, Testdisziplin, Rechtstexte, Barrierefreiheit — ist weiterhin überdurchschnittlich für ein Ein-Personen-Projekt, das bestätige ich nach eigener Prüfung uneingeschränkt. Was mich aber zu einer strengeren Gesamtnote bringt als beide Berichte vom 31.08.: Das Projekt hat inzwischen ein **echtes Betriebsproblem**, nicht nur ein kosmetisches. Die dokumentierte SSRF-Härtung für Mensamax — die eigene Projekt-Doku führt sie explizit als „erledigt" — läuft nachweislich nicht auf dem produktiven Proxy (A-1); der eigens dafür gebaute Live-vs-HEAD-Check ist blind, weil er auf einer von Cloudflare Pages nicht ausgelieferten Datei aufbaut (D-1); und dieselbe Deployment-Drift ist auch am `web/`-Frontend sichtbar (falsche Versionsnummer, tote Links). Das Muster dahinter: Ein „Datei-Dump aktuell?"-Gate in `deploy.sh` prüft zuverlässig, ob man vergessen hat, eine Datei zu kopieren — es prüft nicht, ob der eigentliche `wrangler deploy` für den Proxy überhaupt gelaufen ist. Für ein Projekt, das test- und lint-technisch so diszipliniert ist, ist das eine überraschende und, weil sicherheitsrelevant, die aus meiner Sicht dringlichste offene Aufgabe — dringlicher als die (durchaus real gebliebene) Haushaltsausnahme-Frage aus dem Bericht vom 31.08., weil sie technisch sofort behebbar wäre (`./deploy.sh proxy` einmal laufen lassen und verifizieren) und weil sie eine Sicherheitszusage betrifft, die bereits als erfüllt kommuniziert wird.
