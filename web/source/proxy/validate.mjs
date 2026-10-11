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

// The message names the method and the field that was off, never the
// value: enough to tell which part of an answer changed, nothing from the
// provider's content. Deliberately not "WebUntis <method>: ..." — that is
// the format of messages WebUntis itself sent (see worker.js).
/**
 * @param {string} method
 * @param {string} field
 */
function unexpected(method, field) {
  return new Error(`WebUntis: unerwartete Antwort auf ${method} (${field})`);
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
 * @returns {value is WebUntisRef[] | undefined}
 */
function isOptionalRefList(value) {
  return value === undefined || (Array.isArray(value) && value.every((r) => isObject(r) && isId(r.id)));
}

/**
 * Checks a list answer entry by entry: every entry must be an object and
 * pass each named field check. The first failing check names the field.
 * @param {unknown} result
 * @param {string} method
 * @param {Record<string, (value: unknown) => boolean>} fieldChecks
 * @returns {Record<string, unknown>[]}
 */
function expectEntries(result, method, fieldChecks) {
  if (!Array.isArray(result)) throw unexpected(method, 'Liste');
  for (const entry of result) {
    if (!isObject(entry)) throw unexpected(method, 'Eintrag');
    for (const [field, check] of Object.entries(fieldChecks)) {
      if (!check(entry[field])) throw unexpected(method, field);
    }
  }
  return result;
}

// JSON-RPC 2.0 envelope: either { result } or { error: { message } }.
// Returns the error message (a string WebUntis chose, shown to the parent)
// or the still-unvalidated result.
/**
 * @param {unknown} data
 * @param {string} method
 * @returns {{ error: string } | { result: unknown }}
 */
export function validateRpcEnvelope(data, method) {
  if (!isObject(data)) throw unexpected(method, 'Antwort');
  if (data.error !== undefined && data.error !== null) {
    if (!isObject(data.error) || typeof data.error.message !== 'string') throw unexpected(method, 'error');
    return { error: data.error.message };
  }
  if (!('result' in data)) throw unexpected(method, 'result');
  return { result: data.result };
}

// The session id goes verbatim into "Cookie: JSESSIONID=<id>". Allowed is
// exactly what RFC 6265 allows in a cookie value (cookie-octet): printable
// ASCII without space, double quote, comma, semicolon and backslash. That
// keeps every separator out of the header — no second cookie via ";", no
// line break — without betting on the id's current format (Base64
// characters like + / = stay valid).
const SESSION_ID = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]{1,200}$/;

/**
 * @param {unknown} result
 * @returns {WebUntisAuth}
 */
export function validateAuth(result) {
  if (!isObject(result)) throw unexpected('authenticate', 'result');
  if (typeof result.sessionId !== 'string' || !SESSION_ID.test(result.sessionId)) {
    throw unexpected('authenticate', 'sessionId');
  }
  return { sessionId: result.sessionId };
}

/**
 * @param {unknown} result
 * @returns {WebUntisClass[]}
 */
export function validateClasses(result) {
  return expectEntries(result, 'getKlassen', { id: isId, name: (v) => typeof v === 'string' })
    .map((k) => ({ id: /** @type {number} */ (k.id), name: /** @type {string} */ (k.name) }));
}

/**
 * @param {unknown} result
 * @returns {WebUntisLesson[]}
 */
export function validateLessons(result) {
  return expectEntries(result, 'getTimetable', {
    id: isId, startTime: isClockTime, endTime: isClockTime, code: isOptionalString, su: isOptionalRefList, ro: isOptionalRefList,
  }).map((l) => ({
    id: /** @type {number} */ (l.id),
    startTime: /** @type {number} */ (l.startTime),
    endTime: /** @type {number} */ (l.endTime),
    code: /** @type {string | null | undefined} */ (l.code),
    su: /** @type {WebUntisRef[] | undefined} */ (l.su),
    ro: /** @type {WebUntisRef[] | undefined} */ (l.ro),
  }));
}

/**
 * @param {unknown} result
 * @returns {WebUntisSubject[]}
 */
export function validateSubjects(result) {
  return expectEntries(result, 'getSubjects', { id: isId, name: isOptionalString, longName: isOptionalString })
    .map((s) => ({
      id: /** @type {number} */ (s.id),
      name: /** @type {string | undefined} */ (s.name ?? undefined),
      longName: /** @type {string | undefined} */ (s.longName ?? undefined),
    }));
}

/**
 * @param {unknown} result
 * @returns {WebUntisRoom[]}
 */
export function validateRooms(result) {
  return expectEntries(result, 'getRooms', { id: isId, name: isOptionalString })
    .map((r) => ({ id: /** @type {number} */ (r.id), name: /** @type {string | undefined} */ (r.name ?? undefined) }));
}

// ── Request body from the browser ────────────────────────────────────────

const MAX_FIELD_LENGTH = 1000;
const WEBUNTIS_FIELDS = /** @type {const} */ (['server', 'user', 'password', 'klasse']);
// No "cccampus" here on purpose: ccCampus runs entirely in the browser, the
// proxy never needs its customer number or PIN. The frontend may still send
// a stored cccampus block along with a Mensamax child's config — it is
// dropped right here, like every other unknown field.
const LUNCH_FIELDS = /** @type {const} */ (['provider', 'base', 'projekt', 'einrichtung', 'username', 'password']);

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
  return {
    datum,
    webuntis: pickStrings(body.webuntis, WEBUNTIS_FIELDS),
    lunch: pickStrings(body.lunch, LUNCH_FIELDS),
  };
}
