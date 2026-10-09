// Runtime validation of untrusted input: the request body the browser
// sends, and what WebUntis sends back.
//
// The JSON-RPC answers arrive from a third-party server and are untrusted:
// the worker reads ids, times and names from them and puts the session id
// into a Cookie header. Each validator checks exactly the fields the worker
// uses and returns the value typed; anything structurally off is rejected
// as a whole with a generic message — no upstream content in the error.
// Extra fields are allowed (WebUntis sends many the worker ignores),
// optional display fields (subject/room names) may be missing.
//
// Deliberately a separate file, like hostcheck.mjs, so it can be tested in
// the plain Node suite (run-tests.mjs).

/**
 * @typedef {{ sessionId: string }} WebUntisAuth
 * @typedef {{ id: number, name: string }} WebUntisClass
 * @typedef {{ id: number }} WebUntisRef
 * @typedef {{
 *   id: number, startTime: number, endTime: number,
 *   code?: string | null, su?: WebUntisRef[], ro?: WebUntisRef[]
 * }} WebUntisLesson
 * @typedef {{ id: number, name?: string, longName?: string }} WebUntisSubject
 * @typedef {{ id: number, name?: string }} WebUntisRoom
 */

// Deliberately not "WebUntis <method>: ..." — worker.js reads that prefix on
// authenticate as "WebUntis rejected the login", which a malformed answer
// is not.
/** @param {string} method */
function unexpected(method) {
  return new Error(`WebUntis: unerwartete Antwort auf ${method}`);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value */
function isId(value) {
  return Number.isSafeInteger(value) && /** @type {number} */ (value) >= 0;
}

/** @param {unknown} value  HHMM as WebUntis sends it, e.g. 745 or 1530 */
function isClockTime(value) {
  if (!Number.isSafeInteger(value)) return false;
  const n = /** @type {number} */ (value);
  return n >= 0 && n <= 2359 && n % 100 < 60;
}

/** @param {unknown} value */
function isOptionalString(value) {
  return value === undefined || value === null || typeof value === 'string';
}

/**
 * @param {unknown} value
 * @param {string} method
 * @returns {unknown[]}
 */
function expectArray(value, method) {
  if (!Array.isArray(value)) throw unexpected(method);
  return value;
}

/**
 * @param {unknown} value
 * @returns {value is WebUntisRef[] | undefined}
 */
function isOptionalRefList(value) {
  return value === undefined || (Array.isArray(value) && value.every((r) => isObject(r) && isId(r.id)));
}

// JSON-RPC 2.0 envelope: either { result } or { error: { message } }.
// Returns the error message (a string WebUntis chose, shown to the parent
// as before) or the still-unvalidated result.
/**
 * @param {unknown} data
 * @param {string} method
 * @returns {{ error: string } | { result: unknown }}
 */
export function validateRpcEnvelope(data, method) {
  if (!isObject(data)) throw unexpected(method);
  if (data.error !== undefined && data.error !== null) {
    if (!isObject(data.error) || typeof data.error.message !== 'string') throw unexpected(method);
    return { error: data.error.message };
  }
  if (!('result' in data)) throw unexpected(method);
  return { result: data.result };
}

// The session id goes verbatim into "Cookie: JSESSIONID=<id>" — only a
// plain token charset, so no CR/LF, ";" or "," can reach the header.
const SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/;

/**
 * @param {unknown} result
 * @returns {WebUntisAuth}
 */
export function validateAuth(result) {
  if (!isObject(result) || typeof result.sessionId !== 'string' || !SESSION_ID.test(result.sessionId)) {
    throw unexpected('authenticate');
  }
  return { sessionId: result.sessionId };
}

/**
 * @param {unknown} result
 * @returns {WebUntisClass[]}
 */
export function validateClasses(result) {
  return expectArray(result, 'getKlassen').map((k) => {
    if (!isObject(k) || !isId(k.id) || typeof k.name !== 'string') throw unexpected('getKlassen');
    return { id: /** @type {number} */ (k.id), name: k.name };
  });
}

/**
 * @param {unknown} result
 * @returns {WebUntisLesson[]}
 */
export function validateLessons(result) {
  return expectArray(result, 'getTimetable').map((l) => {
    if (!isObject(l) || !isId(l.id) || !isClockTime(l.startTime) || !isClockTime(l.endTime)
        || !isOptionalString(l.code) || !isOptionalRefList(l.su) || !isOptionalRefList(l.ro)) {
      throw unexpected('getTimetable');
    }
    return {
      id: /** @type {number} */ (l.id),
      startTime: /** @type {number} */ (l.startTime),
      endTime: /** @type {number} */ (l.endTime),
      code: /** @type {string | null | undefined} */ (l.code),
      su: /** @type {WebUntisRef[] | undefined} */ (l.su),
      ro: /** @type {WebUntisRef[] | undefined} */ (l.ro),
    };
  });
}

/**
 * @param {unknown} result
 * @returns {WebUntisSubject[]}
 */
export function validateSubjects(result) {
  return expectArray(result, 'getSubjects').map((s) => {
    if (!isObject(s) || !isId(s.id) || !isOptionalString(s.name) || !isOptionalString(s.longName)) {
      throw unexpected('getSubjects');
    }
    return {
      id: /** @type {number} */ (s.id),
      name: /** @type {string | undefined} */ (s.name ?? undefined),
      longName: /** @type {string | undefined} */ (s.longName ?? undefined),
    };
  });
}

/**
 * @param {unknown} result
 * @returns {WebUntisRoom[]}
 */
export function validateRooms(result) {
  return expectArray(result, 'getRooms').map((r) => {
    if (!isObject(r) || !isId(r.id) || !isOptionalString(r.name)) throw unexpected('getRooms');
    return { id: /** @type {number} */ (r.id), name: /** @type {string | undefined} */ (r.name ?? undefined) };
  });
}

// ── Request body from the browser ────────────────────────────────────────

const MAX_FIELD_LENGTH = 1000;
const WEBUNTIS_FIELDS = /** @type {const} */ (['server', 'user', 'password', 'klasse']);
const LUNCH_FIELDS = /** @type {const} */ (['provider', 'base', 'projekt', 'einrichtung', 'username', 'password']);
const CCCAMPUS_FIELDS = /** @type {const} */ (['base', 'kundennummer', 'pin']);

/**
 * Copies only the known fields; each must be a string (of sane length) or
 * absent. Unknown fields are dropped — the worker has no use for them.
 * @template {string} K
 * @param {unknown} value
 * @param {readonly K[]} fields
 * @returns {Partial<Record<K, string>>}
 */
function pickStrings(value, fields) {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) throw new Error('Ungültiger Request-Body');
  /** @type {Partial<Record<K, string>>} */
  const out = {};
  for (const field of fields) {
    const v = value[field];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' || v.length > MAX_FIELD_LENGTH) throw new Error('Ungültiger Request-Body');
    out[field] = v;
  }
  return out;
}

/**
 * @param {unknown} body  parsed JSON from POST /api/status
 * @returns {StatusRequest}
 */
export function validateRequestBody(body) {
  if (!isObject(body)) throw new Error('Ungültiger Request-Body');
  const { datum } = pickStrings(body, /** @type {const} */ (['datum']));
  const lunchRaw = body.lunch;
  /** @type {LunchConfig} */
  const lunch = pickStrings(lunchRaw, LUNCH_FIELDS);
  if (isObject(lunchRaw) && lunchRaw.cccampus !== undefined && lunchRaw.cccampus !== null) {
    lunch.cccampus = pickStrings(lunchRaw.cccampus, CCCAMPUS_FIELDS);
  }
  return { datum, webuntis: pickStrings(body.webuntis, WEBUNTIS_FIELDS), lunch };
}
