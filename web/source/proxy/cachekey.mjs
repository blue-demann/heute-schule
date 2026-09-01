// Cache key for the proxy.
//
// ⚠ Security-critical: the credentials are part of the key material. A
// cache hit is served BEFORE any login happens — so the key itself has to
// guarantee that only the right credentials can reach a cached response.
// server/user/klasse alone are not enough for that: with a WebUntis class-
// wide shared login ("Klasse-9c") those fields are effectively public
// within the school.
//
// Credentials are never stored in plaintext — the material goes through
// SHA-256, only the digest ends up in the cache key. Wrong password ⇒
// different digest ⇒ no hit ⇒ a real login attempt.
//
// Deliberately a separate file so this is testable without the Cloudflare
// runtime (see ../run-tests.mjs).
//
// Field names below (webuntis, server, klasse, lunch, cccampus, ...) match
// the shared config-object shape used by web/index.html and proxy/worker.js
// — and, for the families already using this, their saved localStorage
// data. Deliberately NOT translated to English along with the rest of this
// file: renaming them would be a breaking change for real, already-
// configured users, not just an internal refactor.

export function buildCacheKeyMaterial(datum, webuntisCfg = {}, lunchCfg = {}) {
  const cc = lunchCfg.cccampus || {};
  const keyFields = {
    datum,
    webuntis: {
      server: webuntisCfg.server,
      user: webuntisCfg.user,
      klasse: webuntisCfg.klasse,
      // Must stay in — see comment above. Do not "clean this up".
      password: webuntisCfg.password,
    },
    lunch: {
      provider: lunchCfg.provider,
      base: lunchCfg.base,
      projekt: lunchCfg.projekt,
      einrichtung: lunchCfg.einrichtung,
      username: lunchCfg.username,
      password: lunchCfg.password,
      // ccCampus runs in the browser, but could in theory be sent along
      // anyway — if so, it must also be able to affect the key.
      cccampus: { base: cc.base, kundennummer: cc.kundennummer, pin: cc.pin },
    },
  };
  return JSON.stringify(keyFields);
}
