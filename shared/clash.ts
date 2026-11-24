import type { Clash, ClashReport, OrderRequest, State, Window } from './types.ts';

const H = 3_600_000;
const IST = 5.5 * H; // shortcut: one fixed time zone (IST), upgrade if sellers outside India
const OPEN = 8; // kitchen hours, IST
const CLOSE = 21;
const HANDOVER = 0.25 * H; // pickup blocks 15 minutes
const SEARCH_HOURS = 72; // how far after the requested pickup we look for a free slot

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ist = (ms: number) => new Date(ms + IST); // read with getUTC* to get IST wall-clock values
export const iso = (ms: number) => ist(ms).toISOString().slice(0, 19) + '+05:30';
const hhmm = (ms: number) => ist(ms).toISOString().slice(11, 16);
export const fmt = (ms: number) => { const d = ist(ms); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hhmm(ms)}`; };
const hourOf = (ms: number) => (ms + IST) % (24 * H) / H;
const dayOf = (ms: number) => Math.floor((ms + IST) / (24 * H));

/** Rule-based clash check: missing fields, kitchen hours, calendar overlap, stock shortfall. Same input, same answer. */
export function checkOrder(req: OrderRequest, state: Pick<State, 'orders' | 'stock' | 'recipes' | 'calendar'>): ClashReport {
  const clashes: Clash[] = [];
  const recipe = req.product ? state.recipes[req.product] : undefined;
  if (!recipe) clashes.push({ kind: 'missing', message: req.product ? `"${req.product}" is not on the menu; pick a product` : 'Product not stated in the order' });
  if (!req.quantity || req.quantity <= 0) clashes.push({ kind: 'missing', message: 'Quantity not stated in the order' });
  const pickup = req.pickupAt ? Date.parse(req.pickupAt) : NaN;
  if (Number.isNaN(pickup)) clashes.push({ kind: 'missing', message: 'Pickup date/time not stated in the order' });
  if (!recipe || !req.quantity || Number.isNaN(pickup)) return { clashes, prep: null, alternative: null };

  const busy = state.calendar.filter((c) => c.kind !== 'reminder').map((c) => ({ c, start: Date.parse(c.start), end: Date.parse(c.end) }));
  const prepHours = recipe.prepHours * H;
  const problems = (p: number): Clash[] => {
    const start = p - prepHours;
    const out: Clash[] = [];
    if (hourOf(start) < OPEN || dayOf(start) !== dayOf(p) || hourOf(p + HANDOVER) > CLOSE || dayOf(p + HANDOVER) !== dayOf(p))
      out.push({ kind: 'hours', message: `Prep ${fmt(start)}–${hhmm(p)} falls outside kitchen hours (${OPEN}:00–${CLOSE}:00)` });
    for (const b of busy)
      if (start < b.end && b.start < p + HANDOVER)
        out.push({ kind: 'calendar', message: `Prep ${fmt(start)}–${hhmm(p)} + pickup overlaps "${b.c.title}" (${fmt(b.start)}–${hhmm(b.end)})`, evidence: b.c.id });
    return out;
  };
  const windowFor = (p: number): Window => ({ start: iso(p - prepHours), end: iso(p) });

  const timeClashes = problems(pickup);
  clashes.push(...timeClashes);

  // Stock: what this order needs vs what is left after confirmed (not yet delivered) orders.
  for (const [item, perUnit] of Object.entries(recipe.materials)) {
    const need = perUnit * req.quantity;
    const stock = state.stock.find((s) => s.item === item);
    const committed = state.orders
      .filter((o) => o.status === 'confirmed')
      .reduce((sum, o) => sum + (state.recipes[o.product]?.materials[item] ?? 0) * o.quantity, 0);
    const free = (stock?.onHand ?? 0) - committed;
    if (need > free)
      clashes.push({ kind: 'stock', message: `Needs ${need} ${stock?.unit ?? ''} ${item}; only ${Math.max(free, 0)} free (${stock?.onHand ?? 0} on hand, ${committed} held for confirmed orders). Short by ${need - Math.max(free, 0)}.`, evidence: item });
  }

  let alternative: ClashReport['alternative'] = null;
  if (timeClashes.length)
    for (let k = 1; k <= SEARCH_HOURS; k++) {
      const p = pickup + k * H;
      if (!problems(p).length) { alternative = { pickupAt: iso(p), prep: windowFor(p) }; break; }
    }

  return { clashes, prep: windowFor(pickup), alternative };
}
