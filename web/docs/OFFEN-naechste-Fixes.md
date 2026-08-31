# Offene Punkte

**Stand: 31.08.2026.** Frühere Fassung dieser Datei entstand direkt nach der
zweiten QA-Runde und dem Peer-Review (27.08.2026) und listete 8 Befunde als
offen. Seither wurden alle bis auf die juristische Prüfung umgesetzt und
live verifiziert — die Historie dazu steht in
[QA-Bericht-2026-08-27-v0.1.1.md](QA-Bericht-2026-08-27-v0.1.1.md) und
[PEER-REVIEW-2026-08-27.md](PEER-REVIEW-2026-08-27.md). Eine dritte
Prüfrunde am 31.08. (frische Sitzungen, kein Vorwissen) ergänzt zwei weitere
Befunde, siehe [QA-Bericht-2026-08-31.md](QA-Bericht-2026-08-31.md) und
[PEER-REVIEW-2026-08-31.md](PEER-REVIEW-2026-08-31.md). Alle vier Berichte
bleiben als Zeitpunkt-Momentaufnahmen unverändert.

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
| 🟡 (Peer-Review 31.08.) Mensamax-Basis-URL ohne Domain-Beschränkung — akzeptierte jede öffentliche HTTPS-Domain, während WebUntis hart auf `*.webuntis.com` begrenzt war | Wachsbare Allowlist wie bei ccCampus: `MENSAMAX_ERLAUBTE_DOMAINS` in `proxy/worker.js`, aktuell `parentsmensa.de`; `pruefeSicherenHostname()`/`pruefeSichereHttpsUrl()` in `hostcheck.mjs` um `pflichtSuffixe` (Liste statt Einzelwert) erweitert; Formular-Hinweis ergänzt |

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

Feature-Ideen (Custom-Termine u. Ä.) stehen weiterhin im „Neue Ideen"-Abschnitt
von [web/README.md](web/README.md), nicht hier — das sind Vorschläge, keine
Befunde.
