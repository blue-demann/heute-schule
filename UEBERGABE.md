# Übergabe: Heute Schule

IDNCVVS · v5 · 2026-11-19 · 88fe667d · gültig

Zweck: Stand für eine neue Sitzung und den Orchestrator. Für den Stand genügt Abschnitt 1.
Inhalt: 1 Stand auf einen Blick · 2 Als Nächstes · 3 Wartet auf User · 4 Zuerst lesen ·
5 Fallen · 6 Für andere Projekte

## 1. Stand auf einen Blick
- Phase: Wartung – **alles erledigt, die Arbeit ruht bis zum nächsten Ereignis** (Fehlerbild aus dem Alltag, Dependabot-Meldung, neuer Wunsch). Live 0.4.7 aus `eb409e1`; 0.4.8 ist gepusht, der Deploy durch User steht aus.
- Ampel: grün – die App läuft stabil, alle Befunde der zwölf Prüfrunden sind erledigt, `npm audit` meldet keine Lücken, eine juristische Prüfung steht nicht an.
- Zuletzt: 2026-11-19 – 0.4.8: Zeitlimit von 15 s für Abrufe in der App (OFFEN 4 erledigt) und Seite springt am neuen Tag auf „Heute“ (Fehlerbild aus dem Alltag). Vorher am selben Tag: juristische Prüfung entfallen, sams-on bestätigt, Lücken in Entwicklungswerkzeugen behoben. Offene Punkte v19, Projekt-Doku v16.
- Repo: `main` · drei Commits auf `172f666` (0.4.8 und diese Übergabe), gepusht · uncommittet: nein · ungepusht: nein
- Sitzung: „Heute Schule“ · Startordner: `~/dev/claude`
- Termine: keine

## 2. Als Nächstes
Keine geplanten Schritte. Bei einem neuen Ereignis zuerst diese Übergabe und die offenen Punkte lesen, dann mit User planen.
1. Geparkt, nur auf Wunsch: Inline-Script nach `web/app.js` auslagern (OFFEN 2, zusammen mit OFFEN 3), erst mit dem `grilling`-Skill planen; Deploy-Token je Worker (OFFEN 1), sobald Cloudflare es unterstützt.
2. Nach jeder größeren Änderung eine frische, unabhängige Prüfrunde anbieten (Vorlage in `prompts/`, Muster in `PROJEKT.md` Abschnitt 9).

## 3. Wartet auf User
- Deploy von 0.4.8 mit `./deploy.sh`; auf dem Handy braucht der Service Worker meist zwei Neuladen.
- Ob 0.4.8 (Zeitlimit, Tageswechsel) eine frische Prüfrunde bekommt; die Abfragekette hatte in den Runden zehn bis zwölf jedes Mal Funde.

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
- Prozessentwicklung: Verzeichnis `records/VERZEICHNIS.md` neu erzeugen; neue Stände HS-PRJ v16, HS-OFF v19 und IDNCVVS v5.
- Prozessentwicklung, Vorschlag für den Entwicklungsprozess (IDU6829): Regel „Commits nur mit ausdrücklich genannten Pfaden“ präzisieren auf `git commit -- <pfade>`, weil ein vorgemerktes Löschen sonst unbemerkt mitgeht (am 11.11.2026 hier passiert, vor dem Push korrigiert).
