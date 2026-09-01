/**
 * Wöchentlicher Cron-Job: liest Cloudflares eigene Analytics-Daten (Web
 * Analytics für die Website, Workers-Invocations für den Proxy) über die
 * GraphQL Analytics API und verschickt eine kurze Zusammenfassung per Mail
 * über Resend. Kein zusätzliches Tracking — nutzt ausschließlich Daten, die
 * Cloudflare für Pages/Workers ohnehin erhebt. Speichert nichts.
 */

const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';

const WOCHEN_STATISTIK_QUERY = `
  query WochenStatistik(
    $accountTag: string!
    $siteTag: string!
    $scriptName: string!
    $von: Time!
    $bis: Time!
  ) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        rumPageloadEventsAdaptiveGroups(
          limit: 1
          filter: { siteTag: $siteTag, datetime_geq: $von, datetime_lt: $bis }
        ) {
          sum {
            visits
          }
        }
        workersInvocationsAdaptiveGroups(
          limit: 1
          filter: { scriptName: $scriptName, datetime_geq: $von, datetime_lt: $bis }
        ) {
          sum {
            requests
          }
        }
      }
    }
  }
`;

/**
 * Zeitraum der letzten vollen 7 Tage (bis gestern, UTC) als ISO-8601-
 * Zeitstempel. Bewusst nicht "diese Woche" (Montag bis heute) — sonst würde
 * ein Montagmorgen-Lauf fast leere Zahlen zeigen.
 */
function letzteWocheAlsZeitraum(jetzt = new Date()) {
  const bis = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()));
  const von = new Date(bis);
  von.setUTCDate(von.getUTCDate() - 7);
  return { von: von.toISOString(), bis: bis.toISOString() };
}

async function holeCloudflareStats(env, von, bis) {
  const resp = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: WOCHEN_STATISTIK_QUERY,
      variables: {
        accountTag: env.CF_ACCOUNT_TAG,
        siteTag: env.CF_WEB_ANALYTICS_SITE_TAG,
        scriptName: env.CF_PROXY_SCRIPT_NAME,
        von,
        bis,
      },
    }),
  });
  const json = await resp.json();
  if (!resp.ok || (json.errors && json.errors.length)) {
    throw new Error(`GraphQL-Fehler (HTTP ${resp.status}): ${JSON.stringify(json.errors || json)}`);
  }
  const account = json.data && json.data.viewer && json.data.viewer.accounts && json.data.viewer.accounts[0];
  const besucheGruppe = account && account.rumPageloadEventsAdaptiveGroups && account.rumPageloadEventsAdaptiveGroups[0];
  const proxyGruppe = account && account.workersInvocationsAdaptiveGroups && account.workersInvocationsAdaptiveGroups[0];
  return {
    besuche: besucheGruppe ? besucheGruppe.sum.visits : null,
    proxyAnfragen: proxyGruppe ? proxyGruppe.sum.requests : null,
  };
}

function formatiereMailText({ von, bis, besuche, proxyAnfragen }) {
  const datum = (iso) => iso.slice(0, 10);
  const zeile = (label, wert) => (wert === null ? `${label}: nicht verfügbar` : `${label}: ${wert}`);
  return [
    `Heute Schule — Wochenstatistik ${datum(von)} bis ${datum(bis)}`,
    '',
    zeile('Website-Besuche', besuche),
    zeile('Proxy-Anfragen (WebUntis/Mensamax)', proxyAnfragen),
    '',
    'Quelle: Cloudflare Web Analytics + Workers-Analytics — beides Daten,',
    'die Cloudflare für den Betrieb ohnehin erhebt. Kein zusätzliches',
    'Tracking, keine Cookies, keine IP-Adressen in dieser Mail.',
  ].join('\n');
}

async function sendeMail(env, text) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_ABSENDER,
      to: env.MAIL_EMPFAENGER,
      subject: 'Heute Schule — Wochenstatistik',
      text,
    }),
  });
  if (!resp.ok) {
    throw new Error(`Resend-Fehler (HTTP ${resp.status}): ${await resp.text()}`);
  }
}

async function laufeDurch(env) {
  const { von, bis } = letzteWocheAlsZeitraum();
  const stats = await holeCloudflareStats(env, von, bis);
  const text = formatiereMailText({ von, bis, ...stats });
  await sendeMail(env, text);
  return text;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(laufeDurch(env));
  },

  // Manueller Testaufruf per HTTP, damit sich die Kette (GraphQL-Query +
  // Mailversand) verifizieren lässt, ohne eine Woche auf den Cron zu warten.
  // Geschützt über ein Shared Secret in der URL — sonst könnte jede:r, der/
  // die die Worker-URL kennt, beliebig oft Testmails auslösen.
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.get('test') !== env.TEST_SECRET) {
      return new Response('nicht gefunden', { status: 404 });
    }
    try {
      const text = await laufeDurch(env);
      return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } catch (fehler) {
      return new Response(String(fehler && fehler.message ? fehler.message : fehler), { status: 500 });
    }
  },
};

export { letzteWocheAlsZeitraum, formatiereMailText };
