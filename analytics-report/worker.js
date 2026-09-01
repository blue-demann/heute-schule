/**
 * Weekly cron job: reads Cloudflare's own analytics data (Web Analytics
 * for the website, Workers invocations for the proxy) via the GraphQL
 * Analytics API and emails a short summary through Resend. No additional
 * tracking — uses only data Cloudflare already collects for Pages/Workers
 * anyway. Stores nothing.
 */

const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';

const WEEKLY_STATS_QUERY = `
  query WeeklyStats(
    $accountTag: string!
    $siteTag: string!
    $scriptName: string!
    $since: Time!
    $until: Time!
  ) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        rumPageloadEventsAdaptiveGroups(
          limit: 1
          filter: { siteTag: $siteTag, datetime_geq: $since, datetime_lt: $until }
        ) {
          sum {
            visits
          }
        }
        workersInvocationsAdaptiveGroups(
          limit: 1
          filter: { scriptName: $scriptName, datetime_geq: $since, datetime_lt: $until }
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
 * The last 7 full days (up to yesterday, UTC) as ISO-8601 timestamps.
 * Deliberately not "this week" (Monday to today) — otherwise a Monday-
 * morning run would show near-empty numbers.
 */
function lastWeekAsRange(now = new Date()) {
  const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - 7);
  return { since: since.toISOString(), until: until.toISOString() };
}

async function fetchCloudflareStats(env, since, until) {
  const resp = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: WEEKLY_STATS_QUERY,
      variables: {
        accountTag: env.CF_ACCOUNT_TAG,
        siteTag: env.CF_WEB_ANALYTICS_SITE_TAG,
        scriptName: env.CF_PROXY_SCRIPT_NAME,
        since,
        until,
      },
    }),
  });
  const json = await resp.json();
  if (!resp.ok || (json.errors && json.errors.length)) {
    throw new Error(`GraphQL error (HTTP ${resp.status}): ${JSON.stringify(json.errors || json)}`);
  }
  const account = json.data && json.data.viewer && json.data.viewer.accounts && json.data.viewer.accounts[0];
  const visitsGroup = account && account.rumPageloadEventsAdaptiveGroups && account.rumPageloadEventsAdaptiveGroups[0];
  const proxyGroup = account && account.workersInvocationsAdaptiveGroups && account.workersInvocationsAdaptiveGroups[0];
  return {
    visits: visitsGroup ? visitsGroup.sum.visits : null,
    proxyRequests: proxyGroup ? proxyGroup.sum.requests : null,
  };
}

function formatEmailText({ since, until, visits, proxyRequests }) {
  const date = (iso) => iso.slice(0, 10);
  const line = (label, value) => (value === null ? `${label}: nicht verfügbar` : `${label}: ${value}`);
  return [
    `Heute Schule — Wochenstatistik ${date(since)} bis ${date(until)}`,
    '',
    line('Website-Besuche', visits),
    line('Proxy-Anfragen (WebUntis/Mensamax)', proxyRequests),
    '',
    'Quelle: Cloudflare Web Analytics + Workers-Analytics — beides Daten,',
    'die Cloudflare für den Betrieb ohnehin erhebt. Kein zusätzliches',
    'Tracking, keine Cookies, keine IP-Adressen in dieser Mail.',
  ].join('\n');
}

async function sendEmail(env, text) {
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
    throw new Error(`Resend error (HTTP ${resp.status}): ${await resp.text()}`);
  }
}

async function run(env) {
  const { since, until } = lastWeekAsRange();
  const stats = await fetchCloudflareStats(env, since, until);
  const text = formatEmailText({ since, until, ...stats });
  await sendEmail(env, text);
  return text;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },

  // Manual HTTP test trigger, so the chain (GraphQL query + sending the
  // email) can be verified without waiting a week for the cron. Protected
  // by a shared secret in the URL — otherwise anyone who knows the worker
  // URL could trigger test emails arbitrarily often.
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.get('test') !== env.TEST_SECRET) {
      return new Response('nicht gefunden', { status: 404 });
    }
    try {
      const text = await run(env);
      return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } catch (err) {
      return new Response(String(err && err.message ? err.message : err), { status: 500 });
    }
  },
};

export { lastWeekAsRange, formatEmailText };
