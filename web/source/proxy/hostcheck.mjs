// Target-host validation for the proxy.
//
// Background: server (WebUntis) and base (Mensamax/ccCampus) arrive
// unauthenticated and unvalidated in the client's POST body and are used
// directly in the worker's fetch() URLs. Without this check the worker
// would be an open relay: anyone who knows the /api/status URL could force
// it to request arbitrary targets from Cloudflare's IP.
//
// Deliberately a separate file instead of inline in the worker, so the
// logic can be tested in the plain Node test suite without the Cloudflare
// runtime (see run-tests.mjs) — this is exactly the kind of security code
// you want tested, not just "looks right".
//
// User-facing error messages stay German (the app's display language) —
// only identifiers and comments are English. Anything thrown here ends up
// verbatim in `stundenFehler`/`lunchFehler` and is rendered in the UI.

// Loopback, private and link-local targets are never legitimate school
// portals. The link-local block (169.254.0.0/16) also covers the classic
// cloud-metadata trick, 169.254.169.254.
export function isPrivateOrLocalTarget(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.localhost')) return true;

  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]); const b = Number(ipv4[2]);
    if (a === 0 || a === 127 || a === 10) return true;   // "this" address / loopback / RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true;    // RFC1918
    if (a === 192 && b === 168) return true;             // RFC1918
    if (a === 169 && b === 254) return true;             // link-local (cloud metadata)
    if (a === 100 && b >= 64 && b <= 127) return true;   // CGNAT, RFC6598
    return false;
  }

  // IPv6 — in URLs wrapped in brackets, which new URL() already strips.
  const v6 = h.replace(/^\[|\]$/g, '');
  if (v6 === '::1' || v6 === '::') return true;
  if (/^fe80:/.test(v6)) return true;          // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true; // unique local address
  return false;
}

// requiredSuffix hard-limits the target to a single domain — makes sense
// for WebUntis (the integration never talks to anything else), deliberately
// not used for the lunch providers, since different schools use different
// portal domains of the same provider type.
//
// Accepts a full URL instead of a bare hostname (e.g. copied straight from
// the browser address bar, including path/hash: ".../WebUntis/#/basic/
// login") and returns only the hostname. No security shortcut: new URL()
// parses the host independently of path tricks, and the result then runs
// through exactly the same check as a directly entered hostname.
// The frontend already cleans up the server field when the input loses
// focus (see extractWebUntisHostname in web/index.html) — this second,
// server-side stage catches older website versions and anything the
// frontend failed to clean up for whatever reason.
function extractHostnameFromUrl(input) {
  const value = String(input || '').trim();
  if (/^https?:\/\//i.test(value)) {
    try { return new URL(value).hostname; } catch { /* falls through to the normal check */ }
  }
  return value;
}

// requiredSuffix: exactly one fixed domain (e.g. WebUntis).
// requiredSuffixes: a growable list of possible domains (e.g. Mensamax,
// where different schools can use different portal domains of the same
// provider type) — the hostname must end in at least one of them. Both
// parameters are optional and mutually exclusive.
export function checkSafeHostname(hostname, { requiredSuffix, requiredSuffixes } = {}) {
  const cleaned = extractHostnameFromUrl(hostname);
  if (!cleaned || typeof cleaned !== 'string' || cleaned.includes('@') || cleaned.includes('/')) {
    throw new Error('Ungültiger Server-Hostname');
  }
  const h = cleaned.trim().toLowerCase();
  if (!h) throw new Error('Ungültiger Server-Hostname');
  if (isPrivateOrLocalTarget(h)) {
    throw new Error('Server-Hostname zeigt auf ein internes/lokales Ziel — nicht erlaubt');
  }
  const candidates = requiredSuffixes || (requiredSuffix ? [requiredSuffix] : null);
  if (candidates) {
    const matches = candidates.some((suffix) => {
      const bare = suffix.replace(/^\./, '');
      return h === bare || h.endsWith(suffix);
    });
    if (!matches) {
      throw new Error(`Server-Hostname muss auf ${candidates.map((s) => `"${s}"`).join(' oder ')} enden`);
    }
  }
  return h;
}

export function checkSafeHttpsUrl(rawUrl, { requiredSuffixes } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (e) {
    throw new Error('Ungültige Basis-URL', { cause: e });
  }
  if (url.protocol !== 'https:') {
    throw new Error('Nur https:// als Basis-URL erlaubt');
  }
  if (url.username || url.password) {
    throw new Error('Ungültige Basis-URL (keine Zugangsdaten in der URL selbst)');
  }
  checkSafeHostname(url.hostname, { requiredSuffixes });
  return url;
}
