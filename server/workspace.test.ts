import { test } from "node:test";
import assert from "node:assert/strict";
import seed from "../seed/state.json" with { type: "json" };
import type { State, Proposal } from "../shared/types.ts";
import { saveWorkspace, editProposal } from "./workspace.ts";
import { approve } from "./approval.ts";
import { statesQuantity } from "../shared/clash.ts";

const state = () => structuredClone(seed as State);
const config = (s: State) => ({
  version: s.version,
  business: { name: "Thread Studio", category: "tailor" },
  stock: structuredClone(s.stock),
  recipes: structuredClone(s.recipes),
});
const staged = () => {
  const s = state();
  s.stock.find((x) => x.item === "whipping cream")!.onHand = 10000;
  const order = {
    id: "O-102",
    customer: "Priya",
    product: "chocolate truffle cake",
    quantity: 1,
    customization: "Flowers",
    pickupAt: "2026-11-29T17:00:00+05:30",
    status: "confirmed" as const,
    sourceMessageId: "M-201",
  };
  const p = (id: string, payload: Proposal["payload"]): Proposal => ({
    id,
    runId: "R-edit",
    status: "pending_approval",
    payload,
    reason: "",
    createdAt: "",
  });
  s.runs.push({
    id: "R-edit",
    kind: "order",
    status: "awaiting_approval",
    steps: [],
    proposalIds: ["row", "prep", "pickup", "reply"],
  });
  s.proposals.push(
    p("row", { kind: "sheet_row", order }),
    p("prep", {
      kind: "calendar_event",
      slot: {
        id: "prep-event",
        kind: "prep",
        title: "Prep",
        start: "2026-11-29T13:00:00+05:30",
        end: order.pickupAt,
        orderId: order.id,
      },
    }),
    p("pickup", {
      kind: "calendar_event",
      slot: {
        id: "pickup-event",
        kind: "pickup",
        title: "Pickup",
        start: order.pickupAt,
        end: "2026-11-29T17:15:00+05:30",
        orderId: order.id,
      },
    }),
    p("reply", {
      kind: "customer_reply",
      to: "priya@example.com",
      subject: "Order",
      body: "Original pickup at 5 pm.",
    }),
  );
  return s;
};
const edit = (s: State, id: string) => ({
  id,
  expectedPayload: structuredClone(
    s.proposals.find((p) => p.id === id)!.payload,
  ),
  payload: structuredClone(s.proposals.find((p) => p.id === id)!.payload),
});

test("business setup saves tailor catalog without removing existing orders", () => {
  const s = state(),
    input = config(s),
    orders = structuredClone(s.orders);
  input.stock.push({ item: "fabric", unit: "m", onHand: 15 });
  input.recipes["kurta"] = {
    unit: "piece",
    prepHours: 3,
    materials: { fabric: 2.5 },
  };
  saveWorkspace(s, input);
  assert.equal(s.business?.category, "tailor");
  assert.equal(s.recipes.kurta.unit, "piece");
  assert.deepEqual(s.orders, orders);
});
test("invalid settings and stale revisions leave all settings unchanged", () => {
  const s = state(),
    before = structuredClone(s),
    input = config(s);
  input.stock[0].onHand = -1;
  assert.throws(() => saveWorkspace(s, input), /non-negative/);
  assert.deepEqual(s, before);
  assert.throws(
    () => saveWorkspace(s, { ...config(s), version: -1 }),
    /changed/,
  );
  assert.deepEqual(s, before);
});
test("existing order recipes and material units cannot silently change", () => {
  const s = state(),
    input = config(s);
  input.recipes["chocolate truffle cake"].prepHours = 2;
  assert.throws(() => saveWorkspace(s, input), /existing orders/);
  const units = config(s);
  units.stock[0].unit = "kg";
  assert.throws(() => saveWorkspace(s, units), /recorded unit/);
});
test("setup is blocked while approvals are pending", () => {
  const s = staged();
  assert.throws(() => saveWorkspace(s, config(s)), /pending approvals/);
});
test("order edit reschedules linked drafts and requires explicit reply review", () => {
  const s = staged(),
    input = edit(s, "row"),
    before = JSON.stringify([s.orders, s.calendar, s.sent]);
  if (input.payload.kind !== "sheet_row") throw new Error();
  input.payload.order.pickupAt = "2026-11-29T19:00:00+05:30";
  editProposal(s, input);
  assert.equal(JSON.stringify([s.orders, s.calendar, s.sent]), before);
  const prep = s.proposals.find((p) => p.id === "prep")!;
  assert.equal(
    prep.payload.kind === "calendar_event" && prep.payload.slot.start,
    "2026-11-29T15:00:00+05:30",
  );
  assert.equal(s.proposals.find((p) => p.id === "reply")!.reviewRequired, true);
  assert.ok(approve(s, ["row", "prep", "pickup", "reply"]).every((r) => !r.ok));
  const reply = edit(s, "reply");
  if (reply.payload.kind !== "customer_reply") throw new Error();
  reply.payload.body = "Pickup at 7 pm.";
  editProposal(s, reply);
  assert.ok(approve(s, ["row", "prep", "pickup", "reply"]).every((r) => r.ok));
  assert.equal(s.sent.at(-1)?.body, "Pickup at 7 pm.");
});
test("conflicting order edits do not partially change drafts", () => {
  const s = staged(),
    input = edit(s, "row"),
    before = structuredClone(s);
  if (input.payload.kind !== "sheet_row") throw new Error();
  input.payload.order.pickupAt = "2026-11-28T15:30:00+05:30";
  assert.throws(() => editProposal(s, input), /overlaps/);
  assert.deepEqual(s, before);
});
test("stale editor and altered recipient are rejected", () => {
  const s = staged(),
    input = edit(s, "reply");
  if (input.payload.kind !== "customer_reply") throw new Error();
  input.payload.to = "other@example.com";
  assert.throws(() => editProposal(s, input), /recipient/);
  const stale = edit(s, "reply");
  s.proposals.find((p) => p.id === "reply")!.payload = {
    kind: "customer_reply",
    to: "priya@example.com",
    subject: "New",
    body: "Updated elsewhere",
  };
  assert.throws(() => editProposal(s, stale), /draft changed/);
});
test("linked order slots must be edited through the order", () => {
  const s = staged();
  assert.throws(() => editProposal(s, edit(s, "prep")), /linked order/);
});
test("edited or settled order cannot be revised after partial approval", () => {
  const s = staged();
  approve(s, ["row"]);
  assert.throws(() => editProposal(s, edit(s, "row")), /no longer/);
});
test("quantity verification supports configured non-bakery units", () => {
  assert.equal(
    statesQuantity("Please make 2 pieces for Friday", 2, "piece"),
    true,
  );
  assert.equal(statesQuantity("I need two boxes", 2, "box"), true);
  assert.equal(statesQuantity("Use 2.5 metres", 2.5, "m"), true);
  assert.equal(statesQuantity("Please make 12 pieces", 2, "piece"), false);
  assert.equal(statesQuantity("Use 3 metres", 2.5, "m"), false);
  assert.equal(statesQuantity("Order 2 kg chocolate cake", 2), true);
});
