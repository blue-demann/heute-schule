// Regeln orientiert am Google JavaScript Style Guide
// (https://google.github.io/styleguide/jsguide.html) — von Hand konfiguriert
// statt über das Paket "eslint-config-google", das seit 2019 nicht mehr
// gepflegt wird und nicht zu aktuellem ESLint (Flat Config) passt.
//
// Eine Regel weicht bewusst vom Guide ab: web/index.html bleibt bei `var`
// statt `const`/`let`, weil die Seite absichtlich in ES5-Syntax gebaut ist
// (Alt-Geräte-Kompatibilität als Ziel, kein Build-Schritt). Diese Ausnahme
// gilt ausschließlich für diese eine Datei.

import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,

  // Gemeinsame Google-Style-Regeln für den gesamten JS-Code außer web/.
  {
    files: ['proxy/**/*.{js,mjs}', 'run-tests.mjs', 'stundenplan.js', 'eslint.config.mjs'],
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

  // proxy/*: läuft in der Cloudflare-Workers-Runtime, nicht in Node — andere
  // Globals (fetch, caches, crypto u. a. wie im Service-Worker-Standard).
  {
    files: ['proxy/**/*.{js,mjs}'],
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

  // web/index.html enthält Inline-JavaScript, kein eigenständiges .js-File —
  // ESLint prüft hier bewusst nicht (siehe Kommentar oben). Der Journal-
  // Comments-Check in run-tests.mjs deckt diese Datei trotzdem ab, weil er
  // rein textbasiert arbeitet, nicht auf ESLint angewiesen ist.
  {
    ignores: ['web/**', 'node_modules/**', '.wrangler/**'],
  },
];
