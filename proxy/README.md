# Stundenplan-Proxy — Deploy

Kleiner Cloudflare Worker, der WebUntis- und Mensamax-Anfragen serverseitig
stellt (löst CORS) und pures JSON zurückgibt. Speichert nichts — jede
Anfrage bringt ihre Login-Daten selbst mit.

## Voraussetzungen

- Node.js installiert
- Cloudflare-Account (kostenlos, ausreichend für dieses Volumen)

## Deploy

Deploy ausschließlich über `../deploy.sh` (siehe `../README.md`, Abschnitte
„Deployen“ und „Zugang“): API-Token mit zwei Rechten aus dem
Schlüsselbund statt `wrangler login`, vorher Tests, Lint und `npm audit`.

```bash
cd ..
./deploy.sh proxy
```

Am Ende zeigt `wrangler` die Worker-URL an, z. B.
`https://stundenplan-proxy.<dein-name>.workers.dev`. Diese URL trägst du
in der Website unter „Einstellungen → Proxy-URL" ein.

## Lokal testen

```bash
npx --no-install wrangler dev
```

Dann z. B. mit curl gegen `http://localhost:8787/api/status` testen
(Body-Format siehe `worker.js`, Feld `webuntis` + `lunch`).

## ccCampus läuft NICHT über diesen Proxy

`cccampus.mbs5online.de` blockiert Anfragen von Cloudflare Workers mit
HTTP 403 (verifiziert — auch mit korrekten Zugangsdaten), lässt aber echte
Browser-Anfragen durch (offene CORS-Header: `Access-Control-Allow-Origin: *`).
Der komplette ccCampus-Ablauf läuft deshalb direkt im Browser, siehe
`fetchCcCampusLunch` in `web/index.html` — spiegelbildlich zu WebUntis/
Mensamax, die umgekehrt CORS-blockiert sind und deswegen den Proxy brauchen.

Mit echten Zugangsdaten verifizierter Ablauf (Stand 27.08.):

- `POST {base}/Login/Login` (`identifierValue`=Kundennummer, `secretValue`=PIN)
  → JSON `{name1, institutionName1, token, email, ...}`; `token` ist nur
  `base64("Kundennummer;PIN;0;0;0;Zeitstempel")`, kein Server-Secret.
- Folgeanfragen: `GET {base}/Mealplan/Weekplan`, Header
  `Authorization: Bearer <token>` → volle Wochenplan-Seite als HTML.
- Pro Tag ein `<div class="status-node ..." title="STATUS" data-date="YYYY-
  MM-DD">`. Beobachtete STATUS-Werte: "kein Liefertag", "Abwesend",
  "abgelaufen". Der Wert bei einer echten Bestellung (Menüname?) wurde noch
  nicht beobachtet — die Auswertung behandelt daher jeden unbekannten Wert
  als "vermutlich ein bestelltes Menü".

## SSRF-Schutz (Ziel-Host-Validierung)

`server` (WebUntis) und `base` (Mensamax/ccCampus) kommen unauthentifiziert
aus dem Client-Request. Ohne Prüfung wäre der Worker ein offener Relay für
beliebige https-Ziele. Validierung liegt in `hostcheck.mjs` (bewusst
ausgelagert, damit sie ohne Cloudflare-Runtime testbar ist — siehe
`../run-tests.mjs`):

- `server` (WebUntis) muss ein gültiger Hostname nach RFC 1123 sein (nur
  `a–z`, `0–9`, Punkt, Bindestrich) und auf `.webuntis.com` enden. Die
  Syntaxprüfung ist nötig, weil eine reine Endungsprüfung z. B.
  `evil.example#.webuntis.com` durchließe — der URL-Parser liest den Teil
  ab `#` als Fragment, der Abruf ginge an `evil.example`.
- `base` (Mensamax — die einzige Basis-URL, die den Proxy tatsächlich
  erreicht; ccCampus läuft komplett im Browser, siehe unten) muss
  `https://` sein, darf keine Zugangsdaten in der URL selbst enthalten und
  darf nicht auf ein privates/Loopback/Link-lokales Ziel zeigen (deckt
  u. a. den 169.254.169.254-Cloud-Metadata-Trick ab) — plus eine
  wachsbare Domain-Allowlist (`MENSAMAX_ALLOWED_DOMAINS` in `worker.js`,
  aktuell nur `parentsmensa.de`), damit der Proxy nicht als Relay gegen
  beliebige öffentliche Hosts missbraucht werden kann. Nutzt eine Schule
  Mensamax unter einer anderen Domain, dort ergänzen. Ein eigener Port ist
  nicht erlaubt; Pfad, Query und Fragment der Basis-URL werden ignoriert —
  die Anfragen entstehen nur aus deren `origin` plus festem Pfad.
- Kein ausgehender Abruf folgt Weiterleitungen (`redirect: 'manual'` in
  `fetchWithTimeout`). Die Prüfung oben gilt nur für die erste URL; eine
  gefolgte Weiterleitung könnte die Anfrage samt Session-Cookie an einen
  beliebigen Host schicken.

## Offene Punkte

1. **Mensamax-Regex** (`getLunchStatusMensamax`) ist eng an die aktuelle
   HTML-Struktur von parentsmensa.de gebunden — bricht bei
   Markup-Änderungen dort, unabhängig von dieser Architektur.

Erledigt (früher hier als offen gelistet): `ALLOWED_ORIGIN` ist in
`wrangler.toml` fest auf `https://heute-schule.pages.dev` gesetzt (nicht
mehr `*`) — bei einer eigenen Domain dort anpassen. Die CORS-Annahme für
WebUntis/Mensamax ist inzwischen mehrfach empirisch bestätigt (Proxy läuft
produktiv); die Mensamax-Cookie-Extraktion über `headers.getSetCookie()` ist
gegen echte Zugangsdaten getestet, inkl. Fix des Login-Erkennungsbugs (siehe
`getMensamaxCookies` in `worker.js`).

## Cloudflare-Account-Status

War beim letzten Stand offen, ob bereits ein Workers-Account existiert
(nur eine Erwähnung von Cloudflare als DNS-Anbieter in der FritzBox
gefunden, kein Hinweis auf einen Entwickler-Account). Falls keiner
existiert: bei `wrangler login` wird automatisch ein kostenloser Account
angelegt.
