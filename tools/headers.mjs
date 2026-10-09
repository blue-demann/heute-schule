// Security-header checks for web/_headers (Cloudflare Pages).
//
// Used twice: run-tests.mjs checks the file against the required minimum
// on every test run, and tools/check-live-headers.mjs compares what the
// live site actually sends against the file after a deploy. User-facing
// problem texts stay German (they end up in Björn's terminal).

// Parses the _headers format: a path pattern at column 0, its headers
// indented below as "Name: value". Comments (#) and blank lines are
// ignored. Returns { pattern: { headerName: value } }.
export function parseHeadersFile(text) {
  const rules = {};
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = raw.trim();
      rules[current] = rules[current] || {};
      continue;
    }
    if (!current) throw new Error(`Header ohne Pfadmuster: ${raw.trim()}`);
    const colon = raw.indexOf(':');
    if (colon === -1) throw new Error(`Zeile ohne Doppelpunkt: ${raw.trim()}`);
    rules[current][raw.slice(0, colon).trim()] = raw.slice(colon + 1).trim();
  }
  return rules;
}

// "default-src 'self'; img-src 'self' data:" → { 'default-src': ["'self'"], ... }
export function parseCsp(value) {
  const directives = {};
  for (const part of value.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives[name.toLowerCase()] = sources;
  }
  return directives;
}

function headerValue(headers, name) {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : headers[key];
}

const SAFE_REFERRER_POLICIES = ['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin'];
const MIN_HSTS_SECONDS = 31536000;

// The minimum every deploy must keep. Returns a list of problems, each
// starting with the header name; an empty list means all requirements hold.
export function checkSecurityHeaders(headers) {
  const problems = [];

  const hsts = headerValue(headers, 'Strict-Transport-Security');
  if (hsts === undefined) {
    problems.push('Strict-Transport-Security: fehlt');
  } else {
    const maxAge = Number((hsts.match(/max-age=(\d+)/i) || [])[1]);
    if (!(maxAge >= MIN_HSTS_SECONDS)) problems.push(`Strict-Transport-Security: max-age unter ${MIN_HSTS_SECONDS} (ein Jahr)`);
    if (!/includeSubDomains/i.test(hsts)) problems.push('Strict-Transport-Security: includeSubDomains fehlt');
  }

  const cspValue = headerValue(headers, 'Content-Security-Policy');
  if (cspValue === undefined) {
    problems.push('Content-Security-Policy: fehlt');
  } else {
    const csp = parseCsp(cspValue);
    const requireExactly = (directive, allowed) => {
      const sources = csp[directive];
      if (!sources) {
        problems.push(`Content-Security-Policy: ${directive} fehlt`);
      } else if (sources.length !== 1 || !allowed.includes(sources[0])) {
        problems.push(`Content-Security-Policy: ${directive} muss ${allowed.join(' oder ')} sein`);
      }
    };
    requireExactly('default-src', ["'self'", "'none'"]);
    requireExactly('object-src', ["'none'"]);
    requireExactly('base-uri', ["'self'", "'none'"]);
    requireExactly('frame-ancestors', ["'none'"]);
    requireExactly('form-action', ["'none'"]);
    const all = Object.values(csp).flat();
    if (all.includes("'unsafe-eval'")) problems.push("Content-Security-Policy: 'unsafe-eval' ist nicht erlaubt");
    if (all.includes('*')) problems.push('Content-Security-Policy: * als Quelle ist nicht erlaubt');
    const scriptSrc = csp['script-src'] || csp['default-src'] || [];
    const foreignScript = scriptSrc.filter((s) => !["'self'", "'none'", "'unsafe-inline'"].includes(s));
    if (foreignScript.length) problems.push(`Content-Security-Policy: script-src erlaubt fremde Quellen (${foreignScript.join(' ')})`);
  }

  if ((headerValue(headers, 'X-Content-Type-Options') || '').toLowerCase() !== 'nosniff') {
    problems.push('X-Content-Type-Options: muss nosniff sein');
  }
  if ((headerValue(headers, 'X-Frame-Options') || '').toUpperCase() !== 'DENY') {
    problems.push('X-Frame-Options: muss DENY sein');
  }
  const referrer = (headerValue(headers, 'Referrer-Policy') || '').toLowerCase();
  if (!SAFE_REFERRER_POLICIES.includes(referrer)) {
    problems.push(`Referrer-Policy: muss eine von ${SAFE_REFERRER_POLICIES.join(', ')} sein`);
  }
  const permissions = headerValue(headers, 'Permissions-Policy');
  if (permissions === undefined) {
    problems.push('Permissions-Policy: fehlt');
  } else {
    for (const feature of ['geolocation', 'camera', 'microphone']) {
      if (!new RegExp(`(^|,)\\s*${feature}=\\(\\)\\s*(,|$)`).test(permissions)) {
        problems.push(`Permissions-Policy: ${feature}=() fehlt`);
      }
    }
  }
  return problems;
}

// Compares expected headers (from the file) with what a response actually
// carried. Names case-insensitive, values compared with whitespace runs
// collapsed. Returns one problem per missing or differing header.
export function compareHeaders(expected, actual) {
  const normalize = (v) => v.trim().replace(/\s+/g, ' ');
  const problems = [];
  for (const [name, value] of Object.entries(expected)) {
    const live = headerValue(actual, name);
    if (live === undefined) problems.push(`${name}: fehlt live`);
    else if (normalize(live) !== normalize(value)) problems.push(`${name}: live abweichend`);
  }
  return problems;
}
