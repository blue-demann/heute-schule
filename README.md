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
npm run typecheck      # Typprüfung (tsc --checkJs, ohne Build-Schritt)
```

Details zu den einzelnen Teilen: [web/README.md](web/README.md),
[proxy/README.md](proxy/README.md).

## Deployen

```bash
npm ci               # einmalig bzw. nach Änderungen an package-lock.json
./deploy.sh          # Standard: alle Prüfungen, dann Proxy + Website
./deploy.sh proxy    # nur der Proxy
./deploy.sh web      # nur die Website
```

Deployt nur aus einem sauberen Arbeitsbaum (alles committet) und nur, wenn
Tests, Lint und `npm audit` (Lücken ab „high“) durchgehen. `wrangler` kommt
als exakt gepinnte Entwicklungsabhängigkeit aus `node_modules`, ohne
`npm ci` gibt es keinen Deploy. Die Reihenfolge der Prüfungen steht in
[PROJEKT.md](PROJEKT.md), Abschnitt 10.

### Zugang (einmalig)

`deploy.sh` braucht kein kontoweites `wrangler login`, sondern einen
Cloudflare-API-Token mit genau zwei Rechten plus die Account-ID – beides im
macOS-Schlüsselbund, nie in einer Datei, nie im Repo und nicht als dauerhafte
Umgebungsvariable.

1. Cloudflare-Dashboard › API Tokens: Token mit **Cloudflare Pages** (Website)
   und **Workers Scripts** (Proxy) – mehr braucht der Deploy nicht. Ablauf ein
   Jahr. Fehlt nachweislich ein Recht (es kommt ein konkreter
   Berechtigungsfehler), genau dieses nachfordern statt vorsorglich mehr zu
   erlauben.
2. Token in den Schlüsselbund – fragt verdeckt ab, landet nicht in der
   Shell-History. Den Wert über den Kopieren-Knopf im Dashboard übernehmen;
   `deploy.sh` lehnt Werte ab, die nicht wie ein Token aussehen:
   ```bash
   security add-generic-password -U -a "$USER" -s heute-schule-cloudflare-token -w
   ```
3. Account-ID in den Schlüsselbund:
   ```bash
   security add-generic-password -U -a "$USER" -s heute-schule-cloudflare-account -w
   ```
4. Länge prüfen, ohne den Wert zu zeigen (ein halb eingefügter Token führt
   sonst zu „Authentication failed [9106]“):
   ```bash
   security find-generic-password -s heute-schule-cloudflare-token -w | awk '{print length($0)}'
   ```

**Deploys laufen in Björns Terminal.** Claude Code erreicht den Schlüsselbund
aus seiner Sandbox nicht, und das ist so gewollt – Claude committet, Björn
startet `./deploy.sh`.

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
