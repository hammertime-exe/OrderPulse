import { test } from "node:test";
import assert from "node:assert/strict";
import seed from "../seed/state.json" with { type: "json" };
import type { State } from "../shared/types.ts";
import {
  adjustStock,
  deliverOrder,
  previewOrder,
  stageOrder,
  stageReminder,
} from "./management.ts";
import { approve, reject } from "./approval.ts";
const state = () => structuredClone(seed as State);
const draft = {
  customer: "Test Seller Customer",
  product: "vanilla sponge cake",
  quantity: 1,
  pickupAt: "2026-11-29T15:00:00+05:30",
  customization: "Blue ribbon",
};
const effects = (s: State) =>
  JSON.stringify([s.orders, s.stock, s.calendar, s.sent]);

test("manual orders are checked and staged without writing effects", () => {
  const s = state(),
    before = effects(s);
  assert.equal(previewOrder(s, { order: draft }).report.clashes.length, 0);
  stageOrder(s, { order: draft });
  assert.equal(effects(s), before);
  assert.equal(s.proposals.length, 3);
  assert.equal(s.runs[0].manual, true);
  assert.ok(
    approve(s, s.proposals.map((p) => p.id).reverse()).every((r) => r.ok),
  );
  assert.equal(s.orders.at(-1)?.customer, draft.customer);
  assert.equal(
    s.calendar.filter((c) => c.orderId === s.orders.at(-1)?.id).length,
    2,
  );
});
test("manual order changes cannot be partially applied", () => {
  const s = state();
  stageOrder(s, { order: draft });
  const before = effects(s);
  assert.equal(approve(s, [s.proposals[0].id])[0].ok, false);
  assert.equal(effects(s), before);
  assert.ok(s.proposals.every((p) => p.status === "pending_approval"));
});
test("rescheduling an existing order replaces its slots only on approval", () => {
  const s = state(),
    old = structuredClone(s.orders[0]);
  stageOrder(s, {
    orderId: old.id,
    expectedOrder: old,
    order: { ...old, pickupAt: "2026-11-29T18:00:00+05:30" },
  });
  assert.deepEqual(s.orders[0], old);
  assert.ok(
    approve(s, s.proposals.map((p) => p.id).reverse()).every((r) => r.ok),
  );
  assert.equal(s.orders[0].pickupAt, "2026-11-29T18:00:00+05:30");
  assert.equal(
    s.calendar.some((c) => c.id === "C-301"),
    false,
  );
  assert.equal(s.calendar.filter((c) => c.orderId === old.id).length, 2);
});
test("rejecting an order revision preserves original order and bookings", () => {
  const s = state(),
    old = structuredClone(s.orders[0]),
    before = effects(s);
  stageOrder(s, {
    orderId: old.id,
    expectedOrder: old,
    order: { ...old, pickupAt: "2026-11-29T18:00:00+05:30" },
  });
  reject(
    s,
    s.proposals.map((p) => p.id),
  );
  assert.equal(effects(s), before);
});
test("conflicting or stale revisions do not stage changes", () => {
  const s = state(),
    before = structuredClone(s);
  assert.throws(
    () =>
      stageOrder(s, {
        order: { ...draft, pickupAt: "2026-11-28T15:30:00+05:30" },
      }),
    /overlaps/,
  );
  assert.deepEqual(s, before);
  assert.throws(
    () =>
      stageOrder(s, {
        orderId: s.orders[0].id,
        expectedOrder: {},
        order: s.orders[0],
      }),
    /changed/,
  );
});
test("new calendar conflict at approval blocks the whole manual plan", () => {
  const s = state();
  stageOrder(s, { order: draft });
  s.calendar.push({
    id: "late",
    title: "Late booking",
    start: "2026-11-29T14:00:00+05:30",
    end: "2026-11-29T16:00:00+05:30",
    kind: "personal",
  });
  const before = effects(s);
  assert.ok(
    approve(
      s,
      s.proposals.map((p) => p.id),
    ).every((r) => !r.ok),
  );
  assert.equal(effects(s), before);
});
test("stock adjustment checks current quantity and records the reason", () => {
  const s = state();
  adjustStock(s, {
    item: "flour",
    onHand: 5000,
    expectedOnHand: 3000,
    reason: "Restocked",
  });
  assert.equal(s.stock.find((x) => x.item === "flour")?.onHand, 5000);
  assert.match(s.audit[0].detail, /Restocked/);
  assert.throws(
    () =>
      adjustStock(s, {
        item: "flour",
        onHand: 7000,
        expectedOnHand: 3000,
        reason: "Restocked",
      }),
    /changed/,
  );
});
test("pending approval permits restocking but blocks stock reduction", () => {
  const s = state();
  stageOrder(s, { order: draft });
  assert.throws(
    () =>
      adjustStock(s, {
        item: "flour",
        onHand: 1,
        expectedOnHand: 3000,
        reason: "Correction",
      }),
    /reducing stock/,
  );
  adjustStock(s, {
    item: "flour",
    onHand: 4000,
    expectedOnHand: 3000,
    reason: "Restock",
  });
  assert.equal(s.stock.find((x) => x.item === "flour")?.onHand, 4000);
});
test("delivery consumes materials once rather than freeing consumed stock", () => {
  const s = state(),
    old = structuredClone(s.orders[0]);
  deliverOrder(s, { id: old.id, expectedOrder: old });
  assert.equal(s.orders[0].status, "delivered");
  assert.equal(s.stock.find((x) => x.item === "whipping cream")?.onHand, 400);
  assert.equal(s.stock.find((x) => x.item === "dark chocolate")?.onHand, 750);
  assert.throws(
    () => deliverOrder(s, { id: old.id, expectedOrder: old }),
    /no longer/,
  );
});
test("delivery fails atomically when materials are missing", () => {
  const s = state();
  s.stock.find((x) => x.item === "eggs")!.onHand = 0;
  const before = structuredClone(s);
  assert.throws(
    () => deliverOrder(s, { id: s.orders[0].id, expectedOrder: s.orders[0] }),
    /missing eggs/,
  );
  assert.deepEqual(s, before);
});
test("checklist reminders require a saved checklist and stay pending", () => {
  const s = state();
  s.proposals.push({
    id: "list",
    runId: "aid",
    status: "executed",
    payload: { kind: "checklist", title: "Documents", items: [] },
    reason: "",
    createdAt: "",
  });
  const at = new Date(Date.now() + 86400000).toISOString();
  stageReminder(s, { checklistId: "list", title: "Gather documents", at });
  assert.equal(
    s.calendar.some((c) => c.title === "Gather documents"),
    false,
  );
  const p = s.proposals.at(-1)!;
  assert.equal(p.status, "pending_approval");
  assert.throws(
    () =>
      stageReminder(s, { checklistId: "list", title: "Gather documents", at }),
    /already/,
  );
  assert.equal(approve(s, [p.id])[0].ok, true);
  assert.ok(s.calendar.some((c) => c.title === "Gather documents"));
});
