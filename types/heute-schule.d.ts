// Shared shapes for the type check (tsc --checkJs, see tsconfig.json), plus
// the few Cloudflare Workers types the proxy uses. Ambient on purpose (no
// import/export), so JSDoc in proxy/*.js can name them directly. Cloudflare's
// own type package would be one more dependency for three names.

interface CacheStorage {
  /** Cloudflare Workers: the data center's default cache. */
  readonly default: Cache;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface ProxyEnv {
  ALLOWED_ORIGIN?: string;
}

// Child configuration as web/index.html sends it. The field names are a wire
// contract with the frontend and with data already saved in families'
// browsers — see the comment at the top of proxy/worker.js.
interface WebUntisConfig {
  server?: string;
  user?: string;
  password?: string;
  klasse?: string;
}

interface CcCampusConfig {
  base?: string;
  kundennummer?: string;
  pin?: string;
}

interface LunchConfig {
  provider?: string;
  base?: string;
  projekt?: string;
  einrichtung?: string;
  username?: string;
  password?: string;
  cccampus?: CcCampusConfig;
}

interface StatusRequest {
  datum?: string;
  webuntis: WebUntisConfig;
  lunch: LunchConfig;
}

// One lesson in the proxy's answer — field names shared with web/index.html.
interface Lesson {
  fach: string;
  raum: string;
  start: string;
  ende: string;
  vertretung: boolean;
}
