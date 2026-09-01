# Heute Schule

Kleine Web-App, die morgens auf einen Blick zeigt: Wie sieht der
Stundenplan der Kinder heute aus (WebUntis), und gibt's Schulessen
(Mensamax oder ccCampus)? Ersetzt eine tägliche Mail per Google-Apps-Script
— jetzt on demand statt einmal am Tag, für mehrere Familien statt nur eine.

**Live:** [heute-schule.pages.dev](https://heute-schule.pages.dev)

## Wie es aufgebaut ist

- **`web/`** — statische PWA (Cloudflare Pages), kein Build-Schritt, kein
  Framework. Zugangsdaten liegen ausschließlich lokal im Browser
  (`localStorage`), nie auf einem eigenen Server.
- **`proxy/`** — ein Cloudflare Worker, der die Anfragen an WebUntis und
  Mensamax stellt (die senden keine CORS-Freigabe, ein Browser darf sie
  also nicht direkt fragen). ccCampus läuft strukturell umgekehrt und
  deshalb ohne Proxy direkt im Browser.

Ausführliche Architektur, Entscheidungs-Log und Sicherheitsmodell:
**[PROJEKT.md](PROJEKT.md)**. Was gerade noch offen ist, ehrlich
aufgeschrieben statt verschwiegen: **[OFFEN-naechste-Fixes.md](OFFEN-naechste-Fixes.md)**.

## Lokal entwickeln

```bash
npm install
npm test              # Testsuite (node run-tests.mjs)
npm run test:coverage # dieselbe Suite mit Code-Coverage (c8)
npm run lint           # ESLint
```

Details zu den einzelnen Teilen: [web/README.md](web/README.md),
[proxy/README.md](proxy/README.md).

## Deployen

```bash
./deploy.sh          # Standard: Tests, Lint, dann Proxy + Website
./deploy.sh proxy    # nur der Proxy
./deploy.sh web      # nur die Website
```

Lässt bei fehlschlagenden Tests oder Lint-Fehlern nichts deployen.

## Sicherheit & Datenschutz

Kein eigener Server speichert Zugangsdaten — sie liegen ausschließlich im
`localStorage` des jeweiligen Browsers. Der Proxy leitet Anfragen nur
durch, cacht Ergebnisse kurz (Cache-Schlüssel enthält die Zugangsdaten
gehasht, kein Zugriff ohne echten Login). SSRF-Schutz, Rate-Limiting und
das komplette Sicherheitsmodell: Abschnitt 6 in [PROJEKT.md](PROJEKT.md).

Rechtstexte (Impressum, Datenschutzerklärung) sind bewusst nicht Teil
dieses Repos — sie enthalten echte, personenbezogene Kontaktdaten, die
MIT-Lizenz gilt für den Code, nicht dafür. Vorlagen mit Platzhaltern:
[web/impressum.example.html](web/impressum.example.html),
[web/datenschutz.example.html](web/datenschutz.example.html).

## Status

Hobby-Projekt eines Einzelnen ohne SLA, aber echtes, täglich von mehreren
Familien genutztes Tool — kein Prototyp zum Ausprobieren. Kann sich
jederzeit ändern.

## Lizenz

[MIT](LICENSE) — für den Code. Gilt ausdrücklich nicht für personenbezogene
Kontaktdaten in den (nicht mitgelieferten) Rechtstexten.
