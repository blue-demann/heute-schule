'use strict';

/**
 * Stundenplan-Proxy — Cloudflare Worker
 *
 * Nimmt WebUntis- und Mensamax-Requests serverseitig ab (löst das CORS-Problem
 * der reinen Browser-Website) und gibt reines JSON zurück. Speichert selbst
 * NICHTS — jede Anfrage liefert Login-Daten mit, die vom Frontend aus
 * localStorage kommen.
 *
 * Logik 1:1 portiert aus stundenplan_agent.gs / stundenplan.js (verifizierter
 * Produktions-Code des bestehenden Apps-Script-Agents), nur UrlFetchApp durch
 * fetch() ersetzt.
 *
 * ⚠ Unverifizierte Annahme aus der Architektur-Diskussion: WebUntis und
 * Mensamax senden vermutlich keine Access-Control-Allow-Origin-Header
 * (deswegen der Proxy). War zum Zeitpunkt der Konzeption nicht empirisch
 * getestet — falls sich das als falsch herausstellt, wäre der Proxy
 * eigentlich gar nicht nötig gewesen, schadet aber auch nicht.
 *
 * ⚠ Mensamax-Cookie-Handling: response.headers.getSetCookie() wird von der
 * Cloudflare-Workers-Runtime unterstützt. Vor dem ersten echten Einsatz mit
 * `wrangler dev` gegen die echten Logins testen (siehe README.md).
 *
 * Setup: siehe README.md in diesem Ordner.
 *
 * Schont WebUntis/Mensamax bewusst (wichtig, sobald mehr als die eigene
 * Familie mitliest — siehe rechtliche Einordnung im Projekt-Doc):
 *  - Kurzes Ergebnis-Caching (Cloudflare Cache API, ~4 Minuten) — mehrere
 *    Elternteile/Refreshs derselben Familie treffen nicht bei jedem Klick
 *    erneut die fremden Server.
 *  - Explizites Timeout auf jeden externen Fetch, damit ein hängender
 *    Request bei WebUntis/Mensamax nicht unbegrenzt weiterläuft.
 */

import { pruefeSicherenHostname, pruefeSichereHttpsUrl } from './hostcheck.mjs';
import { buildCacheKeyMaterial } from './cachekey.mjs';

const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_SECONDS = 240; // 4 Minuten

// Rate-Limit pro IP und Minute. Großzügig bemessen: Ein normaler Refresh
// kostet eine Anfrage pro Kind, also typisch 1-3; selbst eine ungeduldige
// Familie kommt nicht in die Nähe. Der Zweck ist nicht Feinsteuerung,
// sondern zu verhindern, dass der Proxy als bequeme Vorschaltstufe für
// massenhafte WebUntis-Login-Versuche dient (die Allowlist erlaubt alle
// *.webuntis.com, nicht nur die eigene Schule — bei Missbrauch sieht
// WebUntis unsere Cloudflare-IP, nicht die des Angreifers).
const RATE_LIMIT_PRO_MINUTE = 30;

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Zählt Anfragen pro IP je Minutenfenster über die Cache API.
//
// ⚠ Bewusste Einschränkung, damit niemand mehr erwartet als drinsteckt:
// Der Cloudflare-Cache ist pro Rechenzentrum, und Lesen+Schreiben ist nicht
// atomar. Ein verteilter Angreifer oder sehr schnelle Parallelanfragen können
// das Limit also überschreiten. Für einen echten harten Zähler bräuchte es
// Durable Objects (kostenpflichtig, für dieses Projekt unverhältnismäßig).
// Was diese Variante zuverlässig leistet: aus "beliebig viele Login-Versuche"
// wird "spürbarer Aufwand" — das reicht gegen Gelegenheitsmissbrauch.
//
// Die IP wird nur gehasht verwendet, nie im Klartext in einen Cache-Schlüssel
// geschrieben (Datensparsamkeit — sie soll gezählt, nicht gespeichert werden).
async function rateLimitUeberschritten(request, ctx) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return false; // z. B. lokal via `wrangler dev` — dann nicht blockieren

  const fenster = Math.floor(Date.now() / 60000);
  const schluessel = await sha256Hex(`${ip}|${fenster}`);
  const url = new URL(request.url);
  url.pathname = `/__rate/${schluessel}`;
  const zaehlerKey = new Request(url.toString(), { method: 'GET' });

  const cache = caches.default;
  const vorhanden = await cache.match(zaehlerKey);
  const bisher = vorhanden ? Number(await vorhanden.text()) || 0 : 0;

  if (bisher >= RATE_LIMIT_PRO_MINUTE) return true;

  ctx.waitUntil(cache.put(zaehlerKey, new Response(String(bisher + 1), {
    headers: { 'Cache-Control': 'max-age=60', 'Content-Type': 'text/plain' },
  })));
  return false;
}

// Timeout-Wrapper um jeden Request an WebUntis/Mensamax — verhindert, dass
// ein hängender Drittanbieter-Server den Worker (und damit die Anfrage des
// Elternteils) unbegrenzt blockiert.
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw new Error(`Zeitüberschreitung beim Zugriff auf ${new URL(url).hostname} (>${FETCH_TIMEOUT_MS / 1000}s)`, { cause: e });
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Cache-Key inkl. Zugangsdaten — siehe ausführliche Begründung in
// cachekey.mjs. Kurz: Ohne Passwort im Schlüssel liefert ein Cache-Treffer
// fremde Daten aus, ohne dass je ein Login geprüft wurde. Die Zugangsdaten
// werden nur gehasht (SHA-256), nie im Klartext abgelegt.
async function buildCacheKey(request, datum, webuntisCfg, lunchCfg) {
  const enc = new TextEncoder().encode(buildCacheKeyMaterial(datum, webuntisCfg, lunchCfg));
  const digestBuf = await crypto.subtle.digest('SHA-256', enc);
  const hash = [...new Uint8Array(digestBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = `/__cache/${hash}`;
  return new Request(cacheUrl.toString(), { method: 'GET' });
}

// Cloudflare Workers laufen mit UTC-Systemzeit, nicht mit deutscher Zeit —
// new Date().getDate() etc. würde nachts/früh morgens (UTC-Offset) auf den
// falschen Tag zeigen. Deswegen: entweder das vom Client mitgeschickte
// Datum verwenden (der Browser kennt seine eigene lokale Zeit korrekt),
// oder als Fallback explizit die Europe/Berlin-Zeitzone auflösen.
function resolveDatum(explicit) {
  if (explicit && /^\d{8}$/.test(explicit)) return explicit;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const map = {};
  fmt.formatToParts(new Date()).forEach((p) => { map[p.type] = p.value; });
  return `${map.year}${map.month}${map.day}`;
}

function jsonResponse(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders },
  });
}

// ── WebUntis ─────────────────────────────────────────────────────────────

async function webuntisRpc(server, cookie, method, params) {
  const sicheresServer = pruefeSicherenHostname(server, { pflichtSuffix: '.webuntis.com' });
  const resp = await fetchWithTimeout(`https://${sicheresServer}/WebUntis/jsonrpc.do`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ id: 1, method, params, jsonrpc: '2.0' }),
  });
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`WebUntis ${method}: keine gültige JSON-Antwort (HTTP ${resp.status})`, { cause: e });
  }
  if (data.error) throw new Error(`WebUntis ${method}: ${data.error.message}`);
  return data.result;
}

async function getTimetable({ server, user, password, klasse }, datumStr) {
  if (!server || !user || !password || !klasse) {
    throw new Error('WebUntis-Konfiguration unvollständig (server/user/password/klasse)');
  }

  let auth;
  try {
    auth = await webuntisRpc(server, null, 'authenticate', {
      user, password, client: 'stundenplan-proxy',
    });
  } catch (e) {
    // Unterscheiden: hat WebUntis geantwortet und den Login abgelehnt
    // (Benutzername/Passwort falsch), oder war es ein Verbindungsproblem?
    // Nur im ersten Fall lohnt sich eine "Passwort prüfen"-Meldung — beim
    // zweiten wäre das irreführend, da geben wir die Original-Meldung weiter.
    const msg = String((e && e.message) || e);
    if (msg.indexOf('WebUntis authenticate:') === 0) {
      throw new Error('WebUntis-Login fehlgeschlagen — Benutzername oder Passwort prüfen.', { cause: e });
    }
    throw e;
  }
  const cookie = `JSESSIONID=${auth.sessionId}`;

  const datumInt = parseInt(datumStr, 10);

  const klassen = await webuntisRpc(server, cookie, 'getKlassen', {});
  const klasseObj = klassen.find(k => k.name.toLowerCase() === klasse.toLowerCase());
  if (!klasseObj) throw new Error(`Klasse "${klasse}" bei WebUntis nicht gefunden`);

  const stunden = await webuntisRpc(server, cookie, 'getTimetable', {
    id: klasseObj.id, type: 1, startDate: datumInt, endDate: datumInt,
  });
  const faecher = await webuntisRpc(server, cookie, 'getSubjects', {});
  const raeume = await webuntisRpc(server, cookie, 'getRooms', {});

  const faecherMap = {};
  faecher.forEach(f => { faecherMap[f.id] = f.longName || f.name || '?'; });
  const raeumMap = {};
  raeume.forEach(r => { raeumMap[r.id] = r.name || '?'; });

  try { await webuntisRpc(server, cookie, 'logout', {}); } catch { /* egal */ }

  const seen = new Set();
  return stunden
    .sort((a, b) => a.startTime - b.startTime || a.id - b.id)
    .filter(st => {
      if (seen.has(st.id) || st.code === 'cancelled') return false;
      seen.add(st.id);
      return true;
    })
    .map(st => {
      const fachId = st.su && st.su[0] ? st.su[0].id : null;
      const raumId = st.ro && st.ro[0] ? st.ro[0].id : null;
      const s = String(st.startTime).padStart(4, '0');
      const e = String(st.endTime).padStart(4, '0');
      return {
        fach: fachId ? (faecherMap[fachId] || '?') : '?',
        raum: raumId ? (raeumMap[raumId] || '?') : '?',
        start: `${s.slice(0, 2)}:${s.slice(2)}`,
        ende: `${e.slice(0, 2)}:${e.slice(2)}`,
        vertretung: st.code === 'irregular',
      };
    });
}

// ── Mensamax / parentsmensa.de ──────────────────────────────────────────

// Wachsbare Liste statt starrem Einzeldomain-Zwang, weil andere Schulen
// andere Mensamax-Portal-Domains desselben Anbieter-Typs nutzen können —
// derselbe Ansatz wie CCCAMPUS_ERLAUBTE_DOMAINS in web/index.html. Taucht
// eine neue Schule mit anderer Mensamax-Domain auf, hier ergänzen.
const MENSAMAX_ERLAUBTE_DOMAINS = ['.parentsmensa.de'];

// Mensamax liefert Menü-Texte mit HTML-kodierten Sonderzeichen aus (z. B.
// "&amp;" statt "&", teils auch Umlaute als Entity). Ohne Cloudflare-Workers-
// eigenes DOM müssen wir das manuell dekodieren, statt die Rohzeichen an die
// Eltern weiterzugeben.
const HTML_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', ccedil: 'ç', euro: '€',
};
function decodeHtmlEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in HTML_ENTITIES ? HTML_ENTITIES[name] : m));
}

function extractHidden(html, name) {
  const m = html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`));
  return m ? m[1] : '';
}

function getSetCookies(resp) {
  // Cloudflare Workers unterstützt headers.getSetCookie(); Fallback falls nicht.
  if (typeof resp.headers.getSetCookie === 'function') {
    return resp.headers.getSetCookie();
  }
  const single = resp.headers.get('set-cookie');
  return single ? [single] : [];
}

async function getMensamaxCookies({ base, projekt, einrichtung, username, password }) {
  const loginPage = await fetchWithTimeout(`${base}/login.aspx`);
  const loginHtml = await loginPage.text();

  const payload = [
    `__VIEWSTATE=${encodeURIComponent(extractHidden(loginHtml, '__VIEWSTATE'))}`,
    `__VIEWSTATEGENERATOR=${encodeURIComponent(extractHidden(loginHtml, '__VIEWSTATEGENERATOR'))}`,
    `__EVENTVALIDATION=${encodeURIComponent(extractHidden(loginHtml, '__EVENTVALIDATION'))}`,
    `tbxProjekt=${encodeURIComponent(projekt)}`,
    `tbxEinrichtung=${encodeURIComponent(einrichtung)}`,
    `tbxBenutzername=${encodeURIComponent(username)}`,
    `tbxKennwort=${encodeURIComponent(password)}`,
    'hdfCheck=&hdfLanguage=german&hdfLogin=&btnLogin=Anmelden',
  ].join('&');

  const loginResp = await fetchWithTimeout(`${base}/login.aspx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload,
    redirect: 'manual',
  });

  const cookies = {};
  getSetCookies(loginResp).forEach(c => {
    const m = c.match(/^([^=]+)=([^;]*)/);
    if (m) cookies[m[1].trim()] = m[2].trim();
  });

  // Wichtig: ASP.NET_SessionId wird von parentsmensa.de bei JEDEM Login-
  // Versuch gesetzt, auch bei komplett falschen Zugangsdaten — taugt also
  // NICHT als Erfolgs-Indikator (mit curl gegen die echte Seite verifiziert).
  // Zwei zuverlässigere Signale stattdessen:
  //  1. Die Seite zeigt bei Fehllogin explizit "Anmeldung fehlgeschlagen"
  //     (Span #lblHinweis) im HTML.
  //  2. Nur bei echtem Erfolg wird zusätzlich ein App-Auth-Cookie gesetzt
  //     (MensaMax / mm_token / mensamax_superglue), nicht nur die generische
  //     ASP.NET-Session.
  const loginHtml2 = await loginResp.text();
  const loginFehlgeschlagen = /anmeldung fehlgeschlagen/i.test(loginHtml2);
  const hatAuthCookie = !!(cookies['MensaMax'] || cookies['mm_token'] || cookies['mensamax_superglue']);

  if (loginFehlgeschlagen || !hatAuthCookie) {
    return null;
  }

  return Object.entries(cookies)
    .filter(([k]) => ['ASP.NET_SessionId', 'MensaMax', 'mm_token', 'mensamax_superglue'].includes(k))
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function getLunchStatus(lunchCfg, datumStr) {
  const provider = lunchCfg.provider || 'mensamax';
  if (provider === 'cccampus') {
    // ccCampus läuft ausschließlich im Browser (siehe Abschnitt weiter unten).
    // Das Frontend schickt für ccCampus-Kinder deshalb gar keine Zugangsdaten
    // mit — landet hier trotzdem einer, ist das ein Konfigurationsfehler und
    // keine stille Fehlfunktion.
    return 'Schulessen: ccCampus wird direkt im Browser abgefragt, nicht über den Proxy';
  }
  if (provider !== 'mensamax') {
    return `Schulessen: unbekannter Anbieter "${provider}"`;
  }
  return getLunchStatusMensamax(lunchCfg, datumStr);
}

async function getLunchStatusMensamax(lunchCfg, datumStr) {
  const { base } = lunchCfg;
  if (!base || !lunchCfg.username || !lunchCfg.password) {
    throw new Error('Mensamax-Konfiguration unvollständig (base/username/password)');
  }
  pruefeSichereHttpsUrl(base, { pflichtSuffixe: MENSAMAX_ERLAUBTE_DOMAINS });

  const cookieHeader = await getMensamaxCookies(lunchCfg);
  if (!cookieHeader) return 'Schulessen: Login fehlgeschlagen';

  const planResp = await fetchWithTimeout(
    `${base}/mensamax/Essenbestellung/bestellen-stornieren/PlanForm.aspx`,
    { headers: { Cookie: cookieHeader } }
  );
  if (planResp.status !== 200) return 'Schulessen: Daten nicht verfügbar';

  const html = await planResp.text();

  const tagPattern = new RegExp(
    `id="td${datumStr}_\\d+"\\s+class="speiseplan-menue([^"]*)"[\\s\\S]{0,800}?<li>([^<]+)<`, 'g'
  );

  const bestellungen = [];
  let match;
  while ((match = tagPattern.exec(html)) !== null) {
    if (match[1].includes('tdSelected')) {
      bestellungen.push(decodeHtmlEntities(match[2].replace(/\s+/g, ' ').trim()));
    }
  }

  if (bestellungen.length === 0) {
    return html.includes(`td${datumStr}_`) ? 'Kein Menü bestellt' : 'Kein Schulessen heute';
  }
  return `Essen bestellt: ${bestellungen.join(' / ')}`;
}

// ── ccCampus (mbs5online) ────────────────────────────────────────────────
//
// Hier steht bewusst KEIN Code mehr, nur diese Notiz.
//
// cccampus.mbs5online.de blockiert Anfragen von Cloudflare Workers mit
// HTTP 403 (verifiziert — auch mit korrekten Zugangsdaten), lässt aber echte
// Browser-Anfragen durch (offene CORS-Header: Access-Control-Allow-Origin: *).
// Der komplette ccCampus-Ablauf läuft deshalb direkt im Browser — siehe
// Funktion holeCcCampusEssen in web/index.html. Das ist spiegelbildlich zu
// WebUntis/Mensamax, die genau umgekehrt CORS-blockiert sind und den Proxy
// deswegen brauchen.
//
// Früher lag hier zusätzlich eine vollständige, aber nie aufgerufene
// Zweitimplementierung als "Referenz". Die ist entfernt: zwei Kopien
// derselben Parsing-Logik, von denen nur eine je läuft, heißt in der Praxis,
// dass bei einer ccCampus-Änderung die tote Kopie stillschweigend veraltet
// und beim nächsten Lesen in die Irre führt. Der verifizierte Ablauf ist
// stattdessen in proxy/README.md dokumentiert — Text veraltet genauso, sieht
// aber wenigstens nicht wie einsatzbereiter Code aus.


// ── HTTP-Handler ─────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname !== '/api/status') {
      return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    if (await rateLimitUeberschritten(request, ctx)) {
      return jsonResponse(
        { error: 'Zu viele Anfragen — bitte kurz warten und erneut versuchen.' },
        429,
        { ...corsHeaders, 'Retry-After': '60' }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Ungültiger Request-Body (JSON erwartet)' }, 400, corsHeaders);
    }

    const datum = resolveDatum(body.datum);
    const webuntisCfg = body.webuntis || {};
    const lunchCfg = body.lunch || {};

    // Kurzzeit-Cache: identische Anfrage (gleiches Kind, gleicher Tag)
    // innerhalb der TTL wird nicht erneut gegen WebUntis/Mensamax gestellt.
    const cache = caches.default;
    const cacheKey = await buildCacheKey(request, datum, webuntisCfg, lunchCfg);
    const cached = await cache.match(cacheKey);
    if (cached) {
      const cachedBody = await cached.json();
      return jsonResponse(cachedBody, 200, corsHeaders);
    }

    const [stundenResult, lunchResult] = await Promise.allSettled([
      getTimetable(webuntisCfg, datum),
      getLunchStatus(lunchCfg, datum),
    ]);

    const result = {
      datum,
      stunden: stundenResult.status === 'fulfilled' ? stundenResult.value : [],
      stundenFehler: stundenResult.status === 'rejected' ? String(stundenResult.reason.message || stundenResult.reason) : null,
      lunch: lunchResult.status === 'fulfilled' ? lunchResult.value : 'Fehler beim Abrufen',
      lunchFehler: lunchResult.status === 'rejected' ? String(lunchResult.reason.message || lunchResult.reason) : null,
    };

    // Auch (teilweise) fehlgeschlagene Ergebnisse kurz cachen — schützt
    // WebUntis/Mensamax gerade bei falschen Zugangsdaten davor, bei jedem
    // Klick auf "Aktualisieren" erneut angefragt zu werden.
    const cacheResp = new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_TTL_SECONDS}` },
    });
    ctx.waitUntil(cache.put(cacheKey, cacheResp));

    return jsonResponse(result, 200, corsHeaders);
  },
};
