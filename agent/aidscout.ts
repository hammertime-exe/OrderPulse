import type { ChecklistItem, Gate0Result, Proposal } from '../shared/types.ts';
import { gate0 } from '../shared/gate0.ts';
import { H, iso } from '../shared/time.ts';
import { newId, now, updateState } from '../server/store.ts';
import { extractJson } from './ai.ts';
import { appUrl, launchBrowser } from './browser.ts';
import { step } from './steps.ts';

const MAX_TEXT = 12_000; // keep AI input inside free-tier token limits
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

const instructions = `You read an official Indian government web page for a home-based micro-seller.
List what the seller must have or do to use it (documents, details, steps, conditions), and any application deadline.
Return JSON: {"items": [{"text": short task in plain English, "quote": one sentence copied word for word from the page}], "deadline": {"date": ISO 8601 date or null, "quote": exact sentence or ""}}.
Only use what the page states. Copy quotes exactly. If there is no deadline on the page, use null.`;

const finish = (runId: string, gates: Gate0Result[], proposals: Proposal[] = []) =>
  updateState((s) => {
    s.proposals.push(...proposals);
    const r = s.runs.find((x) => x.id === runId);
    if (r) { r.gate0 = gates; r.proposalIds = proposals.map((p) => p.id); r.status = proposals.length ? 'awaiting_approval' : 'done'; }
    const g = gates[0];
    s.audit.unshift({ at: now(), actor: 'agent', action: `gate0: ${g.label}`, detail: `${g.url} — ${g.reasons.join('; ')}`, source: g.finalUrl });
  });

/** AidScout: Gate 0 the portal, read the official page, build a source-quoted checklist. Never fills or submits forms. */
export async function run(runId: string, url: string) {
  const pre = gate0(url);
  await step(runId, 'VERIFY', `Gate 0 on ${pre.hostname || url}: ${pre.label}`, { url, detail: pre.reasons.join('\n') });

  const controlled = pre.hostname.endsWith('.example'); // our own demo lookalike, served locally, safe to show
  if (pre.label !== 'Official source confirmed' && !controlled) {
    await step(runId, 'VERIFY', 'Not opening this page: it is not a vetted official source');
    return finish(runId, [pre]);
  }

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    // The controlled lookalike never touches the network: we serve our demo page for any *.example host.
    await page.route(/^https?:\/\/[^/]+\.example\//, async (route) =>
      route.fulfill({ contentType: 'text/html', body: await (await fetch(appUrl('/mock/lookalike.html'))).text() }));

    try {
      await page.goto(url, { timeout: 30_000 });
    } catch (e) {
      const failed: Gate0Result = { ...pre, label: 'Unable to verify', reasons: [...pre.reasons, `Page did not load: ${(e as Error).message.split('\n')[0]}`] };
      await step(runId, 'CHECK', 'Page did not load; nothing is claimed from it', { url, detail: failed.reasons.at(-1) });
      return finish(runId, [failed]);
    }
    const landed = gate0(url, page.url());
    await step(runId, 'CHECK', `Opened ${landed.hostname}`, { url: page.url(), detail: await page.title() });

    if (landed.label !== 'Official source confirmed') {
      const sensitive = await page.locator('input[name*=aadhaar i], input[name*=bank i], input[type=password], button:has-text("Pay")').count();
      await step(runId, 'VERIFY', `${landed.label}: stopping here`, {
        url: page.url(),
        detail: [...landed.reasons, sensitive ? `Page asks for ${sensitive} sensitive field(s) (ID, bank or payment). Not filled, not submitted.` : ''].filter(Boolean).join('\n'),
      });
      return finish(runId, [landed]);
    }

    // REASON: read the official page and one linked conditions page on the same host
    const pages: { url: string; text: string }[] = [{ url: page.url(), text: await page.innerText('body') }];
    const gates = [landed];
    const link = await page.$$eval('a[href]', (as) => as.map((a) => ({ href: (a as HTMLAnchorElement).href, text: a.textContent ?? '' })));
    const next = link.find((l) => /important|eligib|instruction|document|faq/i.test(l.text) && !/\.pdf$|#$/i.test(l.href) && new URL(l.href).hostname === new URL(page.url()).hostname);
    if (next) {
      const loaded = await page.goto(next.href, { timeout: 30_000 }).then(() => true, () => false);
      const g = gate0(next.href, page.url());
      if (!loaded) await step(runId, 'CHECK', `Linked page "${next.text.trim()}" did not load; skipped`, { url: next.href });
      else gates.push(g);
      if (loaded && g.label === 'Official source confirmed') {
        pages.push({ url: page.url(), text: await page.innerText('body') });
        await step(runId, 'CHECK', `Opened linked page "${next.text.trim()}"`, { url: page.url() });
      }
    }

    const items: ChecklistItem[] = [];
    let dropped = 0;
    let deadline: { date: string; quote: string; url: string } | null = null;
    for (const p of pages) {
      const ai = await extractJson<{ items?: { text: string; quote: string }[]; deadline?: { date: string | null; quote: string } }>(instructions, p.text.slice(0, MAX_TEXT));
      const onPage = (q: string) => !!q && norm(p.text).includes(norm(q));
      for (const it of ai.items ?? []) {
        if (onPage(it.quote)) items.push({ id: newId('I'), text: it.text, quote: it.quote, sourceUrl: p.url, done: false });
        else dropped++;
      }
      if (!deadline && ai.deadline?.date && !Number.isNaN(Date.parse(ai.deadline.date)) && onPage(ai.deadline.quote)) deadline = { date: ai.deadline.date, quote: ai.deadline.quote, url: p.url };
    }
    const passed = deadline && Date.parse(deadline.date) + 24 * H < Date.now() ? deadline : null; // date-only deadlines count through that day
    if (passed) deadline = null; // no "Deadline soon" reminder for a deadline that is over
    await step(runId, 'REASON', `Built checklist: ${items.length} items, each quoted from the official page`, {
      detail: [...items.map((i) => `• ${i.text}`), dropped ? `Dropped ${dropped} item(s) whose quote was not found on the page` : '', deadline ? `Deadline on page: "${deadline.quote}"` : passed ? `Deadline on page has already passed: "${passed.quote}"` : 'No deadline stated on the page; none invented'].filter(Boolean).join('\n'),
    });

    // PREPARE: checklist + one calendar reminder, both waiting for approval
    const proposals: Proposal[] = [];
    const propose = (payload: Proposal['payload'], reason: string) => proposals.push({ id: newId('P'), runId, status: 'pending_approval', payload, reason, createdAt: now() });
    if (items.length) propose({ kind: 'checklist', title: `${landed.hostname} checklist`, items }, 'Every item quotes the official page it came from');
    const at = deadline ? Math.max(Date.parse(deadline.date) - 3 * 24 * H, Date.now()) : Math.ceil(Date.now() / (24 * H)) * 24 * H + 4.5 * H; // 3 days before deadline, else tomorrow 10:00 IST
    if (items.length || deadline)
      propose({ kind: 'calendar_event', slot: { id: newId('C'), title: deadline ? `Deadline soon: ${landed.hostname}` : `Gather documents for ${landed.hostname}`, start: iso(at), end: iso(at + H / 2), kind: 'reminder' } },
        deadline ? `3 days before the deadline quoted on ${deadline.url}` : 'Reminder for the document tasks (no deadline on the page)');
    await step(runId, 'PREPARE', `Prepared ${proposals.length} changes (not written)`);
    await finish(runId, gates, proposals);
    if (proposals.length) await step(runId, 'APPROVE', `Waiting for your approval`);
  } finally {
    await browser.close();
  }
}
