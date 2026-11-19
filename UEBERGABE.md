# Übergabe: Heute Schule

IDNCVVS · v1 · 2026-11-19 · 2893457e · gültig

Zweck: Stand für eine neue Sitzung und den Orchestrator. Für den Stand genügt Abschnitt 1.
Inhalt: 1 Stand auf einen Blick · 2 Als Nächstes · 3 Wartet auf User · 4 Zuerst lesen ·
5 Fallen · 6 Für andere Projekte

## 1. Stand auf einen Blick
- Phase: Wartung, live 0.4.7 (Website und Proxy aus `ddd1497`, deployt 12.11.2026)
- Ampel: gelb – die App läuft stabil, alle Befunde der zwölf Prüfrunden sind erledigt; die juristische Prüfung (OFFEN 1) steht seit August aus.
- Zuletzt: 2026-11-19 – Kontrolle bestanden: Die drei aus der Website entfernten Prüfberichte liefern `404`. OFFEN v14 schließt den Punkt; diese Übergabe neu angelegt.
- Repo: `main` · Übergabe-Commit auf `e06e8d0` · uncommittet: nein · ungepusht: der Übergabe-Commit, bis User den Push freigibt
- Sitzung: „Heute Schule“ · Startordner: `~/dev/claude`
- Termine: keine

## 2. Als Nächstes
1. Beim nächsten Deploy geht die neue Fassung von `web/docs/OFFEN-naechste-Fixes.md` mit live; ein eigener Deploy dafür ist nicht nötig.
2. Lücken in Entwicklungswerkzeugen (OFFEN 7, Dependabot-Warnung #2): neue Versionen von `c8` und `eslint` abwarten oder `minimatch`/`glob` per `overrides` anheben.
3. Zeitlimit in der Web-App beim Abruf vom Proxy (OFFEN 6): mit User planen, dann umsetzen.
4. Inline-Script nach `web/app.js` auslagern (OFFEN 3, zusammen mit OFFEN 4): größeres Vorhaben, erst mit dem `grilling`-Skill planen.
5. Nach jeder größeren Änderung eine frische, unabhängige Prüfrunde anbieten (Vorlage in `prompts/`, Muster in `PROJEKT.md` Abschnitt 9).

## 3. Wartet auf User
- Freigabe für den Push des Übergabe-Commits.
- Juristische Einschätzung zur Haushaltsausnahme und Speicherdauer der Cloudflare-Logs (OFFEN 1).
- sams-on mit einer echten Bestellung prüfen und den Betreiber auf die PHP-Version hinweisen (OFFEN 5).
- Deploys startet User selbst mit `./deploy.sh`.

## 4. Zuerst lesen
1. [Projekt-Kontext](CLAUDE.md) (`CLAUDE.md`, wird automatisch geladen)
2. [Projekt- und Design-Dokumentation (HS-PRJ)](PROJEKT.md): Architektur, Entscheidungen, Sicherheits- und Testkonzept, Release-Historie
3. [Offene Punkte (HS-OFF)](OFFEN-naechste-Fixes.md)
4. [Prüfbericht der zwölften Runde (ID9KS64)](PEER-REVIEW-2026-11-09c.md): jüngste Prüfrunde, Vorbild für Aufbau und Tonfall der nächsten
5. [Prompts der Prüfrunden](prompts/README.md)

## 5. Fallen
- Claude deployt nicht und ruft `wrangler` nie direkt auf; `deploy.sh` braucht den Schlüsselbund, den nur User erreicht.
- Commits immer mit `git commit -- <pfade>`: Ein vorgemerktes `git rm` landet sonst im nächsten Commit, auch wenn nur andere Pfade mit `git add` vorgemerkt sind.
- `web/docs/` und `web/source/proxy/` sind byte-gleiche Kopien; bei jeder Änderung an `PROJEKT.md`, `OFFEN-naechste-Fixes.md`, dem verlinkten Bericht oder `proxy/*` die Kopie mitziehen. Ein aus `web/` entfernter Bericht bleibt bis zu einer Woche im Cloudflare-Cache, deshalb danach ohne Cache-Buster auf `404` prüfen.
- Die Testsuite schreibt fehlgeschlagene Tests auf stderr, die Zusammenfassung auf stdout; wer Mutanten automatisch auswertet, liest beides.
- Browser-Prüfungen nur an einer Kopie von `web/` im Scratchpad mit vorgeschaltetem `fetch`-Stub; der Startbefehl kommt als vorübergehender Eintrag in `~/dev/claude/.claude/launch.json`, danach zurücksetzen. Keine erfundenen Zugangsdaten an den Proxy.
- „Load failed“ auf dem Handy lag bisher am Netz (VPN-Standort), nicht an der App; zuerst den Proxy direkt prüfen.
- Prüfsitzungen lesen nie `Verarbeitungsverzeichnis-INTERN.md`, `web/impressum.html` oder `web/datenschutz.html` (gitignored, echte Personendaten).

## 6. Für andere Projekte
- Prozessentwicklung: IDNCVVS (diese Übergabe) ins Verzeichnis `records/VERZEICHNIS.md` aufnehmen; die IDs der Prüfberichte stehen dort schon.
- Prozessentwicklung, Vorschlag für den Entwicklungsprozess (IDU6829): Regel „Commits nur mit ausdrücklich genannten Pfaden“ präzisieren auf `git commit -- <pfade>`, weil ein vorgemerktes Löschen sonst unbemerkt mitgeht (am 11.11.2026 hier passiert, vor dem Push korrigiert).
