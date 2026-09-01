# Peer-Review „Der beste Freund" — zu QA-Bericht-2026-08-31.md

**Geprüfter Bericht:** `QA-Bericht-2026-08-31.md`
**Live-URL:** https://heute-schule.pages.dev
**Datum dieser Prüfung:** 31.08.2026
**Erstellt von einer frischen, unabhängigen Claude-Sitzung ohne Vorwissen über frühere Projektstände oder frühere Audit-Ergebnisse dieses Projekts.**

---

## 1. Persönliche Kurzeinschätzung

Hey — sauberer Bericht, ehrlich. Belegdichte ist ungewöhnlich hoch für sowas: Ich hab so gut wie jede Zahl, jeden Codeschnipsel und jedes Zitat selbst nachgestellt (Kontrastwert, Klickflächen, Header, CORS, Live-Diff gegen HEAD), und es stimmt praktisch alles bis auf die Nachkommastelle. Dein bester Fund — die Haushaltsausnahme-Inkonsistenz — hält nicht nur stand, sie ist sogar noch stärker als du denkst: Ich hab eine *dritte* Stelle im Projekt gefunden (`Verarbeitungsverzeichnis-INTERN.md`), die dieselbe Zukunfts-Framing-Falle wiederholt. Die eine Sache, die du vor Abgabe unbedingt nachziehen solltest: Deine Security-Sektion lobt „SSRF-Schutz" pauschal, aber die Mensamax-Basis-URL hat *keine* Domain-Beschränkung — nur WebUntis ist hart auf `.webuntis.com` begrenzt. Das ist im Code selbst so dokumentiert und bewusst so entschieden, aber als Security-Reviewer hättest du das nennen müssen statt „SSRF-Schutz" wie einen einheitlichen Block zu behandeln. Zweite Sache, kleiner: Bei der Live/HEAD-Drift klingst du, als hättest du einen unbeabsichtigten Prozessfehler aufgedeckt — flagg wenigstens die Möglichkeit, dass ein Deploy bewusst zurückgehalten wurde, bevor du „Lücke im eigenen Prozess" so bestimmt hinschreibst.

---

## 2. Verifikationstabelle

| Kernaussage aus dem Bericht | Ergebnis | Beleg |
|---|---|---|
| HSTS `max-age=31536000; includeSubDomains`, HTTP→HTTPS 301 | ✅ bestätigt | `curl -sD - https://heute-schule.pages.dev/` und `curl -sI http://heute-schule.pages.dev/` — beide exakt wie beschrieben |
| Vollständige Security-Header (CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy) | ✅ bestätigt | Eigener `curl`-Abruf liefert Header wortgleich zu `web/_headers` |
| `access-control-allow-origin: *` auf statischen Seiten (Cloudflare-Pages-Standard) | ✅ bestätigt | Im selben `curl`-Output sichtbar |
| CORS des Proxys reflektiert Origin nicht, bleibt statisch auf `https://heute-schule.pages.dev` | ✅ bestätigt | Eigener `OPTIONS`-Request mit `Origin: https://evil.example` gegen `/api/status` liefert weiterhin nur die eigene Origin |
| SSRF-Schutz deckt Loopback/RFC1918/Link-lokal/Metadata/Suffix-Tricks ab | ⚠️ teilweise | `proxy/hostcheck.mjs` bestätigt die IP-Range-Sperren vollständig — aber **nur für WebUntis gilt zusätzlich ein Domain-Zwang** (`pflichtSuffix: '.webuntis.com'`). Die Mensamax-`base`-URL läuft durch `pruefeSichereHttpsUrl()` **ohne** `pflichtSuffix` — jede öffentliche HTTPS-Domain wird akzeptiert, auch aus dem freien Textfeld im Setup-Formular (`web/index.html` Zeile 314). Siehe Zusatzbefund A1. |
| Cache-Key-Authentifizierung: Zugangsdaten sind Teil des SHA-256-Schlüsselmaterials | ✅ bestätigt | `proxy/cachekey.mjs` + `sha256Hex()`-Aufruf in `proxy/worker.js` Zeile 112–119 selbst gelesen |
| 87/87 Tests grün | ✅ bestätigt | `node run-tests.mjs` selbst ausgeführt: „87 Tests: 87 ✓ 0 ✗" |
| ESLint sauber | ✅ bestätigt | `npx eslint .` selbst ausgeführt, keine Ausgabe |
| `npm audit`: 0 Schwachstellen, keine Produktions-Dependencies | ✅ bestätigt | `package.json` gelesen — nur `eslint`/`@eslint/js`/`globals` als devDependencies |
| Kontrast `.btn-primary`: `rgb(95,183,135)`/`rgb(20,24,21)`, ~7,35:1 | ✅ bestätigt exakt | Eigene JS-Messung im Live-Browser mit Standard-WCAG-Luminanzformel: `7.351119941281542` |
| Zielgrößen: Zahnrad-Button 38,4×38,4 px, Refresh-FAB 54,4×54,4 px | ✅ bestätigt exakt | Eigene `getBoundingClientRect()`-Messung im Live-Browser (nach Korrektur eines eigenen Viewport-Messfehlers, siehe unten) — Werte treffen exakt |
| `role="banner"/main/contentinfo`-Landmarks vorhanden | ⚠️ teilweise | Ergebnis stimmt (Accessibility-Tree hat diese Rollen), aber **kein einziges `role="..."` steht im Code dafür** — es sind implizite Rollen von `<header>`/`<main>`/`<footer>`. Einziges explizites `role=` im gesamten `web/index.html` ist `role="group"` beim Tag-Umschalter (`grep -n 'role=' web/index.html`). Die Formulierung „vorhanden … im Code bestätigt" suggeriert mehr, als tatsächlich im Quelltext steht. |
| `innerHTML` nur zum Leeren, dynamische Werte über `textContent`/`createElement` | ✅ bestätigt exakt | `grep -n innerHTML web/index.html` liefert ausschließlich `.innerHTML = ''`; Zeile 890 exakt wie zitiert (`span.textContent = s.fach + ' · ' + s.raum`) |
| Live-Deployment weicht von Git-HEAD ab (tote `pad()`, alte `catch(e)`-Syntax, alte Kommentare) | ✅ bestätigt exakt | Eigener Diff `proxy/worker.js` (lokal) vs. `https://heute-schule.pages.dev/source/proxy/worker.js` (live) zeigt exakt die tote `pad()`-Funktion, `catch (e)` statt `catch {}`, `{ cause: e }` fehlt live. `web/index.html`-Diff zeigt wortgleich den zitierten Kommentar „Aus dem Betatest bestätigt (28.08.), dass …" nur live, nicht lokal. |
| Haushaltsausnahme bereits heute hinfällig, nicht erst „bei weiterer Ausweitung" | ✅ bestätigt, sogar verstärkt | `PROJEKT.md` Z. 46 „Mit der Zeit kam eine zweite Familie dazu" (Fakt, Vergangenheit) vs. `web/README.md` Z. 129 „Sobald der Link an befreundete Familien geht" (Zukunftskonjunktiv) — Widerspruch bestätigt. **Zusatzfund:** dieselbe Zukunftsformulierung steckt noch ein drittes Mal in `Verarbeitungsverzeichnis-INTERN.md` Z. 77: „sobald der Nutzerkreis über die eigene Familie hinausgeht". |
| DDG statt TMG korrekt (§ 5 DDG) | ✅ bestätigt | WebFetch gegen `gesetze-im-internet.de/ddg/__5.html`: § 5 DDG regelt exakt die im Impressum abgedeckten Informationspflichten; DDG hat die entsprechenden TMG-Paragrafen 2024 abgelöst (Allgemeinwissen, durch die Fundstelle gestützt) |
| Art. 2 Abs. 2 lit. c DSGVO: „ausschließlich persönliche oder familiäre Tätigkeiten" | ✅ bestätigt | WebFetch-Zitat deckt sich wörtlich mit der Einordnung im Bericht |
| WCAG 2.2 SC 2.5.8 Target Size (Minimum), Level AA, 24×24 CSS-Pixel | ✅ bestätigt | WebFetch gegen `w3.org/WAI/WCAG22/Understanding/target-size-minimum.html` |
| GitHub-Spiegelung privat, liefert 404 | ✅ bestätigt | `curl -o /dev/null -w '%{http_code}' https://github.com/blue-demann/heute-schule` → `404` |
| `robots.txt: Disallow: /`, 404-Seite mit `noindex` | ✅ bestätigt | Beide live abgerufen |
| Keine Cookies, kein Tracking, kein externes Skript | ✅ bestätigt | `grep -rn document.cookie web/` leer; keine `<script src="http...">` oder Analytics-Keywords in `web/*.html` |
| 49.696 Byte unkomprimiert / 14.800 Byte gzip | ✅ bestätigt exakt | `wc -c web/index.html` → 49696; `gzip -c web/index.html \| wc -c` → 14800 |
| Fehlerzustand-Meldung („WebUntis-Login fehlgeschlagen — Benutzername oder Passwort prüfen. · Schulessen: Mensamax-Konfiguration unvollständig …") | ✅ bestätigt | Auf der Live-Seite mit vorhandenem Test-Kind-Datensatz wortgleich gesehen (Screenshot) |
| AVV mit Cloudflare verifiziert am 28.08.2026 im Dashboard | [ungeprüft] | Kein Zugriff auf das Cloudflare-Konto des Betreibers — wie im Bericht selbst markiert. `Verarbeitungsverzeichnis-INTERN.md` (lokal gelesen) dokumentiert dieselbe Behauptung mit Versionsnummer des DPA, aber auch das ist nur eine interne Notiz, kein unabhängiger Beleg. |
| Rate-Limit 30/Min/IP, Grenzen (nicht atomar, pro Rechenzentrum) offen benannt | ✅ Code bestätigt, Verhalten [ungeprüft] | `proxy/worker.js` Zeile 49 (`RATE_LIMIT_PRO_MINUTE = 30`) und Zeile 56–88 gelesen — Limitierungen im Kommentar korrekt beschrieben. Bewusst nicht selbst stresstestet, aus denselben Gründen wie im Bericht genannt. |

---

## 3. Korrekturen

1. **„SSRF-Schutz" ist kein einheitlicher Block — das hättest du trennen müssen.** Der Bericht schreibt „SSRF-Schutz (`proxy/hostcheck.mjs`): Code-Review + 87/87 grüne Tests … decken … ab" als eine zusammenhängende Aussage. Tatsächlich gibt es zwei unterschiedlich starke Schutzstufen im selben Modul: WebUntis bekommt zusätzlich zur IP-Range-Sperre einen harten Domain-Zwang (`pflichtSuffix: '.webuntis.com'`), Mensamax nicht — bewusst so entschieden laut Kommentar in `hostcheck.mjs` Zeile 40–43 („für die Essensanbieter bewusst nicht, da andere Schulen andere Portal-Domains … nutzen können"). Das ist nicht falsch dokumentiert im Code, aber der Bericht verschweigt es. Für einen c't-Testbericht mit Security-Anspruch ist „deckt … ab" ohne diese Einschränkung eine Überzeichnung. Details unter Zusatzbefund A1.

2. **`role="banner"/main/contentinfo … im Code bestätigt" ist ungenau formuliert.** Es handelt sich um implizite ARIA-Rollen von `<header>`/`<main>`/`<footer>` — im Quelltext steht kein einziges `role="banner"` o. Ä. Für Nutzer:innen macht das keinen Unterschied (Accessibility-Tree ist korrekt), aber „im Code bestätigt" suggeriert, man habe die Attribute im Quelltext gefunden. Präziser wäre: „implizite Landmark-Rollen über semantisches HTML, live im Accessibility-Tree bestätigt".

3. **Live/HEAD-Drift: Fund korrekt, Framing zu bestimmt.** Der Bericht formuliert den Fund als „Lücke im eigenen Prozess" und reiht ihn unter „Handlungsempfehlungen" mit der Formulierung „damit die tote `pad()`-Funktion … nicht länger produktiv liegen" — das klingt nach unbeabsichtigtem Fehler. Der Bericht erwähnt an keiner Stelle die Möglichkeit, dass ein Deploy bewusst zurückgehalten wurde (z. B. bis zum Abschluss laufender Prüfrunden). Das ist keine erfundene Referenz oder falsche Tatsachenbehauptung — die Diskrepanz selbst ist ja handfest belegt (siehe Verifikationstabelle) — aber die *Interpretation* „Prozesslücke, dringend beheben" ist nur eine von mehreren plausiblen Lesarten, und der Bericht prüft nicht, welche zutrifft, bevor er sie als Handlungsempfehlung Nr. 2 mit „Aufwand: minimal … muss nur ausgeführt werden" formuliert. Ein Satz wie „ich konnte nicht klären, ob das Deployment bewusst pausiert wurde oder schlicht vergessen ging" hätte gereicht.

Keine falsch zitierten Gesetzesstellen, keine veralteten Standard-Referenzen, keine erfundenen Messwerte gefunden — in diesem Punkt ist der Bericht sauber.

---

## 4. Zusatzbefunde

### A. Security in der Tiefe

- 🟡 **A1 — Mensamax-Basis-URL ohne Domain-Beschränkung (SSRF-Restrisiko).** `proxy/hostcheck.mjs`, Funktion `pruefeSichereHttpsUrl()`, ruft `pruefeSicherenHostname(u.hostname)` **ohne** `pflichtSuffix` auf. Jede:r, die die (öffentlich im Quelltext sichtbare) Proxy-URL kennt, kann per direktem POST an `/api/status` ein `lunch.base` mit einer beliebigen öffentlichen HTTPS-Domain angeben — das Frontend-Feld dafür ist ebenfalls freier Text (`web/index.html` Zeile 314, `placeholder="https://parentsmensa.de"`, kein Dropdown). Der Worker macht dann ein GET auf `{base}/login.aspx`, extrahiert Formularfelder und POSTet Zugangsdaten aus dem Request-Body dorthin (`getMensamaxCookies()`, Zeile 263–312). **Threat Model:** Damit ist der Proxy ein begrenztes GET+POST-Relay gegen beliebige öffentliche Hosts, nutzbar z. B. um über die Cloudflare-IP-Reputation Ziele anzusprechen, ohne die eigene IP zu zeigen, oder um Cloudflares Infrastruktur für POST-Spam gegen fremde Login-Formulare zu missbrauchen. **Einordnung:** Rate-Limit (30/Min/gehashter IP) und das Cloudflare-Workers-Modell (kein klassischer instanzgebundener Cloud-Metadata-Endpunkt wie bei EC2) begrenzen den praktischen Schaden deutlich — das ist kein 🔴, aber „SSRF-Schutz" als pauschales Prädikat für das ganze Modul ist zu großzügig. Beleg: eigene Code-Lektüre `proxy/hostcheck.mjs` + `web/index.html` Zeile 314 + `proxy/worker.js` Zeile 329–363.
- 🟢 **A2 — DNS-Rebinding-TOCTOU strukturell vorhanden, praktisch nicht relevant.** Der Hostname-Check ist ein reiner String-Vergleich vor `fetch()`; zwischen Prüfung und tatsächlicher DNS-Auflösung durch Cloudflares eigenen `fetch()` liegt technisch ein Zeitfenster für DNS-Rebinding. Für Cloudflare Workers ist das Schadenspotenzial gering (kein erreichbares internes Netz wie bei klassischem SSRF gegen eine VM), aber als Muster erwähnenswert, falls der Proxy je auf eine andere Laufzeitumgebung portiert wird. Kein aktueller Handlungsbedarf.
- 🟢 **A3 — Positiv, vom Bericht nicht hervorgehoben:** Timeout-Wrapper (10 s, `fetchWithTimeout`) und 4-Minuten-Cache liegen konsequent vor *jedem* externen Call, nicht nur punktuell — verhindert sowohl hängende Requests als auch versehentliches Bombardieren von WebUntis/Mensamax bei mehrfachen Klicks. Für ein Ein-Personen-Projekt überdurchschnittlich diszipliniert.
- 🟢 **A4 — Kleinigkeit:** Das Rate-Limit zählt auch Cache-Treffer mit (Prüfung liegt vor dem Cache-Lookup in `worker.js`). Bei einer Familie mit mehreren Kindern, die kurz hintereinander mehrfach aktualisiert, zählt das gegen dasselbe Kontingent wie echte Upstream-Calls — in der Praxis bei 30/Min irrelevant, aber nicht ganz das, was der Kommentar „selbst eine ungeduldige Familie kommt nicht in die Nähe" suggeriert, wenn man mitzählt, dass auch kostenlose Cache-Hits mitgezählt werden.

### B. CCC-Perspektive

- 🟢 Nichts Neues an Kritik — der Bericht deckt Tracking/Cookies/Fonts/Cache bereits sauber ab, eigene Prüfung bestätigt das vollständig (keine externen `<script src>`, kein `document.cookie`, keine Google Fonts, `font-src 'self'`).
- 🟢 **Positiv, ergänzend:** `Verarbeitungsverzeichnis-INTERN.md` und das archivierte Cloudflare-PDF sind korrekt per `.gitignore` (Zeile 26, Zeile 41) von der Versionierung ausgeschlossen — interne Rechtsdokumentation landet nicht versehentlich im öffentlichen GitHub-Mirror. Sauber getrennt, genau die Art Datensparsamkeit-im-Kleinen, die man sich von einem CCC-nahen Betreiber wünscht.
- 🟡 **Souveränitäts-Aspekt, den weder Bericht noch ich abschließend bewerten können [teilweise ungeprüft]:** Die gesamte Infrastruktur (Pages, Workers, DNS/TLS, Rate-Limit-Cache) hängt an einem einzigen Anbieter, Cloudflare, im kostenlosen Self-Serve-Tarif. Das ist für ein Familienprojekt eine vernünftige Wahl (kein Google/Microsoft, transparent dokumentiert), aber „digitale Souveränität" bedeutet hier: Verschwindet der kostenlose Cloudflare-Tarif oder wird der Account gesperrt, ist die Seite in Minuten offline — kein Fallback-Hosting dokumentiert. Nicht neu gegenüber dem, was der Bericht ohnehin schon zu Bus-Factor sagt, aber eine Ergänzung wert.

### C. Familienvater-/Alltagsblick

- 🟢 Der In-App-Hinweis „⚠ Hinweis: Dies ist eine Demo-Website. Sie kann jederzeit geändert oder abgeschaltet werden." (live auf jeder Kind-Karte sichtbar) ist genau die Art ehrlicher, laienverständlicher Erwartungssteuerung, die ich meiner Verwandtschaft zeigen würde, ohne es erklären zu müssen — vom Bericht nicht explizit zitiert, aber es stützt sein Fazit „ehrliche, unaufgeregte Rechtstexte" zusätzlich.
- 🟢 Kleine Geschmacksfrage, kein Fehler: Das Fehler-Icon vor „Lessing: Fehler beim Abrufen" ist ein Teller-Icon (🍽️), nicht offensichtlich ein Fehlersymbol — für sich genommen leicht missverständlich, aber durch den klaren deutschen Text direkt darunter entschärft. Würde ich meinen Eltern trotzdem bedenkenlos zeigen — das Gesamtbild bleibt verständlich.
- Mobile Ansicht (375×812, selbst nachgestellt): bestätigt exakt, was der Bericht beschreibt — sauberer Umbruch, FAB unten rechts kollidiert mit nichts, auch bei einer aktiven Fehlermeldung auf der Kind-Karte.

### D. Nerd-Detailblick

- 🟢 **Hübsche Ironie, die der Bericht nicht bemerkt hat:** Der lokale Test „Keine Journal Comments im Code" (`run-tests.mjs`, grün) prüft explizit auf „Datums-/Historie-Signalwörter in Code-Kommentaren" — genau die Art Kommentar, die als „Aus dem Betatest bestätigt (28.08.), dass …" noch live auf der Website steht. Der Test würde den Live-Stand also durchfallen lassen, wenn er je gegen ihn liefe — läuft aber nur gegen den lokalen Stand. Stützt Handlungsempfehlung 3 des Berichts (Live-vs-HEAD-Check) mit einem sehr konkreten Beispiel, warum sie sich lohnt.
- 🟢 **Nette Bestätigung über einen Umweg:** Live-`Content-Length` ist 49.755 Byte, lokal `wc -c web/index.html` liefert 49.696 Byte — die 59-Byte-Differenz passt größenordnungsmäßig zu genau den zusätzlichen Kommentarzeilen, die der Bericht als Live/HEAD-Diff identifiziert. Unabhängige Bestätigung ganz ohne Diff-Tool.
- 🟢 **Positiv, unterbewertet:** `resolveDatum()` in `proxy/worker.js` (Zeile 121–134) behandelt explizit den Fall, dass Cloudflare Workers mit UTC statt deutscher Zeit laufen, und fällt bei fehlendem Client-Datum sauber auf `Europe/Berlin` per `Intl.DateTimeFormat` zurück, statt naiv `new Date()` zu nehmen. Genau die Art Mitternachts-Randfall, den viele Projekte übersehen — verdient explizites Lob, das im Bericht fehlt.
- 🟢 Die auskommentierte, aber bewusst leere ccCampus-Sektion in `worker.js` (Zeile 365–384: „Hier steht bewusst KEIN Code mehr, nur diese Notiz") zeigt dieselbe Disziplin, die beim Live/HEAD-Drift-Fund fehlt — der Entwickler räumt tote Referenzimplementierungen aktiv weg, statt sie rotten zu lassen. Zeigt: Das Problem ist die Deploy-Pipeline, nicht die Entwickler-Disziplin selbst.

---

## 5. Gewichtungs-Feedback

- **Security 🟡:** Stimme der Ampel zu, aber aus einem zusätzlichen Grund, den der Bericht nicht nennt (A1). Die genannten Restrisiken (`unsafe-inline`, Klartext-Credentials) rechtfertigen 🟡 bereits allein; mit A1 dazu ist 🟡 nach wie vor richtig, aber jetzt aus einem vollständigeren Bild heraus statt trotz einer Lücke im eigenen SSRF-Bild.
- **Recht & Compliance 🟡:** Volle Zustimmung, und zwar mit Nachdruck — das ist der stärkste Fund im ganzen Bericht, sauber mit Primärquellen (PROJEKT.md vs. web/README.md) belegt, und meine dritte Fundstelle (Verarbeitungsverzeichnis-INTERN.md) bestätigt, dass es kein Einzelfall-Ausrutscher ist, sondern ein durchgängiges Framing-Problem in der gesamten Projektdokumentation. Hier würde ich, wenn überhaupt, eher fragen, ob nicht sogar ein zusätzlicher Hinweis „an drei Stellen wiederholt" die Dringlichkeit noch klarer gemacht hätte.
- **Code-Qualität 🟡:** Ampel ist vertretbar, aber die *Begründung* im Fließtext sollte die Möglichkeit eines bewussten Deploy-Stopps nennen (siehe Korrektur 3), bevor sie als „Lücke im eigenen Prozess" in die Top-5-Handlungsempfehlungen wandert.
- **Barrierefreiheit 🟢:** Stimme zu — die Messwerte sind exakt reproduzierbar, das ist handwerklich sehr sauber gemacht. Die role-Formulierung (Korrektur 2) ist zu klein, um die Ampel zu kippen.
- **Performance 🟢** und **SEO 🟢:** Beide angemessen und korrekt gehedged mit [ungeprüft] für Core Web Vitals — keine Einwände.
- Insgesamt: Ich habe **nirgends** einen Fall gefunden, wo der Bericht zu streng war — eher im Gegenteil, an zwei Stellen (SSRF-Pauschalisierung, role-Formulierung) etwas zu wohlwollend/ungenau, ohne dass das die Gesamtnote kippen würde.

---

## 6. Fazit

Die Website selbst ist genau das, was der Bericht beschreibt: ein technisch überdurchschnittlich sauberes Ein-Personen-Projekt mit echten, live nachvollziehbaren Security- und A11y-Maßnahmen, ehrlichen Rechtstexten und einer für den aktuellen kleinen Nutzerkreis angemessenen Risikoabwägung. Mein eigenes Gesamturteil weicht nur in einem Punkt spürbar ab: Die SSRF-Schutzmaßnahmen sind nicht so einheitlich, wie „SSRF-Schutz" im Bericht suggeriert — die Mensamax-Basis-URL akzeptiert praktisch jede öffentliche HTTPS-Domain, ein Fakt, der zum Sicherheitsbild dazugehört, auch wenn er das Gesamturteil (🟡 statt 🟢) nicht ändert. Die Haushaltsausnahme-Problematik ist real, gut belegt und beim genaueren Hinsehen sogar noch verbreiteter in der Projektdokumentation, als der Bericht zeigt.

Zur Qualität des Artikels selbst: Die Recherchetiefe ist außergewöhnlich hoch — praktisch jede zitierte Zahl, jeder Codeschnipsel und jede Live-Messung, die ich nachgestellt habe, stimmte exakt, bis auf zwei Stellen mit kleinen Präzisionsproblemen (role-Attribute, SSRF-Pauschalisierung) und eine fehlende Alternativlesart beim Deploy/HEAD-Fund. Die Belegdichte ist vorbildlich (eigene Curl-Abrufe, eigene Testläufe, eigene Live-Messungen statt bloßer Behauptungen), und die Fairness stimmt: Der Bericht lobt explizit, wo Lob angebracht ist, und ist an keiner Stelle unnötig hart. Abgabefertig mit den zwei genannten Nachbesserungen — die Substanz muss dafür nicht neu recherchiert werden, nur an zwei Stellen präzisiert bzw. ergänzt werden.
