import type { Gate0Label, Gate0Result } from './types.ts';

// Gate 0 is a risk screen, not a security certificate. Exact host match against a vetted list; everything else is
// either a lookalike (resembles an official host) or "Unable to verify". A non-government domain is not proof of fraud.
export const OFFICIAL_HOSTS = ['udyamregistration.gov.in', 'msme.gov.in', 'scholarships.gov.in', 'myscheme.gov.in'];

const RANK: Record<Gate0Label, number> = { 'Official source confirmed': 0, 'Unable to verify': 1, 'Potential lookalike': 2 };

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

function checkOne(raw: string): { host: string; label: Gate0Label; reasons: string[] } {
  let u: URL;
  try { u = new URL(raw); } catch { return { host: '', label: 'Unable to verify', reasons: [`"${raw}" is not a valid web address`] }; }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');

  if (OFFICIAL_HOSTS.includes(host)) {
    if (u.protocol !== 'https:') return { host, label: 'Unable to verify', reasons: [`${host} is on the official list, but this page is not served over HTTPS`] };
    return { host, label: 'Official source confirmed', reasons: [`${host} exactly matches a vetted official host`] };
  }
  if (host.includes('xn--')) return { host, label: 'Potential lookalike', reasons: [`${host} uses encoded (punycode) characters that can imitate real letters`] };

  const sub = OFFICIAL_HOSTS.find((o) => host.endsWith('.' + o));
  if (sub) return { host, label: 'Unable to verify', reasons: [`${host} is a subdomain of ${sub}, but not one we have vetted`] };

  const squashed = host.replace(/[.-]/g, '');
  for (const o of OFFICIAL_HOSTS) {
    const brand = o.split('.')[0];
    if (host.includes(o)) return { host, label: 'Potential lookalike', reasons: [`${host} contains "${o}" but the real site ends at ${o}`] };
    if (squashed.includes(brand)) return { host, label: 'Potential lookalike', reasons: [`${host} uses the name "${brand}" but is not ${o}`] };
    const d = distance(host, o);
    if (d <= 2) return { host, label: 'Potential lookalike', reasons: [`${host} is ${d} character${d > 1 ? 's' : ''} away from ${o} (possible typo-squat)`] };
  }
  return { host, label: 'Unable to verify', reasons: [`${host} is not on our vetted official list`] };
}

/** Check the address the agent was given and, if it was redirected, where it actually landed. Worst result wins. */
export function gate0(url: string, finalUrl: string = url): Gate0Result {
  const a = checkOne(url);
  const b = finalUrl === url ? a : checkOne(finalUrl);
  const worst = RANK[b.label] >= RANK[a.label] ? b : a;
  const reasons = finalUrl !== url && a.host !== b.host ? [`Redirected from ${a.host || url} to ${b.host || finalUrl}`, ...a.reasons, ...b.reasons] : worst.reasons;
  return { url, finalUrl, hostname: b.host, label: worst.label, reasons: [...new Set(reasons)] };
}
