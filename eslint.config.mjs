// Regeln orientiert am Google JavaScript Style Guide
// (https://google.github.io/styleguide/jsguide.html) — von Hand konfiguriert
// statt über das Paket "eslint-config-google", das seit 2019 nicht mehr
// gepflegt wird und nicht zu aktuellem ESLint (Flat Config) passt.
//
// web/index.html bekommt einen eigenen, bewusst schwächeren Regelsatz: das
// Inline-Script darf weiter `var` statt `const`/`let` nutzen (kein Umbau
// ohne Anlass, kein Build-Schritt). Geprüft wird die Datei trotzdem — über
// eslint-plugin-html, das das <script>-Inline-JS für ESLint extrahiert.
//
// Sprachstand: Alles, was auf den Geräten der Familien läuft (index.html,
// ueber.html, sw.js), wird mit ecmaVersion 2019 geparst — das ist das
// Syntax-Ziel (iOS ab 11.3, Chrome ab 66). Neuere Syntax wie `?.` oder
// `??` ist damit ein Parse-Fehler statt einer leeren App auf einem alten
// Gerät. Prüft nur Syntax, keine neueren Browser-APIs.
//
// Sicherheitsregeln gelten für den ganzen Code: kein eval und Verwandte,
// kein HTML aus Strings (innerHTML & Co.), kein console im Proxy.

import js from '@eslint/js';
import globals from 'globals';
import html from 'eslint-plugin-html';

const SECURITY_RULES = {
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-restricted-properties': ['error',
    { property: 'innerHTML', message: 'Kein HTML aus Strings — textContent bzw. DOM-Methoden nutzen.' },
    { property: 'outerHTML', message: 'Kein HTML aus Strings — DOM-Methoden nutzen.' },
    { property: 'insertAdjacentHTML', message: 'Kein HTML aus Strings — DOM-Methoden nutzen.' },
    { object: 'document', property: 'write', message: 'document.write ist nicht erlaubt.' },
    { object: 'document', property: 'writeln', message: 'document.writeln ist nicht erlaubt.' },
  ],
};

export default [
  js.configs.recommended,

  {
    files: ['**/*.{js,mjs}', 'web/index.html', 'web/ueber.html'],
    rules: SECURITY_RULES,
  },

  // Gemeinsame Google-Style-Regeln für den gesamten JS-Code außer web/.
  {
    files: ['proxy/**/*.{js,mjs}', 'tools/**/*.mjs', 'run-tests.mjs', 'stundenplan.js', 'eslint.config.mjs', 'web/sw.js'],
    rules: {
      indent: ['error', 2, { SwitchCase: 1 }],
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'one-var': ['error', 'never'],
    },
  },

  // proxy/*: läuft in der Cloudflare-Workers-Runtime, nicht in Node —
  // Globals wie im Service-Worker-Standard (fetch, caches, crypto u. a.).
  // Kein console: Logs landen bei Cloudflare, und dort sollen weder
  // Zugangsdaten noch Antworten der Anbieter auftauchen.
  {
    files: ['proxy/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.serviceworker },
    },
    rules: { 'no-console': 'error' },
  },

  // web/sw.js: Service Worker auf den Geräten der Familien — klassisches
  // Skript, Syntax-Ziel ES2019 (siehe oben).
  {
    files: ['web/sw.js'],
    languageOptions: {
      ecmaVersion: 2019,
      sourceType: 'script',
      globals: { ...globals.serviceworker },
    },
  },

  // run-tests.mjs, tools/ und eslint.config.mjs: echtes Node.
  {
    files: ['run-tests.mjs', 'tools/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // stundenplan.js: Node, aber CommonJS (module.exports), kein ESM-Import.
  {
    files: ['stundenplan.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },

  // web/index.html und web/ueber.html: Inline-<script> über eslint-plugin-
  // html extrahiert und geprüft. `var` bleibt hier bewusst erlaubt (siehe
  // Kommentar oben), deshalb kein no-var/prefer-const in diesem Block —
  // sonst identisch zum übrigen Projekt-Stil. Syntax-Ziel ES2019.
  {
    files: ['web/index.html', 'web/ueber.html'],
    plugins: { html },
    languageOptions: {
      ecmaVersion: 2019,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      indent: ['error', 2, { SwitchCase: 1 }],
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'one-var': ['error', 'never'],
      'no-unused-vars': 'warn',
    },
  },

  // Alles andere unter web/ (Rechtstexte, Beispiel-HTML, gespiegelte Doku-
  // Kopien) bleibt ungeprüft — kein eigener JS-Code dort.
  {
    ignores: [
      'web/impressum*.html',
      'web/datenschutz*.html',
      'web/docs/**',
      'web/source/**',
      'node_modules/**',
      '.wrangler/**',
    ],
  },
];
