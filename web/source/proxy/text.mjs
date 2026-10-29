// Turning provider markup into the plain text the card shows.
//
// Without a DOM in the Workers runtime, entities are decoded by hand. The
// result is always plain text: the frontend renders it with textContent,
// so whatever markup a provider sends can never become live HTML there.

const HTML_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', ccedil: 'ç', euro: '€',
};

/**
 * Mensamax and sams-on send menu text with HTML-encoded characters
 * ("&amp;", sometimes umlauts as entities too).
 * @param {string} str
 * @returns {string}
 */
export function decodeHtmlEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (Object.hasOwn(HTML_ENTITIES, name) ? HTML_ENTITIES[/** @type {keyof typeof HTML_ENTITIES} */ (name)] : m));
}

// The last line of a sams-on menu lists additive and allergen codes, e.g.
// "a, g" or "2, 3, 4, 7, a, g, i, j" — short tokens separated by commas.
const CODE_LINE = /^[0-9a-z]{1,2}(\s*,\s*[0-9a-z]{1,2})*\s*,?$/i;

/**
 * sams-on meal title → one line of plain text: line breaks (<br>, newlines)
 * become spaces, all other tags go, entities are decoded, and a trailing
 * line that only holds additive/allergen codes is dropped.
 * Example: "Pasta Bolognese<br/> (Rind &amp; Schwein) <br/>a, g<br/>"
 * → "Pasta Bolognese (Rind & Schwein)".
 * @param {string} title
 * @returns {string}
 */
export function samsonMealName(title) {
  const lines = title
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .split('\n')
    .map((line) => decodeHtmlEntities(line).replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '');
  if (lines.length > 1 && CODE_LINE.test(lines[lines.length - 1])) lines.pop();
  return lines.join(' ');
}
