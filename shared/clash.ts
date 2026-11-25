import type {
  Clash,
  ClashReport,
  OrderRequest,
  State,
  Window,
} from "./types.ts";
import { H, dayOf, fmt, hhmm, hourOf, iso } from "./time.ts";

const OPEN = 8; // kitchen hours, IST
const CLOSE = 21;
const HANDOVER = 0.25 * H; // pickup blocks 15 minutes
const SEARCH_HOURS = 72; // how far after the requested pickup we look for a free slot

/** Rule-based clash check: missing fields, kitchen hours, calendar overlap, stock shortfall. Same input, same answer. */
export function checkOrder(
  req: OrderRequest,
  state: Pick<State, "orders" | "stock" | "recipes" | "calendar">,
): ClashReport {
  const clashes: Clash[] = [];
  const recipe = req.product ? state.recipes[req.product] : undefined;
  if (!recipe)
    clashes.push({
      kind: "missing",
      message: req.product
        ? `"${req.product}" is not on the menu; pick a product`
        : "Product not stated in the order",
    });
  if (!req.quantity || req.quantity <= 0)
    clashes.push({
      kind: "missing",
      message: "Quantity not stated in the order",
    });
  const pickup = req.pickupAt ? Date.parse(req.pickupAt) : NaN;
  if (Number.isNaN(pickup))
    clashes.push({
      kind: "missing",
      message: "Pickup date/time not stated in the order",
    });
  if (!recipe || !req.quantity || Number.isNaN(pickup))
    return { clashes, prep: null, alternative: null };

  const busy = state.calendar
    .filter((c) => c.kind !== "reminder")
    .map((c) => ({ c, start: Date.parse(c.start), end: Date.parse(c.end) }));
  const prepHours = recipe.prepHours * H;
  const problems = (p: number): Clash[] => {
    const start = p - prepHours;
    const out: Clash[] = [];
    if (
      hourOf(start) < OPEN ||
      dayOf(start) !== dayOf(p) ||
      hourOf(p + HANDOVER) > CLOSE ||
      dayOf(p + HANDOVER) !== dayOf(p)
    )
      out.push({
        kind: "hours",
        message: `Prep ${fmt(start)}–${hhmm(p)} falls outside working hours (${OPEN}:00–${CLOSE}:00)`,
      });
    for (const b of busy)
      if (start < b.end && b.start < p + HANDOVER)
        out.push({
          kind: "calendar",
          message: `Prep ${fmt(start)}–${hhmm(p)} + pickup overlaps "${b.c.title}" (${fmt(b.start)}–${hhmm(b.end)})`,
          evidence: b.c.id,
        });
    return out;
  };
  const windowFor = (p: number): Window => ({
    start: iso(p - prepHours),
    end: iso(p),
  });

  const timeClashes = problems(pickup);
  clashes.push(...timeClashes);

  for (const [item, perUnit] of Object.entries(recipe.materials)) {
    const need = perUnit * req.quantity;
    const { stock, committed, free } = freeStock(item, state);
    if (need > free)
      clashes.push({
        kind: "stock",
        message: `Needs ${need} ${stock?.unit ?? ""} ${item}; only ${Math.max(free, 0)} free (${stock?.onHand ?? 0} on hand, ${committed} held for confirmed orders). Short by ${need - Math.max(free, 0)}.`,
        evidence: item,
      });
  }

  let alternative: ClashReport["alternative"] = null;
  if (timeClashes.length)
    for (let k = 1; k <= SEARCH_HOURS; k++) {
      const p = pickup + k * H;
      if (!problems(p).length) {
        alternative = { pickupAt: iso(p), prep: windowFor(p) };
        break;
      }
    }

  return { clashes, prep: windowFor(pickup), alternative };
}

/** Stock: what is left of an item after confirmed (not yet delivered) orders. */
export function freeStock(
  item: string,
  state: Pick<State, "orders" | "stock" | "recipes">,
) {
  const stock = state.stock.find((s) => s.item === item);
  const committed = state.orders
    .filter((o) => o.status === "confirmed")
    .reduce(
      (sum, o) =>
        sum + (state.recipes[o.product]?.materials[item] ?? 0) * o.quantity,
      0,
    );
  return { stock, committed, free: (stock?.onHand ?? 0) - committed };
}

const WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};
// "2 kg", "1.5kg", "1/2 kg", "½ kg", "two and a half kilos", "half a kilo", "a kilo", "500 g"; never starts mid-number ("21", "1/2")
const QTY =
  /(?<![\w./])(\d+\/\d+|\d+(?:\.\d+)?|½|(?:one|two|three|four|five)\b)?(\s*(?:and\s+)?(?:a\s+)?(?:half|½))?\s*(an?\s+)?(kilo\w*|kgs?|grams?|gms?|g)\b/gi;

/** Confirm a quantity against source text using the configured selling unit; kg supports weight conversion. */
export const statesQuantity = (text: string, q: number, unit = "kg") => {
  if (unit !== "kg") {
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const aliases: Record<string, string[]> = {
      piece: ["piece", "pieces", "pcs", "pc"],
      box: ["box", "boxes"],
      tray: ["tray", "trays"],
      m: ["m", "meter", "meters", "metre", "metres"],
      g: ["g", "gram", "grams"],
      unit: ["unit", "units"],
    };
    const units = aliases[unit.toLowerCase()] ?? [unit, `${unit}s`];
    const pattern = new RegExp(
      `(?<![\\w./])(\\d+(?:\\.\\d+)?|one|two|three|four|five)\\s*(?:${units.map(escape).join("|")})(?!\\w)`,
      "gi",
    );
    return [...text.matchAll(pattern)].some(
      ([, amount]) =>
        Math.abs((WORDS[amount.toLowerCase()] ?? Number(amount)) - q) < 1e-9,
    );
  }
  return [...text.matchAll(QTY)].some(([, base, half, article, unit]) => {
    const [n, d = "1"] = base?.split("/") ?? [];
    const whole =
      base === "½"
        ? 0.5
        : base
          ? (WORDS[base.toLowerCase()] ?? Number(n) / Number(d))
          : half
            ? 0
            : article
              ? 1
              : NaN;
    return (
      Math.abs((whole + (half ? 0.5 : 0)) / (/^g/i.test(unit) ? 1000 : 1) - q) <
      1e-9
    );
  });
};
