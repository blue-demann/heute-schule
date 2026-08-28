# Offene Punkte

**Stand: 28.08.2026.** Frühere Fassung dieser Datei entstand direkt nach der
zweiten QA-Runde und dem Peer-Review (27.08.2026) und listete 8 Befunde als
offen. Seither wurden alle bis auf einen (rechtliche Prüfung) umgesetzt und
live verifiziert — die Historie dazu steht in
[QA-Bericht-2026-08-27-v0.1.1.md](QA-Bericht-2026-08-27-v0.1.1.md) und
[PEER-REVIEW-2026-08-27.md](PEER-REVIEW-2026-08-27.md), die als Zeitpunkt-
Momentaufnahmen unverändert bleiben.

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
| (Betatest 28.08., Markus/Lena) ccCampus-Instanz unter `mbs5.de` statt `mbs5online.de` war blockiert | `CCCAMPUS_ERLAUBTE_DOMAINS`-Liste statt Einzelwert (`web/index.html`), CSP `connect-src` in `web/_headers` ergänzt, neuer Konsistenz-Test zwischen beiden Dateien |
| AVV-Behauptung gegenüber Cloudflare unverifiziert | Verifiziert 28.08.2026 im Cloudflare-Dashboard (Konto → Konfigurationen): AVV automatisch Teil der Self-Serve Subscription Agreement, gilt für diesen kostenlosen Account. Details/Beleg in `Verarbeitungsverzeichnis-INTERN.md` Abschnitt 4, Link in `web/datenschutz.html` |

## Noch offen

1. **🟡 Juristische Prüfung vor weiterer Ausweitung.** Haushaltsausnahme
   (Art. 2 Abs. 2 lit. c DSGVO) fällt weg, sobald weitere fremde Familien
   mitnutzen. Vorbereitet: `Verarbeitungsverzeichnis-INTERN.md` (Entwurf,
   Art. 30, AVV-Punkt jetzt verifiziert), TOM-Abschnitt in der
   Datenschutzerklärung. Noch zu tun:
   - Einschätzung durch jemanden mit juristischem Hintergrund einholen
   - Speicherdauer der Cloudflare-Server-Logs klären
2. **Veröffentlichung auf GitHub (oder vergleichbar).** Aktuell nur lokales
   Git-Repository, kein Remote. Löst gleich zwei offene Punkte: das in
   `ueber.html`/der Datenschutzerklärung gegebene Versprechen „Quellcode
   liegt offen, hier bald verlinkt" ist erst damit eingelöst, und der
   Bus-Factor (Abschnitt 13 in `PROJEKT.md`) sinkt, weil Code und Historie
   dann nicht mehr ausschließlich auf Björns eigenem Rechner liegen. Vorher
   kurz prüfen: `.gitignore` erneut gegenchecken (siehe erster Commit), ggf.
   privates statt öffentliches Repo für den Anfang.
3. **Kosmetisch, keine Eile:** Die WCAG-Versionsangaben in den beiden
   Audit-Dokumenten (QA-Bericht Runde 1/2, Peer-Review) sind uneinheitlich
   zitiert (mal 2.1, mal ohne Version). Die Dokumente selbst bleiben als
   Zeitpunkt-Momentaufnahmen unverändert; für alle künftigen Prüfungen gilt:
   durchgängig **WCAG 2.2** referenzieren, mit Level (A/AA/AAA).

Feature-Ideen (Custom-Termine u. Ä.) stehen weiterhin im „Neue Ideen"-Abschnitt
von [web/README.md](web/README.md), nicht hier — das sind Vorschläge, keine
Befunde.
