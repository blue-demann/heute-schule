// Compares the security headers the live site sends with web/_headers
// (pattern "/*"). Called by deploy.sh after the website deploy.
//   node tools/check-live-headers.mjs https://heute-schule.pages.dev/
// Exit code 0: all headers match; 1: differences (listed); 2: not checkable.

import { readFileSync } from 'node:fs';
import { parseHeadersFile, compareHeaders } from './headers.mjs';

const url = process.argv[2];
if (!url) {
  console.error('Aufruf: node tools/check-live-headers.mjs <URL>');
  process.exit(2);
}

const expected = parseHeadersFile(readFileSync(new URL('../web/_headers', import.meta.url), 'utf-8'))['/*'];
if (!expected) {
  console.error('web/_headers enthält keinen Block für "/*"');
  process.exit(2);
}

let response;
try {
  response = await fetch(url, { redirect: 'manual' });
} catch (e) {
  console.error(`Live-Seite nicht erreichbar: ${e.message}`);
  process.exit(2);
}
const problems = compareHeaders(expected, Object.fromEntries(response.headers));
for (const problem of problems) console.log(`    ${problem}`);
process.exit(problems.length ? 1 : 0);
