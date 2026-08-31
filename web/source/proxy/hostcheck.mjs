// Ziel-Host-Validierung für den Proxy.
//
// Hintergrund: server (WebUntis) und base (Mensamax/ccCampus) kommen
// unauthentifiziert und unvalidiert aus dem Client-POST-Body und werden im
// Worker direkt in fetch()-URLs eingesetzt. Ohne Prüfung wäre der Worker ein
// offener Relay: jede:r, die die /api/status-URL kennt, könnte ihn zwingen,
// beliebige Ziele im Namen der Cloudflare-IP abzufragen.
//
// Bewusst in einer eigenen Datei statt inline im Worker, damit die Logik ohne
// Cloudflare-Runtime in der normalen Node-Testsuite geprüft werden kann
// (siehe run-tests.mjs) — genau diese Art Sicherheitscode will man getestet
// haben, nicht nur "sieht richtig aus".

// Loopback, private und link-lokale Ziele sind nie legitime Schul-Portale.
// Die Link-lokal-Sperre (169.254.0.0/16) deckt u. a. den klassischen
// Cloud-Metadata-Trick 169.254.169.254 ab.
export function istPrivatesOderLokalesZiel(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.localhost')) return true;

  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]); const b = Number(ipv4[2]);
    if (a === 0 || a === 127 || a === 10) return true;   // "diese" Adresse / Loopback / RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true;    // RFC1918
    if (a === 192 && b === 168) return true;             // RFC1918
    if (a === 169 && b === 254) return true;             // Link-lokal (Cloud-Metadata)
    if (a === 100 && b >= 64 && b <= 127) return true;   // CGNAT, RFC6598
    return false;
  }

  // IPv6 — in URLs in eckigen Klammern, die new URL() schon entfernt hat.
  const v6 = h.replace(/^\[|\]$/g, '');
  if (v6 === '::1' || v6 === '::') return true;
  if (/^fe80:/.test(v6)) return true;          // link-lokal
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true; // Unique Local Address
  return false;
}

// pflichtSuffix begrenzt zusätzlich hart auf eine Domain — für WebUntis
// sinnvoll (die Integration spricht nie etwas anderes an), für die
// Essensanbieter bewusst nicht, da andere Schulen andere Portal-Domains
// desselben Anbieter-Typs nutzen können.
// Nimmt statt eines reinen Hostnamens eine ganze URL entgegen (z. B. aus der
// Browser-Adresszeile kopiert, inkl. Pfad/Hash: ".../WebUntis/#/basic/login")
// und liefert nur den Hostnamen zurück. Kein Sicherheitsnachlass: new URL()
// parst den Host unabhängig von Pfad-Tricks, das Ergebnis durchläuft
// anschließend exakt dieselbe Prüfung wie ein direkt eingegebener Hostname.
// Das Frontend bereinigt das Server-Feld zwar schon beim Verlassen des
// Eingabefelds (siehe extrahiereWebUntisHostname in web/index.html) — diese
// zweite, serverseitige Stufe fängt ältere Website-Stände und alles ab, was
// das Frontend aus welchem Grund auch immer nicht bereinigt hat.
function extrahiereHostnameAusUrl(eingabe) {
  const wert = String(eingabe || '').trim();
  if (/^https?:\/\//i.test(wert)) {
    try { return new URL(wert).hostname; } catch { /* fällt durch zur normalen Prüfung */ }
  }
  return wert;
}

// pflichtSuffix: genau eine feste Domain (z. B. WebUntis).
// pflichtSuffixe: eine wachsbare Liste möglicher Domains (z. B. Mensamax,
// wo verschiedene Schulen verschiedene Portal-Domains desselben
// Anbieter-Typs nutzen können) — der Hostname muss auf mindestens eine
// davon enden. Beide Parameter sind optional und schließen sich aus.
export function pruefeSicherenHostname(hostname, { pflichtSuffix, pflichtSuffixe } = {}) {
  const bereinigt = extrahiereHostnameAusUrl(hostname);
  if (!bereinigt || typeof bereinigt !== 'string' || bereinigt.includes('@') || bereinigt.includes('/')) {
    throw new Error('Ungültiger Server-Hostname');
  }
  const h = bereinigt.trim().toLowerCase();
  if (!h) throw new Error('Ungültiger Server-Hostname');
  if (istPrivatesOderLokalesZiel(h)) {
    throw new Error('Server-Hostname zeigt auf ein internes/lokales Ziel — nicht erlaubt');
  }
  const kandidaten = pflichtSuffixe || (pflichtSuffix ? [pflichtSuffix] : null);
  if (kandidaten) {
    const passt = kandidaten.some((suffix) => {
      const nackt = suffix.replace(/^\./, '');
      return h === nackt || h.endsWith(suffix);
    });
    if (!passt) {
      throw new Error(`Server-Hostname muss auf ${kandidaten.map((s) => `"${s}"`).join(' oder ')} enden`);
    }
  }
  return h;
}

export function pruefeSichereHttpsUrl(rawUrl, { pflichtSuffixe } = {}) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch (e) {
    throw new Error('Ungültige Basis-URL', { cause: e });
  }
  if (u.protocol !== 'https:') {
    throw new Error('Nur https:// als Basis-URL erlaubt');
  }
  if (u.username || u.password) {
    throw new Error('Ungültige Basis-URL (keine Zugangsdaten in der URL selbst)');
  }
  pruefeSicherenHostname(u.hostname, { pflichtSuffixe });
  return u;
}
