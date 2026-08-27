'use strict';

// Node.js-testbare Version der reinen Logik aus stundenplan_agent.gs
// Keine GAS-spezifischen APIs (UrlFetchApp, GmailApp, etc.)

const WOCHENTAGE = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];

function pad(n) { return String(n).padStart(2, '0'); }

// ── Cookie-Extraktion ──────────────────────────────────────────────────────

function extractLastPhpsessid(rawCookies) {
  const cookieStr = Array.isArray(rawCookies) ? rawCookies.join(';') : (rawCookies || '');
  const allMatches = [...cookieStr.matchAll(/PHPSESSID=([^;]+)/g)];
  if (!allMatches.length) return null;
  return `PHPSESSID=${allMatches[allMatches.length - 1][1]}`;
}

function extractUpdatedPhpsessid(rawCookies) {
  const cookieStr = Array.isArray(rawCookies) ? rawCookies.join(';') : (rawCookies || '');
  const allMatches = [...cookieStr.matchAll(/PHPSESSID=([^;]+)/g)];
  if (!allMatches.length) return null;
  return `PHPSESSID=${allMatches[allMatches.length - 1][1]}`;
}

// ── Schulessen-Logik ───────────────────────────────────────────────────────

function parseLunchStatus(cal, details, heute) {
  if (!cal) return 'Schulessen: Daten nicht verfügbar';
  const y = heute.getFullYear(), m = heute.getMonth() + 1, d = heute.getDate();
  const tag = ((cal[String(y)] || {})[String(m)] || {})[String(d)] || {};
  if (!tag.CATERING)  return 'Kein Schulessen heute';
  if (tag.SIGNED_OFF) return 'Abgemeldet (kein Essen)';
  if (details && details.MENUES) {
    const bestellt = details.MENUES.find(mn => mn.AUSGEWAEHLT === '1');
    if (bestellt) return `Essen bestellt: ${bestellt.MENUE_TEXT} (${bestellt.PREIS})`;
    return 'Essen verfügbar (kein Menü gewählt)';
  }
  return 'Essen bestellt ✓';
}

// ── Stundenplan-Logik ──────────────────────────────────────────────────────

function buildStundenListe(stunden, faecherMap, raeumMap) {
  const seen = new Set();
  return stunden
    .sort((a, b) => a.startTime - b.startTime || a.id - b.id)
    .filter(st => {
      if (seen.has(st.id) || st.code === 'cancelled') return false;
      seen.add(st.id); return true;
    })
    .map(st => {
      const fachId = st.su && st.su[0] ? st.su[0].id : null;
      const raumId = st.ro && st.ro[0] ? st.ro[0].id : null;
      const s = String(st.startTime).padStart(4, '0');
      const e = String(st.endTime).padStart(4, '0');
      return {
        fach:       fachId ? (faecherMap[fachId] || '?') : '?',
        raum:       raumId ? (raeumMap[raumId]   || '?') : '?',
        start:      `${s.slice(0,2)}:${s.slice(2)}`,
        ende:       `${e.slice(0,2)}:${e.slice(2)}`,
        vertretung: st.code === 'irregular',
      };
    });
}

function formatStunden(stunden) {
  if (!stunden.length) return '  (keine Stunden / schulfrei)';
  const slots = {};
  stunden.forEach(s => {
    const key = `${s.start}|${s.ende}`;
    if (!slots[key]) slots[key] = [];
    slots[key].push(s);
  });
  return Object.entries(slots).map(([key, gruppe]) => {
    const [start, ende] = key.split('|');
    if (gruppe.length === 1) {
      const s = gruppe[0];
      return `  ${start}–${ende}  ${s.fach}  (Raum ${s.raum})${s.vertretung ? '  ⚠ Vertretung' : ''}`;
    }
    return `  ${start}–${ende}  ` + gruppe.map(s => `${s.fach} (${s.raum})`).join(' / ');
  }).join('\n');
}

// ── E-Mail ─────────────────────────────────────────────────────────────────

function buildEmail(kinderDaten, heute) {
  const wochentag = WOCHENTAGE[heute.getDay()];
  const datum     = `${pad(heute.getDate())}.${pad(heute.getMonth()+1)}.${heute.getFullYear()}`;
  const hatFehler = kinderDaten.some(d => d.fehler !== null);
  const subject = hatFehler
    ? `[SCHULE] ⚠ Stundenplan (teilweise Fehler) – ${wochentag}, ${datum}`
    : `[SCHULE] Stundenplan – ${wochentag}, ${datum}`;
  const kinderSektionen = kinderDaten.map(({ kind, stunden, lunch, fehler }) => {
    const fehlerHinweis = fehler
      ? `\n⚠ Datenabruf fehlgeschlagen: ${fehler}\n  Bitte Stundenplan manuell prüfen.`
      : '';
    return [
      `── ${kind.name} (Klasse ${kind.klasse.toUpperCase()}) ──────────────`,
      ``, `📚 Stundenplan${fehlerHinweis}`,
      fehler ? '' : formatStunden(stunden),
      ``, `🍽 Schulessen`, `  ${lunch}`,
    ].join('\n');
  }).join('\n\n');
  const body = [
    `Hallo Liebe Eltern! 👋`, ``,
    `Heute ist ${wochentag}, ${datum} — hier der Überblick:`, ``,
    kinderSektionen, ``,
    `Einen guten Tag! 🌟`, `Deine Heute Schule App`,
  ].join('\n');
  return { subject, body };
}

module.exports = {
  pad,
  extractLastPhpsessid,
  extractUpdatedPhpsessid,
  parseLunchStatus,
  buildStundenListe,
  formatStunden,
  buildEmail,
};
