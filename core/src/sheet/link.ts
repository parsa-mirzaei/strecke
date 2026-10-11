/**
 * Links the learner pastes into Settings › Data (ported from Round 4, PORT_MAP feature C).
 *
 * The app reads a tab through Google Sheets' "Publish to the web" link in CSV format:
 *   https://docs.google.com/spreadsheets/d/e/<published key>/pub?gid=<tab>&single=true&output=csv
 * A published web-page link (pubhtml, output=html, output=tsv) is turned into its CSV form. The sheet's
 * normal address (/spreadsheets/d/<id>/edit…) cannot be read without making the whole file public,
 * so it is refused with an explanation. Each tab (Words, Inbox, Meta) has its own published link, with its
 * own `gid`. Nothing here touches the network.
 */

export type LinkProblem = 'empty' | 'not_a_link' | 'not_google_sheets' | 'edit_link' | 'not_published';

export type PublishedLink =
  | { ok: true; csvUrl: string; key: string; gid: string | null; single: boolean }
  | { ok: false; problem: LinkProblem; sheetId?: string; gid?: string | null };

const HOSTS = new Set(['docs.google.com']);

function parseUrl(input: string): URL | null {
  const s = input.trim();
  if (!s) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
}

/** The tab number: `gid` from the query, else from the fragment (`#gid=123`). */
function gidOf(u: URL): string | null {
  const q = u.searchParams.get('gid');
  if (q && /^\d+$/.test(q)) return q;
  const m = /(?:^|[#&])gid=(\d+)/.exec(u.hash);
  return m ? m[1]! : null;
}

export function parsePublishedLink(input: string): PublishedLink {
  if (!input.trim()) return { ok: false, problem: 'empty' };
  const u = parseUrl(input);
  if (!u || !/^https?:$/.test(u.protocol)) return { ok: false, problem: 'not_a_link' };
  if (!HOSTS.has(u.hostname)) return { ok: false, problem: 'not_google_sheets' };
  const parts = u.pathname.split('/').filter(Boolean);
  // /spreadsheets/d/e/<key>/pub(html)
  if (parts[0] === 'spreadsheets' && parts[1] === 'd' && parts[2] === 'e' && parts[3]) {
    const key = parts[3];
    const action = parts[4] ?? '';
    if (action !== 'pub' && action !== 'pubhtml') return { ok: false, problem: 'not_published' };
    const gid = gidOf(u);
    const single = u.searchParams.get('single') === 'true' || gid !== null;
    const q = new URLSearchParams();
    if (gid !== null) q.set('gid', gid);
    if (single) q.set('single', 'true');
    q.set('output', 'csv');
    return { ok: true, csvUrl: `https://docs.google.com/spreadsheets/d/e/${key}/pub?${q}`, key, gid, single };
  }
  // /spreadsheets/d/<id>/… : the sheet's own address, not a published link.
  if (parts[0] === 'spreadsheets' && parts[1] === 'd' && parts[2]) {
    return { ok: false, problem: 'edit_link', sheetId: parts[2], gid: gidOf(u) };
  }
  return { ok: false, problem: 'not_google_sheets' };
}
