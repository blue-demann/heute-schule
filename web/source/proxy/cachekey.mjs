// Cache-Schlüssel für den Proxy.
//
// ⚠ Sicherheitskritisch: Die Zugangsdaten sind Teil des Schlüsselmaterials.
// Ein Cache-Treffer wird ausgeliefert, BEVOR ein Login stattfindet — der
// Schlüssel muss also selbst sicherstellen, dass nur mit den richtigen
// Zugangsdaten an eine zwischengespeicherte Antwort zu kommen ist.
// server/user/klasse allein reichen dafür nicht: Bei einem WebUntis-
// Klassensammellogin ("Klasse-9c") sind diese Felder innerhalb der Schule
// praktisch öffentlich.
//
// Die Zugangsdaten werden nie im Klartext gespeichert — das Material geht
// durch SHA-256, nur der Digest landet im Cache-Schlüssel. Falsches
// Passwort ⇒ anderer Digest ⇒ kein Treffer ⇒ echter Login-Versuch.
//
// Bewusst in eigener Datei, damit das ohne Cloudflare-Runtime testbar ist
// (siehe ../run-tests.mjs).

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
