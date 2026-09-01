# Wochenstatistik per Mail — Einrichtung

Ein eigener, kleiner Cloudflare Worker (unabhängig vom Proxy), der einmal
pro Woche (montags 07:00 UTC) die Aufruf-Zahlen abfragt und per Mail
verschickt. Nutzt ausschließlich Daten, die Cloudflare für Pages/Workers
ohnehin erhebt — kein zusätzliches Tracking, keine Cookies.

Fünf Schritte, davon drei bei dir (Konten/Tokens kann ich nicht für dich
anlegen):

## 1. Web Analytics für die Website aktivieren

Im Cloudflare-Dashboard: **Analytics & Logs → Web Analytics → Add a site**.
Domain: `heute-schule.pages.dev`. Cloudflare zeigt danach ein
JavaScript-Snippet mit einem `data-cf-beacon`-Token darin, z. B.:

```html
<script defer src='https://static.cloudflareinsights.com/beacon.min.js'
  data-cf-beacon='{"token": "abc123..."}'></script>
```

Das Token selbst ist **nicht geheim** (steht ohnehin öffentlich im
HTML-Quelltext, so wie eine Google-Analytics-ID) — schick es mir einfach,
dann baue ich das Snippet in `web/index.html` (und optional die anderen
Seiten) ein und trage es hier in `wrangler.toml` unter
`CF_WEB_ANALYTICS_SITE_TAG` ein.

## 2. Cloudflare-API-Token erstellen

**My Profile → API Tokens → Create Token → Custom Token**, Berechtigung:
`Account` → `Account Analytics` → `Read`. Account: dein Cloudflare-Account.

Danach **selbst** in diesem Ordner (nicht mir den Wert schicken):

```bash
cd analytics-report
npx wrangler secret put CF_API_TOKEN
```

## 3. Resend-Konto für den Mailversand

[resend.com](https://resend.com) → kostenloses Konto (3.000 Mails/Monat
gratis) → API-Key erstellen. Zum Start reicht der voreingestellte Absender
`onboarding@resend.dev` (keine eigene Domain nötig, ist in `wrangler.toml`
schon so eingetragen). Auch hier **selbst** setzen:

```bash
npx wrangler secret put RESEND_API_KEY
```

## 4. Eigene Werte eintragen

In `wrangler.toml`:
- `CF_ACCOUNT_TAG` — deine Cloudflare-Account-ID (Dashboard, rechte
  Seitenleiste auf der Account-Startseite, oder `npx wrangler whoami`)
- `CF_WEB_ANALYTICS_SITE_TAG` — Token aus Schritt 1
- `MAIL_EMPFAENGER` — die Adresse, an die die Wochenmail gehen soll

Plus ein selbst ausgedachtes Zufallswort als Test-Secret:

```bash
npx wrangler secret put TEST_SECRET
```

## 5. Deployen und einmal live testen

```bash
npx wrangler deploy
```

Danach (ersetze `DEIN-TEST-SECRET`):

```bash
curl "https://heute-schule-analytics-report.<dein-name>.workers.dev/?test=DEIN-TEST-SECRET"
```

Kommt eine Mail an und zeigt die Antwort sinnvolle Zahlen — fertig, der
Cron-Job läuft ab jetzt automatisch. Kommt stattdessen ein Fehler (HTTP 500
mit Text), am besten den Fehlertext hierher kopieren — die GraphQL-Query
ist nach Dokumentation gebaut, aber noch nicht live gegen einen echten
Account getestet, falls sich ein Feldname doch anders nennt, beheben wir
das gemeinsam in ein, zwei Runden.

**Wichtig:** Direkt nach Schritt 1 sind noch keine Daten da — Web Analytics
sammelt erst ab dem Zeitpunkt der Einrichtung. Der erste Testaufruf zeigt
für "Website-Besuche" ggf. 0 oder `nicht verfügbar`, bis ein paar echte
Aufrufe seit der Einrichtung passiert sind.
