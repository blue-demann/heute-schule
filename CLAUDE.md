# Heute Schule — Projekt-Kontext

PWA + Cloudflare-Worker-Proxy: zeigt Stundenplan (WebUntis) + Schulessen-Status
(Mensamax/ccCampus) für mehrere Familien, an einer Stelle statt einzeln
einloggen. Ersetzt einen alten Mail-Automation-Agent (`stundenplan_agent.gs`,
Logik lebt testbar weiter in `stundenplan.js`).

**Zuerst lesen, bevor Code geändert wird — nicht wiederholen, was dort schon steht:**
1. [`PROJEKT.md`](PROJEKT.md) — Architektur, Entscheidungs-Log, Sicherheitsmodell,
   Testkonzept, Release-Historie
2. [`OFFEN-naechste-Fixes.md`](OFFEN-naechste-Fixes.md) — bekannte offene Punkte,
   nicht neu erfinden oder übersehen

**Vor jedem Deploy zwingend:** `./deploy.sh` (nie `wrangler` direkt aufrufen) —
löst Tests, Lint, Coverage-Info, Datei-Dump-Konsistenz-Gate und einen
Live-vs-HEAD-Check aus. Bei fehlschlagenden Tests wird nicht deployed.

**Projektspezifische Konventionen** (Warum jeweils in `PROJEKT.md`):
- Code (Bezeichner + Kommentare) Englisch, Anzeigesprache/UI bleibt Deutsch
- Keine Journal-Kommentare im Code — Gegenwart erklären, nicht die Änderungshistorie
- `web/docs/` und `web/source/proxy/` sind Pflicht-Kopien, byte-synchron zum
  Original (`deploy.sh` prüft das automatisch) — bei Änderungen an `proxy/*`
  oder den dort verlinkten `.md`-Dateien die Kopie mitziehen
- Persistierte Config-/localStorage-Feldnamen (`webuntis.server`, `lunch.provider`,
  `hiddenFaecher`, …) und die geteilten Proxy-Antwort-Felder (`fach`, `raum`,
  `start`, `ende`, `vertretung`) nie ohne Rücksprache umbenennen — echte, bereits
  gespeicherte Nutzer:innendaten
- Bei größeren/sicherheitsrelevanten Änderungen: frische, unabhängige Prüf-Runde
  vorschlagen (siehe `prompts/` für Vorlagen) — dieses Projekt lebt von dem Muster

Für alles, was projektübergreifend gilt (Sprache, Speicherort, Arbeitsweise),
siehe die `CLAUDE.md` eine Ebene höher in `Meine Ablage/Claude/`.
