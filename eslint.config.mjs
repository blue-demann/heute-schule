// Regeln orientiert am Google JavaScript Style Guide
// (https://google.github.io/styleguide/jsguide.html) — von Hand konfiguriert
// statt über das Paket "eslint-config-google", das seit 2019 nicht mehr
// gepflegt wird und nicht zu aktuellem ESLint (Flat Config) passt.
//
// web/index.html bekommt einen eigenen, bewusst schwächeren Regelsatz: das
// Inline-Script bleibt absichtlich bei `var` statt `const`/`let` (Alt-
// Geräte-Kompatibilität als Ziel, kein Build-Schritt). Geprüft wird die
// Datei trotzdem — über eslint-plugin-html, das das <script>-Inline-JS für
// ESLint extrahiert. Diese Lockerung gilt ausschließlich für diese eine
// Datei.

import js from '@eslint/js';
import globals from 'globals';
import html from 'eslint-plugin-html';

export default [
  js.configs.recommended,

  // Gemeinsame Google-Style-Regeln für den gesamten JS-Code außer web/.
  {
    files: ['proxy/**/*.{js,mjs}', 'analytics-report/**/*.{js,mjs}', 'run-tests.mjs', 'stundenplan.js', 'eslint.config.mjs', 'web/sw.js'],
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

  // proxy/*, analytics-report/* und web/sw.js: laufen als Service Worker
  // bzw. in der Cloudflare-Workers-Runtime, nicht in Node — andere Globals
  // (fetch, caches, crypto u. a. wie im Service-Worker-Standard).
  {
    files: ['proxy/**/*.{js,mjs}', 'analytics-report/**/*.{js,mjs}', 'web/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.serviceworker },
    },
  },

  // run-tests.mjs und eslint.config.mjs: echtes Node.
  {
    files: ['run-tests.mjs', 'eslint.config.mjs'],
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
  // sonst identisch zum übrigen Projekt-Stil.
  {
    files: ['web/index.html', 'web/ueber.html'],
    plugins: { html },
    languageOptions: {
      ecmaVersion: 2022,
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
