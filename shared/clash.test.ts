import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkOrder, statesQuantity } from './clash.ts';
import type { OrderRequest, State } from './types.ts';

const seed: State = JSON.parse(readFileSync(new URL('../seed/state.json', import.meta.url), 'utf8'));
const req = (over: Partial<OrderRequest> = {}): OrderRequest => ({
  sourceMessageId: 'M-201', customer: 'Priya Nair', product: 'chocolate truffle cake', customization: '',
  quantity: 2, pickupAt: '2026-11-28T16:00:00+05:30', constraints: [], ...over,
});

test('hero demo order: prep clash, cream shortfall, Saturday 8 pm alternative', () => {
  const r = checkOrder(req(), seed);
  assert.deepEqual(r.clashes.map((c) => c.kind).sort(), ['calendar', 'calendar', 'stock']);
  assert.deepEqual(r.clashes.filter((c) => c.kind === 'calendar').map((c) => c.evidence), ['C-301', 'C-302']);
  assert.equal(r.clashes.find((c) => c.kind === 'stock')?.evidence, 'whipping cream');
  assert.match(r.clashes.find((c) => c.kind === 'stock')!.message, /Short by 400/);
  assert.deepEqual(r.prep, { start: '2026-11-28T12:00:00+05:30', end: '2026-11-28T16:00:00+05:30' });
  assert.deepEqual(r.alternative, { pickupAt: '2026-11-28T20:00:00+05:30', prep: { start: '2026-11-28T16:00:00+05:30', end: '2026-11-28T20:00:00+05:30' } });
});

test('free slot and enough stock: no clashes, no alternative', () => {
  const r = checkOrder(req({ quantity: 0.5, pickupAt: '2026-11-26T14:00:00+05:30' }), seed);
  assert.deepEqual(r.clashes, []);
  assert.equal(r.alternative, null);
});

test('missing fields are flagged, never guessed', () => {
  const r = checkOrder(req({ quantity: null, pickupAt: null, product: 'mystery pie' }), seed);
  assert.deepEqual(r.clashes.map((c) => c.kind), ['missing', 'missing', 'missing']);
  assert.equal(r.prep, null);
});

test('prep before kitchen opens is an hours clash; touching slots do not clash', () => {
  const early = checkOrder(req({ quantity: 0.5, pickupAt: '2026-11-26T10:00:00+05:30' }), seed);
  assert.deepEqual(early.clashes.map((c) => c.kind), ['hours']);
  assert.equal(early.alternative?.pickupAt, '2026-11-26T12:00:00+05:30');
  // prep 15:45-19:45 starts exactly when the O-101 pickup slot ends
  assert.deepEqual(checkOrder(req({ quantity: 0.5, pickupAt: '2026-11-28T19:45:00+05:30' }), seed).clashes, []);
});

test('quantity must be stated next to a kg unit, in digits or words', () => {
  assert.equal(statesQuantity('Need a two kg cake on 21 Nov', 2), true);
  assert.equal(statesQuantity('half a kilo please', 0.5), true);
  assert.equal(statesQuantity('1.5kg truffle', 1.5), true);
  assert.equal(statesQuantity('cake for 21 Nov, 3 kg', 2), false);
  assert.equal(statesQuantity('a 1/2 kg cake', 0.5), true);
  assert.equal(statesQuantity('a 1/2 kg cake', 2), false);
  assert.equal(statesQuantity('½ kg', 0.5), true);
  assert.equal(statesQuantity('a kilo of truffle', 1), true);
  assert.equal(statesQuantity('500 g cake', 0.5), true);
  assert.equal(statesQuantity('two and a half kg', 2.5), true);
  assert.equal(statesQuantity('1½ kg', 1.5), true);
  assert.equal(statesQuantity('2 good cakes', 2), false);
});
