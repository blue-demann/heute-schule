// Testsuite — läuft ohne Abhängigkeiten mit purem Node:
//   node run-tests.mjs
//
// ESM (.mjs), weil die Proxy-Module (hostcheck.mjs) ESM sind — die
// Apps-Script-Logik in stundenplan.js ist weiterhin CommonJS und wird von
// Node hier automatisch als Default-Export eingebunden.

import { readFileSync } from 'node:fs';
import stundenplan from './stundenplan.js';
import { istPrivatesOderLokalesZiel, pruefeSicherenHostname, pruefeSichereHttpsUrl } from './proxy/hostcheck.mjs';
import { buildCacheKeyMaterial } from './proxy/cachekey.mjs';

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

console.log('\nistPrivatesOderLokalesZiel()');
test('localhost',            () => assert(istPrivatesOderLokalesZiel('localhost')));
test('127.0.0.1 (Loopback)', () => assert(istPrivatesOderLokalesZiel('127.0.0.1')));
test('10.x (RFC1918)',       () => assert(istPrivatesOderLokalesZiel('10.1.2.3')));
test('172.16.x (RFC1918)',   () => assert(istPrivatesOderLokalesZiel('172.16.0.1')));
test('172.31.x (RFC1918)',   () => assert(istPrivatesOderLokalesZiel('172.31.255.254')));
test('172.32.x ist öffentlich (Grenzfall)', () => assert(!istPrivatesOderLokalesZiel('172.32.0.1')));
test('192.168.x (RFC1918)',  () => assert(istPrivatesOderLokalesZiel('192.168.0.1')));
test('169.254.169.254 (Cloud-Metadata)', () => assert(istPrivatesOderLokalesZiel('169.254.169.254')));
test('::1 (IPv6 Loopback)',  () => assert(istPrivatesOderLokalesZiel('::1')));
test('fd00: (IPv6 ULA)',     () => assert(istPrivatesOderLokalesZiel('fd00::1')));
test('.local-Domain',        () => assert(istPrivatesOderLokalesZiel('nas.local')));
test('echte Domain ist nicht privat', () => assert(!istPrivatesOderLokalesZiel('lg-norderstedt.webuntis.com')));
test('öffentliche IP ist nicht privat', () => assert(!istPrivatesOderLokalesZiel('8.8.8.8')));

console.log('\npruefeSicherenHostname()');
test('gültiger WebUntis-Server geht durch', () => {
  assertEqual(pruefeSicherenHostname('lg-norderstedt.webuntis.com', { pflichtSuffix: '.webuntis.com' }), 'lg-norderstedt.webuntis.com');
});
test('Großschreibung wird normalisiert', () => {
  assertEqual(pruefeSicherenHostname('LG-Norderstedt.WebUntis.com', { pflichtSuffix: '.webuntis.com' }), 'lg-norderstedt.webuntis.com');
});
test('pflichtSuffixe (Liste) lässt eine der mehreren erlaubten Domains durch', () => {
  assertEqual(
    pruefeSicherenHostname('parentsmensa.de', { pflichtSuffixe: ['.parentsmensa.de', '.andere-schule.de'] }),
    'parentsmensa.de'
  );
  assertEqual(
    pruefeSicherenHostname('portal.andere-schule.de', { pflichtSuffixe: ['.parentsmensa.de', '.andere-schule.de'] }),
    'portal.andere-schule.de'
  );
});
test('pflichtSuffixe (Liste) lehnt Domain ab, die zu keinem Eintrag passt', () => {
  assertWirft(
    () => pruefeSicherenHostname('angreifer.example', { pflichtSuffixe: ['.parentsmensa.de', '.andere-schule.de'] }),
    'muss auf'
  );
});
test('fremde Domain wird abgelehnt', () => {
  assertWirft(() => pruefeSicherenHostname('angreifer.example', { pflichtSuffix: '.webuntis.com' }), 'muss auf');
});
test('Suffix-Trickserei wird abgelehnt (webuntis.com.angreifer.example)', () => {
  assertWirft(() => pruefeSicherenHostname('webuntis.com.angreifer.example', { pflichtSuffix: '.webuntis.com' }), 'muss auf');
});
test('Loopback wird abgelehnt, auch ohne Pflicht-Suffix', () => {
  assertWirft(() => pruefeSicherenHostname('127.0.0.1'), 'internes/lokales Ziel');
});
test('Cloud-Metadata-IP wird abgelehnt', () => {
  assertWirft(() => pruefeSicherenHostname('169.254.169.254'), 'internes/lokales Ziel');
});
test('Zugangsdaten im Hostnamen werden abgelehnt', () => {
  assertWirft(() => pruefeSicherenHostname('user@evil.example'), 'Ungültiger Server-Hostname');
});
test('Pfad im Hostnamen wird abgelehnt', () => {
  assertWirft(() => pruefeSicherenHostname('webuntis.com/../evil'), 'Ungültiger Server-Hostname');
});
test('leerer Hostname wird abgelehnt', () => {
  assertWirft(() => pruefeSicherenHostname(''), 'Ungültiger Server-Hostname');
});
test('REGRESSION: komplette aus der Adresszeile kopierte WebUntis-URL wird akzeptiert', () => {
  // Deckt den Fall ab, dass jemand die volle URL aus der Adresszeile ins
  // Server-Feld einfügt statt nur den Hostnamen.
  assertEqual(
    pruefeSicherenHostname('https://schule.webuntis.com/WebUntis/#/basic/login', { pflichtSuffix: '.webuntis.com' }),
    'schule.webuntis.com'
  );
});
test('WebUntis-URL ohne Pfad wird akzeptiert', () => {
  assertEqual(
    pruefeSicherenHostname('https://schule.webuntis.com/', { pflichtSuffix: '.webuntis.com' }),
    'schule.webuntis.com'
  );
});
test('URL zu einer fremden Domain bleibt abgelehnt (kein Freifahrtschein durchs URL-Parsing)', () => {
  assertWirft(() => pruefeSicherenHostname('https://angreifer.example/x', { pflichtSuffix: '.webuntis.com' }), 'muss auf');
});
test('URL zu einer internen Adresse bleibt abgelehnt', () => {
  assertWirft(() => pruefeSicherenHostname('https://169.254.169.254/pfad'), 'internes/lokales Ziel');
});

console.log('\npruefeSichereHttpsUrl()');
test('Mensamax-Basis-URL geht durch', () => {
  assertEqual(pruefeSichereHttpsUrl('https://parentsmensa.de').hostname, 'parentsmensa.de');
});
test('ccCampus-Basis-URL mit Pfad geht durch', () => {
  assertEqual(pruefeSichereHttpsUrl('https://cccampus.mbs5online.de/ordering').hostname, 'cccampus.mbs5online.de');
});
test('http:// wird abgelehnt', () => {
  assertWirft(() => pruefeSichereHttpsUrl('http://parentsmensa.de'), 'Nur https');
});
test('file:// wird abgelehnt', () => {
  assertWirft(() => pruefeSichereHttpsUrl('file:///etc/passwd'), 'Nur https');
});
test('Zugangsdaten in der URL werden abgelehnt', () => {
  assertWirft(() => pruefeSichereHttpsUrl('https://user:pw@parentsmensa.de'), 'keine Zugangsdaten');
});
test('interne Adresse als Basis-URL wird abgelehnt', () => {
  assertWirft(() => pruefeSichereHttpsUrl('https://192.168.1.1/admin'), 'internes/lokales Ziel');
});
test('Cloud-Metadata als Basis-URL wird abgelehnt', () => {
  assertWirft(() => pruefeSichereHttpsUrl('https://169.254.169.254/latest/meta-data/'), 'internes/lokales Ziel');
});
test('Unsinn wird abgelehnt', () => {
  assertWirft(() => pruefeSichereHttpsUrl('nicht mal eine url'), 'Ungültige Basis-URL');
});
test('REGRESSION: Mensamax-Allowlist lässt die bekannte Domain durch', () => {
  assertEqual(
    pruefeSichereHttpsUrl('https://parentsmensa.de', { pflichtSuffixe: ['.parentsmensa.de'] }).hostname,
    'parentsmensa.de'
  );
});
test('REGRESSION: Mensamax-Allowlist lehnt beliebige fremde Domain ab', () => {
  assertWirft(
    () => pruefeSichereHttpsUrl('https://angreifer.example', { pflichtSuffixe: ['.parentsmensa.de'] }),
    'muss auf'
  );
});
test('REGRESSION: Suffix-Trick auf die Mensamax-Allowlist bleibt abgelehnt', () => {
  assertWirft(
    () => pruefeSichereHttpsUrl('https://parentsmensa.de.angreifer.example', { pflichtSuffixe: ['.parentsmensa.de'] }),
    'muss auf'
  );
});

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

// ── Keine Journal Comments im Code ──────────────────────────────────────────
//
// Kommentare erklären den aktuellen Stand, nicht die Änderungshistorie
// dahin — das gehört in Commit-Nachrichten oder die Design-Doku
// (PROJEKT.md), nicht in den Code (siehe Clean Code, Kapitel "Comments" —
// "Journal Comments" als benanntes Anti-Pattern).
// Dokumentationsdateien (*.md) sind bewusst ausgenommen: Dort gehört
// Zeitbezug hin.

console.log('\nKeine Journal Comments im Code');

test('keine Datums-/Historie-Signalwörter in Code-Kommentaren', () => {
  // Prüft zwei Kommentar-Formen getrennt, weil eine reine Zeilenanfang-
  // Prüfung (frühere Fassung dieses Tests) mehrzeilige /* */-Blöcke ohne
  // führendes "*" je Fortsetzungszeile übersehen hat — genau der Fall, der
  // in web/index.html unentdeckt blieb, bis eine externe Prüfung ihn fand.
  const dateien = [
    'run-tests.mjs', 'stundenplan.js', 'deploy.sh', '.gitignore', 'eslint.config.mjs',
    'proxy/worker.js', 'proxy/hostcheck.mjs', 'proxy/cachekey.mjs',
    'web/index.html', 'web/_headers',
  ];
  const signalwoerter = /vorher|Korrektur \(|Fix vom|Betatest \(|Versehen|monatelang|Passiert seit|bestätigt \(\d|verifiziert \(\d|wurde behoben|nachträglich geändert/;
  const treffer = [];
  for (const datei of dateien) {
    const inhalt = readFileSync(new URL(`./${datei}`, import.meta.url), 'utf-8');

    // Form 1: einzeilige //- und #-Kommentare, zeilenweise geprüft.
    inhalt.split('\n').forEach((zeile, i) => {
      if (/^\s*(\/\/|#)/.test(zeile) && signalwoerter.test(zeile)) {
        treffer.push(`${datei}:${i + 1}: ${zeile.trim()}`);
      }
    });

    // Form 2: /* ... */-Blöcke als Ganzes, unabhängig davon, ob jede
    // Fortsetzungszeile mit "*" beginnt.
    for (const block of inhalt.matchAll(/\/\*[\s\S]*?\*\//g)) {
      if (signalwoerter.test(block[0])) {
        const zeile = inhalt.slice(0, block.index).split('\n').length;
        treffer.push(`${datei}:${zeile}: ${block[0].split('\n')[0].trim()}…`);
      }
    }
  }
  assert(treffer.length === 0, 'Journal-Comment-Signalwörter gefunden:\n    ' + treffer.join('\n    '));
});

// ── Ergebnis ───────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`${passed + failed} Tests: ${passed} ✓  ${failed} ✗`);
if (failed > 0) process.exit(1);
