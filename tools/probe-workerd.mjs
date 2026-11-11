// Runs the real proxy (proxy/*.mjs, proxy/worker.js) in workerd, the
// Workers runtime from node_modules, against a local stand-in for WebUntis,
// Mensamax and sams-on that can answer slowly or stall. Checks what the
// test suite can only assume through its mocks: that the time limits end a
// provider that stalls before the headers or mid-body, in the real runtime.
// Run by hand, e.g. after a workerd update; takes about a minute.
//   node tools/probe-workerd.mjs
// Exit code 0: every scenario as expected; 1: at least one is not; 2: the
// probe itself could not run; 130/143: stopped by Ctrl+C or SIGTERM. Starts no wrangler and reaches no real
// provider: every outbound request of the worker goes to the stand-in.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const MODULES = ['worker.js', 'hostcheck.mjs', 'text.mjs', 'cachekey.mjs', 'validate.mjs'];
const MEAL_PAGE = '<html><td id="td20260901_1" class="speiseplan-menue tdSelected"><ul><li>Nudeln<</li></ul></td></html>';
const WEBUNTIS_RESULTS = {
  authenticate: { sessionId: 'abc123' },
  getKlassen: [{ id: 1, name: '9c' }],
  getTimetable: [{ id: 10, startTime: 800, endTime: 845, su: [{ id: 20 }], ro: [{ id: 2 }] }],
  getSubjects: [{ id: 20, longName: 'Deutsch' }],
  getRooms: [{ id: 2, name: 'R102' }],
  logout: {},
};

// What the stand-in does per request: a delay in ms, 'stallHeaders' (never
// answers) or 'stallBody' (headers and a first piece, then nothing).
/** @type {Record<string, number | string>} */
let behaviour = {};
/** @type {string[]} */
let seen = [];

/** @param {string} key  e.g. "WU getRooms" or "GET lessing.sams-on.de /api/login" */
function answerFor(key, host, path, method) {
  if (key.startsWith('WU ')) {
    return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 1, jsonrpc: '2.0', result: WEBUNTIS_RESULTS[key.slice(3)] }) };
  }
  if (host.endsWith('parentsmensa.de')) {
    if (path === '/login.aspx' && method === 'POST') {
      return { headers: { 'Content-Type': 'text/html', 'Set-Cookie': ['MensaMax=tok; Path=/', 'ASP.NET_SessionId=s; Path=/'] }, body: '<html>ok</html>' };
    }
    if (path === '/login.aspx') {
      return { headers: { 'Content-Type': 'text/html' }, body: '<html><input name="__VIEWSTATE" value="x"><input name="__VIEWSTATEGENERATOR" value="x"><input name="__EVENTVALIDATION" value="x"></html>' };
    }
    return { headers: { 'Content-Type': 'text/html' }, body: MEAL_PAGE };
  }
  if (host === 'lessing.sams-on.de') {
    const json = { 'Content-Type': 'application/vnd.akquinet.samson.v2+json' };
    if (path === '/api/instance/lessing') return { headers: { ...json, 'Set-Cookie': 'PHPSESSID=anonym; path=/' }, body: JSON.stringify({ short: 'lessing', hideCredit: '0' }) };
    if (path === '/api/login' && method === 'POST') return { headers: { ...json, 'Set-Cookie': 'PHPSESSID=angemeldet; path=/' }, body: '{"type":"user"}' };
    if (path === '/api/login') return { headers: json, body: JSON.stringify({ uid: '8', creditAmount: '12,40', user: { userId: '8', credit: '12,40' } }) };
    if (path === '/api/users/8/orders/view') return { headers: json, body: JSON.stringify({ orders: [] }) };
    return { headers: json, body: '{}' };
  }
  return null;
}

const standIn = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const host = String(req.headers.host);
  const path = String(req.url).split('?')[0];
  const key = path === '/WebUntis/jsonrpc.do' ? `WU ${JSON.parse(body).method}` : `${req.method} ${host} ${path}`;
  seen.push(key);
  const what = behaviour[key];
  if (what === 'stallHeaders') return;
  if (typeof what === 'number') await new Promise((resolve) => setTimeout(resolve, what));
  const answer = answerFor(key, host, path, req.method);
  if (!answer) { res.writeHead(599); res.end(); return; }
  res.writeHead(200, answer.headers);
  if (what === 'stallBody') { res.write(answer.body.slice(0, 5)); return; }
  res.end(answer.body);
});
// The Cache API of workerd talks to this: always a miss, every write accepted.
const cacheStandIn = http.createServer((req, res) => { req.resume(); res.writeHead(req.method === 'GET' ? 504 : 204); res.end(); });

const PROBE_ORIGIN = 'https://heute-schule.pages.dev';
const WEBUNTIS = { server: 'schule.webuntis.com', password: 'p', klasse: '9c' };
const MENSAMAX = { provider: 'mensamax', base: 'https://x.parentsmensa.de', projekt: 'P', einrichtung: 'E', password: 'p' };
const SAMSON = { provider: 'samson', samson: { instanz: 'lessing', passwort: 'p', guthabenAnzeigen: true } };
const timeout = (host) => `Zeitüberschreitung beim Zugriff auf ${host} (Gesamtzeit überschritten)`;

// Each scenario: the stand-in's behaviour, the request, and when the answer
// may come (from/to in ms) — "from" shows the stall really held, "to" that
// the limit ended it.
const SCENARIOS = [
  { name: 'normaler Abruf WebUntis und Mensamax', behaviour: {}, request: (u) => ({ webuntis: { ...WEBUNTIS, user: u }, lunch: { ...MENSAMAX, username: u } }),
    from: 0, to: 3000, check: (a) => a.stunden.length === 1 && a.lunch === 'Essen bestellt: Nudeln' },
  { name: 'WebUntis getRooms: Inhalt hängt', behaviour: { 'WU getRooms': 'stallBody' }, request: (u) => ({ webuntis: { ...WEBUNTIS, user: u }, lunch: {} }),
    from: 9500, to: 12000, check: (a, log) => a.stundenFehler === timeout('schule.webuntis.com') && log.includes('WU logout') },
  { name: 'WebUntis: jede Anfrage 4 s langsam', behaviour: Object.fromEntries(Object.keys(WEBUNTIS_RESULTS).map((m) => [`WU ${m}`, 4000])), request: (u) => ({ webuntis: { ...WEBUNTIS, user: u }, lunch: {} }),
    from: 9500, to: 14000, check: (a) => a.stundenFehler === timeout('schule.webuntis.com') },
  { name: 'WebUntis-Abmeldung: Inhalt hängt', behaviour: { 'WU logout': 'stallBody' }, request: (u) => ({ webuntis: { ...WEBUNTIS, user: u }, lunch: {} }),
    from: 2500, to: 5000, check: (a) => a.stundenFehler === null && a.stunden.length === 1 },
  { name: 'WebUntis-Abmeldung: keine Header', behaviour: { 'WU logout': 'stallHeaders' }, request: (u) => ({ webuntis: { ...WEBUNTIS, user: u }, lunch: {} }),
    from: 2500, to: 5000, check: (a) => a.stundenFehler === null && a.stunden.length === 1 },
  { name: 'Mensamax-Speiseplan: Inhalt hängt', behaviour: { 'GET x.parentsmensa.de /mensamax/Essenbestellung/bestellen-stornieren/PlanForm.aspx': 'stallBody' }, request: (u) => ({ webuntis: {}, lunch: { ...MENSAMAX, username: u } }),
    from: 9500, to: 12000, check: (a) => a.lunchFehler === timeout('x.parentsmensa.de') },
  { name: 'sams-on-Bestellungen: Inhalt hängt, Abmeldung geht trotzdem raus', behaviour: { 'GET lessing.sams-on.de /api/users/8/orders/view': 'stallBody' }, request: (u) => ({ webuntis: {}, lunch: { ...SAMSON, samson: { ...SAMSON.samson, benutzername: u } } }),
    from: 9500, to: 12000, check: (a, log) => a.lunchFehler === timeout('lessing.sams-on.de') && log.includes('POST lessing.sams-on.de /api/logout') },
];

/** @param {http.Server} server */
async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = server.address();
  return typeof address === 'object' && address ? address.port : 0;
}

/** A port nobody listens on right now (the OS hands out a free one). */
async function freePort() {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(() => resolve(undefined)));
  return port;
}

/**
 * Starts workerd and runs every scenario. Returns the exit code; cleans up
 * on every way out, Ctrl+C and SIGTERM included, so no workerd and no temp
 * directory stay behind.
 * @returns {Promise<number>}
 */
async function main() {
  const work = mkdtempSync(join(tmpdir(), 'probe-workerd-'));
  let workerd;
  // Node ends on a signal without running `finally`, so the signal cleans up
  // itself.
  const stop = (signal) => {
    workerd?.kill();
    rmSync(work, { recursive: true, force: true });
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const standInPort = await listen(standIn);
    const cachePort = await listen(cacheStandIn);
    const workerPort = await freePort();
    // workerd embeds files relative to its config, so the modules sit next to it.
    for (const m of MODULES) copyFileSync(join(repo, 'proxy', m), join(work, m));
    const embeds = MODULES.map((m) => `(name = "${m}", esModule = embed "${m}")`).join(', ');
    writeFileSync(join(work, 'config.capnp'), `using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [
    (name = "main", worker = .proxy),
    (name = "provider", external = (address = "127.0.0.1:${standInPort}", http = ())),
    (name = "cache", external = (address = "127.0.0.1:${cachePort}", http = ())),
  ],
  sockets = [ (name = "http", address = "127.0.0.1:${workerPort}", http = (), service = "main") ],
);
const proxy :Workerd.Worker = (
  modules = [ ${embeds} ],
  compatibilityDate = "2026-08-25",
  bindings = [ (name = "ALLOWED_ORIGIN", text = "${PROBE_ORIGIN}") ],
  globalOutbound = "provider",
  cacheApiOutbound = "cache",
);
`);
    workerd = spawn(join(repo, 'node_modules', '.bin', 'workerd'), ['serve', join(work, 'config.capnp')], { stdio: ['ignore', 'ignore', 'inherit'] });
    const base = `http://127.0.0.1:${workerPort}`;
    // Only our proxy answers a preflight with this origin; anything else that
    // took the port in the meantime does not get the placeholder logins.
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      up = await fetch(`${base}/api/status`, { method: 'OPTIONS' })
        .then((resp) => resp.headers.get('Access-Control-Allow-Origin') === PROBE_ORIGIN, () => false);
    }
    if (!up) {
      console.error('workerd startet nicht, oder auf dem Port antwortet ein anderer Dienst.');
      return 2;
    }

    let failed = 0;
    for (const [i, scenario] of SCENARIOS.entries()) {
      behaviour = scenario.behaviour;
      seen = [];
      const started = Date.now();
      let answer;
      let ms;
      try {
        const resp = await fetch(`${base}/api/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
          body: JSON.stringify({ ...scenario.request(`probe${i}`), datum: '20260901' }),
          signal: AbortSignal.timeout(30000),
        });
        answer = await resp.json();
        ms = Date.now() - started;
      } catch (e) {
        ms = Date.now() - started;
        answer = { clientError: e instanceof Error ? e.name : String(e) };
      }
      // Work after the answer (the sams-on logout) needs a moment to arrive.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const ok = !('clientError' in answer) && ms >= scenario.from && ms <= scenario.to && scenario.check(answer, seen);
      if (!ok) failed++;
      console.log(`${ok ? '✓' : '✗'} ${scenario.name}: ${ms} ms (erwartet ${scenario.from}–${scenario.to})`);
      if (!ok) console.log(`    Antwort: ${JSON.stringify(answer)}\n    Anfragen: ${seen.join(' | ')}`);
    }
    console.log(failed ? `\n${failed} von ${SCENARIOS.length} Szenarien nicht wie erwartet.` : `\nAlle ${SCENARIOS.length} Szenarien wie erwartet.`);
    return failed ? 1 : 0;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    workerd?.kill();
    standIn.closeAllConnections();
    standIn.close();
    cacheStandIn.close();
    rmSync(work, { recursive: true, force: true });
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`Die Prüfung ließ sich nicht ausführen: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
);
