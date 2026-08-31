# Kritische Website-Analyse „Heute Schule" — Runde 2

**Prüfgegenstand:** https://heute-schule.pages.dev · Version 0.1.1 (Beta)
**Proxy:** https://stundenplan-proxy.bluedemann.workers.dev
**Datum:** 27.08.2026
**Vergleichsbasis:** Runde 1 vom selben Tag (Version 0.1.0), vor Umsetzung der
Handlungsempfehlungen.

---

## Zugriffs-Einschränkungen (offengelegt statt geraten)

- Kein Lighthouse/PageSpeed/axe-core-Scan verfügbar → Performance- und
  Barrierefreiheitsaussagen beruhen auf manueller HTTP-Header-, DOM- und
  CSS-Prüfung sowie eigenen Kontrastberechnungen im Browser, **nicht** auf
  automatisierten Werkzeugen. Echte Core Web Vitals (LCP/CLS/INP) sind
  unbekannt.
- Kein Screenreader-Realtest (VoiceOver/NVDA) — nur Accessibility-Tree- und
  DOM-Inspektion.
- Kein aktiver Penetrationstest. Die SSRF-Prüfungen unten waren gezielte,
  harmlose Negativtests gegen die eigene Infrastruktur (interne IP, fremde
  Domain, Suffix-Trick), kein Angriffsversuch gegen Dritte.
- Kein Test mit echten Zugangsdaten in dieser Runde → die Datenpfade
  „Stundenplan wird korrekt angezeigt" und „Schulessen-Status stimmt" sind
  **nicht** neu verifiziert. Aussagen dazu stammen aus dem laufenden Betrieb,
  nicht aus dieser Prüfung.
- `npm audit`/CVE-Scan entfällt mangels Abhängigkeiten (kein
  `package.json`, keine externen Bibliotheken) — das ist selbst ein Befund,
  kein Prüflücken-Problem.

---

## 1. Kurzfazit

Alle 10 Befunde aus Runde 1 sind umgesetzt und live verifiziert — das ist eine
ungewöhnlich vollständige Abarbeitung, inklusive der unbequemen Punkte
(SSRF-Härtung mit Testabdeckung, echte 404-Seite, Formular-Labels). Die
Sicherheitslage hat sich am deutlichsten verbessert: Der Proxy weist
Angriffsvarianten jetzt sauber ab, CORS ist eingegrenzt, die Security-Header
sind vollständig. Dafür fördert diese Runde zwei Dinge zutage, die in Runde 1
durchgerutscht sind: ein **klarer Kontrastfehler im Dunkelmodus** (weiße
Schrift auf Akzentgrün, 2,44:1 statt geforderter 4,5:1) und eine **selbst
eingebaute Falle** — die neue CSP blockiert ccCampus-Instanzen außerhalb von
`*.mbs5online.de` stillschweigend, was genau dann zuschlägt, wenn weitere
Familien mit anderer Portal-Domain dazukommen sollen. Beides ist klein zu
beheben, beides gehört vor dem Verteilen weiterer Links erledigt.

---

## 2. Bewertungstabelle

| Kategorie | Runde 1 | Runde 2 | Kernaussage |
|---|---|---|---|
| Zweck & Nutzen | 🟢 | 🟢 | Unverändert klar umrissen; Ausweitung auf weitere Familien ist konzeptionell gedeckt. |
| Usability/UX | 🟡 | 🟢 | Das strukturelle Bugmuster ist behoben, nicht nur der Einzelfall. |
| Barrierefreiheit | 🔴 | 🟡 | Alle Runde-1-Befunde behoben — dafür ein neuer, klarer AA-Verstoß im Dunkelmodus. |
| Security | 🔴 | 🟢 | SSRF-Abwehr live verifiziert, CORS eingegrenzt, Header vollständig. |
| Recht & Compliance | 🟢 | 🟢 | Unverändert solide; ein Hinweis zur „Demo"-Formulierung bei wachsendem Nutzerkreis. |
| Design | 🟡 | 🟡 | Eine gemeinsame Quelle statt vier — dabei aber ein Spezifitätsproblem sichtbar geworden. |
| Code-Qualität | 🟡 | 🟢 | Toter Code raus, Sicherheitslogik testbar ausgelagert, 73 Tests grün. |
| Performance | 🟢 | 🟢 | ~48 KB App-Shell, keine externen Requests, Antwortzeiten < 100 ms. |
| SEO | 🟡 | 🟢 | Soft-404 beseitigt; Nicht-Indexierung ist jetzt eine bewusste, dokumentierte Entscheidung. |
| Content-Qualität | 🟢 | 🟢 | Präzisierung bei „verschlüsselt" war überfällig und ist erfolgt. |

---

## 3. Detailbefunde

### 3.1 Verifiziert behoben (Runde-1-Befunde)

Alle Prüfungen gegen die **Live-Umgebung**, nicht gegen den lokalen Stand.

| # | Befund aus Runde 1 | Beleg Runde 2 |
|---|---|---|
| 1 | SSRF/Open-Relay im Worker | Drei Negativtests: `127.0.0.1` → *„zeigt auf ein internes/lokales Ziel"*; `angreifer.example` → *„muss auf \".webuntis.com\" enden"*; `webuntis.com.angreifer.example` (Suffix-Trick) → ebenfalls abgewiesen |
| 2 | `role="button"` auf `<h1>` | `h1_role: null`, `h1_tag: "H1"`, Button jetzt **in** der Überschrift, kein `title`-Attribut mehr → kein Label-in-Name-Konflikt |
| 3 | 0/15 Formularfelder mit Label verknüpft | `labelsWithFor: 14`, `inputsOhneZuordnung: []` — alle 15 Felder zugeordnet (14 per `for`, 1 per `aria-label`) |
| 4 | Fehlende Security-Header | Live gesetzt: `content-security-policy`, `strict-transport-security: max-age=31536000; includeSubDomains`, `x-frame-options: DENY`, `permissions-policy`, dazu die bereits vorhandenen `nosniff`/`referrer-policy` |
| 5 | Soft-404 (`robots.txt`/`sitemap.xml` lieferten HTTP 200 + index.html) | `/robots.txt` → HTTP 200 `text/plain`; `/sitemap.xml` → **HTTP 404**; `/gibtesnicht-xyz123` → **HTTP 404** |
| 6 | Touch-Targets < 24×24 px | `min-width/min-height:24px` live im CSS für `.hide-fach` und `.chip-x`; „Entfernen"-Button im Browser gemessen: 24 px hoch |
| 7 | Vierfach duplizierte `:root`-Variablen | `theme.css` (3.965 B) wird von allen vier Seiten geladen; nur noch ein bewusster Ein-Zeilen-Override (`--seitenbreite`) in `datenschutz.html` |
| 8 | Toter ccCampus-Referenzcode im Worker | Entfernt; verifizierter Ablauf jetzt in `proxy/README.md` dokumentiert |
| 9 | Keine Tests für den Web-/Proxy-Code | 73 Tests grün, davon 25 neu für die Ziel-Host-Validierung (`proxy/hostcheck.mjs`) |
| 10 | Wiederkehrendes „leere Karten"-Bugmuster | `showDashboard()` lädt strukturell immer mit; die drei handkopierten Aufrufstellen sind weg |

**Zusätzlich zu Runde 1 umgesetzt:**

- `ALLOWED_ORIGIN` von `*` auf `https://heute-schule.pages.dev` eingegrenzt
  (live bestätigt) — war ein alter offener Punkt im Projekt, kein Befund aus
  Runde 1.
- Hellmodus-Kontrast `--muted`: von 4,76:1 auf **5,69:1** verbessert (gemessen).
- Service Worker auf v3, `theme.css` in der Shell aufgenommen.
- Landmarks/ARIA: `aria-label` auf beiden `<section>`, `aria-pressed` auf dem
  Tag-Umschalter, `aria-live="polite"` + `aria-busy` auf den nachladenden
  Karten (alle live bestätigt).

---

### 3.2 Neue Befunde

#### 🔴 Kontrast im Dunkelmodus: weiße Schrift auf Akzentgrün — 2,44:1

**Das ist der wichtigste Befund dieser Runde, und er stammt aus meiner eigenen
Lücke in Runde 1**: Dort hatte ich nur die Paare `--muted`/`--bg` und
`--warn`/`--warn-bg` durchgerechnet und daraus vorschnell „Kontrast in Ordnung"
abgeleitet — die Kombination Weiß auf `--accent` habe ich schlicht nicht
geprüft.

Im Dunkelmodus ist `--accent` das helle `#5fb787`. Weiße Schrift darauf ergibt
**2,44:1**. WCAG 2.1 AA (SC 1.4.3) verlangt 4,5:1 für normalen Text. Betroffen,
jeweils im Browser gemessen:

| Element | Schriftgröße | Kontrast (dunkel) | Kontrast (hell) |
|---|---|---|---|
| `.btn-primary` „Speichern & anzeigen" | 15,2 px | **2,44:1** ❌ | 5,99:1 ✓ |
| `.tag-btn.active` (Tagesauswahl) | 14,1 px | **2,44:1** ❌ | 5,99:1 ✓ |
| `a.uebersicht-btn` (auf allen 4 Textseiten) | 13,1 px | **2,44:1** ❌ | 5,99:1 ✓ |

Der Hellmodus ist durchgängig unauffällig (5,69–5,99:1). Es handelt sich also
um einen reinen Dunkelmodus-Fehler — der aber die drei prominentesten
Bedienelemente der App trifft, darunter den zentralen Speichern-Knopf. Da der
Dunkelmodus auf Mobilgeräten häufig systemweit aktiv ist, ist die praktische
Betroffenheit hoch, nicht theoretisch.

**Behebung:** entweder im Dunkelmodus dunkle Schrift auf dem hellen Akzent
verwenden (nachgerechnet: `#141815` auf `#5fb787` ergibt **7,35:1**,
`#1c231f` ergibt 6,57:1 — beide deutlich über der Anforderung) oder eine eigene
Token-Variable für „Text auf Akzentfläche" einführen, die je Modus passend
gesetzt wird. Zweiteres ist sauberer, weil es die Regel an einer Stelle
festhält, statt sie über die Komponenten zu verteilen.

#### 🟡 CSP blockiert ccCampus-Instanzen außerhalb von `*.mbs5online.de` — stillschweigend

**Selbst eingebaut, und ausgerechnet gegen das erklärte Ziel gerichtet, weitere
Familien einzubinden.** Die neue CSP enthält:

```
connect-src 'self' https://stundenplan-proxy.bluedemann.workers.dev https://*.mbs5online.de
```

Die ccCampus-Basis-URL ist im Setup aber **frei editierbar** (Feld
`lunch.cccampus.base`, Platzhalter `https://cccampus.mbs5online.de/ordering`).
Eine Familie mit ccCampus-Instanz unter einer anderen Domain wird von der CSP
blockiert. Im Browser getestet:

```js
fetch('https://cccampus.example.org/ordering/Login/Login', {method:'POST'})
// → TypeError: "Failed to fetch"
```

Für die Nutzerin ist das nicht von einem Netzwerkausfall zu unterscheiden —
die Karte zeigt „Fehler beim Abrufen", nirgends steht, dass die Seite selbst
die Verbindung unterbunden hat. Bei Mensamax besteht das Problem **nicht**,
weil dessen Anfragen über den Proxy laufen und der ohnehin in `connect-src`
steht.

Drei mögliche Wege, in absteigender Sauberkeit:

1. Die Basis-URL im Frontend gegen dieselbe Allowlist prüfen und **im Setup**
   eine verständliche Meldung zeigen („Diese ccCampus-Adresse ist noch nicht
   freigeschaltet — bitte melden") statt es erst beim Abruf scheitern zu lassen.
2. `connect-src` um weitere bekannte ccCampus-Domains erweitern, sobald sie
   auftauchen (funktioniert, skaliert aber schlecht und braucht je Familie
   einen Deploy).
3. Feld auf die unterstützte Domain festnageln und nicht mehr editierbar
   machen, solange nur eine Instanz bekannt ist — ehrlicher als ein Feld, das
   Freiheit vortäuscht, die die CSP nicht hergibt.

#### 🟡 `.hide-fach` mit `opacity:.35` — schwacher Nicht-Text-Kontrast

Der 🚫-Knopf an jeder Stunde ist mit `opacity:.35` bewusst zurückgenommen. Die
Klickfläche ist jetzt korrekt 24×24 px (Runde-1-Befund behoben), die
*Sichtbarkeit* bleibt aber gering. WCAG 1.4.11 (Nicht-Text-Kontrast, AA)
verlangt 3:1 für Bedienelemente. Bei 35 % Deckkraft ist das für die meisten
Vorder-/Hintergrundkombinationen nicht erreichbar. Da es sich um ein Emoji und
nicht um Text handelt, ist die Norm-Anwendung diskutabel — die Auffindbarkeit
für Nutzerinnen mit eingeschränktem Sehvermögen ist es nicht. Empfehlung:
Deckkraft auf ~0,6 anheben, beim Hover/Fokus auf 1.

#### 🟡 Rechtstexte fehlen im Offline-Cache

`SHELL` im Service Worker umfasst `./`, `./index.html`, `./theme.css`,
`./manifest.webmanifest`, `./icon.svg` — **nicht** Impressum, Datenschutz und
Über. Diese Seiten werden zwar nach dem ersten Besuch beiläufig
mitgecacht (Network-first mit Cache-Ablage), sind aber offline nicht
erreichbar, solange sie nie geöffnet wurden. Bei Seiten mit gesetzlicher
Vorhaltepflicht ist das unschön, wenn auch praktisch selten relevant
(offline + nie besucht). Aufwand: drei Einträge in einem Array.

#### 🟢 Wochenendtage im Tagesumschalter

Der gleitende Zwei-Tage-Umschalter bot zum Prüfzeitpunkt (Do, 27.08.) „Fr 28.8."
und **„Sa 29.8."** an. Für einen Schulstundenplan ist ein Samstag in aller Regel
eine garantierte Leermeldung. Kein Fehler, aber eine verschenkte von drei
Schaltflächen. Wochenenden zu überspringen wäre eine kleine, spürbare
Verbesserung — falls keine Schule im Umfeld Samstagsunterricht hat, was vor der
Umsetzung kurz zu klären wäre.

#### 🟢 Ein Redirect-Hop bei jedem internen Link

Interne Verweise zeigen auf `impressum.html`, Cloudflare Pages leitet per
HTTP 308 auf `/impressum` um — ein zusätzlicher Roundtrip pro Navigation
(gemessen: 1 Hop, Gesamtzeit weiterhin < 90 ms). Die Endung beizubehalten ist
allerdings bewusst vertretbar, weil das lokale Testen per
`python3 -m http.server` genau diese Dateinamen braucht. Kosten und Nutzen
liegen hier dicht beieinander; Nichtstun ist eine legitime Entscheidung.

#### 🟢 „Demo-Website" bei wachsendem Nutzerkreis

Auf allen Seiten steht weiterhin: *„Dies ist eine Demo-Website. Sie kann
jederzeit geändert oder abgeschaltet werden."* Das ist haftungsseitig klug und
ehrlich. Mit der Ausweitung auf weitere Familien entsteht aber eine leichte
Spannung: Menschen geben echte Zugangsdaten ihrer Kinder in etwas ein, das sich
selbst als Demo bezeichnet. Kein Rechtsmangel, aber es lohnt die bewusste
Entscheidung, ob die Formulierung so bleiben soll oder zu etwas wie
„privates Projekt, keine Verfügbarkeitsgarantie" wechselt — inhaltlich
dasselbe Versprechen, aber weniger nach Wegwerf-Prototyp klingend.

---

## 4. Priorisierte Handlungsempfehlungen

| # | Maßnahme | Risiko | Aufwand |
|---|---|---|---|
| 1 | **Dunkelmodus-Kontrast beheben** — eigenes Token für „Text auf Akzentfläche", im Dunkelmodus dunkel statt weiß. Betrifft Speichern-Knopf, Tagesauswahl, Übersicht-Pille. | hoch | gering |
| 2 | **ccCampus/CSP-Falle entschärfen** — Basis-URL im Setup gegen die Allowlist prüfen und verständlich melden, statt später an „Failed to fetch" zu scheitern. Vor dem Verteilen weiterer Links erledigen. | mittel–hoch (blockiert genau das Wachstumsziel) | gering–mittel |
| 3 | **`.hide-fach`-Deckkraft** von 0,35 auf ~0,6 anheben, Hover/Fokus auf 1. | gering–mittel | sehr gering |
| 4 | **Rechtstexte in den SW-Cache** aufnehmen (drei Array-Einträge). | gering | sehr gering |
| 5 | **Wochenenden im Tagesumschalter überspringen** — vorher kurz prüfen, ob Samstagsunterricht vorkommt. | gering | gering–mittel |

---

## 5. Gesamturteil

Zwischen Runde 1 und Runde 2 liegt der Unterschied zwischen „funktioniert für
uns" und „kann man guten Gewissens weitergeben". Die Sicherheitsbefunde sind
nicht nur behoben, sondern nachweisbar behoben: Der Proxy weist alle drei
getesteten Angriffsvarianten mit klaren Meldungen ab, CORS ist eingegrenzt, die
Header-Lage ist vollständig, und — für die Nachhaltigkeit am wichtigsten — die
Validierungslogik liegt in einer eigenen, mit 25 Tests abgedeckten Datei statt
irgendwo im Worker verstreut. Auch die Barrierefreiheitsarbeit war gründlich
und ging über das Gerügte hinaus.

Genau deshalb sticht der Dunkelmodus-Kontrast so hervor: Er ist kein Rest aus
der Altlast, sondern eine Lücke der ersten Prüfung, die eine Runde lang
unentdeckt blieb — ein gutes Argument dafür, Kontrastprüfungen nicht selektiv
per Hand, sondern in beiden Farbschemata systematisch über alle
Vordergrund-/Hintergrundpaare laufen zu lassen. Und die CSP-Falle ist die
klassische Nebenwirkung einer gut gemeinten Härtung: Sie schützt zuverlässig,
aber sie schweigt, wenn sie zuschlägt — was genau die nächste Familie treffen
würde, die dazukommen soll.

Beide Punkte sind eine Stunde Arbeit. Danach ist dies ein Projekt, dessen
Sorgfaltsniveau man in dieser Größenklasse selten sieht.

---

*Erstellt von Claude (Sonnet 5) im Rahmen einer c't-Stil-Analyse auf Anforderung
des Betreibers. Alle Messwerte stammen aus Live-Prüfungen vom 27.08.2026 gegen
die Produktivumgebung. Diese Analyse ersetzt weder einen Penetrationstest noch
eine anwaltliche Prüfung.*
