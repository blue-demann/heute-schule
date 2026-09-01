// Test suite — runs dependency-free with plain Node:
//   node run-tests.mjs
//
// ESM (.mjs), because the proxy modules (hostcheck.mjs) are ESM — the
// Apps Script logic in stundenplan.js is still CommonJS and gets wired in
// here by Node automatically as a default export.

import { readFileSync } from 'node:fs';
import stundenplan from './stundenplan.js';
import { isPrivateOrLocalTarget, checkSafeHostname, checkSafeHttpsUrl } from './proxy/hostcheck.mjs';
import { buildCacheKeyMaterial } from './proxy/cachekey.mjs';
import { lastWeekAsRange, formatEmailText } from './analytics-report/worker.js';

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

console.log('\nlastWeekAsRange() (analytics-report)');

test('returns exactly 7 full days, ending the day before (UTC)', () => {
  const now = new Date('2026-09-08T10:00:00Z'); // a Tuesday
  const { since, until } = lastWeekAsRange(now);
  assertEqual(since, '2026-09-01T00:00:00.000Z');
  assertEqual(until, '2026-09-08T00:00:00.000Z');
});

test('handles a month boundary correctly', () => {
  const now = new Date('2026-09-03T00:00:00Z');
  const { since } = lastWeekAsRange(now);
  assertEqual(since, '2026-08-27T00:00:00.000Z');
});

console.log('\nformatEmailText() (analytics-report)');

test('full numbers are printed', () => {
  const text = formatEmailText({
    since: '2026-09-01T00:00:00.000Z',
    until: '2026-09-08T00:00:00.000Z',
    visits: 42,
    proxyRequests: 17,
  });
  assert(text.includes('2026-09-01 bis 2026-09-08'), 'date range missing from the text');
  assert(text.includes('Website-Besuche: 42'), 'visit count missing from the text');
  assert(text.includes('Proxy-Anfragen (WebUntis/Mensamax): 17'), 'proxy count missing from the text');
});

test('missing values are marked "nicht verfügbar", not silently dropped', () => {
  const text = formatEmailText({
    since: '2026-09-01T00:00:00.000Z',
    until: '2026-09-08T00:00:00.000Z',
    visits: null,
    proxyRequests: 5,
  });
  assert(text.includes('Website-Besuche: nicht verfügbar'), 'missing value is not marked as such');
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
    'proxy/worker.js', 'proxy/hostcheck.mjs', 'proxy/cachekey.mjs',
    'analytics-report/worker.js',
    'web/index.html', 'web/_headers',
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
