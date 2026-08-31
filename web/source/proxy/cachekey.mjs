// Cache-Schlüssel für den Proxy.
//
// ⚠ Sicherheitskritisch — hier steckte bis 27.08.2026 eine echte Lücke:
//
// Der Schlüssel wurde "bewusst nur aus nicht-geheimen Feldern" gebildet
// (server/user/klasse, keine Passwörter). Das klang nach Datensparsamkeit,
// war aber eine Authentifizierungsumgehung: Der Cache-Treffer wird
// ausgeliefert, BEVOR irgendein Login stattfindet. Wer server, user und
// klasse kannte, bekam innerhalb der TTL die zwischengespeicherte Antwort
// einer fremden, legitimen Abfrage — ohne Passwort. Bei einem
// WebUntis-Klassensammellogin ("Klasse-9c") sind genau diese drei Felder
// innerhalb der Schule praktisch öffentlich; geheim war nur das Passwort,
// und das wurde übersprungen.
//
// Reproduziert war das so: zwei Anfragen mit identischer Identität, aber
// verschiedenen Passwörtern → zweite Antwort kam aus dem Cache (0,04 s statt
// 0,20 s) und war byte-identisch.
//
// Konsequenz: Die Zugangsdaten gehören ins Schlüsselmaterial. Sie werden nie
// im Klartext gespeichert — das Material geht durch SHA-256, und nur der
// Digest landet im Cache-Schlüssel. Falsches Passwort ⇒ anderer Digest ⇒ kein
// Treffer ⇒ echter Login-Versuch. Genau so soll es sein.
//
// Bewusst in eigener Datei, damit das ohne Cloudflare-Runtime testbar ist
// (siehe ../run-tests.mjs) — der Fehler oben wäre mit einem Test aufgefallen.

export function buildCacheKeyMaterial(datum, webuntisCfg = {}, lunchCfg = {}) {
  const cc = lunchCfg.cccampus || {};
  const relevant = {
    datum,
    webuntis: {
      server: webuntisCfg.server,
      user: webuntisCfg.user,
      klasse: webuntisCfg.klasse,
      // Muss rein — siehe Kommentar oben. Nicht "aufräumen".
      password: webuntisCfg.password,
    },
    lunch: {
      provider: lunchCfg.provider,
      base: lunchCfg.base,
      projekt: lunchCfg.projekt,
      einrichtung: lunchCfg.einrichtung,
      username: lunchCfg.username,
      password: lunchCfg.password,
      // ccCampus läuft zwar im Browser, kann aber theoretisch mitkommen —
      // dann darf es den Schlüssel ebenfalls beeinflussen.
      cccampus: { base: cc.base, kundennummer: cc.kundennummer, pin: cc.pin },
    },
  };
  return JSON.stringify(relevant);
}
