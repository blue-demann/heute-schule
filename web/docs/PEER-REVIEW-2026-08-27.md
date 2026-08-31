# Peer-Review des Testberichts „Heute Schule" (Runde 2)

**Reviewer-Rolle:** IT-Security-Berater, CCC-Umfeld, Familienvater
**Geprüfter Bericht:** `QA-Bericht-2026-08-27-v0.1.1.md`
**Prüfobjekt:** https://heute-schule.pages.dev · Version 0.1.1
**Quellcode:** vollständig lokal vorhanden (`web/`, `proxy/`)
**Datum:** 27.08.2026

---

## Zugriffslage

Ich hatte Live-Browsing, freien HTTP-Zugriff (Header, POSTs gegen den eigenen
Proxy), vollständigen Quellcode-Zugriff und konnte die Kontrastwerte selbst im
Browser nachrechnen. Was ich **nicht** hatte: echte Zugangsdaten für WebUntis
oder einen der Essensanbieter, Lighthouse/axe, Screenreader, und Einblick in
Cloudflares Log-/Vertragslage. Entsprechend markierte Punkte sind
`[ungeprüft]`.

---

## 1. Persönliche Kurzeinschätzung

Ehrlich? Der Artikel ist handwerklich richtig gut — Belegdichte, offengelegte
Prüflücken, und vor allem der Mumm, den eigenen Fehler aus Runde 1 (den
übersehenen Dunkelmodus-Kontrast) offen als eigene Lücke zu benennen statt ihn
als Neubefund zu verkaufen. Das ist mehr Selbstkorrektur, als die meisten
Testberichte je zeigen. **Aber du kannst ihn so nicht abgeben**, und zwar aus
einem einzigen, dafür harten Grund: Du hast in Runde 1 den Cache-Key des Proxys
ausdrücklich *gelobt* („bewusst nur aus nicht-geheimen Feldern gebildet") — und
genau das ist eine Authentifizierungslücke, die ich in zwei Minuten
reproduziert habe. Solange die drinsteht, vergibst du Security 🟢 an ein
System, bei dem ich ohne Passwort an den Stundenplan fremder Kinder komme.
Fix das eine Ding, dann ist der Rest wirklich stark.

---

## 2. Verifikationstabelle

| Kernaussage aus dem Bericht | Ergebnis | Mein Beleg |
|---|---|---|
| SSRF behoben, 3 Varianten abgewiesen | ✅ bestätigt | Selbst nachgestellt: `127.0.0.1` → *„internes/lokales Ziel"*, `angreifer.example` und `webuntis.com.angreifer.example` → *„muss auf \".webuntis.com\" enden"* |
| CORS auf eigene Domain eingegrenzt | ✅ bestätigt | `curl -X OPTIONS -H "Origin: https://boese.example"` → `access-control-allow-origin: https://heute-schule.pages.dev` |
| Security-Header vollständig | ✅ bestätigt | Selbst abgerufen: CSP, HSTS `max-age=31536000; includeSubDomains`, `x-frame-options: DENY`, `permissions-policy`, `nosniff`, `referrer-policy` |
| `role="button"` auf `<h1>` weg | ✅ bestätigt | DOM: `h1_tag: "H1"`, `h1_role: null`, Button innerhalb der Überschrift, kein `title` mehr |
| 15/15 Formularfelder zugeordnet | ✅ bestätigt | Eigene DOM-Abfrage: `labelsWithFor: 14`, `inputsOhneZuordnung: []` |
| Soft-404 beseitigt | ✅ bestätigt | `/sitemap.xml` → 404, `/gibtesnicht-xyz123` → 404, `/robots.txt` → 200 `text/plain` |
| Dunkelmodus-Kontrast 2,44:1 | ✅ bestätigt | Selbst nachgerechnet: `#ffffff` auf `#5fb787` = **2,44:1**. Betrifft `.btn-primary`, `.tag-btn.active`, `a.uebersicht-btn` |
| Hellmodus 5,69–5,99:1, unauffällig | ✅ bestätigt | Eigene Messung im Hellmodus: 5,69 (Fließtext) / 5,99 (Akzentflächen) |
| CSP blockiert fremde ccCampus-Domains | ✅ bestätigt | `fetch('https://cccampus.example.org/...')` von der Live-Seite → `TypeError: Failed to fetch` |
| 73 Tests grün | ✅ bestätigt | `node run-tests.mjs` → 73 ✓ 0 ✗ |
| „Keine externen JS-Bibliotheken, keine Dritten" | ✅ bestätigt | Keine externen `<script src>`/`<link href="http`, kein `package.json`, kein Cloudflare-Insights-Beacon (0 Treffer) |
| **„Cache-Key schließt Passwörter aus" = gute Entscheidung** | ❌ **widerlegt** | Ist eine Auth-Lücke — siehe A1. Empirisch: 2. Anfrage mit *falschem* Passwort → 0,043 s statt 0,202 s, Antwort byte-identisch |
| Security-Ampel 🟢 | ❌ widerlegt | Nicht haltbar, solange A1 offen ist — siehe Abschnitt 5 |
| Alle Runde-1-Befunde behoben | ⚠️ teilweise | Stimmt für die 10 genannten. Aber Runde 1 hatte die Vertrauensfrage zum Proxy gar nicht erst als Befund erfasst — siehe B1 |
| „Stundenplan/Schulessen werden korrekt angezeigt" | [ungeprüft] | Keine echten Zugangsdaten. Der Bericht sagt das selbst offen — korrekt so |
| AVV mit Cloudflare geschlossen | [ungeprüft] | Steht so in der Datenschutzerklärung; ich kann Vertragsannahmen im Cloudflare-Konto nicht einsehen — siehe B3 |

---

## 3. Korrekturen

### 3.1 WCAG-Versionen inkonsistent zitiert

Du springst zwischen Versionen, und einmal stimmt die Zuordnung nicht:

| Deine Angabe | Korrekt |
|---|---|
| Runde 1: „WCAG 2.5.8 (AA)" ohne Version | **SC 2.5.8 Target Size (Minimum)** gibt es erst ab **WCAG 2.2**. In 2.0/2.1 existiert das Kriterium nicht — die Versionsangabe ist hier nicht optional, sondern trägt die ganze Aussage |
| Runde 1: „WCAG 2.5.3 Label in Name" implizit als AA geführt | SC 2.5.3 ist **Level A**, nicht AA (seit WCAG 2.1) |
| Runde 2: „WCAG 2.1 AA (SC 1.4.3)" | Nicht falsch (1.4.3 gibt es seit 2.0), aber inkonsistent zu Runde 1 |

**Empfehlung:** durchgängig auf **WCAG 2.2** referenzieren — die subsumiert alle
genannten Kriterien, und 2.2 ist seit Oktober 2023 W3C-Recommendation. Level
jeweils mit angeben.

### 3.2 § 5 DDG — hier hast du recht, und das ist erwähnenswert

Impressum und Bericht nennen **§ 5 DDG**. Das ist korrekt und aktuell: Das
Digitale-Dienste-Gesetz hat das TMG abgelöst, die Impressumspflicht steht nicht
mehr in § 5 TMG. Ich schreibe das hin, weil ein erschreckender Anteil
deutscher Seiten (und Testberichte) hier immer noch TMG zitiert. Keine
Korrektur, sondern ausdrückliche Bestätigung.

### 3.3 „Security 🟢" ist eine Fehlbewertung

Siehe Abschnitt 5. Mit einer nicht-authentifizierten Datenabfrage im System ist
grün nicht vertretbar, egal wie gut SSRF und CORS gelöst sind.

### 3.4 Kleinigkeit: „Angriffsvarianten" ist zu großspurig

Du schreibst, der Proxy „weist alle drei getesteten Angriffsvarianten ab". Das
waren drei *Eingabevarianten für dieselbe Schwachstellenklasse* (Host-Validierung),
keine drei Angriffsarten. Sprachlich verkauft das die Abdeckung besser, als sie
ist. Nicht dramatisch, aber ein c't-Lektorat würde es anstreichen.

---

## 4. Meine Zusatzbefunde

### A — Security in der Tiefe

#### 🔴 A1: Cache-Treffer ohne Passwortprüfung — fremde Stundenpläne abrufbar

**Der Befund, den du in Runde 1 als gute Designentscheidung gelobt hast.**

`buildCacheKey()` (`proxy/worker.js:67-79`) bildet den Schlüssel aus:

```js
const relevant = {
  datum,
  webuntis: { server, user, klasse },          // kein password
  lunch:    { base, projekt, einrichtung, username },  // kein password
};
```

Und der Cache-Treffer wird **vor jeder Authentifizierung** ausgeliefert
(`worker.js:384-388`):

```js
const cached = await cache.match(cacheKey);
if (cached) {
  const cachedBody = await cached.json();
  return jsonResponse(cachedBody, 200, corsHeaders);   // kein Passwort-Check
}
```

**Empirisch reproduziert** (frischer Zufallsnutzer, damit kein Alt-Cache stört):

| Anfrage | Passwort | Antwortzeit | Antwort |
|---|---|---|---|
| 1 | `AAAA` | 0,202 s (echter Upstream-Call) | Fehlermeldung |
| 2 | `BBBB` | **0,043 s** (Cache) | **byte-identisch** |

Das Passwort wurde bei Anfrage 2 nicht einmal angefasst. Übertragen auf den
Echtbetrieb heißt das: Wer `server`, `user` und `klasse` kennt, bekommt
innerhalb der 4-Minuten-TTL die zwischengespeicherte Antwort einer legitimen
Abfrage — **also den echten Stundenplan und Essensstatus des Kindes, ohne
Passwort**.

Und das Fiese: Bei einem WebUntis-*Klassensammellogin* ist `user` typischerweise
`Klasse-9c` und `klasse` ist `9c`. Beides ist innerhalb einer Schule praktisch
öffentlich — jedes Kind der Klasse kennt es. Der „geheime" Teil ist allein das
Passwort, und genau das umgeht der Cache. Ein Angreifer muss nicht einmal das
Timing treffen: alle zwei Minuten pollen reicht.

> **Einschränkung, ehrlich:** Den Vollzug mit echten Daten konnte ich mangels
> Zugangsdaten nicht demonstrieren. Bewiesen ist: der Cache-Key enthält kein
> Passwort (Code), und ein Treffer wird ohne Passwortprüfung ausgeliefert
> (Code + Zeitmessung). Dass der gecachte Inhalt bei erfolgreichem Login der
> echte Stundenplan ist, folgt aus `worker.js:456-462` — geprüft, aber nicht
> ausgeführt.

**Fix:** Passwort (bzw. einen HMAC davon) in den Cache-Key aufnehmen. Der
Schlüssel ist ohnehin ein SHA-256-Digest, es landet also nichts Lesbares im
Cache-Namen. Die Kommentarzeile „bewusst NUR aus nicht-geheimen Feldern" gehört
mit umgedreht — die Begründung war plausibel und trotzdem falsch.

#### 🟡 A2: Kein Rate-Limit — der Proxy ist ein WebUntis-Login-Relay

`grep -i "ratelimit\|throttle\|429" proxy/worker.js` → **0 Treffer**.

Die Host-Allowlist begrenzt auf `*.webuntis.com`, aber das sind *alle* Schulen
auf WebUntis, nicht nur deine. Mein Testaufruf gegen `demo.webuntis.com` ging
durch und erzeugte einen echten Login-Versuch. Das heißt: Der Proxy nimmt
beliebig viele Login-Versuche gegen beliebige WebUntis-Instanzen entgegen und
stellt sie mit Cloudflare-IP zu. Für Credential-Stuffing ist das eine geschenkte
Vorschaltstufe — und wenn jemand das ausnutzt, sieht WebUntis eure IP, nicht
seine.

Der 4-Minuten-Cache dämpft das zufällig (gleicher `user` → Cache), aber eben
nur pro Nutzername. Ein simples Limit pro IP wäre ein Zehnzeiler.

#### 🟢 A3: Supply Chain — vorbildlich, und das darfst du deutlicher sagen

Kein `package.json`, keine npm-Abhängigkeiten, keine CDN-Skripte, keine
Web-Fonts, kein Analytics-Beacon (alles selbst geprüft). Damit ist die Frage
„wem muss ich vertrauen, damit diese Seite integer bleibt?" reduziert auf:
Björn, Cloudflare, und die beiden Schulportale. Das ist für eine Web-App im
Jahr 2026 bemerkenswert wenig, und Subresource Integrity erübrigt sich schlicht,
weil es keine Fremdressourcen gibt.

Dein Bericht erwähnt das, aber unter „ferner liefen". Das ist der stärkste
strukturelle Sicherheitsvorteil des ganzen Projekts und gehört nach vorn.

#### 🟡 A4: Betriebsrealität — kein Prozess, nur ein Mensch

Deploy ist manuell (`npx wrangler deploy`), es gibt keine CI, keinen
automatischen Test-Gate vor dem Deploy (die 73 Tests laufen nur, wenn jemand
sie startet), und kein Monitoring. Bei einem Ein-Personen-Projekt ist das
vertretbar — aber jetzt hängen fremde Familien dran. Minimum wäre: Tests als
Pre-Deploy-Schritt verdrahten, damit ein kaputter `hostcheck` nicht
unbemerkt live geht. Dein Bericht bewertet Code-Qualität 🟢 und übergeht
diesen Aspekt komplett.

### B — CCC-Perspektive

#### 🔴 B1: Die eigentliche Vertrauensfrage kommt in beiden Berichten nicht vor

Das ist meine grundsätzlichste Kritik am Artikel, nicht an der Software.

Cloudflare Workers terminieren TLS an der Edge. Der Worker bekommt den
Request-Body **im Klartext** — verifiziert, indem ich Zugangsdaten hingeschickt
habe und der Worker einen echten WebUntis-Login damit versucht hat. Das heißt
in Klartext: **Jedes WebUntis- und Mensamax-Passwort jeder teilnehmenden
Familie läuft im Klartext durch Cloudflares Rechenzentrum.**

Der Code loggt nichts (geprüft: kein `console.log` mit Credentials in
`worker.js`). Aber:

- Björn *könnte* jederzeit eine Zeile Logging ergänzen. Die Familien haben
  keine Möglichkeit, das zu bemerken oder zu überprüfen.
- Cloudflare könnte es. `[ungeprüft]`, was Cloudflare tatsächlich vorhält.
- Der Datenschutzerklärung ist das zwar zu entnehmen („Der reicht sie
  unmittelbar an WebUntis bzw. Mensamax weiter"), aber die Tragweite —
  *fremde* Eltern vertrauen einer Privatperson plus einem US-Konzern die
  Schulzugangsdaten ihrer Kinder an — wird nirgends benannt.

Architektonisch ist der Proxy wegen CORS unvermeidbar. **Vermeidbar ist die
Plattformwahl nicht — die Intransparenz aber schon.** Aus CCC-Sicht wäre das
Mindeste: in der Datenschutzerklärung explizit sagen, dass der Betreiber die
Zugangsdaten technisch sehen *könnte*, es nicht tut, und dass der Quellcode
genau deswegen offen liegt. Compliance ist die Untergrenze; hier geht es um
informierte Zustimmung.

Bemerkenswert übrigens, dass ausgerechnet ccCampus — der Anbieter, den ihr
technisch *nicht* über den Proxy leiten könnt — dadurch die
datensouveränere Variante ist: Browser zu Anbieter, kein Dritter dazwischen.
Ein Zufallsgewinn, den der Bericht als reine Notlösung darstellt.

#### 🔴 B2: Keine Löschfunktion in der App

`grep -n "removeItem\|localStorage.clear\|Daten löschen"` in `web/index.html`
→ **kein Treffer**.

Die Datenschutzerklärung verweist für Löschung auf „die Website-Daten deines
Browsers für diese Seite löschen". Für dich und mich ist das trivial. Für die
nicht-technische Verwandtschaft, an die der Link jetzt geht, ist es eine
Zumutung — und praktisch bedeutet es, dass die Zugangsdaten der Kinder auf dem
Gerät bleiben, bis jemand aktiv in den Browsereinstellungen gräbt.

Ein Knopf „Alle Daten auf diesem Gerät löschen" im Setup ist zehn Zeilen und
macht aus einem theoretischen Betroffenenrecht ein tatsächliches. Aus
Datensparsamkeitssicht ist das kein Nice-to-have.

#### 🟡 B3: Rechtliche Rolle ändert sich mit der Ausweitung — beide Berichte übergehen das

Kein Rechtsrat, ich bin kein Anwalt — aber der Punkt gehört in den Artikel:

Solange „Heute Schule" nur die eigene Familie bedient, greift plausibel die
**Haushaltsausnahme (Art. 2 Abs. 2 lit. c DSGVO)** für ausschließlich
persönliche oder familiäre Tätigkeiten. Sobald der Link an befreundete Familien
geht — genau der jetzt eingeschlagene Weg — fällt diese Ausnahme weg, und
Björn wird zum vollen Verantwortlichen für personenbezogene Daten *fremder
Kinder*. Damit kommen Pflichten dazu, die eine bloße Datenschutzerklärung nicht
abdeckt (u. a. Verzeichnis von Verarbeitungstätigkeiten, technische und
organisatorische Maßnahmen nach Art. 32).

Dein Bericht bewertet „Recht & Compliance 🟢" — für den Stand *vorher* zu Recht.
Für den Stand, auf den das Projekt gerade zusteuert, ist das zu früh vergeben.
Mindestens ein Hinweis „vor der Ausweitung juristisch gegenprüfen lassen"
gehört rein. Und die Aussage in der Datenschutzerklärung, es sei ein AVV mit
Cloudflare geschlossen, sollte jemand tatsächlich verifizieren `[ungeprüft]` —
in einem Rechtstext eine unbelegte Behauptung stehen zu haben, wäre unnötig
riskant.

#### 🟢 B4: Transparenz — gelöst, wie man es sich wünscht

Kein obfuskierter Code, keine Minifizierung, lesbare deutsche Kommentare, MIT-
Lizenz, und eine Datenschutzerklärung, die drei verschiedene Datenpfade
tatsächlich auseinanderhält statt sie in einem Textbaustein zu verstecken. Das
ist ehrlicher als 95 % dessen, was ich beruflich zu sehen bekomme. Verdient im
Artikel mehr als einen Nebensatz.

### C — Familienvater-/Alltagsblick

#### 🟡 C1: Geteiltes Familien-Tablet ist das realistische Bedrohungsszenario

Dein Threat-Model-Fokus liegt auf Fremden von außen. Das realistische Szenario
ist ein anderes: **Das Familien-Tablet liegt herum.** Die Zugangsdaten stehen
im Klartext in localStorage (das benennt ihr korrekt), aber die praktische
Konsequenz benennt niemand — das Kind, dessen Stundenplan gefiltert wird, kann
mit zwei Klicks in den Entwicklertools das WebUntis-Passwort der Eltern
auslesen. Nicht theoretisch: Genau diese Kinder sind Zielgruppe des
🚫-Ausblende-Features und damit vor dem Gerät.

Schaden bleibt begrenzt (Stundenplan lesen, Essen sehen — nichts bestellbar,
kein Geld). Aber wenn dasselbe Passwort woanders wiederverwendet wird, wird es
schnell größer. Der Hinweis „nutzt für WebUntis kein Passwort, das ihr sonst
noch verwendet" wäre im Setup besser aufgehoben als in der README.

#### 🟢 C2: Altes Tablet — Entwarnung, und das kann man belegen

Ich hab den Quelltext auf moderne Syntax abgeklopft: **keine** Arrow Functions,
**kein** `async`/`await`, **kein** optional chaining, **kein** `CSS.escape`,
**kein** `structuredClone`. Einziges neueres Feature: ein `.finally()` (ES2018).
Der Code ist durchgehend in ES5-Stil geschrieben.

Heißt: läuft auf so ziemlich allem, was seit 2018 ein Update gesehen hat. Für
ein Projekt, das explizit an technisch gemischte Familien geht, ist das genau
richtig — und offensichtlich eine bewusste Entscheidung, keine Nachlässigkeit.
Bei ~48 KB Gesamtgewicht und Antwortzeiten unter 100 ms ist auch schlechtes
Netz kein Thema.

#### 🟡 C3: Der stille CSP-Fehlschlag trifft genau die Falschen

Deinen eigenen Befund (Failed to fetch bei fremder ccCampus-Domain) stufst du
🟡 ein. Ich würde ihn höher hängen, weil er *ausschließlich* neue Familien
trifft — also Menschen, die noch kein Vertrauen in die App haben und beim
ersten Fehlversuch abspringen. Für die ist „Fehler beim Abrufen" nicht
debugbar. Der erste Eindruck ist genau der, den man nicht verstolpern will.

### D — Nerd-Detailblick

#### 🟢 D1: Der Spezifitätsbug, der dokumentiert wurde

`theme.css` erklärt in einem Kommentar, warum dort `body.textseite a.uebersicht-btn`
steht und nicht das naheliegende `.uebersicht-btn` — inklusive der Einsicht,
dass `body.textseite a` zwei Typselektoren mitbringt und deswegen spezifischer
ist, als es aussieht. Dass jemand den eigenen Fehlschlag als Warnschild für den
nächsten Leser stehen lässt, statt ihn wegzuputzen, ist gute Ingenieurskultur.

#### 🟡 D2: Die tote `decodeHtmlEntities`-Zwillingsfunktion lebt noch

Die ccCampus-Zweitimplementierung im Worker ist raus — richtig so. Aber
`decodeHtmlEntities()` samt Entity-Tabelle existiert weiterhin *doppelt*: einmal
in `proxy/worker.js` (für Mensamax) und einmal als `decodeHtmlEntitiesClient()`
in `web/index.html` (für ccCampus). Gleiches Problem, das du beim ccCampus-Code
zu Recht angeprangert hast, nur eine Ebene tiefer und deshalb übersehen. Hier
ist es allerdings *begründbar* — Worker und Browser teilen keinen Code —, es
sollte nur im Bericht stehen statt unerwähnt zu bleiben.

#### 🟢 D3: `resolveDatum()` ist die eleganteste Stelle im Projekt

Client-Datum zuerst, `Europe/Berlin` über `Intl.DateTimeFormat` als Fallback,
mit Kommentar, warum UTC im Worker die falsche Antwort gibt. Das ist der
Zeitzonenfehler, den ich beruflich am häufigsten *nicht* gelöst sehe. Ein Lob
im Artikel wäre verdient — Testberichte listen zu selten, was jemand richtig
gemacht hat.

---

## 5. Gewichtungs-Feedback

### Wo ich dir widerspreche

| Kategorie | Deine Ampel | Meine | Begründung |
|---|---|---|---|
| **Security** | 🟢 | 🔴 | A1 allein kippt das. Ein System, aus dem ich ohne Passwort Nutzdaten ziehen kann, ist nicht grün — auch nicht mit perfekter SSRF-Abwehr. Nach dem Cache-Key-Fix und einem Rate-Limit: 🟢 gerechtfertigt |
| **Recht & Compliance** | 🟢 | 🟡 | Nicht wegen eines Fehlers im Bestehenden, sondern weil die Haushaltsausnahme mit der Ausweitung wegfällt (B3) und das nirgends adressiert ist |
| **Code-Qualität** | 🟢 | 🟡 | 73 grüne Tests sind stark, aber sie laufen in keinem Gate (A4), und der Cache-Key-Fehler ist ein Logikfehler, den keiner der Tests abdeckt — Tests prüfen `hostcheck`, nicht `buildCacheKey` |
| **CSP-Falle** | 🟡 | 🟡→🔴 | Grenzfall. Trifft ausschließlich Neuzugänge und ist für sie undebugbar (C3) |

### Wo ich dir ausdrücklich zustimme

- **Dunkelmodus-Kontrast 🔴** — korrekt gewichtet, korrekt gemessen, und die
  Selbstauskunft „das war meine Lücke in Runde 1" ist genau richtig. Ich habe
  2,44:1 unabhängig nachgerechnet.
- **Barrierefreiheit 🟡 statt 🟢** — richtig, trotz der wirklich vollständigen
  Abarbeitung der alten Befunde. Ein AA-Verstoß auf dem Speichern-Knopf ist
  kein 🟢.
- **Performance 🟢 mit Einschränkung** — die Offenlegung, dass ohne Lighthouse
  keine echten Web Vitals vorliegen, statt einfach „schnell" zu behaupten:
  vorbildlich.
- **SEO 🟢** — Soft-404 sauber gelöst, und `Disallow: /` als *dokumentierte
  Entscheidung* mit Begründung (Impressum mit Privatanschrift nicht
  indexieren) statt als Versehen. Genau so.
- **Die Wochenend-Beobachtung 🟢** — stimmt, ist Kleinkram, und du stufst sie
  als Kleinkram ein. Kein Aufblasen für die Befundliste. Angenehm.

---

## 6. Fazit

**Zur Website:** Das ist das ungewöhnliche Exemplar einer privaten Web-App, die
in fast jeder Hinsicht sorgfältiger gebaut ist als kommerzielle Konkurrenz —
null Abhängigkeiten, null Tracker, offener Code, ehrliche Rechtstexte, ES5 für
alte Geräte. Und ausgerechnet an der Stelle, wo alle Vorsicht zusammenlaufen
müsste — Zugangsdaten fremder Kinder —, hat sie zwei ungelöste Probleme: einen
Cache, der Authentifizierung aushebelt, und eine Architektur, die einer
Privatperson plus einem US-Konzern Klartext-Passwörter anvertraut, ohne dass
die betroffenen Familien das in seiner Tragweite erfahren. Das erste ist ein
Bug und in einer halben Stunde weg. Das zweite ist eine Designentscheidung, die
man nicht wegprogrammieren, sondern nur offenlegen kann — und genau das sollte
vor dem Verteilen weiterer Links passieren.

**Zum Artikel:** Recherchetiefe und Belegdichte sind deutlich über dem, was in
der Kategorie üblich ist — fast jede Behauptung ist mit einem selbst erhobenen
Messwert oder einer Codestelle unterlegt, und die Prüflücken stehen offen im
Text statt kaschiert zu werden. Die Selbstkorrektur zum Kontrastfehler hebt ihn
nochmal. Zwei echte Schwächen: Du prüfst gründlich, *was da ist*, aber zu
selten, *was fehlt* (Löschfunktion, Rate-Limit, Verantwortlichkeitswechsel bei
Ausweitung sind alle nicht vorgekommen) — und einmal hast du eine Designbegründung
aus dem Quellcode übernommen, statt sie zu testen, was dich A1 gekostet hat.
Das ist die Lehre für Runde 3: Ein Kommentar, der erklärt, warum etwas sicher
ist, ist eine Behauptung des Entwicklers, keine Prüfung. Mit den Korrekturen
aus Abschnitt 3 und 5 ist das eine abgabefertige, gute Arbeit.

---

*Peer-Review erstellt am 27.08.2026. Alle mit ✅/❌ markierten Aussagen wurden
eigenständig gegen die Live-Umgebung bzw. den Quellcode geprüft; mit
`[ungeprüft]` markierte Punkte konnten mangels Zugriff nicht verifiziert werden.
Rechtliche Einordnungen sind Laienhinweise und ersetzen keine anwaltliche
Prüfung.*
