# Offene Punkte

**Stand: 01.09.2026.** Frühere Fassung dieser Datei entstand direkt nach der
zweiten QA-Runde und dem Peer-Review (27.08.2026) und listete 8 Befunde als
offen. Seither wurden alle bis auf die juristische Prüfung umgesetzt und
live verifiziert — die Historie dazu steht in
[QA-Bericht-2026-08-27-v0.1.1.md](https://github.com/blue-demann/heute-schule/blob/main/QA-Bericht-2026-08-27-v0.1.1.md)
und [PEER-REVIEW-2026-08-27.md](https://github.com/blue-demann/heute-schule/blob/main/PEER-REVIEW-2026-08-27.md).
Eine dritte Prüfrunde am 31.08. (frische Sitzungen, kein Vorwissen) ergänzte
zwei weitere Befunde, siehe
[QA-Bericht-2026-08-31.md](QA-Bericht-2026-08-31.md) und
[PEER-REVIEW-2026-08-31.md](https://github.com/blue-demann/heute-schule/blob/main/PEER-REVIEW-2026-08-31.md).
Eine vierte Runde am 01.09. prüfte gezielt die Doku-Konsistenz, siehe
[DOKU-KONSISTENZ-CHECK-2026-09-01.md](https://github.com/blue-demann/heute-schule/blob/main/DOKU-KONSISTENZ-CHECK-2026-09-01.md).
Eine fünfte Runde, ebenfalls am 01.09. und bewusst ohne die vierte Runde zu
kennen (Unabhängigkeit), prüfte den QA-Bericht vom 31.08. gegen und führte
zusätzlich ein eigenes Audit durch — fand dabei den schwerwiegendsten
Befund bisher: den nicht deployten SSRF-Fix, siehe unten und
[PEER-REVIEW-2026-09-01.md](PEER-REVIEW-2026-09-01.md).
(Links zu Berichten, die nicht Teil des `web/docs/`-Dumps sind, zeigen
bewusst auf GitHub statt auf eine relative Datei — dort würde ein
relativer Link ins Leere laufen.) Alle Berichte bleiben als
Zeitpunkt-Momentaufnahmen unverändert.

## Erledigt seit dem Peer-Review

| Befund | Fix |
|---|---|
| 🔴 Cache-Treffer ohne Passwortprüfung | Zugangsdaten im Schlüsselmaterial, `proxy/cachekey.mjs`, 8 Regressionstests |
| 🔴 Dunkelmodus-Kontrast (2,44:1) | Token `--accent-text`, 7,35:1 nachgerechnet |
| 🔴 Keine Löschfunktion | Knopf „Alle meine Daten auf diesem Gerät löschen" |
| 🟡 CSP blockiert fremde ccCampus-Domains stillschweigend | Vorab-Prüfung + verständliche Meldung statt „Failed to fetch" |
| 🟡 Kein Rate-Limit im Proxy | 30 Anfragen/IP/Minute über die Cache API |
| 🟡 Transparenz zum Proxy-Klartextzugriff | Eigener Absatz in `web/datenschutz.html` Abschnitt 2 |
| Kleinkram: `.hide-fach`-Kontrast, Rechtstexte im SW-Cache, Wochenendtage, kein Pre-Deploy-Gate | Alle behoben (Deckkraft 0,6, SW-Shell v4, `schultagOffset()`, `deploy.sh`) |
| (nicht aus dem Review, aus dem Betatest 28.08.) Server-Feld akzeptierte keine kopierten Browser-URLs | Client- und serverseitige Bereinigung, `extrahiereWebUntisHostname` / `hostcheck.mjs` |
| (Betatest 28.08., zweite Familie) ccCampus-Instanz unter `mbs5.de` statt `mbs5online.de` war blockiert | `CCCAMPUS_ERLAUBTE_DOMAINS`-Liste statt Einzelwert (`web/index.html`), CSP `connect-src` in `web/_headers` ergänzt, neuer Konsistenz-Test zwischen beiden Dateien |
| AVV-Behauptung gegenüber Cloudflare unverifiziert | Verifiziert 28.08.2026 im Cloudflare-Dashboard (Konto → Konfigurationen): AVV automatisch Teil der Self-Serve Subscription Agreement, gilt für diesen kostenlosen Account. Details/Beleg in `Verarbeitungsverzeichnis-INTERN.md` Abschnitt 4, Link in `web/datenschutz.html` |
| Veröffentlichung auf GitHub | Privates Repository unter `github.com/blue-demann/heute-schule` angelegt und gepusht; Commit-Historie vorab mit `git-filter-repo` von echten Kontaktdaten und der echten Commit-Autor-Identität bereinigt |
| 🟡 (Peer-Review 31.08.) Mensamax-Basis-URL ohne Domain-Beschränkung — akzeptierte jede öffentliche HTTPS-Domain, während WebUntis hart auf `*.webuntis.com` begrenzt war | Wachsbare Allowlist wie bei ccCampus: `MENSAMAX_ALLOWED_DOMAINS` in `proxy/worker.js`, aktuell `parentsmensa.de`; `checkSafeHostname()`/`checkSafeHttpsUrl()` in `hostcheck.mjs` um `requiredSuffixes` (Liste statt Einzelwert) erweitert; Formular-Hinweis ergänzt |
| 🔴 (Peer-Review 01.09., Fund A-1) Der Mensamax-SSRF-Fix (Zeile oben) war committet und lokal getestet, lief aber nie auf dem produktiven Proxy — Open-Relay für beliebige öffentliche HTTPS-Ziele blieb live, obwohl als „erledigt" dokumentiert | `./deploy.sh proxy` ausgeführt; per direktem `curl` gegen den Live-Proxy verifiziert — nicht erlaubte Domain wird jetzt abgelehnt, `.parentsmensa.de`-Subdomain kommt durch |
| 🟡 (Peer-Review 01.09., Fund D-1) Der eigens für obigen Fund gebaute Live-vs-HEAD-Check in `deploy.sh` war selbst funktionslos — Cloudflare Pages liefert Dateien mit führendem Punkt im Namen nicht aus | `web/.deploy-commit` → `web/deploy-commit.txt`; nach vollständigem `./deploy.sh` live verifiziert: Hash stimmt exakt mit Git-HEAD überein |
| 🟡 (Peer-Review 01.09., Fund D-2) ESLint schloss `web/**` komplett von jeder Prüfung aus, nicht nur eine einzelne Regel | `eslint-plugin-html` prüft jetzt `web/index.html`/`web/ueber.html` (Inline-Script) und `web/sw.js` mit denselben Regeln wie der übrige Code (außer `var`); erster echter Lauf fand vier reale, bisher unentdeckte kleine Probleme im Code, alle behoben |

## Noch offen

1. **🟡 Juristische Prüfung.** Die Haushaltsausnahme (Art. 2 Abs. 2 lit. c
   DSGVO) deckt nur rein familiäre Nutzung ab — eine zweite,
   familienfremde Familie nutzt bereits aktiv mit (ccCampus-Essensanbieter,
   siehe `PROJEKT.md` Abschnitt 1), die Ausnahme dürfte also schon jetzt
   nicht mehr greifen, nicht erst „bei weiterer Ausweitung". Vorbereitet:
   `Verarbeitungsverzeichnis-INTERN.md` (Entwurf, Art. 30, AVV-Punkt
   verifiziert), TOM-Abschnitt in der
   Datenschutzerklärung. Noch zu tun:
   - Einschätzung durch jemanden mit juristischem Hintergrund einholen
   - Speicherdauer der Cloudflare-Server-Logs klären
2. **Kosmetisch, keine Eile:** Die WCAG-Versionsangaben in den Audit-
   Dokumenten (QA-Bericht Runde 1/2, Peer-Review 27.08.) sind uneinheitlich
   zitiert (mal 2.1, mal ohne Version). Die Dokumente selbst bleiben als
   Zeitpunkt-Momentaufnahmen unverändert; für alle künftigen Prüfungen gilt:
   durchgängig **WCAG 2.2** referenzieren, mit Level (A/AA/AAA).
3. **🟡 (Peer-Review 01.09., Fund C-2) „Demo-Website"-Hinweistext
   missverständlich.** Klingt nach „nicht ernst gemeint, kann jederzeit
   verschwinden", gemeint ist eigentlich ein Haftungsausschluss ohne SLA
   (kein Demo im Sinne von unecht — echtes, täglich genutztes Tool zweier
   Familien). Bessere Formulierung z. B. „Hobby-Projekt ohne Garantie, kann
   jederzeit geändert werden".
4. **🟡 (Peer-Review 01.09., Fund C-3) Apple-Touch-Icon fehlt als PNG.**
   `apple-touch-icon` verweist nur auf `icon.svg` — iOS/Safari unterstützt
   SVG dafür nicht zuverlässig, PNG (z. B. 180×180) ist weiterhin nötig.
   Besonders relevant wegen des geplanten eigenen Wechsels auf iPhone.
5. **Wartet auf manuelle Einrichtung:** `analytics-report/` (wöchentliche
   Aufruf-Statistik per Mail) ist fertig gebaut, aber noch nicht live —
   braucht drei Schritte, die nur Björn selbst machen kann (Web-Analytics-
   Site anlegen, Cloudflare-API-Token, Resend-Konto). Details in
   `analytics-report/README.md`. Die GraphQL-Query ist nach Dokumentation
   gebaut, aber noch nicht gegen einen echten Account getestet.

Feature-Ideen (Custom-Termine u. Ä.) stehen weiterhin im „Neue Ideen"-Abschnitt
von [web/README.md](https://github.com/blue-demann/heute-schule/blob/main/web/README.md), nicht hier — das sind Vorschläge, keine
Befunde.
