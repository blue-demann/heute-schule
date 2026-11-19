# Übergabe: Heute Schule

IDNCVVS · v3 · 2026-11-19 · d662af38 · gültig

Zweck: Stand für eine neue Sitzung und den Orchestrator. Für den Stand genügt Abschnitt 1.
Inhalt: 1 Stand auf einen Blick · 2 Als Nächstes · 3 Wartet auf User · 4 Zuerst lesen ·
5 Fallen · 6 Für andere Projekte

## 1. Stand auf einen Blick
- Phase: Wartung, live 0.4.7 (Website und Proxy aus `ddd1497`, deployt 12.11.2026)
- Ampel: grün – die App läuft stabil, alle Befunde der zwölf Prüfrunden sind erledigt, `npm audit` meldet keine Lücken, eine juristische Prüfung steht nicht mehr an.
- Zuletzt: 2026-11-19 – Die App nutzt derzeit nur der eigene Haushalt, die juristische Prüfung entfällt; sie bleibt aber für andere Familien nutzbar; sams-on läuft laut User einwandfrei; Lücken in Entwicklungswerkzeugen behoben (`eslint` 10.15.0, `overrides` für `c8`). Offene Punkte v16, Projekt-Doku v14.
- Repo: `main` · zwei Wartungs-Commits auf `3678983`, gepusht · uncommittet: nein · ungepusht: nein
- Sitzung: „Heute Schule“ · Startordner: `~/dev/claude`
- Termine: keine

## 2. Als Nächstes
1. Beim nächsten Deploy gehen Projekt-Doku, offene Punkte und `web/README.md` mit live; ein eigener Deploy dafür ist nicht nötig.
2. Zeitlimit in der Web-App beim Abruf vom Proxy (OFFEN 4): mit User planen, dann umsetzen.
3. Inline-Script nach `web/app.js` auslagern (OFFEN 2, zusammen mit OFFEN 3): größeres Vorhaben, erst mit dem `grilling`-Skill planen.
4. Nach jeder größeren Änderung eine frische, unabhängige Prüfrunde anbieten (Vorlage in `prompts/`, Muster in `PROJEKT.md` Abschnitt 9).

## 3. Wartet auf User
- Hinweis an den sams-on-Betreiber zur PHP-Version, falls noch nicht geschehen.
- Deploys startet User selbst mit `./deploy.sh`.

## 4. Zuerst lesen
1. [Projekt-Kontext](CLAUDE.md) (`CLAUDE.md`, wird automatisch geladen)
2. [Projekt- und Design-Dokumentation (HS-PRJ)](PROJEKT.md): Architektur, Entscheidungen, Sicherheits- und Testkonzept, Release-Historie
3. [Offene Punkte (HS-OFF)](OFFEN-naechste-Fixes.md)
4. [Prüfbericht der zwölften Runde (ID9KS64)](PEER-REVIEW-2026-11-09c.md): jüngste Prüfrunde, Vorbild für Aufbau und Tonfall der nächsten
5. [Prompts der Prüfrunden](prompts/README.md)

## 5. Fallen
- Nutzt wieder eine Familie außerhalb des Haushalts die App, die juristische Prüfung (Haushaltsausnahme, Speicherdauer der Cloudflare-Logs) wieder als offenen Punkt aufnehmen. Anbieter, Formular und Rechtstexte bleiben bewusst für andere Familien nutzbar; nichts davon als „ungenutzt“ entfernen.
- Claude deployt nicht und ruft `wrangler` nie direkt auf; `deploy.sh` braucht den Schlüsselbund, den nur User erreicht.
- Commits immer mit `git commit -- <pfade>`: Ein vorgemerktes `git rm` landet sonst im nächsten Commit, auch wenn nur andere Pfade mit `git add` vorgemerkt sind.
- `web/docs/` und `web/source/proxy/` sind byte-gleiche Kopien; bei jeder Änderung an `PROJEKT.md`, `OFFEN-naechste-Fixes.md`, dem verlinkten Bericht oder `proxy/*` die Kopie mitziehen. Ein aus `web/` entfernter Bericht bleibt bis zu einer Woche im Cloudflare-Cache, deshalb danach ohne Cache-Buster auf `404` prüfen.
- `overrides` in `package.json` hebt `glob` und `minimatch` unter `test-exclude` an; entfernen, sobald eine `c8`-Version sie selbst mitbringt (Dependabot-PRs für `c8` daraufhin prüfen). `eslint-plugin-html` unter 8.2.1 stürzt mit `eslint` ab 10.15 ab.
- Die Testsuite schreibt fehlgeschlagene Tests auf stderr, die Zusammenfassung auf stdout; wer Mutanten automatisch auswertet, liest beides.
- Browser-Prüfungen nur an einer Kopie von `web/` im Scratchpad mit vorgeschaltetem `fetch`-Stub; der Startbefehl kommt als vorübergehender Eintrag in `~/dev/claude/.claude/launch.json`, danach zurücksetzen. Keine erfundenen Zugangsdaten an den Proxy.
- „Load failed“ auf dem Handy lag bisher am Netz (VPN-Standort), nicht an der App; zuerst den Proxy direkt prüfen.
- Prüfsitzungen lesen nie `Verarbeitungsverzeichnis-INTERN.md`, `web/impressum.html` oder `web/datenschutz.html` (gitignored, echte Personendaten).

## 6. Für andere Projekte
- Prozessentwicklung: Verzeichnis `records/VERZEICHNIS.md` neu erzeugen; neue Stände HS-PRJ v14, HS-OFF v16 und IDNCVVS v3.
- Prozessentwicklung, Vorschlag für den Entwicklungsprozess (IDU6829): Regel „Commits nur mit ausdrücklich genannten Pfaden“ präzisieren auf `git commit -- <pfade>`, weil ein vorgemerktes Löschen sonst unbemerkt mitgeht (am 11.11.2026 hier passiert, vor dem Push korrigiert).
