// Testsuite — läuft ohne Abhängigkeiten mit purem Node:
//   node run-tests.mjs
//
// ESM (.mjs), weil die Proxy-Module (hostcheck.mjs) ESM sind — die
// Apps-Script-Logik in stundenplan.js ist weiterhin CommonJS und wird von
// Node hier automatisch als Default-Export eingebunden.

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
  buildStundenListe,
  formatStunden,
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
test('einstellige Zahl wird aufgefüllt',   () => assertEqual(pad(5),  '05'));
test('zweistellige Zahl bleibt gleich',    () => assertEqual(pad(12), '12'));
test('Null wird zu 00',                    () => assertEqual(pad(0),  '00'));

// ── Cookie-Extraktion ──────────────────────────────────────────────────────
console.log('\nextractLastPhpsessid()');

test('einfacher Cookie-String', () => {
  assertEqual(extractLastPhpsessid('PHPSESSID=abc123; Path=/'), 'PHPSESSID=abc123');
});

test('letztes von zwei PHPSESSIDs nehmen (Doppel-Cookie-Bug)', () => {
  const raw = 'PHPSESSID=first111; Path=/\nPHPSESSID=second222; Path=/';
  assertEqual(extractLastPhpsessid(raw), 'PHPSESSID=second222');
});

test('Array von Cookies', () => {
  const raw = ['PHPSESSID=cookieA; Path=/', 'PHPSESSID=cookieB; Path=/'];
  assertEqual(extractLastPhpsessid(raw), 'PHPSESSID=cookieB');
});

test('kein PHPSESSID → null', () => {
  assertEqual(extractLastPhpsessid('session=xyz'), null);
});

test('leerer String → null', () => {
  assertEqual(extractLastPhpsessid(''), null);
});

test('null → null', () => {
  assertEqual(extractLastPhpsessid(null), null);
});

// ── Session-Rotation ───────────────────────────────────────────────────────
console.log('\nextractUpdatedPhpsessid() — Session-Rotation');

test('neue PHPSESSID aus Response-Header extrahieren', () => {
  const respCookies = ['PHPSESSID=rotiert999; Path=/; HttpOnly'];
  assertEqual(extractUpdatedPhpsessid(respCookies), 'PHPSESSID=rotiert999');
});

test('keine neue Cookie → null (kein Update)', () => {
  assertEqual(extractUpdatedPhpsessid(''), null);
});

test('letztes Cookie bei mehreren in Response nehmen', () => {
  const respCookies = 'PHPSESSID=alt111; Path=/\nPHPSESSID=neu222; Path=/';
  assertEqual(extractUpdatedPhpsessid(respCookies), 'PHPSESSID=neu222');
});

// ── parseLunchStatus ───────────────────────────────────────────────────────
console.log('\nparseLunchStatus()');

const heute = new Date(2026, 5, 22); // Montag 22.06.2026

function makeCalendar(dayProps) {
  return { '2026': { '6': { '22': dayProps } } };
}

test('kein Catering → kein Schulessen', () => {
  const cal = makeCalendar({ CATERING: 0 });
  assertEqual(parseLunchStatus(cal, null, heute), 'Kein Schulessen heute');
});

test('Catering ohne CATERING-Flag → kein Schulessen', () => {
  const cal = makeCalendar({});
  assertEqual(parseLunchStatus(cal, null, heute), 'Kein Schulessen heute');
});

test('abgemeldet', () => {
  const cal = makeCalendar({ CATERING: 1, SIGNED_OFF: 1 });
  assertEqual(parseLunchStatus(cal, null, heute), 'Abgemeldet (kein Essen)');
});

test('Menü bestellt (AUSGEWAEHLT=1)', () => {
  const cal = makeCalendar({ CATERING: 1 });
  const details = { MENUES: [
    { MENUE_NR: 1, MENUE_TEXT: 'Spaghetti Bolognese', PREIS: '3,80 EUR', AUSGEWAEHLT: '1' },
    { MENUE_NR: 2, MENUE_TEXT: 'Gemüsesuppe',         PREIS: '3,80 EUR', AUSGEWAEHLT: '0' },
  ]};
  assertEqual(parseLunchStatus(cal, details, heute), 'Essen bestellt: Spaghetti Bolognese (3,80 EUR)');
});

test('Menüs vorhanden aber keines gewählt', () => {
  const cal = makeCalendar({ CATERING: 1 });
  const details = { MENUES: [
    { MENUE_NR: 1, MENUE_TEXT: 'Spaghetti', PREIS: '3,80 EUR', AUSGEWAEHLT: '0' },
  ]};
  assertEqual(parseLunchStatus(cal, details, heute), 'Essen verfügbar (kein Menü gewählt)');
});

test('details null (Session-Problem oder abgemeldet) → Fallback', () => {
  const cal = makeCalendar({ CATERING: 1 });
  assertEqual(parseLunchStatus(cal, null, heute), 'Essen bestellt ✓');
});

test('cal null → Daten nicht verfügbar', () => {
  assertEqual(parseLunchStatus(null, null, heute), 'Schulessen: Daten nicht verfügbar');
});

test('zweites Menü ist das gewählte', () => {
  const cal = makeCalendar({ CATERING: 1 });
  const details = { MENUES: [
    { MENUE_NR: 1, MENUE_TEXT: 'Fleischgericht', PREIS: '4,00 EUR', AUSGEWAEHLT: '0' },
    { MENUE_NR: 2, MENUE_TEXT: 'Veganes Gericht', PREIS: '4,00 EUR', AUSGEWAEHLT: '1' },
  ]};
  assertEqual(parseLunchStatus(cal, details, heute), 'Essen bestellt: Veganes Gericht (4,00 EUR)');
});

// ── buildStundenListe ──────────────────────────────────────────────────────
console.log('\nbuildStundenListe()');

const faecherMap = { 10: 'Mathematik', 20: 'Deutsch', 30: 'Englisch' };
const raeumMap   = { 1: 'R101', 2: 'R102', 3: 'Sporthalle' };

function makeStunde(id, startTime, endTime, fachId, raumId, code) {
  return {
    id, startTime, endTime,
    su: fachId ? [{ id: fachId }] : [],
    ro: raumId ? [{ id: raumId }] : [],
    code: code || null,
  };
}

test('einfache Stunde', () => {
  const result = buildStundenListe(
    [makeStunde(1, 800, 845, 10, 1)],
    faecherMap, raeumMap
  );
  assert(result.length === 1);
  assertEqual(result[0].fach,  'Mathematik');
  assertEqual(result[0].raum,  'R101');
  assertEqual(result[0].start, '08:00');
  assertEqual(result[0].ende,  '08:45');
  assertEqual(result[0].vertretung, false);
});

test('ausgefallene Stunde wird gefiltert', () => {
  const result = buildStundenListe(
    [makeStunde(1, 800, 845, 10, 1, 'cancelled')],
    faecherMap, raeumMap
  );
  assertEqual(result.length, 0);
});

test('Vertretung wird markiert', () => {
  const result = buildStundenListe(
    [makeStunde(1, 800, 845, 20, 1, 'irregular')],
    faecherMap, raeumMap
  );
  assertEqual(result[0].vertretung, true);
});

test('Duplikat-IDs werden dedupliziert', () => {
  const result = buildStundenListe(
    [makeStunde(5, 800, 845, 10, 1), makeStunde(5, 800, 845, 10, 1)],
    faecherMap, raeumMap
  );
  assertEqual(result.length, 1);
});

test('Sortierung nach Startzeit', () => {
  const result = buildStundenListe(
    [makeStunde(2, 945, 1030, 20, 2), makeStunde(1, 800, 845, 10, 1)],
    faecherMap, raeumMap
  );
  assertEqual(result[0].start, '08:00');
  assertEqual(result[1].start, '09:45');
});

test('unbekanntes Fach → ?', () => {
  const result = buildStundenListe(
    [makeStunde(1, 800, 845, 99, 1)],
    faecherMap, raeumMap
  );
  assertEqual(result[0].fach, '?');
});

test('kein Fach → ?', () => {
  const result = buildStundenListe(
    [makeStunde(1, 800, 845, null, 1)],
    faecherMap, raeumMap
  );
  assertEqual(result[0].fach, '?');
});

test('unbekannter Raum → ?', () => {
  const result = buildStundenListe(
    [makeStunde(1, 800, 845, 10, 99)],
    faecherMap, raeumMap
  );
  assertEqual(result[0].raum, '?');
});

// ── formatStunden ──────────────────────────────────────────────────────────
console.log('\nformatStunden()');

test('leere Liste', () => {
  assertEqual(formatStunden([]), '  (keine Stunden / schulfrei)');
});

test('einzelne Stunde', () => {
  const stunden = [{ fach: 'Mathematik', raum: 'R101', start: '08:00', ende: '08:45', vertretung: false }];
  const result = formatStunden(stunden);
  assert(result.includes('08:00–08:45'), 'Zeit fehlt');
  assert(result.includes('Mathematik'),  'Fach fehlt');
  assert(result.includes('R101'),        'Raum fehlt');
  assert(!result.includes('⚠'),          'Kein Vertretungszeichen erwartet');
});

test('Vertretung zeigt ⚠', () => {
  const stunden = [{ fach: 'Deutsch', raum: 'R102', start: '09:45', ende: '10:30', vertretung: true }];
  assert(formatStunden(stunden).includes('⚠ Vertretung'));
});

test('Parallelgruppen werden zusammengefasst', () => {
  const stunden = [
    { fach: 'Latein',      raum: 'R101', start: '08:00', ende: '08:45', vertretung: false },
    { fach: 'Französisch', raum: 'R102', start: '08:00', ende: '08:45', vertretung: false },
    { fach: 'Spanisch',    raum: 'R103', start: '08:00', ende: '08:45', vertretung: false },
  ];
  const result = formatStunden(stunden);
  const lines = result.split('\n');
  assertEqual(lines.length, 1);
  assert(result.includes('Latein'),      'Latein fehlt');
  assert(result.includes('Französisch'), 'Französisch fehlt');
  assert(result.includes('Spanisch'),    'Spanisch fehlt');
});

test('verschiedene Zeiten bleiben getrennt', () => {
  const stunden = [
    { fach: 'Mathe',    raum: 'R101', start: '08:00', ende: '08:45', vertretung: false },
    { fach: 'Deutsch',  raum: 'R102', start: '09:45', ende: '10:30', vertretung: false },
  ];
  const lines = formatStunden(stunden).split('\n');
  assertEqual(lines.length, 2);
});

// ── buildEmail ─────────────────────────────────────────────────────────────
console.log('\nbuildEmail()');

const montag = new Date(2026, 5, 22); // Montag

const kinderOhneFeher = [
  { kind: { name: 'Mia', klasse: '8c' }, stunden: [], lunch: 'Essen bestellt ✓', fehler: null },
  { kind: { name: 'Emma', klasse: '5d' }, stunden: [], lunch: 'Abgemeldet (kein Essen)', fehler: null },
];

test('Subject enthält [SCHULE]', () => {
  const { subject } = buildEmail(kinderOhneFeher, montag);
  assert(subject.startsWith('[SCHULE]'), 'Kein [SCHULE]-Prefix');
});

test('Subject enthält Wochentag', () => {
  const { subject } = buildEmail(kinderOhneFeher, montag);
  assert(subject.includes('Montag'), 'Kein Wochentag im Subject');
});

test('Subject enthält Datum', () => {
  const { subject } = buildEmail(kinderOhneFeher, montag);
  assert(subject.includes('22.06.2026'), 'Kein Datum im Subject');
});

test('kein ⚠ im Subject ohne Fehler', () => {
  const { subject } = buildEmail(kinderOhneFeher, montag);
  assert(!subject.includes('⚠'), '⚠ nicht erwartet');
});

test('⚠ im Subject wenn Fehler vorliegt', () => {
  const kinderMitFehler = [
    { kind: { name: 'Mia', klasse: '8c' }, stunden: [], lunch: '', fehler: 'Timeout' },
  ];
  const { subject } = buildEmail(kinderMitFehler, montag);
  assert(subject.includes('⚠'), '⚠ erwartet bei Fehler');
});

test('Body enthält Begrüßung', () => {
  const { body } = buildEmail(kinderOhneFeher, montag);
  assert(body.includes('Hallo Liebe Eltern'), 'Begrüßung fehlt');
});

test('Body enthält beide Kinder', () => {
  const { body } = buildEmail(kinderOhneFeher, montag);
  assert(body.includes('Mia'),  'Mia fehlt');
  assert(body.includes('Emma'), 'Emma fehlt');
});

test('Body enthält Klassenname in Großbuchstaben', () => {
  const { body } = buildEmail(kinderOhneFeher, montag);
  assert(body.includes('8C'), '8C fehlt');
  assert(body.includes('5D'), '5D fehlt');
});

test('Fehlerhinweis im Body wenn Fehler', () => {
  const kinderMitFehler = [
    { kind: { name: 'Mia', klasse: '8c' }, stunden: [], lunch: '', fehler: 'Timeout' },
  ];
  const { body } = buildEmail(kinderMitFehler, montag);
  assert(body.includes('Datenabruf fehlgeschlagen'), 'Fehlerhinweis fehlt');
  assert(body.includes('Timeout'), 'Fehlertext fehlt');
});

test('Body endet mit Signatur', () => {
  const { body } = buildEmail(kinderOhneFeher, montag);
  assert(body.includes('Deine Heute Schule App'), 'Signatur fehlt');
});

// ── Proxy: Ziel-Host-Validierung (SSRF-Schutz) ─────────────────────────────

function assertWirft(fn, teilDerMeldung) {
  let geworfen = null;
  try { fn(); } catch (e) { geworfen = e; }
  if (!geworfen) throw new Error('Es wurde kein Fehler geworfen, aber einer erwartet');
  if (teilDerMeldung && !geworfen.message.includes(teilDerMeldung)) {
    throw new Error(`Fehlermeldung passt nicht.\n    Erwartet enthält: ${teilDerMeldung}\n    Erhalten:  ${geworfen.message}`);
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

const wuBasis = { server: 'x.webuntis.com', user: 'Klasse-9c', klasse: '9c', password: 'richtig' };
const lunchBasis = { provider: 'mensamax', base: 'https://parentsmensa.de', projekt: 'P', einrichtung: 'E', username: 'u', password: 'geheim' };

test('REGRESSION: anderes WebUntis-Passwort ⇒ anderer Schlüssel', () => {
  const a = buildCacheKeyMaterial('20260827', wuBasis, lunchBasis);
  const b = buildCacheKeyMaterial('20260827', { ...wuBasis, password: 'falsch' }, lunchBasis);
  assert(a !== b, 'Schlüssel identisch trotz anderem Passwort — Cache liefert fremde Daten ohne Login aus!');
});

test('REGRESSION: anderes Mensamax-Passwort ⇒ anderer Schlüssel', () => {
  const a = buildCacheKeyMaterial('20260827', wuBasis, lunchBasis);
  const b = buildCacheKeyMaterial('20260827', wuBasis, { ...lunchBasis, password: 'falsch' });
  assert(a !== b, 'Schlüssel identisch trotz anderem Mensamax-Passwort');
});

test('REGRESSION: andere ccCampus-PIN ⇒ anderer Schlüssel', () => {
  const mitPin = (pin) => buildCacheKeyMaterial('20260827', wuBasis,
    { ...lunchBasis, provider: 'cccampus', cccampus: { base: 'https://c.mbs5online.de', kundennummer: '1', pin } });
  assert(mitPin('1111') !== mitPin('2222'), 'Schlüssel identisch trotz anderer PIN');
});

test('identische Eingaben ⇒ identischer Schlüssel (Cache funktioniert überhaupt)', () => {
  const a = buildCacheKeyMaterial('20260827', wuBasis, lunchBasis);
  const b = buildCacheKeyMaterial('20260827', { ...wuBasis }, { ...lunchBasis });
  assertEqual(a, b);
});

test('anderer Tag ⇒ anderer Schlüssel', () => {
  const a = buildCacheKeyMaterial('20260827', wuBasis, lunchBasis);
  const b = buildCacheKeyMaterial('20260828', wuBasis, lunchBasis);
  assert(a !== b, 'Schlüssel identisch trotz anderem Datum');
});

test('anderes Kind derselben Familie ⇒ anderer Schlüssel', () => {
  const a = buildCacheKeyMaterial('20260827', wuBasis, lunchBasis);
  const b = buildCacheKeyMaterial('20260827', { ...wuBasis, klasse: '6d' }, lunchBasis);
  assert(a !== b, 'Schlüssel identisch trotz anderer Klasse');
});

test('Passwörter stehen im Material (wird gehasht, nie roh gespeichert)', () => {
  const m = buildCacheKeyMaterial('20260827', wuBasis, lunchBasis);
  assert(m.includes('richtig'), 'WebUntis-Passwort fehlt im Schlüsselmaterial');
  assert(m.includes('geheim'), 'Mensamax-Passwort fehlt im Schlüsselmaterial');
});

test('fehlende Konfiguration wirft nicht', () => {
  buildCacheKeyMaterial('20260827');
  buildCacheKeyMaterial('20260827', {}, {});
});

// ── ccCampus-Domain-Allowlist: index.html und _headers müssen übereinstimmen ─
//
// Zwei unabhängige Mechanismen prüfen dieselbe Domain-Liste: die CSP
// (connect-src in web/_headers, blockiert auf Browser-Ebene) und
// CCCAMPUS_ERLAUBTE_DOMAINS in web/index.html (zeigt die verständliche
// Fehlermeldung, statt es an der CSP scheitern zu lassen). Eine Domain nur
// an einer Stelle einzutragen reicht nicht — genau dieser Bug wäre mit den
// bisherigen Tests unsichtbar geblieben, da beide Dateien nie gegeneinander
// geprüft wurden.

console.log('\nccCampus-Domain-Allowlist (index.html vs. _headers)');

test('CCCAMPUS_ERLAUBTE_DOMAINS und CSP connect-src listen dieselben Domains', () => {
  const indexHtml = readFileSync(new URL('./web/index.html', import.meta.url), 'utf-8');
  const headers = readFileSync(new URL('./web/_headers', import.meta.url), 'utf-8');

  const jsMatch = indexHtml.match(/CCCAMPUS_ERLAUBTE_DOMAINS\s*=\s*\[([^\]]*)\]/);
  assert(jsMatch, 'CCCAMPUS_ERLAUBTE_DOMAINS nicht in index.html gefunden — Test selbst kaputt?');
  const ausJs = jsMatch[1].match(/'\.([a-z0-9.-]+)'/g).map(s => s.slice(2, -1)).sort();

  // Nicht einfach nach "connect-src" suchen — das Wort steht auch in der
  // Erklär-Kommentarzeile davor und würde die falsche Zeile treffen.
  const cspMatch = headers.match(/^\s*Content-Security-Policy:[^\n]*/m);
  assert(cspMatch, 'Content-Security-Policy nicht in _headers gefunden — Test selbst kaputt?');
  const ausCsp = [...cspMatch[0].matchAll(/https:\/\/\*\.([a-z0-9.-]*mbs5[a-z0-9.-]*)/g)]
    .map(m => m[1]).sort();

  assertEqual(JSON.stringify(ausJs), JSON.stringify(ausCsp));
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
