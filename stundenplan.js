'use strict';

// Node.js-testable version of the pure logic from stundenplan_agent.gs
// No GAS-specific APIs (UrlFetchApp, GmailApp, etc.)
//
// Legacy code: inherited from the original Apps Script email automation
// that "Heute Schule" replaced. Kept only for its test-covered logic, not
// called by the live proxy or website. Its output strings (email subject/
// body, status messages) are deliberately still German — they're the
// exact text real parents used to receive, not this file's own code.

const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];

function pad(n) { return String(n).padStart(2, '0'); }

// ── Cookie extraction ────────────────────────────────────────────────────

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

// ── Lunch logic ──────────────────────────────────────────────────────────

function parseLunchStatus(cal, details, today) {
  if (!cal) return 'Schulessen: Daten nicht verfügbar';
  const y = today.getFullYear(); const m = today.getMonth() + 1; const d = today.getDate();
  const day = ((cal[String(y)] || {})[String(m)] || {})[String(d)] || {};
  if (!day.CATERING)  return 'Kein Schulessen heute';
  if (day.SIGNED_OFF) return 'Abgemeldet (kein Essen)';
  if (details && details.MENUES) {
    const ordered = details.MENUES.find(mn => mn.AUSGEWAEHLT === '1');
    if (ordered) return `Essen bestellt: ${ordered.MENUE_TEXT} (${ordered.PREIS})`;
    return 'Essen verfügbar (kein Menü gewählt)';
  }
  return 'Essen bestellt ✓';
}

// ── Timetable logic ──────────────────────────────────────────────────────
//
// Result field names (fach, raum, start, ende, vertretung) match the same
// shape proxy/worker.js's getTimetable() returns — deliberately not
// translated on their own, see the note there.

function buildLessonList(lessons, subjectsById, roomsById) {
  const seen = new Set();
  return lessons
    .sort((a, b) => a.startTime - b.startTime || a.id - b.id)
    .filter(st => {
      if (seen.has(st.id) || st.code === 'cancelled') return false;
      seen.add(st.id); return true;
    })
    .map(st => {
      const subjectId = st.su && st.su[0] ? st.su[0].id : null;
      const roomId = st.ro && st.ro[0] ? st.ro[0].id : null;
      const s = String(st.startTime).padStart(4, '0');
      const e = String(st.endTime).padStart(4, '0');
      return {
        fach:       subjectId ? (subjectsById[subjectId] || '?') : '?',
        raum:       roomId    ? (roomsById[roomId]       || '?') : '?',
        start:      `${s.slice(0,2)}:${s.slice(2)}`,
        ende:       `${e.slice(0,2)}:${e.slice(2)}`,
        vertretung: st.code === 'irregular',
      };
    });
}

function formatLessons(lessons) {
  if (!lessons.length) return '  (keine Stunden / schulfrei)';
  const slots = {};
  lessons.forEach(s => {
    const key = `${s.start}|${s.ende}`;
    if (!slots[key]) slots[key] = [];
    slots[key].push(s);
  });
  return Object.entries(slots).map(([key, group]) => {
    const [start, end] = key.split('|');
    if (group.length === 1) {
      const s = group[0];
      return `  ${start}–${end}  ${s.fach}  (Raum ${s.raum})${s.vertretung ? '  ⚠ Vertretung' : ''}`;
    }
    return `  ${start}–${end}  ` + group.map(s => `${s.fach} (${s.raum})`).join(' / ');
  }).join('\n');
}

// ── Email ────────────────────────────────────────────────────────────────

function buildEmail(childrenData, today) {
  const weekday = WEEKDAYS[today.getDay()];
  const date    = `${pad(today.getDate())}.${pad(today.getMonth()+1)}.${today.getFullYear()}`;
  const hasError = childrenData.some(d => d.fehler !== null);
  const subject = hasError
    ? `[SCHULE] ⚠ Stundenplan (teilweise Fehler) – ${weekday}, ${date}`
    : `[SCHULE] Stundenplan – ${weekday}, ${date}`;
  const childSections = childrenData.map(({ kind, stunden, lunch, fehler }) => {
    const errorNote = fehler
      ? `\n⚠ Datenabruf fehlgeschlagen: ${fehler}\n  Bitte Stundenplan manuell prüfen.`
      : '';
    return [
      `── ${kind.name} (Klasse ${kind.klasse.toUpperCase()}) ──────────────`,
      '', `📚 Stundenplan${errorNote}`,
      fehler ? '' : formatLessons(stunden),
      '', '🍽 Schulessen', `  ${lunch}`,
    ].join('\n');
  }).join('\n\n');
  const body = [
    'Hallo Liebe Eltern! 👋', '',
    `Heute ist ${weekday}, ${date} — hier der Überblick:`, '',
    childSections, '',
    'Einen guten Tag! 🌟', 'Deine Heute Schule App',
  ].join('\n');
  return { subject, body };
}

module.exports = {
  pad,
  extractLastPhpsessid,
  extractUpdatedPhpsessid,
  parseLunchStatus,
  buildLessonList,
  formatLessons,
  buildEmail,
};
