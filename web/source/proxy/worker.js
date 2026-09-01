'use strict';

/**
 * Stundenplan proxy — Cloudflare Worker
 *
 * Takes WebUntis and Mensamax requests off the plain browser website's
 * hands (solves their CORS problem) and returns plain JSON. Stores NOTHING
 * itself — every request brings its own login data, sourced by the
 * frontend from localStorage.
 *
 * Logic ported 1:1 from stundenplan_agent.gs / stundenplan.js (verified
 * production code of the pre-existing Apps Script agent), only UrlFetchApp
 * was swapped for fetch().
 *
 * WebUntis and Mensamax don't send an Access-Control-Allow-Origin header —
 * that's why this proxy exists: direct browser requests to these providers
 * are technically impossible (see ../PROJEKT.md, section 5).
 *
 * Mensamax cookie handling uses response.headers.getSetCookie(), which the
 * Cloudflare Workers runtime supports.
 *
 * Setup: see README.md in this folder.
 *
 * Deliberately easy on WebUntis/Mensamax (matters once more than just our
 * own family reads along — see the legal assessment in the project doc):
 *  - Short result caching (Cloudflare Cache API, ~4 minutes) — several
 *    parents/refreshes from the same family don't hit the outside servers
 *    again on every click.
 *  - An explicit timeout on every outbound fetch, so a hung request to
 *    WebUntis/Mensamax doesn't keep running indefinitely.
 *
 * Response fields that reach the frontend (`stunden`, `fach`, `raum`,
 * `start`, `ende`, `vertretung`, `lunch`, `datum`, `stundenFehler`,
 * `lunchFehler`) and the shared config-object shape (`server`, `klasse`,
 * `provider`, `base`, `projekt`, `einrichtung`, `cccampus`, ...) are
 * deliberately still German — they're a wire contract with web/index.html
 * (and, for the config shape, already-saved localStorage data in real
 * users' browsers), not this file's internal code. Renaming them belongs
 * together with the matching web/index.html pass, not on their own.
 */

import { checkSafeHostname, checkSafeHttpsUrl } from './hostcheck.mjs';
import { buildCacheKeyMaterial } from './cachekey.mjs';

const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_SECONDS = 240; // 4 minutes

// Rate limit per IP per minute. Set generously: a normal refresh costs one
// request per child, so typically 1-3; even an impatient family won't come
// close. The point isn't fine-grained throttling — it's to stop the proxy
// from being a convenient front for mass WebUntis login attempts (the
// allowlist permits all of *.webuntis.com, not just our own school — under
// abuse, WebUntis would see our Cloudflare IP, not the attacker's).
const RATE_LIMIT_PER_MINUTE = 30;

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Counts requests per IP within a one-minute window, via the Cache API.
//
// ⚠ Deliberate limitation, so nobody expects more than is actually there:
// the Cloudflare cache is per data center, and read+write isn't atomic. A
// distributed attacker or very fast parallel requests can exceed the
// limit. A genuinely hard counter would need Durable Objects (paid,
// disproportionate for this project). What this variant reliably does:
// turn "arbitrarily many login attempts" into "noticeable effort" — enough
// against casual abuse.
//
// The IP is only ever used hashed, never written into a cache key in
// plaintext (data minimization — it should be counted, not stored).
async function isRateLimited(request, ctx) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return false; // e.g. locally via `wrangler dev` — don't block there

  const minuteWindow = Math.floor(Date.now() / 60000);
  const key = await sha256Hex(`${ip}|${minuteWindow}`);
  const url = new URL(request.url);
  url.pathname = `/__rate/${key}`;
  const counterKey = new Request(url.toString(), { method: 'GET' });

  const cache = caches.default;
  const existing = await cache.match(counterKey);
  const countSoFar = existing ? Number(await existing.text()) || 0 : 0;

  if (countSoFar >= RATE_LIMIT_PER_MINUTE) return true;

  ctx.waitUntil(cache.put(counterKey, new Response(String(countSoFar + 1), {
    headers: { 'Cache-Control': 'max-age=60', 'Content-Type': 'text/plain' },
  })));
  return false;
}

// Timeout wrapper around every request to WebUntis/Mensamax — stops a
// hung third-party server from blocking the worker (and the parent's
// request) indefinitely.
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

// Cache key including credentials — see the detailed rationale in
// cachekey.mjs. Short version: without the password in the key, a cache
// hit would serve someone else's data without ever checking a login. The
// credentials are only ever hashed (SHA-256), never stored in plaintext.
async function buildCacheKey(request, datum, webuntisCfg, lunchCfg) {
  const enc = new TextEncoder().encode(buildCacheKeyMaterial(datum, webuntisCfg, lunchCfg));
  const digestBuf = await crypto.subtle.digest('SHA-256', enc);
  const hash = [...new Uint8Array(digestBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = `/__cache/${hash}`;
  return new Request(cacheUrl.toString(), { method: 'GET' });
}

// Cloudflare Workers run on UTC system time, not German time — plain
// new Date().getDate() etc. would point at the wrong day late at night /
// early morning (UTC offset). So: either use the date the client already
// sent along (the browser knows its own local time correctly), or, as a
// fallback, explicitly resolve the Europe/Berlin timezone.
function resolveDate(explicit) {
  if (explicit && /^\d{8}$/.test(explicit)) return explicit;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = {};
  formatter.formatToParts(new Date()).forEach((p) => { parts[p.type] = p.value; });
  return `${parts.year}${parts.month}${parts.day}`;
}

function jsonResponse(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders },
  });
}

// ── WebUntis ─────────────────────────────────────────────────────────────

async function webuntisRpc(server, cookie, method, params) {
  const safeServer = checkSafeHostname(server, { requiredSuffix: '.webuntis.com' });
  const resp = await fetchWithTimeout(`https://${safeServer}/WebUntis/jsonrpc.do`, {
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
    // Distinguish: did WebUntis respond and reject the login (wrong
    // username/password), or was it a connection problem? Only in the
    // first case is a "check your password" message worth showing — in
    // the second it would be misleading, so we pass the original message
    // through instead.
    const msg = String((e && e.message) || e);
    if (msg.indexOf('WebUntis authenticate:') === 0) {
      throw new Error('WebUntis-Login fehlgeschlagen — Benutzername oder Passwort prüfen.', { cause: e });
    }
    throw e;
  }
  const cookie = `JSESSIONID=${auth.sessionId}`;

  const dateInt = parseInt(datumStr, 10);

  const classes = await webuntisRpc(server, cookie, 'getKlassen', {});
  const classObj = classes.find(k => k.name.toLowerCase() === klasse.toLowerCase());
  if (!classObj) throw new Error(`Klasse "${klasse}" bei WebUntis nicht gefunden`);

  const lessons = await webuntisRpc(server, cookie, 'getTimetable', {
    id: classObj.id, type: 1, startDate: dateInt, endDate: dateInt,
  });
  const subjects = await webuntisRpc(server, cookie, 'getSubjects', {});
  const rooms = await webuntisRpc(server, cookie, 'getRooms', {});

  const subjectNameById = {};
  subjects.forEach(f => { subjectNameById[f.id] = f.longName || f.name || '?'; });
  const roomNameById = {};
  rooms.forEach(r => { roomNameById[r.id] = r.name || '?'; });

  try { await webuntisRpc(server, cookie, 'logout', {}); } catch { /* not worth failing over */ }

  const seen = new Set();
  return lessons
    .sort((a, b) => a.startTime - b.startTime || a.id - b.id)
    .filter(st => {
      if (seen.has(st.id) || st.code === 'cancelled') return false;
      seen.add(st.id);
      return true;
    })
    .map(st => {
      const subjectId = st.su && st.su[0] ? st.su[0].id : null;
      const roomId = st.ro && st.ro[0] ? st.ro[0].id : null;
      const start = String(st.startTime).padStart(4, '0');
      const end = String(st.endTime).padStart(4, '0');
      return {
        fach: subjectId ? (subjectNameById[subjectId] || '?') : '?',
        raum: roomId ? (roomNameById[roomId] || '?') : '?',
        start: `${start.slice(0, 2)}:${start.slice(2)}`,
        ende: `${end.slice(0, 2)}:${end.slice(2)}`,
        vertretung: st.code === 'irregular',
      };
    });
}

// ── Mensamax / parentsmensa.de ──────────────────────────────────────────

// A growable list instead of a single hard-coded domain, because other
// schools can run other Mensamax portal domains of the same provider type
// — same approach as CCCAMPUS_ALLOWED_DOMAINS in web/index.html. If a new
// school shows up with a different Mensamax domain, add it here.
const MENSAMAX_ALLOWED_DOMAINS = ['.parentsmensa.de'];

// Mensamax serves menu text with HTML-encoded special characters (e.g.
// "&amp;" instead of "&", and sometimes umlauts as entities too). Without
// Cloudflare Workers' own DOM we have to decode this by hand instead of
// passing the raw characters on to parents.
const HTML_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
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
  // Cloudflare Workers supports headers.getSetCookie(); fall back if not.
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

  // Important: ASP.NET_SessionId gets set by parentsmensa.de on EVERY login
  // attempt, even with completely wrong credentials — so it does NOT work
  // as a success indicator (verified with curl against the real site).
  // Two more reliable signals instead:
  //  1. On a failed login the page explicitly shows "Anmeldung
  //     fehlgeschlagen" (span #lblHinweis) in the HTML.
  //  2. Only a genuine success additionally sets an app auth cookie
  //     (MensaMax / mm_token / mensamax_superglue), not just the generic
  //     ASP.NET session cookie.
  const loginHtml2 = await loginResp.text();
  const loginFailed = /anmeldung fehlgeschlagen/i.test(loginHtml2);
  const hasAuthCookie = !!(cookies['MensaMax'] || cookies['mm_token'] || cookies['mensamax_superglue']);

  if (loginFailed || !hasAuthCookie) {
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
    // ccCampus runs exclusively in the browser (see the section further
    // down). The frontend therefore never sends credentials along for
    // ccCampus children — if one lands here anyway, that's a config error,
    // not something to fail silently on.
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
  checkSafeHttpsUrl(base, { requiredSuffixes: MENSAMAX_ALLOWED_DOMAINS });

  const cookieHeader = await getMensamaxCookies(lunchCfg);
  if (!cookieHeader) return 'Schulessen: Login fehlgeschlagen';

  const planResp = await fetchWithTimeout(
    `${base}/mensamax/Essenbestellung/bestellen-stornieren/PlanForm.aspx`,
    { headers: { Cookie: cookieHeader } }
  );
  if (planResp.status !== 200) return 'Schulessen: Daten nicht verfügbar';

  const html = await planResp.text();

  const dayPattern = new RegExp(
    `id="td${datumStr}_\\d+"\\s+class="speiseplan-menue([^"]*)"[\\s\\S]{0,800}?<li>([^<]+)<`, 'g'
  );

  const orders = [];
  let match;
  while ((match = dayPattern.exec(html)) !== null) {
    if (match[1].includes('tdSelected')) {
      orders.push(decodeHtmlEntities(match[2].replace(/\s+/g, ' ').trim()));
    }
  }

  if (orders.length === 0) {
    return html.includes(`td${datumStr}_`) ? 'Kein Menü bestellt' : 'Kein Schulessen heute';
  }
  return `Essen bestellt: ${orders.join(' / ')}`;
}

// ── ccCampus (mbs5online) ────────────────────────────────────────────────
//
// Deliberately no code here anymore, just this note.
//
// cccampus.mbs5online.de blocks requests from Cloudflare Workers with
// HTTP 403 (verified — even with correct credentials), but lets real
// browser requests through (open CORS headers: Access-Control-Allow-
// Origin: *). The whole ccCampus flow therefore runs directly in the
// browser — see the function fetchCcCampusLunch in web/index.html. That's
// the mirror image of WebUntis/Mensamax, which are CORS-blocked the other
// way round and need this proxy because of it.
//
// Deliberately no dead "reference" second implementation here either: two
// copies of the same parsing logic, only one of which ever actually runs,
// means the dead copy silently goes stale on any ccCampus change and
// misleads whoever reads it next. The verified flow is documented in
// proxy/README.md instead — that text goes stale the same way, but at
// least doesn't look like code ready to run.


// ── HTTP handler ─────────────────────────────────────────────────────────

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

    if (await isRateLimited(request, ctx)) {
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

    const datum = resolveDate(body.datum);
    const webuntisCfg = body.webuntis || {};
    const lunchCfg = body.lunch || {};

    // Short-lived cache: an identical request (same child, same day)
    // within the TTL doesn't hit WebUntis/Mensamax again.
    const cache = caches.default;
    const cacheKey = await buildCacheKey(request, datum, webuntisCfg, lunchCfg);
    const cached = await cache.match(cacheKey);
    if (cached) {
      const cachedBody = await cached.json();
      return jsonResponse(cachedBody, 200, corsHeaders);
    }

    const [lessonsResult, lunchResult] = await Promise.allSettled([
      getTimetable(webuntisCfg, datum),
      getLunchStatus(lunchCfg, datum),
    ]);

    const result = {
      datum,
      stunden: lessonsResult.status === 'fulfilled' ? lessonsResult.value : [],
      stundenFehler: lessonsResult.status === 'rejected' ? String(lessonsResult.reason.message || lessonsResult.reason) : null,
      lunch: lunchResult.status === 'fulfilled' ? lunchResult.value : 'Fehler beim Abrufen',
      lunchFehler: lunchResult.status === 'rejected' ? String(lunchResult.reason.message || lunchResult.reason) : null,
    };

    // Cache (partially) failed results too, briefly — protects WebUntis/
    // Mensamax from being hit again on every "refresh" click, especially
    // with wrong credentials.
    const cacheResp = new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_TTL_SECONDS}` },
    });
    ctx.waitUntil(cache.put(cacheKey, cacheResp));

    return jsonResponse(result, 200, corsHeaders);
  },
};
