'use strict';

/**
 * Stundenplan proxy — Cloudflare Worker
 *
 * Takes WebUntis, Mensamax and sams-on requests off the plain browser
 * website's hands and returns plain JSON. Stores NOTHING itself — every
 * request brings its own login data, sourced by the frontend from
 * localStorage.
 *
 * The WebUntis and Mensamax logic was ported 1:1 from stundenplan_agent.gs /
 * stundenplan.js (verified production code of the pre-existing Apps Script
 * agent), only UrlFetchApp was swapped for fetch(). sams-on has its own
 * section further down.
 *
 * Why the proxy exists: WebUntis and Mensamax don't send an
 * Access-Control-Allow-Origin header. sams-on does ("*"), but its session
 * lives in a cookie, and with "*" browsers refuse requests that carry
 * cookies. Direct browser requests to these providers are therefore
 * technically impossible (see ../PROJEKT.md, section 5).
 *
 * Cookie handling (Mensamax, sams-on) uses response.headers.getSetCookie(),
 * which the Cloudflare Workers runtime supports.
 *
 * Setup: see README.md in this folder.
 *
 * Deliberately easy on the providers (matters once more than just our own
 * family reads along — see the legal assessment in the project doc):
 *  - Short result caching (Cloudflare Cache API, ~4 minutes) — several
 *    parents/refreshes from the same family don't hit the outside servers
 *    again on every click.
 *  - An explicit timeout on every outbound fetch, so a hung request doesn't
 *    keep running indefinitely; the sams-on sequence also has one shared
 *    time limit for all its requests.
 *
 * Response fields that reach the frontend (`stunden`, `fach`, `raum`,
 * `start`, `ende`, `vertretung`, `lunch`, `datum`, `stundenFehler`,
 * `lunchFehler`, `guthaben`, `guthabenKnapp`, `guthabenGefuehrt`) and the
 * shared config-object shape (`server`, `klasse`, `provider`, `base`,
 * `projekt`, `einrichtung`, `cccampus`, `samson`, `instanz`, ...) are
 * deliberately still German — they're a wire contract with web/index.html
 * (and, for the config shape, already-saved localStorage data in real
 * users' browsers), not this file's internal code. Renaming them belongs
 * together with the matching web/index.html pass, not on their own.
 */

import { checkSafeHostname, checkSafeHttpsUrl, httpsUrlForHost, samsonOrigin } from './hostcheck.mjs';
import { decodeHtmlEntities, samsonMealName } from './text.mjs';
import { buildCacheKeyMaterial } from './cachekey.mjs';
import {
  validateRequestBody, validateRpcEnvelope, validateAuth, validateClasses, validateLessons, validateSubjects, validateRooms,
  validateSamsonAccount, validateSamsonOrders, samsonCredit, samsonCreditHidden,
} from './validate.mjs';

const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_SECONDS = 240; // 4 minutes

// Rate limit per IP per minute. Set generously: a normal refresh costs one
// request per child, so typically 1-3; even an impatient family won't come
// close. The point isn't fine-grained throttling — it's to stop the proxy
// from being a convenient front for mass WebUntis login attempts (the
// allowlist permits all of *.webuntis.com, not just our own school — under
// abuse, WebUntis would see our Cloudflare IP, not the attacker's).
const RATE_LIMIT_PER_MINUTE = 30;

/** @param {string} text */
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
/**
 * @param {Request} request
 * @param {ExecutionContext} ctx
 */
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

// Wrapper around every request to a provider.
// - Timeout: stops a hung third-party server from blocking the worker (and
//   the parent's request) indefinitely.
// - Never follows redirects: the host check only covers the first URL. A
//   followed 3xx would send the request — including session cookies or
//   login data — to whatever host the Location header names, so one open
//   redirect on an allowed domain would turn the proxy into a relay.
//   A 3xx response is returned as is and treated as an error by the caller.
/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {AbortSignal} [budget]  a time limit shared by several requests in a row
 */
async function fetchWithTimeout(url, options, budget) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const signal = budget ? AbortSignal.any([controller.signal, budget]) : controller.signal;
  try {
    return await fetch(url, { ...options, redirect: 'manual', signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      const limit = budget?.aborted ? 'Gesamtzeit überschritten' : `>${FETCH_TIMEOUT_MS / 1000}s`;
      throw new Error(`Zeitüberschreitung beim Zugriff auf ${new URL(url).hostname} (${limit})`, { cause: e });
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
/**
 * @param {Request} request
 * @param {string} datum
 * @param {WebUntisConfig} webuntisCfg
 * @param {LunchConfig} lunchCfg
 */
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
/** @param {string | undefined} explicit */
function resolveDate(explicit) {
  if (explicit && /^\d{8}$/.test(explicit)) return explicit;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  /** @type {Record<string, string>} */
  const parts = {};
  formatter.formatToParts(new Date()).forEach((p) => { parts[p.type] = p.value; });
  return `${parts.year}${parts.month}${parts.day}`;
}

/**
 * @param {unknown} obj
 * @param {number} status
 * @param {Record<string, string>} corsHeaders
 */
function jsonResponse(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders },
  });
}

// ── WebUntis ─────────────────────────────────────────────────────────────

// WebUntis answered with a well-formed JSON-RPC error, i.e. it understood
// the request and said no. Its own class, so callers can tell "WebUntis
// rejected this" (e.g. wrong password) from "WebUntis could not be reached
// or answered something else" without parsing message texts.
class WebUntisRejection extends Error {}

/**
 * @param {string} server
 * @param {string | null} cookie
 * @param {string} method
 * @param {Record<string, unknown>} params
 * @returns {Promise<unknown>}
 */
async function webuntisRpc(server, cookie, method, params) {
  const safeServer = checkSafeHostname(server, { requiredSuffix: '.webuntis.com' });
  const resp = await fetchWithTimeout(httpsUrlForHost(safeServer, '/WebUntis/jsonrpc.do'), {
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
  const envelope = validateRpcEnvelope(data, method);
  if ('error' in envelope) throw new WebUntisRejection(`WebUntis ${method}: ${envelope.error}`);
  return envelope.result;
}

/**
 * @param {WebUntisConfig} webuntisCfg
 * @param {string} datumStr
 * @returns {Promise<Lesson[]>}
 */
async function getTimetable({ server, user, password, klasse }, datumStr) {
  if (!server || !user || !password || !klasse) {
    throw new Error('WebUntis-Konfiguration unvollständig (server/user/password/klasse)');
  }

  let auth;
  try {
    auth = validateAuth(await webuntisRpc(server, null, 'authenticate', {
      user, password, client: 'stundenplan-proxy',
    }));
  } catch (e) {
    // Only when WebUntis itself rejected the login is "check your password"
    // worth showing. For anything else — no connection, a maintenance page
    // instead of JSON, a redirect, a malformed answer — it would be
    // misleading, so the original message passes through.
    if (e instanceof WebUntisRejection) {
      throw new Error('WebUntis-Login fehlgeschlagen — Benutzername oder Passwort prüfen.', { cause: e });
    }
    throw e;
  }
  const cookie = `JSESSIONID=${auth.sessionId}`;

  const dateInt = parseInt(datumStr, 10);

  const classes = validateClasses(await webuntisRpc(server, cookie, 'getKlassen', {}));
  const classObj = classes.find(k => k.name.toLowerCase() === klasse.toLowerCase());
  if (!classObj) throw new Error(`Klasse "${klasse}" bei WebUntis nicht gefunden`);

  const lessons = validateLessons(await webuntisRpc(server, cookie, 'getTimetable', {
    id: classObj.id, type: 1, startDate: dateInt, endDate: dateInt,
  }));
  const subjects = validateSubjects(await webuntisRpc(server, cookie, 'getSubjects', {}));
  const rooms = validateRooms(await webuntisRpc(server, cookie, 'getRooms', {}));

  /** @type {Record<number, string>} */
  const subjectNameById = {};
  subjects.forEach(f => { subjectNameById[f.id] = f.longName || f.name || '?'; });
  /** @type {Record<number, string>} */
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

/**
 * @param {string} html
 * @param {string} name
 */
function extractHidden(html, name) {
  const m = html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`));
  return m ? m[1] : '';
}

/**
 * @param {Response} resp
 * @returns {string[]}
 */
function getSetCookies(resp) {
  // Cloudflare Workers supports headers.getSetCookie(); fall back if not.
  if (typeof resp.headers.getSetCookie === 'function') {
    return resp.headers.getSetCookie();
  }
  const single = resp.headers.get('set-cookie');
  return single ? [single] : [];
}

/**
 * @param {string} origin
 * @param {LunchConfig} lunchCfg
 * @returns {Promise<string | null>}
 */
async function getMensamaxCookies(origin, { projekt = '', einrichtung = '', username = '', password = '' }) {
  const loginPage = await fetchWithTimeout(`${origin}/login.aspx`);
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

  const loginResp = await fetchWithTimeout(`${origin}/login.aspx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload,
  });

  /** @type {Record<string, string>} */
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

/**
 * @param {LunchConfig} lunchCfg
 * @param {string} datumStr
 * @param {ExecutionContext} ctx
 * @returns {Promise<LunchResult>}
 */
async function getLunchStatus(lunchCfg, datumStr, ctx) {
  const provider = lunchCfg.provider || 'mensamax';
  if (provider === 'cccampus') {
    // ccCampus runs exclusively in the browser (see the section further
    // down). The frontend therefore never sends credentials along for
    // ccCampus children — if one lands here anyway, that's a config error,
    // not something to fail silently on.
    return { lunch: 'Schulessen: ccCampus wird direkt im Browser abgefragt, nicht über den Proxy' };
  }
  if (provider === 'samson') {
    return getLunchStatusSamson(lunchCfg.samson, datumStr, ctx);
  }
  if (provider !== 'mensamax') {
    return { lunch: `Schulessen: unbekannter Anbieter "${provider}"` };
  }
  return { lunch: await getLunchStatusMensamax(lunchCfg, datumStr) };
}

/**
 * @param {LunchConfig} lunchCfg
 * @param {string} datumStr
 * @returns {Promise<string>}
 */
async function getLunchStatusMensamax(lunchCfg, datumStr) {
  const { base } = lunchCfg;
  if (!base || !lunchCfg.username || !lunchCfg.password) {
    throw new Error('Mensamax-Konfiguration unvollständig (base/username/password)');
  }
  // Requests are built from the checked origin plus fixed paths only — a
  // path, query or fragment in the configured base never reaches the URL,
  // so it cannot steer the request to e.g. a redirect endpoint.
  const { origin } = checkSafeHttpsUrl(base, { requiredSuffixes: MENSAMAX_ALLOWED_DOMAINS });

  const cookieHeader = await getMensamaxCookies(origin, lunchCfg);
  if (!cookieHeader) return 'Schulessen: Login fehlgeschlagen';

  const planResp = await fetchWithTimeout(
    `${origin}/mensamax/Essenbestellung/bestellen-stornieren/PlanForm.aspx`,
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

// ── sams-on (<instanz>.sams-on.de) ───────────────────────────────────────
//
// The JSON API behind the sams-on web app, used the way that app uses it:
// fetch the instance info (starts the session cookie), log in, read the
// account's user id, ask for the orders of exactly the requested day, log
// out. The session lives in a cookie, which sams-on's CORS setting ("*")
// does not allow in browser requests from other sites, hence the proxy.
// Read-only: no request here can order, cancel or change anything.

// What the sams-on web app sends as Content-Type (sic, leading slash).
// Without it, sams-on answers the instance info with an empty body.
const SAMSON_CONTENT_TYPE = '/application/vnd.akquinet.samson.v2';

// Cookie name/value as they may go into our own Cookie header: no
// separators, no whitespace (RFC 6265 cookie-octet for the value).
const COOKIE_PAIR = /^([A-Za-z0-9!#$%&'*+.^_`|~-]+)=([\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*)$/;

/**
 * Merges the Set-Cookie headers of a response into the session's cookies.
 * @param {Map<string, string>} jar
 * @param {Response} resp
 */
function collectCookies(jar, resp) {
  for (const header of getSetCookies(resp)) {
    const m = header.split(';', 1)[0].trim().match(COOKIE_PAIR);
    if (m) jar.set(m[1], m[2]);
  }
}

/** @param {Map<string, string>} jar */
function cookieHeader(jar) {
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * @param {Response} resp
 * @param {string} method
 * @returns {Promise<unknown>}
 */
async function samsonJson(resp, method) {
  if (!resp.ok) throw new Error(`sams-on: ${method} nicht abrufbar (HTTP ${resp.status})`);
  try {
    return JSON.parse(await resp.text());
  } catch (e) {
    throw new Error(`sams-on: keine gültige JSON-Antwort auf ${method} (HTTP ${resp.status})`, { cause: e });
  }
}

// Below this credit (in euros) the card highlights the balance. Our own
// choice: sams-on lets each school set a threshold for its own notice
// (lowCreditWarning in the instance info), but a school may leave it unset,
// and sams-on then warns not at all.
const SAMSON_LOW_CREDIT = 5;

// One limit for the whole sams-on sequence (up to four requests before the
// answer), on top of the per-request timeout: a hanging sams-on then costs
// at most this long per child, not four timeouts in a row.
const SAMSON_BUDGET_MS = 15000;

/**
 * @param {string | null} amount  e.g. "12,40"
 * @param {boolean | null} hidden  whether sams-on hides the credit at this school; null if unknown
 * @returns {SamsonBalance}
 */
function samsonBalance(amount, hidden) {
  if (hidden === true) return { betrag: null, knapp: false, gefuehrt: false };
  const betrag = hidden === false ? amount : null;
  return { betrag, knapp: betrag !== null && Number(betrag.replace(',', '.')) < SAMSON_LOW_CREDIT, gefuehrt: true };
}

/**
 * @param {SamsonConfig | undefined} samsonCfg
 * @param {string} datumStr  YYYYMMDD
 * @param {ExecutionContext} ctx
 * @returns {Promise<LunchResult>}
 */
async function getLunchStatusSamson(samsonCfg, datumStr, ctx) {
  const { instanz, benutzername, passwort, guthabenAnzeigen = false } = samsonCfg || {};
  if (!instanz || !benutzername || !passwort) {
    throw new Error('sams-on-Konfiguration unvollständig (Schuladresse/Benutzername/Passwort)');
  }
  const origin = samsonOrigin(instanz);
  const instanceName = new URL(origin).hostname.split('.')[0];
  const jar = new Map();
  const headers = () => ({ 'Content-Type': SAMSON_CONTENT_TYPE, Accept: 'application/json', ...(jar.size ? { Cookie: cookieHeader(jar) } : {}) });
  const budget = new AbortController();
  const budgetTimer = setTimeout(() => budget.abort(), SAMSON_BUDGET_MS);
  /**
   * @param {string} path
   * @param {RequestInit} [init]
   */
  const samsonFetch = (path, init) => fetchWithTimeout(`${origin}${path}`, { ...init, headers: headers() }, budget.signal);

  try {
    const instanceResp = await samsonFetch(`/api/instance/${instanceName}`);
    // An unknown school name: sams-on redirects to its homepage (seen live,
    // 302 to www.sams-on.de); a 404 would mean the same.
    const unknownSchool = instanceResp.status === 404 || (instanceResp.status >= 300 && instanceResp.status < 400);
    if (unknownSchool) throw new Error(`sams-on: Schule „${instanceName}“ nicht gefunden — Adresse in den Einstellungen prüfen`);
    if (!instanceResp.ok) throw new Error(`sams-on: nicht erreichbar (HTTP ${instanceResp.status})`);
    collectCookies(jar, instanceResp);
    // Whether sams-on shows the balance to users of this school at all —
    // only read when the balance is to be shown. An unreadable instance
    // info makes the balance "not available", it does not fail the meal
    // status.
    let creditHidden = /** @type {boolean | null} */ (false);
    if (guthabenAnzeigen) {
      try {
        creditHidden = samsonCreditHidden(JSON.parse(await instanceResp.text()));
      } catch {
        creditHidden = null;
      }
    }

    const loginResp = await samsonFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: benutzername, password: passwort }),
    });
    if (loginResp.status === 401 || loginResp.status === 403) return { lunch: 'Schulessen: Login fehlgeschlagen' };
    if (!loginResp.ok) throw new Error(`sams-on: Anmeldung nicht möglich (HTTP ${loginResp.status})`);
    collectCookies(jar, loginResp);

    try {
      const accountResp = await samsonFetch('/api/login?forceUserarea=false');
      // Not logged in after all: sams-on answers a failed login like this.
      if (accountResp.status === 401) return { lunch: 'Schulessen: Login fehlgeschlagen' };
      // sams-on sends name, e-mail, ID card number and credit with this
      // answer, always; only the user id and, if switched on, the credit
      // are taken from it.
      const account = await samsonJson(accountResp, 'login');
      const userId = validateSamsonAccount(account);
      const balance = guthabenAnzeigen ? { guthaben: samsonBalance(samsonCredit(account), creditHidden) } : {};

      const day = `${datumStr.slice(0, 4)}-${datumStr.slice(4, 6)}-${datumStr.slice(6, 8)}`;
      const ordersResp = await samsonFetch(`/api/users/${userId}/orders/view?dateFrom=${day}&dateTill=${day}`);
      const meals = validateSamsonOrders(await samsonJson(ordersResp, 'orders/view'))
        .filter((o) => o.dayId === day)
        .map((o) => samsonMealName(o.title))
        .filter((name) => name !== '');
      return { lunch: meals.length ? `Essen bestellt: ${meals.join(' / ')}` : 'Kein Essen bestellt', ...balance };
    } finally {
      // Sent after the answer, outside the shared time limit, so a slow
      // sams-on does not hold up the card. Not worth failing over: if it
      // does not go through, the session expires on its own.
      ctx.waitUntil(
        fetchWithTimeout(`${origin}/api/logout?forceUserarea=false`, { method: 'POST', headers: headers(), body: '{}' })
          .then(() => {}, () => {})
      );
    }
  } finally {
    clearTimeout(budgetTimer);
  }
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
  /**
   * @param {Request} request
   * @param {ProxyEnv} env
   * @param {ExecutionContext} ctx
   */
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

    // Only known fields, each a string or absent (see validate.mjs) — the
    // body comes straight from the browser and is as untrusted as any
    // upstream answer.
    let body;
    try {
      body = validateRequestBody(await request.json());
    } catch {
      return jsonResponse({ error: 'Ungültiger Request-Body' }, 400, corsHeaders);
    }

    const datum = resolveDate(body.datum);
    const webuntisCfg = body.webuntis;
    const lunchCfg = body.lunch;

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
      getLunchStatus(lunchCfg, datum, ctx),
    ]);

    const result = {
      datum,
      stunden: lessonsResult.status === 'fulfilled' ? lessonsResult.value : [],
      stundenFehler: lessonsResult.status === 'rejected' ? String(lessonsResult.reason.message || lessonsResult.reason) : null,
      lunch: lunchResult.status === 'fulfilled' ? lunchResult.value.lunch : 'Fehler beim Abrufen',
      lunchFehler: lunchResult.status === 'rejected' ? String(lunchResult.reason.message || lunchResult.reason) : null,
      // Only present when the parent switched the balance on (sams-on).
      ...(lunchResult.status === 'fulfilled' && lunchResult.value.guthaben
        ? {
          guthaben: lunchResult.value.guthaben.betrag,
          guthabenKnapp: lunchResult.value.guthaben.knapp,
          guthabenGefuehrt: lunchResult.value.guthaben.gefuehrt,
        }
        : {}),
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
