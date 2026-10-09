// Test suite — runs with plain Node:
//   node run-tests.mjs
// The only package it uses is ESLint itself (already a devDependency), to
// check that the lint rules actually catch what they are meant to catch.
//
// ESM (.mjs), because the proxy modules (hostcheck.mjs) are ESM — the
// Apps Script logic in stundenplan.js is still CommonJS and gets wired in
// here by Node automatically as a default export.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import stundenplan from './stundenplan.js';
import { parseHeadersFile, checkSecurityHeaders, compareHeaders } from './tools/headers.mjs';
import { isPrivateOrLocalTarget, checkSafeHostname, checkSafeHttpsUrl, httpsUrlForHost } from './proxy/hostcheck.mjs';
import { buildCacheKeyMaterial } from './proxy/cachekey.mjs';
import {
  validateRequestBody, validateRpcEnvelope, validateAuth, validateClasses, validateLessons, validateSubjects, validateRooms,
} from './proxy/validate.mjs';
import proxyWorker from './proxy/worker.js';

const {
  pad,
  extractLastPhpsessid,
  extractUpdatedPhpsessid,
  parseLunchStatus,
  buildLessonList,
  formatLessons,
  buildEmail,
} = stundenplan;

let passed = 0; let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

// For tests against proxy/worker.js's fetch() handler, which is async
// throughout (real awaits on Promise.allSettled, cache lookups, ...) — a
// plain sync test() can't catch a rejected promise.
async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion fehlgeschlagen');
}

function assertEqual(a, b) {
  if (a !== b) throw new Error(`Erwartet: ${JSON.stringify(b)}\n    Erhalten:  ${JSON.stringify(a)}`);
}

// ── pad ────────────────────────────────────────────────────────────────────
console.log('\npad()');
test('single-digit number gets padded',   () => assertEqual(pad(5),  '05'));
test('two-digit number stays the same',   () => assertEqual(pad(12), '12'));
test('zero becomes 00',                   () => assertEqual(pad(0),  '00'));

// ── Cookie extraction ────────────────────────────────────────────────────
console.log('\nextractLastPhpsessid()');

test('simple cookie string', () => {
  assertEqual(extractLastPhpsessid('PHPSESSID=abc123; Path=/'), 'PHPSESSID=abc123');
});

test('takes the last of two PHPSESSIDs (double-cookie bug)', () => {
  const raw = 'PHPSESSID=first111; Path=/\nPHPSESSID=second222; Path=/';
  assertEqual(extractLastPhpsessid(raw), 'PHPSESSID=second222');
});

test('array of cookies', () => {
  const raw = ['PHPSESSID=cookieA; Path=/', 'PHPSESSID=cookieB; Path=/'];
  assertEqual(extractLastPhpsessid(raw), 'PHPSESSID=cookieB');
});

test('no PHPSESSID → null', () => {
  assertEqual(extractLastPhpsessid('session=xyz'), null);
});

test('empty string → null', () => {
  assertEqual(extractLastPhpsessid(''), null);
});

test('null → null', () => {
  assertEqual(extractLastPhpsessid(null), null);
});

// ── Session rotation ─────────────────────────────────────────────────────
console.log('\nextractUpdatedPhpsessid() — session rotation');

test('extract a new PHPSESSID from the response header', () => {
  const respCookies = ['PHPSESSID=rotated999; Path=/; HttpOnly'];
  assertEqual(extractUpdatedPhpsessid(respCookies), 'PHPSESSID=rotated999');
});

test('no new cookie → null (no update)', () => {
  assertEqual(extractUpdatedPhpsessid(''), null);
});

test('takes the last cookie when several are in the response', () => {
  const respCookies = 'PHPSESSID=old111; Path=/\nPHPSESSID=new222; Path=/';
  assertEqual(extractUpdatedPhpsessid(respCookies), 'PHPSESSID=new222');
});

// ── parseLunchStatus ─────────────────────────────────────────────────────
console.log('\nparseLunchStatus()');

const today = new Date(2026, 5, 22); // Monday 2026-06-22

function makeCalendar(dayProps) {
  return { '2026': { '6': { '22': dayProps } } };
}

test('no catering → no school lunch', () => {
  const cal = makeCalendar({ CATERING: 0 });
  assertEqual(parseLunchStatus(cal, null, today), 'Kein Schulessen heute');
});

test('catering entry present but no CATERING flag → no school lunch', () => {
  const cal = makeCalendar({});
  assertEqual(parseLunchStatus(cal, null, today), 'Kein Schulessen heute');
});

test('signed off', () => {
  const cal = makeCalendar({ CATERING: 1, SIGNED_OFF: 1 });
  assertEqual(parseLunchStatus(cal, null, today), 'Abgemeldet (kein Essen)');
});

test('menu ordered (AUSGEWAEHLT=1)', () => {
  const cal = makeCalendar({ CATERING: 1 });
  const details = { MENUES: [
    { MENUE_NR: 1, MENUE_TEXT: 'Spaghetti Bolognese', PREIS: '3,80 EUR', AUSGEWAEHLT: '1' },
    { MENUE_NR: 2, MENUE_TEXT: 'Gemüsesuppe',         PREIS: '3,80 EUR', AUSGEWAEHLT: '0' },
  ]};
  assertEqual(parseLunchStatus(cal, details, today), 'Essen bestellt: Spaghetti Bolognese (3,80 EUR)');
});

test('menus available but none selected', () => {
  const cal = makeCalendar({ CATERING: 1 });
  const details = { MENUES: [
    { MENUE_NR: 1, MENUE_TEXT: 'Spaghetti', PREIS: '3,80 EUR', AUSGEWAEHLT: '0' },
  ]};
  assertEqual(parseLunchStatus(cal, details, today), 'Essen verfügbar (kein Menü gewählt)');
});

test('details null (session problem or signed off) → fallback', () => {
  const cal = makeCalendar({ CATERING: 1 });
  assertEqual(parseLunchStatus(cal, null, today), 'Essen bestellt ✓');
});

test('cal null → data not available', () => {
  assertEqual(parseLunchStatus(null, null, today), 'Schulessen: Daten nicht verfügbar');
});

test('the second menu is the selected one', () => {
  const cal = makeCalendar({ CATERING: 1 });
  const details = { MENUES: [
    { MENUE_NR: 1, MENUE_TEXT: 'Fleischgericht', PREIS: '4,00 EUR', AUSGEWAEHLT: '0' },
    { MENUE_NR: 2, MENUE_TEXT: 'Veganes Gericht', PREIS: '4,00 EUR', AUSGEWAEHLT: '1' },
  ]};
  assertEqual(parseLunchStatus(cal, details, today), 'Essen bestellt: Veganes Gericht (4,00 EUR)');
});

// ── buildLessonList ──────────────────────────────────────────────────────
console.log('\nbuildLessonList()');

const subjectsById = { 10: 'Mathematik', 20: 'Deutsch', 30: 'Englisch' };
const roomsById     = { 1: 'R101', 2: 'R102', 3: 'Sporthalle' };

// startTime/endTime use WebUntis's own HHMM integer format (e.g. 800/845
// = 8:00–8:45, a normal 45-minute first period) — not arbitrary numbers.
function makeLesson(id, startTime, endTime, subjectId, roomId, code) {
  return {
    id, startTime, endTime,
    su: subjectId ? [{ id: subjectId }] : [],
    ro: roomId ? [{ id: roomId }] : [],
    code: code || null,
  };
}

test('a simple lesson', () => {
  const result = buildLessonList(
    [makeLesson(1, 800, 845, 10, 1)],
    subjectsById, roomsById
  );
  assert(result.length === 1);
  assertEqual(result[0].fach,  'Mathematik');
  assertEqual(result[0].raum,  'R101');
  assertEqual(result[0].start, '08:00');
  assertEqual(result[0].ende,  '08:45');
  assertEqual(result[0].vertretung, false);
});

test('a cancelled lesson is filtered out', () => {
  const result = buildLessonList(
    [makeLesson(1, 800, 845, 10, 1, 'cancelled')],
    subjectsById, roomsById
  );
  assertEqual(result.length, 0);
});

test('a substitution is flagged', () => {
  const result = buildLessonList(
    [makeLesson(1, 800, 845, 20, 1, 'irregular')],
    subjectsById, roomsById
  );
  assertEqual(result[0].vertretung, true);
});

test('duplicate IDs are deduplicated', () => {
  const result = buildLessonList(
    [makeLesson(5, 800, 845, 10, 1), makeLesson(5, 800, 845, 10, 1)],
    subjectsById, roomsById
  );
  assertEqual(result.length, 1);
});

test('sorted by start time', () => {
  const result = buildLessonList(
    [makeLesson(2, 945, 1030, 20, 2), makeLesson(1, 800, 845, 10, 1)],
    subjectsById, roomsById
  );
  assertEqual(result[0].start, '08:00');
  assertEqual(result[1].start, '09:45');
});

test('unknown subject → ?', () => {
  const result = buildLessonList(
    [makeLesson(1, 800, 845, 99, 1)],
    subjectsById, roomsById
  );
  assertEqual(result[0].fach, '?');
});

test('no subject → ?', () => {
  const result = buildLessonList(
    [makeLesson(1, 800, 845, null, 1)],
    subjectsById, roomsById
  );
  assertEqual(result[0].fach, '?');
});

test('unknown room → ?', () => {
  const result = buildLessonList(
    [makeLesson(1, 800, 845, 10, 99)],
    subjectsById, roomsById
  );
  assertEqual(result[0].raum, '?');
});

// ── formatLessons ────────────────────────────────────────────────────────
console.log('\nformatLessons()');

test('empty list', () => {
  assertEqual(formatLessons([]), '  (keine Stunden / schulfrei)');
});

test('a single lesson', () => {
  const lessons = [{ fach: 'Mathematik', raum: 'R101', start: '08:00', ende: '08:45', vertretung: false }];
  const result = formatLessons(lessons);
  assert(result.includes('08:00–08:45'), 'time is missing');
  assert(result.includes('Mathematik'),  'subject is missing');
  assert(result.includes('R101'),        'room is missing');
  assert(!result.includes('⚠'),          'no substitution marker expected');
});

test('a substitution shows ⚠', () => {
  const lessons = [{ fach: 'Deutsch', raum: 'R102', start: '09:45', ende: '10:30', vertretung: true }];
  assert(formatLessons(lessons).includes('⚠ Vertretung'));
});

test('parallel groups are combined into one line', () => {
  const lessons = [
    { fach: 'Latein',      raum: 'R101', start: '08:00', ende: '08:45', vertretung: false },
    { fach: 'Französisch', raum: 'R102', start: '08:00', ende: '08:45', vertretung: false },
    { fach: 'Spanisch',    raum: 'R103', start: '08:00', ende: '08:45', vertretung: false },
  ];
  const result = formatLessons(lessons);
  const lines = result.split('\n');
  assertEqual(lines.length, 1);
  assert(result.includes('Latein'),      'Latein is missing');
  assert(result.includes('Französisch'), 'Französisch is missing');
  assert(result.includes('Spanisch'),    'Spanisch is missing');
});

test('different times stay on separate lines', () => {
  const lessons = [
    { fach: 'Mathe',    raum: 'R101', start: '08:00', ende: '08:45', vertretung: false },
    { fach: 'Deutsch',  raum: 'R102', start: '09:45', ende: '10:30', vertretung: false },
  ];
  const lines = formatLessons(lessons).split('\n');
  assertEqual(lines.length, 2);
});

// ── buildEmail ───────────────────────────────────────────────────────────
console.log('\nbuildEmail()');

const monday = new Date(2026, 5, 22); // a Monday

const childrenNoError = [
  { kind: { name: 'Mia', klasse: '8c' }, stunden: [], lunch: 'Essen bestellt ✓', fehler: null },
  { kind: { name: 'Emma', klasse: '5d' }, stunden: [], lunch: 'Abgemeldet (kein Essen)', fehler: null },
];

test('subject contains [SCHULE]', () => {
  const { subject } = buildEmail(childrenNoError, monday);
  assert(subject.startsWith('[SCHULE]'), 'missing [SCHULE] prefix');
});

test('subject contains the weekday', () => {
  const { subject } = buildEmail(childrenNoError, monday);
  assert(subject.includes('Montag'), 'weekday missing from subject');
});

test('subject contains the date', () => {
  const { subject } = buildEmail(childrenNoError, monday);
  assert(subject.includes('22.06.2026'), 'date missing from subject');
});

test('no ⚠ in the subject without an error', () => {
  const { subject } = buildEmail(childrenNoError, monday);
  assert(!subject.includes('⚠'), '⚠ not expected');
});

test('⚠ in the subject when there is an error', () => {
  const childrenWithError = [
    { kind: { name: 'Mia', klasse: '8c' }, stunden: [], lunch: '', fehler: 'Timeout' },
  ];
  const { subject } = buildEmail(childrenWithError, monday);
  assert(subject.includes('⚠'), '⚠ expected on error');
});

test('body contains the greeting', () => {
  const { body } = buildEmail(childrenNoError, monday);
  assert(body.includes('Hallo Liebe Eltern'), 'greeting is missing');
});

test('body contains both children', () => {
  const { body } = buildEmail(childrenNoError, monday);
  assert(body.includes('Mia'),  'Mia is missing');
  assert(body.includes('Emma'), 'Emma is missing');
});

test('body contains the class name in uppercase', () => {
  const { body } = buildEmail(childrenNoError, monday);
  assert(body.includes('8C'), '8C is missing');
  assert(body.includes('5D'), '5D is missing');
});

test('error note in the body when there is an error', () => {
  const childrenWithError = [
    { kind: { name: 'Mia', klasse: '8c' }, stunden: [], lunch: '', fehler: 'Timeout' },
  ];
  const { body } = buildEmail(childrenWithError, monday);
  assert(body.includes('Datenabruf fehlgeschlagen'), 'error note is missing');
  assert(body.includes('Timeout'), 'error text is missing');
});

test('body ends with the signature', () => {
  const { body } = buildEmail(childrenNoError, monday);
  assert(body.includes('Deine Heute Schule App'), 'signature is missing');
});

// ── Proxy: target-host validation (SSRF protection) ─────────────────────

function assertWirft(fn, expectedSubstring) {
  let thrown = null;
  try { fn(); } catch (e) { thrown = e; }
  if (!thrown) throw new Error('No error was thrown, but one was expected');
  if (expectedSubstring && !thrown.message.includes(expectedSubstring)) {
    throw new Error(`Error message doesn't match.\n    Expected to contain: ${expectedSubstring}\n    Got:  ${thrown.message}`);
  }
}

console.log('\nisPrivateOrLocalTarget()');
test('localhost',            () => assert(isPrivateOrLocalTarget('localhost')));
test('127.0.0.1 (loopback)', () => assert(isPrivateOrLocalTarget('127.0.0.1')));
test('10.x (RFC1918)',       () => assert(isPrivateOrLocalTarget('10.1.2.3')));
test('172.16.x (RFC1918)',   () => assert(isPrivateOrLocalTarget('172.16.0.1')));
test('172.31.x (RFC1918)',   () => assert(isPrivateOrLocalTarget('172.31.255.254')));
test('172.32.x is public (boundary case)', () => assert(!isPrivateOrLocalTarget('172.32.0.1')));
test('192.168.x (RFC1918)',  () => assert(isPrivateOrLocalTarget('192.168.0.1')));
test('169.254.169.254 (cloud metadata)', () => assert(isPrivateOrLocalTarget('169.254.169.254')));
test('::1 (IPv6 loopback)',  () => assert(isPrivateOrLocalTarget('::1')));
test('fd00: (IPv6 ULA)',     () => assert(isPrivateOrLocalTarget('fd00::1')));
test('.local domain',        () => assert(isPrivateOrLocalTarget('nas.local')));
test('real domain is not private', () => assert(!isPrivateOrLocalTarget('lg-norderstedt.webuntis.com')));
test('public IP is not private', () => assert(!isPrivateOrLocalTarget('8.8.8.8')));

console.log('\ncheckSafeHostname()');
test('valid WebUntis server passes', () => {
  assertEqual(checkSafeHostname('lg-norderstedt.webuntis.com', { requiredSuffix: '.webuntis.com' }), 'lg-norderstedt.webuntis.com');
});
test('capitalization is normalized', () => {
  assertEqual(checkSafeHostname('LG-Norderstedt.WebUntis.com', { requiredSuffix: '.webuntis.com' }), 'lg-norderstedt.webuntis.com');
});
test('requiredSuffixes (list) lets any one of several allowed domains through', () => {
  assertEqual(
    checkSafeHostname('parentsmensa.de', { requiredSuffixes: ['.parentsmensa.de', '.andere-schule.de'] }),
    'parentsmensa.de'
  );
  assertEqual(
    checkSafeHostname('portal.andere-schule.de', { requiredSuffixes: ['.parentsmensa.de', '.andere-schule.de'] }),
    'portal.andere-schule.de'
  );
});
test('requiredSuffixes (list) rejects a domain matching none of the entries', () => {
  assertWirft(
    () => checkSafeHostname('angreifer.example', { requiredSuffixes: ['.parentsmensa.de', '.andere-schule.de'] }),
    'muss auf'
  );
});
test('foreign domain is rejected', () => {
  assertWirft(() => checkSafeHostname('angreifer.example', { requiredSuffix: '.webuntis.com' }), 'muss auf');
});
test('suffix trick is rejected (webuntis.com.angreifer.example)', () => {
  assertWirft(() => checkSafeHostname('webuntis.com.angreifer.example', { requiredSuffix: '.webuntis.com' }), 'muss auf');
});
test('loopback is rejected, even without a required suffix', () => {
  assertWirft(() => checkSafeHostname('127.0.0.1'), 'internes/lokales Ziel');
});
test('cloud-metadata IP is rejected', () => {
  assertWirft(() => checkSafeHostname('169.254.169.254'), 'internes/lokales Ziel');
});
test('credentials in the hostname are rejected', () => {
  assertWirft(() => checkSafeHostname('user@evil.example'), 'Ungültiger Server-Hostname');
});
test('path in the hostname is rejected', () => {
  assertWirft(() => checkSafeHostname('webuntis.com/../evil'), 'Ungültiger Server-Hostname');
});
test('empty hostname is rejected', () => {
  assertWirft(() => checkSafeHostname(''), 'Ungültiger Server-Hostname');
});
test('REGRESSION: a delimiter before the required suffix cannot smuggle in another host', () => {
  // Each of these ends in ".webuntis.com" as a string, but the URL parser
  // reads everything from the delimiter on as fragment/query/path, so the
  // fetch would go to the host in front of it.
  for (const input of [
    'evil.example#.webuntis.com',
    'evil.example?.webuntis.com',
    'evil.example\\.webuntis.com',
    'evil.example:443#.webuntis.com',
    '127.0.0.1#.webuntis.com',
  ]) {
    assertWirft(() => checkSafeHostname(input, { requiredSuffix: '.webuntis.com' }), 'Ungültiger Server-Hostname');
  }
});
test('labels violating RFC 1123 are rejected (empty, leading/trailing hyphen, too long)', () => {
  for (const input of ['a..webuntis.com', '-a.webuntis.com', 'a-.webuntis.com', `${'a'.repeat(64)}.webuntis.com`, '.webuntis.com']) {
    assertWirft(() => checkSafeHostname(input, { requiredSuffix: '.webuntis.com' }), 'Ungültiger Server-Hostname');
  }
});
test('a 63-character label is still accepted (boundary)', () => {
  const host = `${'a'.repeat(63)}.webuntis.com`;
  assertEqual(checkSafeHostname(host, { requiredSuffix: '.webuntis.com' }), host);
});
test('non-ASCII hostname is rejected, its xn-- form is accepted', () => {
  assertWirft(() => checkSafeHostname('schüle.webuntis.com', { requiredSuffix: '.webuntis.com' }), 'Ungültiger Server-Hostname');
  assertEqual(checkSafeHostname('xn--schle-mva.webuntis.com', { requiredSuffix: '.webuntis.com' }), 'xn--schle-mva.webuntis.com');
});

console.log('\nhttpsUrlForHost()');
test('builds the URL for a checked hostname', () => {
  assertEqual(httpsUrlForHost('schule.webuntis.com', '/WebUntis/jsonrpc.do'), 'https://schule.webuntis.com/WebUntis/jsonrpc.do');
});
test('fails closed when the parser would resolve a different host', () => {
  assertWirft(() => httpsUrlForHost('evil.example#.webuntis.com', '/WebUntis/jsonrpc.do'), 'Ungültiger Server-Hostname');
  assertWirft(() => httpsUrlForHost('a\t.webuntis.com', '/WebUntis/jsonrpc.do'), 'Ungültiger Server-Hostname');
});
test('fails closed when the URL does not parse at all', () => {
  assertWirft(() => httpsUrlForHost('a b.webuntis.com', '/WebUntis/jsonrpc.do'), 'Ungültiger Server-Hostname');
});
test('REGRESSION: a full WebUntis URL copied from the address bar is accepted', () => {
  // Covers someone pasting the whole address-bar URL into the server field
  // instead of just the hostname.
  assertEqual(
    checkSafeHostname('https://schule.webuntis.com/WebUntis/#/basic/login', { requiredSuffix: '.webuntis.com' }),
    'schule.webuntis.com'
  );
});
test('WebUntis URL without a path is accepted', () => {
  assertEqual(
    checkSafeHostname('https://schule.webuntis.com/', { requiredSuffix: '.webuntis.com' }),
    'schule.webuntis.com'
  );
});
test('a URL to a foreign domain stays rejected (URL parsing is not a free pass)', () => {
  assertWirft(() => checkSafeHostname('https://angreifer.example/x', { requiredSuffix: '.webuntis.com' }), 'muss auf');
});
test('a URL to an internal address stays rejected', () => {
  assertWirft(() => checkSafeHostname('https://169.254.169.254/pfad'), 'internes/lokales Ziel');
});

console.log('\ncheckSafeHttpsUrl()');
test('Mensamax base URL passes', () => {
  assertEqual(checkSafeHttpsUrl('https://parentsmensa.de').hostname, 'parentsmensa.de');
});
test('ccCampus base URL with a path passes', () => {
  assertEqual(checkSafeHttpsUrl('https://cccampus.mbs5online.de/ordering').hostname, 'cccampus.mbs5online.de');
});
test('http:// is rejected', () => {
  assertWirft(() => checkSafeHttpsUrl('http://parentsmensa.de'), 'Nur https');
});
test('file:// is rejected', () => {
  assertWirft(() => checkSafeHttpsUrl('file:///etc/passwd'), 'Nur https');
});
test('credentials in the URL are rejected', () => {
  assertWirft(() => checkSafeHttpsUrl('https://user:pw@parentsmensa.de'), 'keine Zugangsdaten');
});
test('a non-default port is rejected', () => {
  assertWirft(() => checkSafeHttpsUrl('https://parentsmensa.de:8443'), 'kein eigener Port');
});
test('the explicit default port :443 is accepted (the parser drops it)', () => {
  assertEqual(checkSafeHttpsUrl('https://parentsmensa.de:443').origin, 'https://parentsmensa.de');
});
test('an internal address as the base URL is rejected', () => {
  assertWirft(() => checkSafeHttpsUrl('https://192.168.1.1/admin'), 'internes/lokales Ziel');
});
test('cloud metadata as the base URL is rejected', () => {
  assertWirft(() => checkSafeHttpsUrl('https://169.254.169.254/latest/meta-data/'), 'internes/lokales Ziel');
});
test('garbage input is rejected', () => {
  assertWirft(() => checkSafeHttpsUrl('nicht mal eine url'), 'Ungültige Basis-URL');
});
test('REGRESSION: the Mensamax allowlist lets the known domain through', () => {
  assertEqual(
    checkSafeHttpsUrl('https://parentsmensa.de', { requiredSuffixes: ['.parentsmensa.de'] }).hostname,
    'parentsmensa.de'
  );
});
test('REGRESSION: the Mensamax allowlist rejects any unrelated domain', () => {
  assertWirft(
    () => checkSafeHttpsUrl('https://angreifer.example', { requiredSuffixes: ['.parentsmensa.de'] }),
    'muss auf'
  );
});
test('REGRESSION: a suffix trick against the Mensamax allowlist stays rejected', () => {
  assertWirft(
    () => checkSafeHttpsUrl('https://parentsmensa.de.angreifer.example', { requiredSuffixes: ['.parentsmensa.de'] }),
    'muss auf'
  );
});

// ── Property-based tests for the security-critical hostname checks ─────────
//
// Prompted by review feedback: hand-picked example values (like the ones
// above) don't show *why* those particular numbers/strings were chosen —
// nothing stops an implementation (or an AI writing the test) from being
// shaped to pass exactly those examples without actually satisfying the
// underlying property. Generating many inputs from an explicitly named
// equivalence class and checking the property holds for all of them is
// much harder to satisfy by accident.
//
// Deterministic PRNG (mulberry32) instead of Math.random(), so a failure
// is reproducible from the printed seed and CI runs are not flaky.
function mulberry32(seed) {
  return function next() {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROPERTY_TEST_SEED = 20260901;
const PROPERTY_TEST_ITERATIONS = 200;

function forAll(name, generator, property) {
  test(`${name} (${PROPERTY_TEST_ITERATIONS} generated cases, seed ${PROPERTY_TEST_SEED})`, () => {
    const random = mulberry32(PROPERTY_TEST_SEED);
    for (let i = 0; i < PROPERTY_TEST_ITERATIONS; i++) {
      const input = generator(random);
      try {
        property(input);
      } catch (e) {
        throw new Error(`case ${i} (input: ${JSON.stringify(input)}, seed: ${PROPERTY_TEST_SEED}): ${e.message}`, { cause: e });
      }
    }
  });
}

function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function randomLabel(random, minLen = 1, maxLen = 10) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const len = randomInt(random, minLen, maxLen);
  let label = '';
  for (let i = 0; i < len; i++) label += alphabet[randomInt(random, 0, alphabet.length - 1)];
  return label;
}

console.log('\nProperty: isPrivateOrLocalTarget()');

// Equivalence class: any address inside 10.0.0.0/8 (all of RFC1918's
// largest private block) — every single one must be flagged private,
// not just the one example (10.1.2.3) used above.
forAll(
  'random 10.0.0.0/8 address is always private',
  (random) => `10.${randomInt(random, 0, 255)}.${randomInt(random, 0, 255)}.${randomInt(random, 0, 255)}`,
  (ip) => assert(isPrivateOrLocalTarget(ip), `${ip} should have been classified as private/internal`)
);

// Equivalence class: 192.168.0.0/16.
forAll(
  'random 192.168.0.0/16 address is always private',
  (random) => `192.168.${randomInt(random, 0, 255)}.${randomInt(random, 0, 255)}`,
  (ip) => assert(isPrivateOrLocalTarget(ip), `${ip} should have been classified as private/internal`)
);

// Equivalence class: public IPv4 space, deliberately built by picking a
// first octet outside every reserved range this function checks for
// (0, 10, 100 [CGNAT], 127, 169, 172, 192) — so every generated address is,
// by construction, a real public-space example, not a coincidence. Some of
// these octets (e.g. 172.32.x.x, covered by an explicit boundary test
// above) are actually public too; excluding the whole octet here just
// keeps the generator simple, it does not narrow what the property means.
const RESERVED_FIRST_OCTETS = new Set([0, 10, 100, 127, 169, 172, 192]);
function randomPublicFirstOctet(random) {
  let octet;
  do { octet = randomInt(random, 1, 223); } while (RESERVED_FIRST_OCTETS.has(octet));
  return octet;
}
forAll(
  'random public-space IPv4 address is never private',
  (random) => `${randomPublicFirstOctet(random)}.${randomInt(random, 0, 255)}.${randomInt(random, 0, 255)}.${randomInt(random, 0, 255)}`,
  (ip) => assert(!isPrivateOrLocalTarget(ip), `${ip} should NOT have been classified as private/internal`)
);

console.log('\nProperty: checkSafeHostname() with a fixed allowlist');

const ALLOWED_TEST_SUFFIX = '.parentsmensa.de';

// Equivalence class: any hostname that genuinely ends in the allowed
// suffix, built from a random label of random length — not just the one
// hand-picked example ("parentsmensa.de") used above.
forAll(
  'random subdomain of the allowed suffix is always accepted',
  (random) => `${randomLabel(random)}${ALLOWED_TEST_SUFFIX}`,
  (host) => assertEqual(checkSafeHostname(host, { requiredSuffixes: [ALLOWED_TEST_SUFFIX] }), host)
);

// Equivalence class: random domains built from an unrelated TLD, so by
// construction they cannot end in the allowed suffix — the property under
// test is "anything outside the allowlist is rejected", not "this one
// attacker domain is rejected".
forAll(
  'random domain outside the allowlist is always rejected',
  (random) => `${randomLabel(random)}.${randomLabel(random, 2, 6)}.example`,
  (host) => assertWirft(() => checkSafeHostname(host, { requiredSuffixes: [ALLOWED_TEST_SUFFIX] }), 'muss auf')
);

// Equivalence class: the allowed domain glued directly onto a random
// label, without the separating dot ("evilparentsmensa.de"). Ends in the
// domain name as a string, but is a different registrable domain — the
// leading dot of the suffix is what makes the check a domain boundary.
forAll(
  'allowed domain glued on without a dot is always rejected (Mensamax list)',
  (random) => `${randomLabel(random)}${ALLOWED_TEST_SUFFIX.slice(1)}`,
  (host) => assertWirft(() => checkSafeHostname(host, { requiredSuffixes: [ALLOWED_TEST_SUFFIX] }), 'muss auf')
);
forAll(
  'allowed domain glued on without a dot is always rejected (WebUntis single suffix)',
  (random) => `${randomLabel(random)}webuntis.com`,
  (host) => assertWirft(() => checkSafeHostname(host, { requiredSuffix: '.webuntis.com' }), 'muss auf')
);

console.log('\nProperty: checkSafeHostname() — the checked string is the host the fetch reaches');

// The security property behind "WebUntis only on *.webuntis.com": whatever
// checkSafeHostname() accepts must, once inserted into the worker's URL,
// be parsed back as exactly that host — otherwise the suffix check
// compared one string while the fetch went somewhere else. The classes
// below each wrap an attacker-controlled host so that the raw string
// still ends in ".webuntis.com"; every one of them must be rejected, and
// the invariant must hold for anything that is accepted.
const WEBUNTIS_SUFFIX = '.webuntis.com';

function pick(random, items) {
  return items[randomInt(random, 0, items.length - 1)];
}

// Valid RFC 1123 label: letters/digits, hyphens only in the interior.
function randomRfcLabel(random) {
  const len = randomInt(random, 1, 20);
  if (len === 1) return randomLabel(random, 1, 1);
  let interior = '';
  for (let i = 0; i < len - 2; i++) interior += pick(random, ['-', ...'abcdefghijklmnopqrstuvwxyz0123456789']);
  return randomLabel(random, 1, 1) + interior + randomLabel(random, 1, 1);
}

function randomAllowedHost(random) {
  const labels = [];
  for (let i = randomInt(random, 1, 3); i > 0; i--) labels.push(randomRfcLabel(random));
  return labels.join('.') + WEBUNTIS_SUFFIX;
}

// Attacker target in front of the delimiter: a foreign domain, a public
// IPv4 address or an internal one (loopback, cloud metadata).
function randomAttackerHost(random) {
  return pick(random, [
    () => `${randomLabel(random)}.${randomLabel(random, 2, 6)}.example`,
    () => `${randomPublicFirstOctet(random)}.${randomInt(random, 0, 255)}.${randomInt(random, 0, 255)}.${randomInt(random, 0, 255)}`,
    () => `127.${randomInt(random, 0, 255)}.${randomInt(random, 0, 255)}.${randomInt(random, 1, 254)}`,
    () => '169.254.169.254',
  ])();
}

// Optional filler between delimiter and suffix, so the suffix is not
// always glued directly to the delimiter.
function randomFiller(random) {
  return random() < 0.5 ? '' : randomLabel(random);
}

function insertAt(random, str, chars) {
  const pos = randomInt(random, 1, str.length - 1);
  return str.slice(0, pos) + chars + str.slice(pos);
}

function assertParsesToSameAllowedHost(input) {
  let accepted;
  try {
    accepted = checkSafeHostname(input, { requiredSuffix: WEBUNTIS_SUFFIX });
  } catch {
    return; // rejected — always safe
  }
  let parsedHost;
  try {
    parsedHost = new URL(`https://${accepted}/WebUntis/jsonrpc.do`).hostname;
  } catch (e) {
    throw new Error(`accepted ${JSON.stringify(accepted)}, but it does not parse as a URL host`, { cause: e });
  }
  assertEqual(parsedHost, accepted);
  assert(parsedHost.endsWith(WEBUNTIS_SUFFIX), `${parsedHost} does not end in ${WEBUNTIS_SUFFIX}`);
  assert(!isPrivateOrLocalTarget(parsedHost), `${parsedHost} is an internal target`);
}

const HOST_CONFUSION_CLASSES = [
  ['fragment', (random) => `${randomAttackerHost(random)}#${randomFiller(random)}${WEBUNTIS_SUFFIX}`],
  ['query', (random) => `${randomAttackerHost(random)}?${randomFiller(random)}${WEBUNTIS_SUFFIX}`],
  ['backslash', (random) => `${randomAttackerHost(random)}\\${randomFiller(random)}${WEBUNTIS_SUFFIX}`],
  ['port followed by a delimiter', (random) =>
    `${randomAttackerHost(random)}:${randomInt(random, 1, 65535)}${pick(random, ['#', '?', '\\'])}${randomFiller(random)}${WEBUNTIS_SUFFIX}`],
  // Interior only: leading/trailing whitespace is trimmed on purpose.
  ['whitespace inside the host', (random) => insertAt(random, randomAllowedHost(random), pick(random, [' ', '\t', '\n', '\r', ' ']))],
  ['percent-encoding', (random) =>
    `${randomAttackerHost(random)}%${pick(random, ['23', '3f', '3F', '5c', '2f', '40', '3a', '2e', '09'])}${randomFiller(random)}${WEBUNTIS_SUFFIX}`],
  ['userinfo', (random) =>
    `${randomLabel(random)}${random() < 0.5 ? '' : `:${randomLabel(random)}`}@${randomAttackerHost(random)}${pick(random, ['#', '?', '\\', ''])}${WEBUNTIS_SUFFIX}`],
];

for (const [className, generator] of HOST_CONFUSION_CLASSES) {
  forAll(
    `host confusion via ${className} is always rejected`,
    generator,
    (input) => assertWirft(() => checkSafeHostname(input, { requiredSuffix: WEBUNTIS_SUFFIX }), 'Ungültiger Server-Hostname')
  );
}

// Guards against the opposite failure: an over-strict check that blocks
// real schools. Multi-label subdomains with hyphens must pass unchanged.
forAll(
  'random valid RFC 1123 subdomain of webuntis.com is always accepted unchanged',
  randomAllowedHost,
  (host) => assertEqual(checkSafeHostname(host, { requiredSuffix: WEBUNTIS_SUFFIX }), host)
);

// The invariant itself, over all classes mixed with valid hosts — phrased
// independently of error messages, so it also holds for any future change
// that rejects differently.
forAll(
  'whatever is accepted parses back to exactly that allowed, public host',
  (random) => (random() < 0.3 ? randomAllowedHost(random) : pick(random, HOST_CONFUSION_CLASSES)[1](random)),
  assertParsesToSameAllowedHost
);

console.log('\nProperty: checkSafeHttpsUrl() — the worker\'s Mensamax request URLs stay on the checked host');

// worker.js builds every Mensamax request as "${origin}/<fixed path>" from
// the URL checkSafeHttpsUrl() returns. For anything accepted, that request
// must go to the checked, allowlisted host on the default port — checked
// for well-formed bases (with paths, queries, ports, whitespace appended)
// and for the same delimiter tricks as above.
forAll(
  'for every accepted Mensamax base, the request URLs the worker builds stay on the allowlisted host and default port',
  (random) => {
    const tail = pick(random, ['', '/', '#', '?x', '\t', '/pfad', ':8443', ':443', '/umleitung?ziel=https://evil.example']);
    return random() < 0.5
      ? `https://${randomRfcLabel(random)}${ALLOWED_TEST_SUFFIX}${tail}`
      : `https://${randomAttackerHost(random)}${pick(random, ['#', '?', '\\', '\\@', ':443#'])}${randomFiller(random)}${ALLOWED_TEST_SUFFIX}${tail}`;
  },
  (base) => {
    let checked;
    try {
      checked = checkSafeHttpsUrl(base, { requiredSuffixes: [ALLOWED_TEST_SUFFIX] });
    } catch {
      return; // rejected — always safe
    }
    assertEqual(checked.port, '');
    for (const path of ['/login.aspx', '/mensamax/Essenbestellung/bestellen-stornieren/PlanForm.aspx']) {
      const request = new URL(`${checked.origin}${path}`);
      assertEqual(request.hostname, checked.hostname);
      assertEqual(request.port, '');
      assertEqual(request.pathname, path);
      assert(request.hostname.endsWith(ALLOWED_TEST_SUFFIX), `${request.hostname} is not on the allowlist`);
    }
  }
);

// ── Runtime validation of untrusted input (proxy/validate.mjs) ─────────────
//
// Property-based like the hostname checks: each equivalence class generates
// inputs and states what must happen to all of them. Valid shapes (with
// arbitrary extra fields) must pass unchanged; every class of structural
// damage must be rejected with the generic message, never passed on.

console.log('\nProperty: WebUntis answer validation');

function randomLesson(random) {
  const lesson = {
    id: randomInt(random, 0, 1e6),
    startTime: randomInt(random, 6, 18) * 100 + randomInt(random, 0, 59),
    endTime: randomInt(random, 6, 18) * 100 + randomInt(random, 0, 59),
  };
  if (random() < 0.5) lesson.code = pick(random, ['cancelled', 'irregular', null]);
  if (random() < 0.8) lesson.su = [{ id: randomInt(random, 0, 999) }];
  if (random() < 0.8) lesson.ro = random() < 0.2 ? [] : [{ id: randomInt(random, 0, 999), orgid: 1 }];
  if (random() < 0.5) lesson.lsnumber = randomInt(random, 0, 1e5); // extra field WebUntis sends
  return lesson;
}
const randomLessons = (random) => Array.from({ length: randomInt(random, 0, 8) }, () => randomLesson(random));

forAll('valid lessons (with extra fields) pass and keep id/times/code/refs', randomLessons, (lessons) => {
  const out = validateLessons(lessons);
  assertEqual(out.length, lessons.length);
  out.forEach((l, i) => {
    assertEqual(l.id, lessons[i].id);
    assertEqual(l.startTime, lessons[i].startTime);
    assertEqual(l.endTime, lessons[i].endTime);
    assertEqual(JSON.stringify(l.su), JSON.stringify(lessons[i].su));
  });
});

// Each class damages exactly one thing in an otherwise valid answer.
const BAD_VALUES = [null, '12', -1, 1.5, Number.NaN, true, {}, []];
const LESSON_DAMAGE = [
  ['id of the wrong type or range', (l, random) => ({ ...l, id: pick(random, BAD_VALUES) })],
  ['id missing', (l) => { const c = { ...l }; delete c.id; return c; }],
  ['start time out of range (hour ≥ 24, minute ≥ 60, negative)', (l, random) => ({ ...l, startTime: pick(random, [2400, 1260, -5, 99999]) })],
  ['end time of the wrong type', (l, random) => ({ ...l, endTime: pick(random, ['0800', null, 8.5]) })],
  ['code not a string', (l, random) => ({ ...l, code: pick(random, [1, {}, []]) })],
  ['subject refs not a list of ids', (l, random) => ({ ...l, su: pick(random, [{}, 'x', [null], [{}], [{ id: '1' }]]) })],
  ['room refs not a list of ids', (l, random) => ({ ...l, ro: pick(random, [{}, [{ id: -1 }], [7]]) })],
  ['entry not an object', (l, random) => pick(random, [null, 'x', 1, []])],
];
for (const [className, damage] of LESSON_DAMAGE) {
  forAll(
    `getTimetable answer with ${className} is always rejected`,
    (random) => {
      const lessons = [randomLesson(random), ...randomLessons(random)];
      const at = randomInt(random, 0, lessons.length - 1);
      lessons[at] = damage(lessons[at], random);
      return lessons;
    },
    (lessons) => assertWirft(() => validateLessons(lessons), 'unerwartete Antwort auf getTimetable')
  );
}

test('a non-array answer is rejected for every list method', () => {
  for (const [validate, method] of [[validateLessons, 'getTimetable'], [validateClasses, 'getKlassen'], [validateSubjects, 'getSubjects'], [validateRooms, 'getRooms']]) {
    for (const value of [null, undefined, {}, 'x', 1]) assertWirft(() => validate(value), `unerwartete Antwort auf ${method}`);
  }
});
test('classes need a numeric id and a string name; subjects/rooms may lack names', () => {
  assertEqual(validateClasses([{ id: 3, name: '9c', extra: 1 }])[0].name, '9c');
  assertWirft(() => validateClasses([{ id: 3 }]), 'getKlassen');
  assertWirft(() => validateClasses([{ id: '3', name: '9c' }]), 'getKlassen');
  assertEqual(validateSubjects([{ id: 1 }])[0].longName, undefined);
  assertWirft(() => validateSubjects([{ id: 1, longName: 5 }]), 'getSubjects');
  assertEqual(validateRooms([{ id: 2, name: null }])[0].name, undefined);
  assertWirft(() => validateRooms([{ name: 'R1' }]), 'getRooms');
});

// The session id is written into "Cookie: JSESSIONID=<id>".
forAll(
  'a session id from the plain token charset is accepted unchanged',
  (random) => {
    const alphabet = 'ABCDEFabcdef0123456789._-';
    return Array.from({ length: randomInt(random, 1, 64) }, () => alphabet[randomInt(random, 0, alphabet.length - 1)]).join('');
  },
  (sessionId) => assertEqual(validateAuth({ sessionId, personId: 1 }).sessionId, sessionId)
);
forAll(
  'a session id carrying header-breaking characters is always rejected',
  (random) => insertAt(random, `${randomLabel(random, 4, 20)}${randomLabel(random, 2, 6)}`, pick(random, ['\r\n', '\n', ';', ',', ' ', '=', '"', '\u0000', 'ä'])),
  (sessionId) => assertWirft(() => validateAuth({ sessionId }), 'unerwartete Antwort auf authenticate')
);
test('authenticate: missing, empty, overlong or non-string session id is rejected', () => {
  for (const result of [null, {}, { sessionId: '' }, { sessionId: 'a'.repeat(201) }, { sessionId: 42 }]) {
    assertWirft(() => validateAuth(result), 'unerwartete Antwort auf authenticate');
  }
});
test('the generic message does not look like a rejected login (no "WebUntis authenticate:" prefix)', () => {
  let message = '';
  try { validateAuth(null); } catch (e) { message = e.message; }
  assert(message && !message.startsWith('WebUntis authenticate:'), message);
});

test('JSON-RPC envelope: result, error with message, and every malformed shape', () => {
  assertEqual(JSON.stringify(validateRpcEnvelope({ jsonrpc: '2.0', id: 1, result: [1] }, 'x')), '{"result":[1]}');
  assertEqual(JSON.stringify(validateRpcEnvelope({ error: { message: 'nein', code: -1 } }, 'x')), '{"error":"nein"}');
  for (const data of [null, [], 'x', {}, { error: {} }, { error: 'kaputt' }, { error: { message: 1 } }]) {
    assertWirft(() => validateRpcEnvelope(data, 'getRooms'), 'unerwartete Antwort auf getRooms');
  }
});

console.log('\nProperty: request body validation');

forAll(
  'a body with string fields keeps exactly the known fields and drops the rest',
  (random) => ({
    datum: '20261009',
    webuntis: { server: `${randomLabel(random)}.webuntis.com`, user: randomLabel(random), password: randomLabel(random), klasse: randomLabel(random, 1, 3), extra: 'x' },
    lunch: { provider: 'mensamax', base: 'https://parentsmensa.de', username: randomLabel(random), password: randomLabel(random), cccampus: { pin: randomLabel(random), unbekannt: 1 } },
    unbekannt: { tief: true },
  }),
  (body) => {
    const out = validateRequestBody(body);
    assertEqual(out.webuntis.server, body.webuntis.server);
    assertEqual(out.lunch.cccampus.pin, body.lunch.cccampus.pin);
    assert(!('extra' in out.webuntis) && !('unbekannt' in out) && !('unbekannt' in out.lunch.cccampus), JSON.stringify(out));
  }
);
forAll(
  'a known field with a non-string value is always rejected',
  (random) => {
    const [section, field] = pick(random, [['webuntis', 'server'], ['webuntis', 'klasse'], ['lunch', 'base'], ['lunch', 'password'], ['top', 'datum']]);
    const value = pick(random, [42, true, {}, [], ['a'], { toString: 'x' }]);
    const body = { webuntis: { server: 'a.webuntis.com' }, lunch: {} };
    if (section === 'top') body[field] = value; else body[section][field] = value;
    return body;
  },
  (body) => assertWirft(() => validateRequestBody(body), 'Ungültiger Request-Body')
);
test('request body: not an object, section not an object, or an overlong field is rejected', () => {
  for (const body of [null, [], 'x', 1, { webuntis: 'x' }, { lunch: [1] }, { lunch: { cccampus: 'x' } }, { webuntis: { user: 'a'.repeat(1001) } }]) {
    assertWirft(() => validateRequestBody(body), 'Ungültiger Request-Body');
  }
});
test('request body: missing sections become empty configs', () => {
  assertEqual(JSON.stringify(validateRequestBody({})), '{"webuntis":{},"lunch":{}}');
});

// ── Proxy: Cache-Schlüssel ─────────────────────────────────────────────────
//
// Prüft, dass unterschiedliche Zugangsdaten immer zu unterschiedlichen
// Cache-Schlüsseln führen — sonst könnte ein Cache-Treffer Daten ausliefern,
// ohne dass ein Login stattgefunden hat (siehe Kommentar in cachekey.mjs).

console.log('\nbuildCacheKeyMaterial()');

const webuntisBase = { server: 'x.webuntis.com', user: 'Klasse-9c', klasse: '9c', password: 'richtig' };
const lunchBase = { provider: 'mensamax', base: 'https://parentsmensa.de', projekt: 'P', einrichtung: 'E', username: 'u', password: 'geheim' };

test('REGRESSION: different WebUntis password ⇒ different key', () => {
  const a = buildCacheKeyMaterial('20260827', webuntisBase, lunchBase);
  const b = buildCacheKeyMaterial('20260827', { ...webuntisBase, password: 'falsch' }, lunchBase);
  assert(a !== b, 'key is identical despite a different password — cache would serve someone else\'s data without a login!');
});

test('REGRESSION: different Mensamax password ⇒ different key', () => {
  const a = buildCacheKeyMaterial('20260827', webuntisBase, lunchBase);
  const b = buildCacheKeyMaterial('20260827', webuntisBase, { ...lunchBase, password: 'falsch' });
  assert(a !== b, 'key is identical despite a different Mensamax password');
});

test('REGRESSION: different ccCampus PIN ⇒ different key', () => {
  const withPin = (pin) => buildCacheKeyMaterial('20260827', webuntisBase,
    { ...lunchBase, provider: 'cccampus', cccampus: { base: 'https://c.mbs5online.de', kundennummer: '1', pin } });
  assert(withPin('1111') !== withPin('2222'), 'key is identical despite a different PIN');
});

test('identical inputs ⇒ identical key (the cache can work at all)', () => {
  const a = buildCacheKeyMaterial('20260827', webuntisBase, lunchBase);
  const b = buildCacheKeyMaterial('20260827', { ...webuntisBase }, { ...lunchBase });
  assertEqual(a, b);
});

test('a different day ⇒ different key', () => {
  const a = buildCacheKeyMaterial('20260827', webuntisBase, lunchBase);
  const b = buildCacheKeyMaterial('20260828', webuntisBase, lunchBase);
  assert(a !== b, 'key is identical despite a different date');
});

test('a different child of the same family ⇒ different key', () => {
  const a = buildCacheKeyMaterial('20260827', webuntisBase, lunchBase);
  const b = buildCacheKeyMaterial('20260827', { ...webuntisBase, klasse: '6d' }, lunchBase);
  assert(a !== b, 'key is identical despite a different class');
});

test('passwords are present in the key material (gets hashed, never stored raw)', () => {
  const m = buildCacheKeyMaterial('20260827', webuntisBase, lunchBase);
  assert(m.includes('richtig'), 'WebUntis password missing from the key material');
  assert(m.includes('geheim'), 'Mensamax password missing from the key material');
});

test('missing config does not throw', () => {
  buildCacheKeyMaterial('20260827');
  buildCacheKeyMaterial('20260827', {}, {});
});

// ── proxy/worker.js: fetch() handler ────────────────────────────────────
//
// worker.js runs in the Cloudflare Workers runtime, not Node — but its
// fetch() handler only actually needs Request/Response/URL/crypto.subtle
// (all native since Node 18) plus the Workers-only Cache API
// (caches.default). A tiny hand-rolled stub is enough to call the real,
// exported fetch() handler directly and exercise routing, rate-limiting,
// caching and error-aggregation end to end — no wrangler dev/Miniflare
// needed, consistent with this project's habit of writing 20 lines
// instead of pulling in a package (see mulberry32 above).

function makeCachesStub() {
  const store = new Map();
  return {
    default: {
      async match(request) {
        const key = typeof request === 'string' ? request : request.url;
        const stored = store.get(key);
        return stored ? stored.clone() : undefined;
      },
      async put(request, response) {
        const key = typeof request === 'string' ? request : request.url;
        store.set(key, response.clone());
      },
    },
  };
}

// worker.js fires cache writes via ctx.waitUntil() without awaiting them
// (correct for a real Worker, which keeps running after the response is
// sent) — a test that wants to see a completed write's effect (e.g. "the
// next request now hits the cache") needs to explicitly drain them first.
function makeCtx() {
  const waits = [];
  return {
    waitUntil(promise) { waits.push(promise); },
    async drain() { await Promise.all(waits); waits.length = 0; },
  };
}

// Routes outbound fetch() calls made by worker.js (to WebUntis/Mensamax)
// to canned responses instead of the real network. Throws loudly on an
// unexpected call instead of silently reaching the real internet — tests
// that expect zero network calls pass an empty handler list on purpose.
const realFetch = globalThis.fetch;
function mockFetch(handlers) {
  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url);
    const handler = handlers.find((h) => h.test(urlStr, options));
    if (!handler) throw new Error(`unexpected fetch() in test: ${urlStr}`);
    return handler.respond(urlStr, options);
  };
}
function restoreFetch() {
  globalThis.fetch = realFetch;
}

const TEST_ENV = { ALLOWED_ORIGIN: 'https://heute-schule.pages.dev' };

function apiRequest(body, extraHeaders = {}) {
  return new Request('https://proxy.test/api/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...extraHeaders },
    body: JSON.stringify(body),
  });
}

console.log('\nproxy/worker.js: fetch() handler');

await testAsync('OPTIONS request gets a CORS preflight response', async () => {
  globalThis.caches = makeCachesStub();
  const resp = await proxyWorker.fetch(new Request('https://proxy.test/api/status', { method: 'OPTIONS' }), TEST_ENV, makeCtx());
  assertEqual(resp.status, 200);
  assertEqual(resp.headers.get('Access-Control-Allow-Origin'), 'https://heute-schule.pages.dev');
});

await testAsync('an unknown path is rejected with 404', async () => {
  globalThis.caches = makeCachesStub();
  const resp = await proxyWorker.fetch(new Request('https://proxy.test/nope', { method: 'POST' }), TEST_ENV, makeCtx());
  assertEqual(resp.status, 404);
});

await testAsync('GET on /api/status is rejected with 405', async () => {
  globalThis.caches = makeCachesStub();
  const resp = await proxyWorker.fetch(new Request('https://proxy.test/api/status', { method: 'GET' }), TEST_ENV, makeCtx());
  assertEqual(resp.status, 405);
});

await testAsync('invalid JSON body is rejected with 400', async () => {
  globalThis.caches = makeCachesStub();
  const req = new Request('https://proxy.test/api/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json',
  });
  const resp = await proxyWorker.fetch(req, TEST_ENV, makeCtx());
  assertEqual(resp.status, 400);
});

await testAsync('REGRESSION: the 31st request from the same IP within a minute is rate-limited', async () => {
  globalThis.caches = makeCachesStub();
  const ctx = makeCtx();
  for (let i = 0; i < 30; i++) {
    const resp = await proxyWorker.fetch(apiRequest({ webuntis: {}, lunch: {} }), TEST_ENV, ctx);
    await ctx.drain();
    assert(resp.status !== 429, `request ${i + 1} of 30 was rate-limited too early`);
  }
  const blocked = await proxyWorker.fetch(apiRequest({ webuntis: {}, lunch: {} }), TEST_ENV, ctx);
  assertEqual(blocked.status, 429);
  assert(blocked.headers.get('Retry-After'), 'missing Retry-After header on a 429');
});

await testAsync('no CF-Connecting-IP header (local dev) is never rate-limited', async () => {
  globalThis.caches = makeCachesStub();
  const ctx = makeCtx();
  const req = () => new Request('https://proxy.test/api/status', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webuntis: {}, lunch: {} }),
  });
  for (let i = 0; i < 35; i++) {
    const resp = await proxyWorker.fetch(req(), TEST_ENV, ctx);
    assert(resp.status !== 429, `request ${i + 1} of 35 was rate-limited despite no IP header`);
  }
});

await testAsync('empty webuntis/lunch config surfaces both errors, no network call made', async () => {
  globalThis.caches = makeCachesStub();
  mockFetch([]); // any fetch() call here is a bug: nothing should reach the network
  const resp = await proxyWorker.fetch(apiRequest({ webuntis: {}, lunch: {} }), TEST_ENV, makeCtx());
  restoreFetch();
  assertEqual(resp.status, 200);
  const body = await resp.json();
  assert(body.stundenFehler && body.stundenFehler.includes('WebUntis-Konfiguration unvollständig'), 'missing WebUntis config error');
  assert(body.lunchFehler && body.lunchFehler.includes('Mensamax-Konfiguration unvollständig'), 'missing Mensamax config error');
  assertEqual(body.stunden.length, 0);
});

await testAsync('an unsafe WebUntis server is rejected before any network call', async () => {
  globalThis.caches = makeCachesStub();
  mockFetch([]);
  const resp = await proxyWorker.fetch(
    apiRequest({ webuntis: { server: 'angreifer.example', user: 'x', password: 'x', klasse: '9c' }, lunch: {} }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  const body = await resp.json();
  assert(body.stundenFehler.includes('muss auf'), 'expected the hostcheck allowlist rejection message');
});

await testAsync('REGRESSION: a server smuggling another host before ".webuntis.com" never reaches the network', async () => {
  for (const server of ['evil.example#.webuntis.com', 'evil.example?.webuntis.com', 'evil.example\\.webuntis.com', '127.0.0.1#.webuntis.com']) {
    globalThis.caches = makeCachesStub();
    const outbound = [];
    mockFetch([{
      test: () => true,
      respond: async (url) => { outbound.push(url); return new Response('{}', { status: 500 }); },
    }]);
    const resp = await proxyWorker.fetch(
      apiRequest({ webuntis: { server, user: 'x', password: 'x', klasse: '9c' }, lunch: {} }),
      TEST_ENV, makeCtx()
    );
    restoreFetch();
    assertEqual(outbound.length, 0);
    const body = await resp.json();
    assert(body.stundenFehler.includes('Ungültiger Server-Hostname'), `unexpected error for ${server}: ${body.stundenFehler}`);
  }
});

await testAsync('REGRESSION: an identical second request is served from cache, not a second WebUntis round-trip', async () => {
  globalThis.caches = makeCachesStub();
  const ctx = makeCtx();
  let webuntisCalls = 0;
  mockFetch([{
    test: (url) => url.includes('/WebUntis/jsonrpc.do'),
    respond: async () => {
      webuntisCalls++;
      return new Response(JSON.stringify({ error: { message: 'invalid credentials' } }));
    },
  }]);
  const req = () => apiRequest({ webuntis: { server: 'schule.webuntis.com', user: 'u', password: 'p', klasse: '9c' }, lunch: {} });
  await proxyWorker.fetch(req(), TEST_ENV, ctx);
  await ctx.drain();
  await proxyWorker.fetch(req(), TEST_ENV, ctx);
  await ctx.drain();
  restoreFetch();
  assertEqual(webuntisCalls, 1);
});

await testAsync('a full WebUntis success round-trip returns a sorted, deduplicated lesson list', async () => {
  globalThis.caches = makeCachesStub();
  mockFetch([{
    test: (url) => url.includes('/WebUntis/jsonrpc.do'),
    respond: async (url, options) => {
      const requested = JSON.parse(options.body);
      const results = {
        authenticate: { sessionId: 'abc123' },
        getKlassen: [{ id: 1, name: '9c' }],
        getTimetable: [
          { id: 10, startTime: 945, endTime: 1030, su: [{ id: 20 }], ro: [{ id: 2 }], code: null },
          { id: 11, startTime: 800, endTime: 845, su: [{ id: 21 }], ro: [{ id: 1 }], code: 'irregular' },
        ],
        getSubjects: [{ id: 20, longName: 'Deutsch' }, { id: 21, longName: 'Mathematik' }],
        getRooms: [{ id: 1, name: 'R101' }, { id: 2, name: 'R102' }],
        logout: {},
      };
      return new Response(JSON.stringify({ result: results[requested.method] }));
    },
  }]);
  const resp = await proxyWorker.fetch(
    apiRequest({ webuntis: { server: 'schule.webuntis.com', user: 'u', password: 'p', klasse: '9c' }, lunch: {}, datum: '20260901' }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  const body = await resp.json();
  assertEqual(body.stundenFehler, null);
  assertEqual(body.stunden.length, 2);
  assertEqual(body.stunden[0].fach, 'Mathematik'); // sorted by start time: 08:00 first
  assertEqual(body.stunden[0].vertretung, true);
  assertEqual(body.stunden[1].fach, 'Deutsch');
});

await testAsync('REGRESSION: a malformed WebUntis answer is reported generically, not as a wrong password', async () => {
  globalThis.caches = makeCachesStub();
  mockFetch([{
    test: (url) => url.includes('/WebUntis/jsonrpc.do'),
    respond: async () => new Response(JSON.stringify({ result: { sessionId: 'abc\r\nSet-Cookie: x=1' } })),
  }]);
  const resp = await proxyWorker.fetch(
    apiRequest({ webuntis: { server: 'schule.webuntis.com', user: 'u', password: 'p', klasse: '9c' }, lunch: {}, datum: '20260901' }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  const body = await resp.json();
  assertEqual(body.stundenFehler, 'WebUntis: unerwartete Antwort auf authenticate');
});

await testAsync('REGRESSION: a session id with CR/LF never reaches a Cookie header', async () => {
  globalThis.caches = makeCachesStub();
  const cookies = [];
  mockFetch([{
    test: (url) => url.includes('/WebUntis/jsonrpc.do'),
    respond: async (url, options) => {
      const requested = JSON.parse(options.body);
      if (options.headers && options.headers.Cookie) cookies.push(options.headers.Cookie);
      if (requested.method === 'authenticate') return new Response(JSON.stringify({ result: { sessionId: 'abc\r\nX-Injected: 1' } }));
      return new Response(JSON.stringify({ result: [] }));
    },
  }]);
  await proxyWorker.fetch(
    apiRequest({ webuntis: { server: 'schule.webuntis.com', user: 'u', password: 'p', klasse: '9c' }, lunch: {}, datum: '20260901' }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  assertEqual(cookies.length, 0);
});

await testAsync('REGRESSION: a timetable entry with a broken shape fails the request instead of rendering garbage', async () => {
  globalThis.caches = makeCachesStub();
  mockFetch([{
    test: (url) => url.includes('/WebUntis/jsonrpc.do'),
    respond: async (url, options) => {
      const results = {
        authenticate: { sessionId: 'abc123' },
        getKlassen: [{ id: 1, name: '9c' }],
        getTimetable: [{ id: 10, startTime: '0800', endTime: 845 }],
        getSubjects: [], getRooms: [], logout: {},
      };
      return new Response(JSON.stringify({ result: results[JSON.parse(options.body).method] }));
    },
  }]);
  const resp = await proxyWorker.fetch(
    apiRequest({ webuntis: { server: 'schule.webuntis.com', user: 'u', password: 'p', klasse: '9c' }, lunch: {}, datum: '20260901' }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  const body = await resp.json();
  assertEqual(body.stundenFehler, 'WebUntis: unerwartete Antwort auf getTimetable');
  assertEqual(body.stunden.length, 0);
});

await testAsync('REGRESSION: a request body with a non-string config field is rejected with 400, no network call', async () => {
  globalThis.caches = makeCachesStub();
  mockFetch([]);
  const resp = await proxyWorker.fetch(
    apiRequest({ webuntis: { server: 'schule.webuntis.com', user: 'u', password: 'p', klasse: 9 }, lunch: {} }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  assertEqual(resp.status, 400);
});

await testAsync('a wrong WebUntis password produces the friendly login-failure message', async () => {
  globalThis.caches = makeCachesStub();
  mockFetch([{
    test: (url) => url.includes('/WebUntis/jsonrpc.do'),
    respond: async () => new Response(JSON.stringify({ error: { message: 'invalid credentials' } })),
  }]);
  const resp = await proxyWorker.fetch(
    apiRequest({ webuntis: { server: 'schule.webuntis.com', user: 'u', password: 'wrong', klasse: '9c' }, lunch: {}, datum: '20260901' }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  const body = await resp.json();
  assert(body.stundenFehler.includes('Benutzername oder Passwort prüfen'), 'expected the friendly login-failure message');
});

await testAsync('a failed Mensamax login is reported as "Login fehlgeschlagen"', async () => {
  globalThis.caches = makeCachesStub();
  mockFetch([{
    test: (url) => url.endsWith('/login.aspx'),
    respond: async (url, options) => {
      if (options.method === 'POST') return new Response('<html>Anmeldung fehlgeschlagen</html>');
      return new Response('<html><input name="__VIEWSTATE" value="x"><input name="__VIEWSTATEGENERATOR" value="x"><input name="__EVENTVALIDATION" value="x"></html>');
    },
  }]);
  const resp = await proxyWorker.fetch(
    apiRequest({
      webuntis: {},
      lunch: { provider: 'mensamax', base: 'https://x.parentsmensa.de', projekt: 'P', einrichtung: 'E', username: 'u', password: 'wrong' },
      datum: '20260901',
    }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  const body = await resp.json();
  assertEqual(body.lunch, 'Schulessen: Login fehlgeschlagen');
});

await testAsync('a successful Mensamax order is parsed off the plan page', async () => {
  globalThis.caches = makeCachesStub();
  mockFetch([
    {
      test: (url) => url.endsWith('/login.aspx'),
      respond: async (url, options) => {
        if (options.method === 'POST') {
          return new Response('<html>ok</html>', {
            headers: [['Set-Cookie', 'MensaMax=tok123; Path=/'], ['Set-Cookie', 'ASP.NET_SessionId=sess1; Path=/']],
          });
        }
        return new Response('<html><input name="__VIEWSTATE" value="x"><input name="__VIEWSTATEGENERATOR" value="x"><input name="__EVENTVALIDATION" value="x"></html>');
      },
    },
    {
      test: (url) => url.includes('/PlanForm.aspx'),
      respond: async () => new Response(
        '<div id="td20260901_1" class="speiseplan-menue tdSelected"><li>Spaghetti &amp; Soße</li></div>',
        { status: 200 }
      ),
    },
  ]);
  const resp = await proxyWorker.fetch(
    apiRequest({
      webuntis: {},
      lunch: { provider: 'mensamax', base: 'https://x.parentsmensa.de', projekt: 'P', einrichtung: 'E', username: 'u', password: 'p' },
      datum: '20260901',
    }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  const body = await resp.json();
  assertEqual(body.lunch, 'Essen bestellt: Spaghetti & Soße');
});

// Canned Mensamax responses for a successful login, shared by the
// redirect/URL-construction tests below.
function mensamaxLoginHandler() {
  return {
    test: (url) => url.endsWith('/login.aspx'),
    respond: async (url, options) => {
      if (options.method === 'POST') {
        return new Response('<html>ok</html>', {
          headers: [['Set-Cookie', 'MensaMax=tok123; Path=/'], ['Set-Cookie', 'ASP.NET_SessionId=sess1; Path=/']],
        });
      }
      return new Response('<html><input name="__VIEWSTATE" value="x"><input name="__VIEWSTATEGENERATOR" value="x"><input name="__EVENTVALIDATION" value="x"></html>');
    },
  };
}
function mensamaxLunch(base) {
  return { provider: 'mensamax', base, projekt: 'P', einrichtung: 'E', username: 'u', password: 'p' };
}

await testAsync('an unsafe Mensamax base is rejected before any network call', async () => {
  for (const base of [
    'https://angreifer.example',
    'http://x.parentsmensa.de',
    'https://192.168.1.1',
    'https://parentsmensa.de.angreifer.example',
    'https://evilparentsmensa.de',
    'https://x.parentsmensa.de:8443',
  ]) {
    globalThis.caches = makeCachesStub();
    const outbound = [];
    mockFetch([{ test: () => true, respond: async (url) => { outbound.push(url); return new Response('', { status: 500 }); } }]);
    const resp = await proxyWorker.fetch(apiRequest({ webuntis: {}, lunch: mensamaxLunch(base), datum: '20260901' }), TEST_ENV, makeCtx());
    restoreFetch();
    assertEqual(outbound.length, 0);
    const body = await resp.json();
    assert(body.lunchFehler, `expected a lunch error for ${base}`);
  }
});

await testAsync('REGRESSION: path, query and fragment of the Mensamax base never reach the request URL', async () => {
  globalThis.caches = makeCachesStub();
  const outbound = [];
  mockFetch([{
    test: () => true,
    respond: async (url, options) => {
      outbound.push(url);
      if (url.includes('/PlanForm.aspx')) return new Response('<html></html>', { status: 200 });
      return mensamaxLoginHandler().respond(url, options);
    },
  }]);
  await proxyWorker.fetch(
    apiRequest({ webuntis: {}, lunch: mensamaxLunch('https://x.parentsmensa.de/umleitung?ziel=https://evil.example#frag'), datum: '20260901' }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  const allowed = new Set([
    'https://x.parentsmensa.de/login.aspx',
    'https://x.parentsmensa.de/mensamax/Essenbestellung/bestellen-stornieren/PlanForm.aspx',
  ]);
  assert(outbound.length === 3, `expected login GET, login POST and plan GET, got ${JSON.stringify(outbound)}`);
  for (const url of outbound) assert(allowed.has(url), `unexpected request URL ${url}`);
});

await testAsync('REGRESSION: no outbound request follows redirects (WebUntis and Mensamax)', async () => {
  globalThis.caches = makeCachesStub();
  const redirectModes = [];
  mockFetch([
    {
      test: (url) => url.includes('/WebUntis/jsonrpc.do'),
      respond: async (url, options) => {
        redirectModes.push([url, options.redirect]);
        return new Response(JSON.stringify({ error: { message: 'invalid credentials' } }));
      },
    },
    {
      test: (url) => url.includes('parentsmensa.de'),
      respond: async (url, options) => {
        redirectModes.push([url, options.redirect]);
        if (url.includes('/PlanForm.aspx')) return new Response('<html></html>', { status: 200 });
        return mensamaxLoginHandler().respond(url, options);
      },
    },
  ]);
  await proxyWorker.fetch(
    apiRequest({
      webuntis: { server: 'schule.webuntis.com', user: 'u', password: 'p', klasse: '9c' },
      lunch: mensamaxLunch('https://x.parentsmensa.de'),
      datum: '20260901',
    }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  assert(redirectModes.length === 4, `expected 1 WebUntis + 3 Mensamax requests, got ${redirectModes.length}`);
  for (const [url, mode] of redirectModes) assertEqual(`${url} → ${mode}`, `${url} → manual`);
});

await testAsync('a redirect on the Mensamax plan page is reported as unavailable, not followed', async () => {
  globalThis.caches = makeCachesStub();
  const outbound = [];
  mockFetch([
    mensamaxLoginHandler(),
    {
      test: (url) => url.includes('/PlanForm.aspx'),
      respond: async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example/' } }),
    },
    { test: () => true, respond: async (url) => { outbound.push(url); return new Response('', { status: 500 }); } },
  ]);
  const resp = await proxyWorker.fetch(apiRequest({ webuntis: {}, lunch: mensamaxLunch('https://x.parentsmensa.de'), datum: '20260901' }), TEST_ENV, makeCtx());
  restoreFetch();
  assertEqual(outbound.length, 0);
  const body = await resp.json();
  assertEqual(body.lunch, 'Schulessen: Daten nicht verfügbar');
});

await testAsync('a ccCampus child sent to the proxy anyway gets the "runs in the browser" note, no network call', async () => {
  globalThis.caches = makeCachesStub();
  mockFetch([]);
  const resp = await proxyWorker.fetch(
    apiRequest({ webuntis: {}, lunch: { provider: 'cccampus' }, datum: '20260901' }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  const body = await resp.json();
  assertEqual(body.lunch, 'Schulessen: ccCampus wird direkt im Browser abgefragt, nicht über den Proxy');
});

await testAsync('an unknown lunch provider is reported by name, no network call', async () => {
  globalThis.caches = makeCachesStub();
  mockFetch([]);
  const resp = await proxyWorker.fetch(
    apiRequest({ webuntis: {}, lunch: { provider: 'irgendwas' }, datum: '20260901' }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  const body = await resp.json();
  assertEqual(body.lunch, 'Schulessen: unbekannter Anbieter "irgendwas"');
});

await testAsync('a Mensamax day with no menu selected yet is distinguished from no school lunch at all', async () => {
  globalThis.caches = makeCachesStub();
  mockFetch([
    {
      test: (url) => url.endsWith('/login.aspx'),
      respond: async (url, options) => {
        if (options.method === 'POST') {
          return new Response('<html>ok</html>', { headers: [['Set-Cookie', 'MensaMax=tok123; Path=/']] });
        }
        return new Response('<html></html>');
      },
    },
    {
      // day marker present, but no "tdSelected" — a menu day with nothing ordered yet.
      test: (url) => url.includes('/PlanForm.aspx'),
      respond: async () => new Response('<div id="td20260901_1" class="speiseplan-menue"><li>Spaghetti</li></div>'),
    },
  ]);
  const resp = await proxyWorker.fetch(
    apiRequest({
      webuntis: {},
      lunch: { provider: 'mensamax', base: 'https://x.parentsmensa.de', projekt: 'P', einrichtung: 'E', username: 'u', password: 'p' },
      datum: '20260901',
    }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  const body = await resp.json();
  assertEqual(body.lunch, 'Kein Menü bestellt');
});

await testAsync('getSetCookies falls back to a single set-cookie header when getSetCookie() is unavailable', async () => {
  globalThis.caches = makeCachesStub();
  // Simulate a fetch implementation without Headers#getSetCookie() (older
  // runtimes) by handing back a Response whose headers object lacks it —
  // exercises the fallback branch instead of skipping it silently.
  mockFetch([{
    test: (url) => url.endsWith('/login.aspx'),
    respond: async (url, options) => {
      if (options.method === 'POST') {
        const resp = new Response('<html>Anmeldung fehlgeschlagen</html>');
        const headers = Object.create(Object.getPrototypeOf(resp.headers), {
          get: { value: (name) => (name.toLowerCase() === 'set-cookie' ? 'MensaMax=tok; Path=/' : null) },
          getSetCookie: { value: undefined },
        });
        Object.defineProperty(resp, 'headers', { value: headers });
        return resp;
      }
      return new Response('<html></html>');
    },
  }]);
  const resp = await proxyWorker.fetch(
    apiRequest({
      webuntis: {},
      lunch: { provider: 'mensamax', base: 'https://x.parentsmensa.de', projekt: 'P', einrichtung: 'E', username: 'u', password: 'p' },
      datum: '20260901',
    }),
    TEST_ENV, makeCtx()
  );
  restoreFetch();
  const body = await resp.json();
  // "Anmeldung fehlgeschlagen" in the HTML alone is already enough to fail
  // the login — this test's point is only that reading the fallback path
  // doesn't throw, not the login outcome itself.
  assertEqual(body.lunch, 'Schulessen: Login fehlgeschlagen');
});

delete globalThis.caches;

// ── Deploy gate: clean working tree ──────────────────────────────────────
//
// tools/require-clean-tree.sh runs first in deploy.sh. Each case builds a
// throwaway Git repository in the system temp folder (deleted afterwards)
// and checks the script's exit code — the dirty cases are the ones that
// must turn red, the clean and ignored-only cases prove it doesn't just
// always fail.

console.log('\ntools/require-clean-tree.sh');

const CLEAN_TREE_SCRIPT = new URL('./tools/require-clean-tree.sh', import.meta.url).pathname;

function withTempRepo(setup) {
  const dir = mkdtempSync(join(tmpdir(), 'heute-schule-cleantree-'));
  try {
    const git = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' });
    git('init', '-q');
    writeFileSync(join(dir, '.gitignore'), 'geheim.txt\n');
    writeFileSync(join(dir, 'datei.txt'), 'eins\n');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
    setup({ dir, git });
    try {
      execFileSync('bash', [CLEAN_TREE_SCRIPT], { cwd: dir, stdio: 'pipe' });
      return 0;
    } catch (e) {
      return e.status;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('clean tree passes', () => {
  assertEqual(withTempRepo(() => {}), 0);
});
test('only a gitignored file present passes (e.g. the real impressum.html)', () => {
  assertEqual(withTempRepo(({ dir }) => writeFileSync(join(dir, 'geheim.txt'), 'x\n')), 0);
});
test('modified tracked file is rejected', () => {
  assertEqual(withTempRepo(({ dir }) => writeFileSync(join(dir, 'datei.txt'), 'zwei\n')), 1);
});
test('staged but uncommitted change is rejected', () => {
  assertEqual(withTempRepo(({ dir, git }) => { writeFileSync(join(dir, 'datei.txt'), 'zwei\n'); git('add', 'datei.txt'); }), 1);
});
test('untracked, not ignored file is rejected', () => {
  assertEqual(withTempRepo(({ dir }) => writeFileSync(join(dir, 'neu.txt'), 'x\n')), 1);
});
test('a folder that is no Git repository is rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'heute-schule-nogit-'));
  try {
    let status = 0;
    try { execFileSync('bash', [CLEAN_TREE_SCRIPT], { cwd: dir, stdio: 'pipe' }); } catch (e) { status = e.status; }
    assertEqual(status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Security headers in web/_headers ────────────────────────────────────
//
// The real file must meet the minimum, and every single requirement must
// be reported by name when it is removed or weakened — otherwise the check
// could silently pass a regression.

console.log('\nSecurity headers (web/_headers)');

const HEADERS_FILE = parseHeadersFile(readFileSync(new URL('./web/_headers', import.meta.url), 'utf-8'));
const SITE_HEADERS = HEADERS_FILE['/*'];

test('web/_headers has a block for all paths', () => {
  assert(SITE_HEADERS, 'no "/*" block in web/_headers');
});
test('web/_headers meets every security requirement', () => {
  assertEqual(checkSecurityHeaders(SITE_HEADERS).join(' | '), '');
});

const withCsp = (fn) => ({ ...SITE_HEADERS, 'Content-Security-Policy': fn(SITE_HEADERS['Content-Security-Policy']) });
const HEADER_MUTATIONS = [
  ['HSTS removed', () => { const h = { ...SITE_HEADERS }; delete h['Strict-Transport-Security']; return h; }, 'Strict-Transport-Security: fehlt'],
  ['HSTS max-age below one year', () => ({ ...SITE_HEADERS, 'Strict-Transport-Security': 'max-age=86400; includeSubDomains' }), 'Strict-Transport-Security: max-age'],
  ['HSTS without includeSubDomains', () => ({ ...SITE_HEADERS, 'Strict-Transport-Security': 'max-age=31536000' }), 'includeSubDomains'],
  ['CSP removed', () => { const h = { ...SITE_HEADERS }; delete h['Content-Security-Policy']; return h; }, 'Content-Security-Policy: fehlt'],
  ['CSP default-src widened', () => withCsp((v) => v.replace("default-src 'self'", "default-src 'self' https:")), 'default-src'],
  ['CSP object-src removed', () => withCsp((v) => v.replace("object-src 'none'; ", '')), 'object-src fehlt'],
  ['CSP base-uri removed', () => withCsp((v) => v.replace("base-uri 'self'; ", '')), 'base-uri fehlt'],
  ['CSP frame-ancestors allows self', () => withCsp((v) => v.replace("frame-ancestors 'none'", "frame-ancestors 'self'")), 'frame-ancestors'],
  ['CSP form-action removed', () => withCsp((v) => v.replace("form-action 'none'; ", '')), 'form-action fehlt'],
  ['CSP unsafe-eval added', () => withCsp((v) => v.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")), 'unsafe-eval'],
  ['CSP wildcard source added', () => withCsp((v) => v.replace("img-src 'self'", "img-src 'self' *")), '* als Quelle'],
  ['CSP foreign script host added', () => withCsp((v) => v.replace("script-src 'self'", "script-src 'self' https://cdn.example")), 'script-src erlaubt fremde Quellen'],
  ['nosniff removed', () => { const h = { ...SITE_HEADERS }; delete h['X-Content-Type-Options']; return h; }, 'X-Content-Type-Options'],
  ['X-Frame-Options weakened', () => ({ ...SITE_HEADERS, 'X-Frame-Options': 'SAMEORIGIN' }), 'X-Frame-Options'],
  ['Referrer-Policy leaks full URL', () => ({ ...SITE_HEADERS, 'Referrer-Policy': 'unsafe-url' }), 'Referrer-Policy'],
  ['Permissions-Policy allows camera', () => ({ ...SITE_HEADERS, 'Permissions-Policy': SITE_HEADERS['Permissions-Policy'].replace('camera=()', 'camera=(self)') }), 'camera=() fehlt'],
];
for (const [name, mutate, expected] of HEADER_MUTATIONS) {
  test(`header check reports: ${name}`, () => {
    const problems = checkSecurityHeaders(mutate());
    assert(problems.some((p) => p.includes(expected)), `expected a problem containing "${expected}", got: ${JSON.stringify(problems)}`);
  });
}

test('live comparison: equal headers pass, regardless of name case and whitespace', () => {
  const live = Object.fromEntries(Object.entries(SITE_HEADERS).map(([n, v]) => [n.toLowerCase(), ` ${v.replace(/ /g, '  ')} `]));
  assertEqual(compareHeaders(SITE_HEADERS, live).length, 0);
});
test('live comparison: a missing and a changed header are each reported by name', () => {
  const live = { ...SITE_HEADERS, 'X-Frame-Options': 'SAMEORIGIN' };
  delete live['Referrer-Policy'];
  const problems = compareHeaders(SITE_HEADERS, live);
  assertEqual(problems.length, 2);
  assert(problems.some((p) => p.startsWith('Referrer-Policy:')) && problems.some((p) => p.startsWith('X-Frame-Options:')), JSON.stringify(problems));
});

// ── ESLint: security rules and syntax target actually fire ────────────────
//
// Lints small snippets as if they were files in the project, using the
// real eslint.config.mjs. Every forbidden construct must be reported, the
// allowed counterpart must not — a rule that is misconfigured (wrong file
// glob, typo in the rule name) would otherwise fail silently.

console.log('\nESLint configuration');

const eslint = new ESLint({ cwd: new URL('.', import.meta.url).pathname });
const inHtml = (js) => `<!doctype html><html><body><script>\n${js}\n</script></body></html>\n`;

async function lintMessages(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages;
}

const LINT_MUST_FLAG = [
  ['eval in the proxy', 'eval("1");\n', 'proxy/x.mjs', 'no-eval'],
  ['setTimeout with a string in the proxy', 'setTimeout("x()", 1);\n', 'proxy/x.mjs', 'no-implied-eval'],
  ['new Function in tools', 'export const f = new Function("return 1");\n', 'tools/x.mjs', 'no-new-func'],
  ['console in the proxy', 'console.log("x");\n', 'proxy/x.mjs', 'no-console'],
  ['innerHTML in index.html', inHtml("document.body.innerHTML = 'x';"), 'web/index.html', 'no-restricted-properties'],
  ['outerHTML in index.html', inHtml("document.body.outerHTML = 'x';"), 'web/index.html', 'no-restricted-properties'],
  ['insertAdjacentHTML in index.html', inHtml("document.body.insertAdjacentHTML('beforeend', 'x');"), 'web/index.html', 'no-restricted-properties'],
  ['document.write in ueber.html', inHtml("document.write('x');"), 'web/ueber.html', 'no-restricted-properties'],
  ['innerHTML in sw.js', 'self.x = self.document.body.innerHTML;\n', 'web/sw.js', 'no-restricted-properties'],
];
for (const [name, code, filePath, ruleId] of LINT_MUST_FLAG) {
  await testAsync(`lint flags ${name}`, async () => {
    const messages = await lintMessages(code, filePath);
    assert(messages.some((m) => m.ruleId === ruleId), `expected ${ruleId}, got ${JSON.stringify(messages.map((m) => m.ruleId))}`);
  });
}

const LINT_MUST_ALLOW = [
  ['textContent instead of innerHTML', inHtml("document.body.textContent = '';"), 'web/index.html'],
  ['console in the test suite', "console.log('x');\n", 'run-tests.mjs'],
];
for (const [name, code, filePath] of LINT_MUST_ALLOW) {
  await testAsync(`lint allows ${name}`, async () => {
    const messages = await lintMessages(code, filePath);
    assertEqual(messages.map((m) => m.ruleId || m.message).join(' | '), '');
  });
}

// Syntax target ES2019 for everything that runs on the families' devices:
// ES2019 syntax must parse, ES2020 syntax must be a fatal parse error.
const ES2019_FILES = [
  ['web/index.html', inHtml], ['web/ueber.html', inHtml], ['web/sw.js', (js) => `${js}\n`],
];
for (const [filePath, wrap] of ES2019_FILES) {
  await testAsync(`${filePath}: ES2019 syntax (catch without binding) parses`, async () => {
    const messages = await lintMessages(wrap('try { self.x(); } catch { self.y = 1; }'), filePath);
    assert(!messages.some((m) => m.fatal), JSON.stringify(messages));
  });
  for (const [feature, js] of [['optional chaining', 'self.a = self.b?.c;'], ['nullish coalescing', 'self.a = self.b ?? 1;']]) {
    await testAsync(`${filePath}: ES2020 ${feature} is a parse error`, async () => {
      const messages = await lintMessages(wrap(js), filePath);
      assert(messages.some((m) => m.fatal), `expected a fatal parse error, got ${JSON.stringify(messages)}`);
    });
  }
}

// ── Licenses of all dependencies ─────────────────────────────────────────
//
// The project is MIT-licensed and ships none of its dependencies: all of
// them are build/test/deploy tools. This keeps it that way: every package
// in the lockfile must be a devDependency under a permissive license. An
// SPDX "OR" needs one allowed alternative, an "AND" needs all parts.

console.log('\nDependency licenses (package-lock.json)');

const PERMISSIVE_LICENSES = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'BlueOak-1.0.0', '0BSD', 'CC0-1.0']);
// Named exception: sharp's prebuilt libvips binaries (optional, one per
// platform) are LGPL-3.0-or-later. They come in via wrangler → miniflare
// → sharp, are only used by wrangler's local emulation on the developer's
// machine and are never part of the deployed app.
const LICENSE_EXCEPTIONS = [{ packagePrefix: 'node_modules/@img/sharp-', license: 'LGPL-3.0-or-later' }];

function licenseAllowed(packagePath, expression) {
  if (!expression) return false;
  const term = (t) => PERMISSIVE_LICENSES.has(t)
    || LICENSE_EXCEPTIONS.some((ex) => packagePath.startsWith(ex.packagePrefix) && ex.license === t);
  const clean = expression.replace(/[()]/g, '').trim();
  if (/\sOR\s/.test(clean)) return clean.split(/\s+OR\s+/).some((alt) => licenseAllowed(packagePath, alt));
  return clean.split(/\s+AND\s+/).every(term);
}

function checkLockfile(lock) {
  const problems = [];
  for (const [path, info] of Object.entries(lock.packages)) {
    if (!path) continue;
    if (!info.dev) problems.push(`${path}: keine reine Entwicklungsabhängigkeit`);
    if (!licenseAllowed(path, info.license)) problems.push(`${path}: Lizenz ${info.license || '(keine Angabe)'} nicht freigegeben`);
  }
  return problems;
}

const LOCKFILE = JSON.parse(readFileSync(new URL('./package-lock.json', import.meta.url), 'utf-8'));
test('every locked package is a devDependency under an approved license', () => {
  const problems = checkLockfile(LOCKFILE);
  assert(problems.length === 0, problems.join('\n    '));
});

const lockWith = (path, info) => ({ packages: { '': {}, 'node_modules/ok': { dev: true, license: 'MIT' }, [path]: info } });
const LICENSE_CASES = [
  ['GPL-3.0 package', lockWith('node_modules/x', { dev: true, license: 'GPL-3.0-only' }), 1],
  ['LGPL outside the named exception', lockWith('node_modules/x', { dev: true, license: 'LGPL-3.0-or-later' }), 1],
  ['package without a license field', lockWith('node_modules/x', { dev: true }), 1],
  ['runtime (non-dev) dependency', lockWith('node_modules/x', { license: 'MIT' }), 1],
  ['AND with one non-permissive part', lockWith('node_modules/x', { dev: true, license: 'MIT AND GPL-2.0-only' }), 1],
  ['OR with one permissive alternative', lockWith('node_modules/x', { dev: true, license: '(GPL-2.0-only OR MIT)' }), 0],
  ['LGPL within the named sharp exception', lockWith('node_modules/@img/sharp-libvips-test', { dev: true, license: 'Apache-2.0 AND LGPL-3.0-or-later' }), 0],
];
for (const [name, lock, expectedProblems] of LICENSE_CASES) {
  test(`license check: ${name} → ${expectedProblems ? 'reported' : 'accepted'}`, () => {
    assertEqual(checkLockfile(lock).length, expectedProblems);
  });
}

// ── ccCampus domain allowlist: index.html and _headers must agree ────────
//
// Two independent mechanisms check the same domain list: the CSP
// (connect-src in web/_headers, blocks at the browser level) and
// CCCAMPUS_ALLOWED_DOMAINS in web/index.html (shows the understandable
// error message instead of letting it fail against the CSP). Listing a
// domain in only one place isn't enough — exactly this bug would have
// stayed invisible to the previous tests, since neither file was ever
// checked against the other.

console.log('\nccCampus domain allowlist (index.html vs. _headers)');

test('CCCAMPUS_ALLOWED_DOMAINS and the CSP connect-src list the same domains', () => {
  const indexHtml = readFileSync(new URL('./web/index.html', import.meta.url), 'utf-8');
  const headers = readFileSync(new URL('./web/_headers', import.meta.url), 'utf-8');

  const jsMatch = indexHtml.match(/CCCAMPUS_ALLOWED_DOMAINS\s*=\s*\[([^\]]*)\]/);
  assert(jsMatch, 'CCCAMPUS_ALLOWED_DOMAINS not found in index.html — test itself broken?');
  const fromJs = jsMatch[1].match(/'\.([a-z0-9.-]+)'/g).map(s => s.slice(2, -1)).sort();

  // Don't just search for "connect-src" — the word also appears in the
  // explanatory comment line above it and would match the wrong line.
  const cspMatch = headers.match(/^\s*Content-Security-Policy:[^\n]*/m);
  assert(cspMatch, 'Content-Security-Policy not found in _headers — test itself broken?');
  const fromCsp = [...cspMatch[0].matchAll(/https:\/\/\*\.([a-z0-9.-]*mbs5[a-z0-9.-]*)/g)]
    .map(m => m[1]).sort();

  assertEqual(JSON.stringify(fromJs), JSON.stringify(fromCsp));
});

// ── No journal comments in the code ─────────────────────────────────────────
//
// Comments explain the current state, not the history of changes that led
// to it — that belongs in commit messages or the design doc (PROJEKT.md),
// not in the code (see Clean Code, chapter "Comments" — "Journal Comments"
// as a named anti-pattern).
// Documentation files (*.md) are deliberately excluded: that's exactly
// where a time reference belongs.
//
// Signal words are checked in both German and English: most of the
// codebase is being moved to English identifiers/comments, but some files
// (and the frozen, point-in-time audit reports) are still German — this
// check needs to catch journal-style comments in either language.

console.log('\nNo journal comments in the code');

test('no date/history signal words in code comments', () => {
  // Checks two comment forms separately, because a plain line-start check
  // (an earlier version of this test) missed multi-line /* */ blocks
  // whose continuation lines don't each start with "*" — exactly the case
  // that stayed undetected in web/index.html until an external review
  // found it.
  const files = [
    'run-tests.mjs', 'stundenplan.js', 'deploy.sh', '.gitignore', 'eslint.config.mjs',
    'proxy/worker.js', 'proxy/hostcheck.mjs', 'proxy/cachekey.mjs', 'proxy/validate.mjs', 'types/heute-schule.d.ts', 'tsconfig.json',
    'tools/headers.mjs', 'tools/check-live-headers.mjs', 'tools/require-clean-tree.sh',
    'web/index.html', 'web/sw.js', 'web/_headers',
  ];
  const signalWords = /vorher|Korrektur \(|Fix vom|Betatest \(|Versehen|monatelang|Passiert seit|bestätigt \(\d|verifiziert \(\d|wurde behoben|nachträglich geändert|fix from|beta test \(|for months|has happened since|confirmed \(\d|verified \(\d|\bwas fixed\b|changed later/;
  const hits = [];
  for (const file of files) {
    const content = readFileSync(new URL(`./${file}`, import.meta.url), 'utf-8');

    // Form 1: single-line // and # comments, checked line by line.
    content.split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|#)/.test(line) && signalWords.test(line)) {
        hits.push(`${file}:${i + 1}: ${line.trim()}`);
      }
    });

    // Form 2: /* ... */ blocks as a whole, regardless of whether every
    // continuation line starts with "*".
    for (const block of content.matchAll(/\/\*[\s\S]*?\*\//g)) {
      if (signalWords.test(block[0])) {
        const line = content.slice(0, block.index).split('\n').length;
        hits.push(`${file}:${line}: ${block[0].split('\n')[0].trim()}…`);
      }
    }
  }
  assert(hits.length === 0, 'Found journal-comment signal words:\n    ' + hits.join('\n    '));
});

// ── Ergebnis ───────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`${passed + failed} Tests: ${passed} ✓  ${failed} ✗`);
if (failed > 0) process.exit(1);
