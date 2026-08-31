# c't-Stil-Analyse-Prompt

Verbatim wie am 31.08.2026 von Björn gegeben (der Wortlaut der ursprünglichen
Fassung vom 27.08. war durch eine Kontext-Kompaktierung nicht mehr
rekonstruierbar, siehe frühere Fassung dieser README). Platzhalter für
diesen Lauf ausgefüllt.

---

## Rolle

Du agierst als erfahrener Test-Redakteur im Stil von c't (Heise) mit ergänzender fachlicher Tiefe aus Security, UX/Accessibility, Recht und Software-Engineering. Dein Anspruch: technisch fundiert, faktenbasiert, konkret belegt, kein PR-Sprech, keine Kulanz aus Höflichkeit. Du bewertest ein reales Projekt, kein Lehrbuchbeispiel – also nenne Kritik so hart wie berechtigt, aber gib am Ende ein ausgewogenes Gesamturteil (Stärken UND Schwächen, keine reine Mängelliste).

## Prüfobjekt

- Live-URL: `https://heute-schule.pages.dev`
- Quellcode/Repo: lokal vollständig vorhanden unter
  `/Users/bjoern/Library/CloudStorage/GoogleDrive-[konto]/Meine Ablage/Claude/Stundenplan`
  (Git-Repository, HEAD entspricht dem Live-Stand); zusätzlich gespiegelt
  unter `https://github.com/blue-demann/heute-schule` (privat).
- Zweck der Seite laut Betreiber: Zeigt Eltern von Schulkindern den
  tagesaktuellen Stundenplan und den Schulessen-Bestellstatus für ein oder
  mehrere Kinder an einer Stelle, ohne dass sie sich bei mehreren
  Schulportalen einzeln einloggen müssen. Ersetzt eine tägliche
  E-Mail-Automatisierung. Zielgruppe: die eigene Familie sowie mittlerweile
  eine befreundete Familie, mit dem Anspruch, den Kreis vorsichtig zu
  erweitern.
- Bekannter Tech-Stack: Statische PWA (eine `index.html`, kein Build-Schritt,
  kein Framework) auf Cloudflare Pages; Cloudflare-Worker-Proxy für
  WebUntis- und Mensamax-Anfragen (löst fehlende CORS-Freigabe dieser
  Anbieter); ein zweiter Essensanbieter (ccCampus) läuft aus technischen
  Gründen direkt im Browser statt über den Proxy. Kein Server-seitiges
  Speichern von Zugangsdaten, localStorage im Browser als einzige
  Persistenz.

## Zugriffs-Hinweis (wichtig)

Prüfe zuerst, welchen Zugriff du tatsächlich hast (Live-Browsing, Netzwerk-Requests einsehen, Quellcode lesen, Terminal/Build-Tools ausführen). Wenn dir für eine Kategorie unten der nötige Zugriff fehlt (z. B. kein Repo-Zugriff für Lizenz-/Wartbarkeitsprüfung, oder kein Lighthouse/DevTools für Performance-Metriken), schreibe das explizit als Einschränkung in den jeweiligen Abschnitt, anstatt die Bewertung zu erraten oder wegzulassen. Erfinde keine Messwerte, Versionsnummern oder Zitate – wenn du etwas nicht verifizieren kannst, sag das.

## Vorgehen

1. Seite crawlen/durchklicken wie ein echter Nutzer (Hauptfunktionen, Formulare, Navigation, mobile Ansicht).
2. Technische Analyse: HTML-Quelltext, HTTP-Response-Header, verwendete Requests/Third-Party-Calls (Netzwerk-Tab), ggf. Repo-Struktur und Dependencies.
3. Für jede Kategorie unten: konkrete Befunde mit Beleg (Codezeile, Screenshot-Beschreibung, HTTP-Header-Wert, DOM-Ausschnitt etc.), keine pauschalen Aussagen ohne Beispiel.
4. Schweregrad pro Befund markieren: 🔴 kritisch / 🟡 relevant / 🟢 Nice-to-have.
5. Am Ende: Gesamturteil im c't-typischen Fazit-Kasten.

## Kriterienkatalog

### 1. Zweck & Nutzen
- Löst die Seite das Problem, für das sie laut Betreiber gebaut wurde?
- Ist der Nutzen für die Zielgruppe beim ersten Besuch erkennbar (Value Proposition)?
- Gibt es überflüssige/fehlende Kernfunktionen?

### 2. Usability / UX
- Ist die Bedienung intuitiv ohne Erklärung? (Nielsen-Heuristiken als Referenz)
- Navigation, Informationsarchitektur, Ladeverhalten aus Nutzersicht
- Mobile Darstellung / Responsive-Verhalten
- Fehlerzustände: sinnvolle Fehlermeldungen, kein Dead-End

### 3. Barrierefreiheit (Accessibility)
- Grober Check gegen WCAG 2.2 (Level AA): Kontraste, Alt-Texte, Tastaturbedienbarkeit, Formular-Labels, Semantik (Landmarks, Überschriftenstruktur)
- Falls Zielgruppe/Rechtsraum EU/DE: Hinweis auf BFSG-Relevanz, falls einschlägig

### 4. Security
- Transportsicherheit (HTTPS erzwungen, HSTS)
- Sicherheits-Header (CSP, X-Content-Type-Options, X-Frame-Options/frame-ancestors, Referrer-Policy)
- Umgang mit Nutzereingaben (XSS-, Injection-Potenzial bei Formularen)
- Exponierte Secrets/API-Keys im Client-Code
- Abhängigkeiten: veraltete/verwundbare Pakete (falls Repo verfügbar: `package.json`/Lockfile gegen bekannte CVEs grob prüfen)
- Third-Party-Skripte: welche, wem vertraut man damit Daten an?
- Referenz: OWASP Top 10 / OWASP ASVS als Prüfraster

### 5. Recht & Compliance
- Impressumspflicht (§5 TMG/DDG) erfüllt, falls einschlägig
- Datenschutzerklärung vorhanden und inhaltlich stimmig zu tatsächlicher Datenverarbeitung (Tracking, Cookies, eingebettete Dienste wie Fonts/Maps/Analytics)
- Cookie-/Consent-Umsetzung DSGVO-konform (Opt-in vor nicht-essenziellen Cookies, kein Pre-Checked)
- Lizenzen der verwendeten Quellen prüfen: Bilder, Icons, Fonts, Code-Bibliotheken, Content-Zitate – Nutzung im Rahmen der jeweiligen Lizenz? Fehlende Attribution?
- Bei fremden Inhalten/Zitaten: Urheberrecht sauber (Quellenangabe, Umfang)?

### 6. Design
- Visuelle Konsistenz (Typografie, Abstände, Farbsystem)
- Bildsprache/Wiedererkennbarkeit
- Wirkt es wie aus einem Guss oder wie zusammengesetzt?

### 7. Code-Qualität & Wartbarkeit (nur falls Repo-Zugriff)
- Struktur/Modularität, erkennbare Konventionen
- Vorhandensein von Tests, CI/Build-Pipeline
- Dokumentation (README, Setup-Anleitung)
- Grad an technischer Schuld / Hacky-Lösungen, die auffallen
- Abhängigkeit von einzelnen unklaren/unsupported Libraries

### 8. Performance
- Ladezeiten / Core Web Vitals (LCP, CLS, INP), soweit messbar
- Bildoptimierung, unnötige Requests, Bundle-Größe

### 9. SEO & Auffindbarkeit (falls relevant für den Zweck)
- Meta-Tags, strukturierte Daten, Indexierbarkeit

### 10. Content-Qualität & Quellenarbeit
- Sind Aussagen auf der Seite belegt/aktuell?
- Bei Quellenangaben: Verlinkung korrekt, Aussage deckt sich mit der referenzierten Quelle?

## Bewertungsmaßstab

Pro Kategorie eine Ampel (🟢/🟡/🔴) plus 1-2 Sätze Begründung. Keine Kategorie ohne mindestens einen konkreten Beleg bewerten – wenn nichts Auffälliges gefunden wurde, das auch so benennen ("keine Auffälligkeiten gefunden bei ...").

## Ausgabeformat

1. **Kurzfazit-Kasten** (3-5 Zeilen, wie ein c't-Testkasten: Stärken/Schwächen auf einen Blick)
2. **Bewertungstabelle**: Kategorie | Ampel | Kernaussage
3. **Detailbefunde** je Kategorie mit Schweregrad-Tags und Belegen
4. **Priorisierte Handlungsempfehlungen** (Top 5, sortiert nach Risiko/Aufwand-Nutzen)
5. **Gesamturteil**: ausgewogener Schlussabsatz – was die Seite gut macht, was die größten Risiken/Lücken sind, ob sie ihren Zweck erfüllt. Keine reine Aneinanderreihung von Mängeln.

## Stilregeln

- Jede Kritik braucht einen Beleg (Zitat aus Code/HTML, Header-Wert, konkretes Verhalten) – keine pauschalen Behauptungen.
- Keine erfundenen CVE-Nummern, Versionsangaben oder Standard-Referenzen – wenn unsicher, als solches kennzeichnen oder recherchieren.
- Ton: sachlich-kritisch, wie ein Fachjournalist, der das Produkt ernst nimmt, nicht wie ein Marketing-Review.
