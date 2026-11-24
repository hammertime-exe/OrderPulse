import { test } from 'node:test';
import assert from 'node:assert/strict';
import seed from '../seed/state.json' with { type: 'json' };
import type { Proposal, State } from '../shared/types.ts';
import { approve, reject } from './approval.ts';

const order = { id: 'O-102', customer: 'Priya Nair', product: 'chocolate truffle cake', quantity: 2, customization: '', pickupAt: '2026-11-28T20:00:00+05:30', status: 'confirmed' as const, sourceMessageId: 'M-201' };
const staged = (): State => {
  const s: State = structuredClone(seed as State);
  const p = (id: string, payload: Proposal['payload']): Proposal => ({ id, runId: 'R-1', status: 'pending_approval', payload, reason: '', createdAt: '' });
  s.runs.push({ id: 'R-1', kind: 'order', status: 'awaiting_approval', steps: [], proposalIds: ['P-1', 'P-2', 'P-3'], report: { clashes: [{ kind: 'stock', message: '', evidence: 'whipping cream' }], prep: null, alternative: null } });
  s.proposals.push(
    p('P-1', { kind: 'sheet_row', order }),
    p('P-2', { kind: 'calendar_event', slot: { id: 'C-9', title: 'Prep O-102', start: '2026-11-28T16:00:00+05:30', end: '2026-11-28T20:00:00+05:30', kind: 'prep' } }),
    p('P-3', { kind: 'customer_reply', to: 'priya.nair@example.com', subject: 'Your cake', body: 'Hi' }),
  );
  return s;
};
const effects = (s: State) => JSON.stringify([s.orders, s.calendar, s.sent, s.inbox]);

test('approve writes each effect once and logs it', () => {
  const s = staged();
  const r = approve(s, ['P-1', 'P-2', 'P-3']);
  assert.ok(r.every((x) => x.ok));
  assert.equal(s.orders.at(-1)?.id, 'O-102');
  assert.equal(s.calendar.at(-1)?.id, 'C-9');
  assert.equal(s.sent.length, 1);
  assert.equal(s.inbox.find((m) => m.id === 'M-201')?.read, true);
  assert.equal(s.audit.length, 3);
  assert.equal(s.runs[0].status, 'done');
  // double click: no second write
  assert.equal(approve(s, ['P-1'])[0].error, 'already executed');
  assert.equal(s.orders.filter((o) => o.id === 'O-102').length, 1);
});

test('rejected proposals leave source state unchanged', () => {
  const s = staged();
  const before = effects(s);
  assert.ok(reject(s, ['P-1', 'P-2', 'P-3']).every((x) => x.ok));
  assert.equal(effects(s), before);
  assert.equal(s.audit.length, 3);
  assert.equal(approve(s, ['P-2'])[0].error, 'already rejected');
});

test('stale calendar is caught at approval time, not overwritten', () => {
  const s = staged();
  s.calendar.push({ id: 'C-new', title: 'Dentist', start: '2026-11-28T17:00:00+05:30', end: '2026-11-28T18:00:00+05:30', kind: 'personal' });
  const [r] = approve(s, ['P-2']);
  assert.equal(r.ok, false);
  assert.match(r.error!, /Dentist/);
  assert.equal(s.calendar.some((c) => c.id === 'C-9'), false);
});

test('a run stands or falls together: no confirmation reply when the order row is stale', () => {
  const s = staged();
  s.orders.push({ ...order, customer: 'Someone else' });
  const r = approve(s, ['P-1', 'P-2', 'P-3']);
  assert.ok(r.every((x) => !x.ok));
  assert.equal(s.sent.length, 0);
  assert.equal(s.calendar.some((c) => c.id === 'C-9'), false);
});

test('stock taken by an order confirmed since staging is caught at approval', () => {
  const s = staged();
  s.orders.push({ ...order, id: 'O-150', quantity: 1 }); // uses dark chocolate the staged order counted on
  const [r] = approve(s, ['P-1']);
  assert.equal(r.ok, false);
  assert.match(r.error!, /not enough dark chocolate/);
});

test('a row that failed in an earlier approval still blocks the confirmation reply', () => {
  const s = staged();
  s.orders.push({ ...order, customer: 'Someone else' });
  assert.equal(approve(s, ['P-1'])[0].ok, false);
  assert.equal(approve(s, ['P-3'])[0].ok, false);
  assert.equal(s.sent.length, 0);
});

test('rejecting every change of an order run puts its message back in the unread inbox', () => {
  const s = staged();
  s.runs.at(-1)!.input = 'M-201';
  s.inbox.find((m) => m.id === 'M-201')!.read = true;
  reject(s, ['P-1', 'P-2', 'P-3']);
  assert.equal(s.inbox.find((m) => m.id === 'M-201')?.read, false);
});
