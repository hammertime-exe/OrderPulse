import type { Order, OrderRequest, Proposal, State } from "../shared/types.ts";
import { checkOrder } from "../shared/clash.ts";
import { H, iso } from "../shared/time.ts";
import { newId, now } from "./store.ts";
const validText = (x: unknown, max = 160): x is string =>
  typeof x === "string" && x.trim().length > 0 && x.length <= max;
const validDate = (x: unknown): x is string =>
  typeof x === "string" &&
  /(Z|[+-]\d{2}:\d{2})$/.test(x) &&
  Number.isFinite(Date.parse(x));
export function orderContext(s: State, previous?: Order) {
  return {
    ...s,
    orders: s.orders.filter((o) => o.id !== previous?.id),
    calendar: s.calendar.filter((c) => !previous || c.orderId !== previous.id),
  };
}
export function parseOrder(s: State, raw: any): OrderRequest {
  if (
    !raw ||
    !validText(raw.customer) ||
    typeof raw.product !== "string" ||
    !Object.hasOwn(s.recipes, raw.product) ||
    typeof raw.quantity !== "number" ||
    !Number.isFinite(raw.quantity) ||
    raw.quantity <= 0 ||
    raw.quantity > 1_000_000 ||
    !validDate(raw.pickupAt) ||
    typeof raw.customization !== "string" ||
    raw.customization.length > 2000
  )
    throw new Error(
      "Enter a customer, catalog product, positive quantity and valid pickup time.",
    );
  return {
    sourceMessageId: "",
    customer: raw.customer.trim(),
    product: raw.product,
    quantity: raw.quantity,
    pickupAt: raw.pickupAt,
    customization: raw.customization,
    constraints: [],
  };
}
export function previewOrder(s: State, body: any) {
  const request = parseOrder(s, body?.order),
    previous = body?.orderId
      ? s.orders.find((o) => o.id === body.orderId)
      : undefined;
  if (body?.orderId && (!previous || previous.status !== "confirmed"))
    throw new Error("Only confirmed orders can be edited.");
  return { request, report: checkOrder(request, orderContext(s, previous)) };
}
export function stageOrder(s: State, body: any) {
  if (s.runs.some((r) => r.status === "running"))
    throw new Error("Wait for the active agent run to finish.");
  const previous = body?.orderId
    ? s.orders.find((o) => o.id === body.orderId)
    : undefined;
  if (
    previous &&
    JSON.stringify(body.expectedOrder) !== JSON.stringify(previous)
  )
    throw new Error(
      "This order changed. Reopen it to load the latest details.",
    );
  if (
    previous &&
    s.proposals.some(
      (p) =>
        p.status === "pending_approval" &&
        p.payload.kind === "sheet_row" &&
        p.payload.order.id === previous.id,
    )
  )
    throw new Error(
      "This order already has pending changes. Review them in Approval desk.",
    );
  const { request, report } = previewOrder(s, body);
  if (report.clashes.length)
    throw new Error(report.clashes.map((c) => c.message).join(" "));
  const id = previous?.id ?? newId("O"),
    runId = newId("R");
  const order: Order = {
    id,
    customer: request.customer,
    product: request.product!,
    quantity: request.quantity!,
    customization: request.customization,
    pickupAt: request.pickupAt!,
    status: "confirmed",
    ...(previous?.sourceMessageId
      ? { sourceMessageId: previous.sourceMessageId }
      : {}),
  };
  const proposals: Proposal[] = [];
  const add = (payload: Proposal["payload"], reason: string) =>
    proposals.push({
      id: newId("P"),
      runId,
      payload,
      reason,
      status: "pending_approval",
      createdAt: now(),
    });
  add(
    {
      kind: "sheet_row",
      order,
      ...(previous ? { previousOrder: structuredClone(previous) } : {}),
    },
    previous
      ? "Seller requested an update; the original stays unchanged until approval."
      : "Seller entered this order. Stock and schedule checks passed.",
  );
  add(
    {
      kind: "calendar_event",
      slot: {
        id: newId("C"),
        orderId: id,
        kind: "prep",
        title: `Prep: ${id} ${order.product}`,
        start: report.prep!.start,
        end: report.prep!.end,
      },
    },
    "Preparation slot for the proposed order.",
  );
  add(
    {
      kind: "calendar_event",
      slot: {
        id: newId("C"),
        orderId: id,
        kind: "pickup",
        title: `Pickup: ${id} ${order.customer}`,
        start: order.pickupAt,
        end: iso(Date.parse(order.pickupAt) + H / 4),
      },
    },
    "15-minute pickup slot.",
  );
  s.proposals.push(...proposals);
  s.runs.unshift({
    id: runId,
    kind: "order",
    manual: true,
    startedAt: now(),
    request,
    report,
    status: "awaiting_approval",
    proposalIds: proposals.map((p) => p.id),
    steps: [
      {
        at: now(),
        phase: "REASON",
        action: "Seller-entered order checked against stock and calendar",
      },
      {
        at: now(),
        phase: "APPROVE",
        action: "Order and linked slots staged for approval",
      },
    ],
  });
  s.audit.unshift({
    at: now(),
    actor: "seller",
    action: previous ? "order_update_staged" : "order_staged",
    detail: `${id}: ${order.customer}; awaiting approval.`,
  });
  return { runId };
}
export function adjustStock(s: State, body: any) {
  const item = s.stock.find((x) => x.item === body?.item);
  if (!item) throw new Error("Material not found.");
  if (
    typeof body.onHand !== "number" ||
    !Number.isFinite(body.onHand) ||
    body.onHand < 0 ||
    body.onHand > 1_000_000 ||
    !validText(body.reason, 250)
  )
    throw new Error("Enter a non-negative quantity and a reason.");
  if (item.onHand !== body.expectedOnHand)
    throw new Error("Stock changed. Reopen this material before saving.");
  if (s.runs.some((r) => r.status === "running"))
    throw new Error("Wait for the agent run to finish before adjusting stock.");
  if (
    body.onHand < item.onHand &&
    s.proposals.some((p) => p.status === "pending_approval")
  )
    throw new Error(
      "Resolve pending approvals before reducing stock. Restocking is available now.",
    );
  const before = item.onHand;
  item.onHand = body.onHand;
  s.audit.unshift({
    at: now(),
    actor: "seller",
    action: "stock_adjusted",
    detail: `${item.item}: ${before} to ${item.onHand} ${item.unit}. ${body.reason.trim()}`,
  });
}
export function deliverOrder(s: State, body: any) {
  const order = s.orders.find((o) => o.id === body?.id);
  if (!order || order.status !== "confirmed")
    throw new Error("This order is no longer awaiting delivery.");
  if (JSON.stringify(body.expectedOrder) !== JSON.stringify(order))
    throw new Error("Order changed. Reopen it before marking delivered.");
  if (
    s.runs.some((r) => r.status === "running") ||
    s.proposals.some((p) => p.status === "pending_approval")
  )
    throw new Error(
      "Finish active runs and pending approvals before marking delivery.",
    );
  const materials = s.recipes[order.product]?.materials;
  if (!materials) throw new Error("Product recipe is missing.");
  for (const [name, amount] of Object.entries(materials))
    if (
      (s.stock.find((x) => x.item === name)?.onHand ?? 0) <
      amount * order.quantity
    )
      throw new Error(
        `Record the missing ${name} stock before completing this order.`,
      );
  for (const [name, amount] of Object.entries(materials))
    s.stock.find((x) => x.item === name)!.onHand -= amount * order.quantity;
  order.status = "delivered";
  s.audit.unshift({
    at: now(),
    actor: "seller",
    action: "order_delivered",
    detail: `${order.id}: ${order.customer}. Materials deducted from on-hand stock.`,
  });
}
export function stageReminder(s: State, body: any) {
  const list = s.proposals.find(
    (p) =>
      p.id === body?.checklistId &&
      p.status === "executed" &&
      p.payload.kind === "checklist",
  );
  if (
    !list ||
    !validText(body.title) ||
    !validDate(body.at) ||
    Date.parse(body.at) <= Date.now()
  )
    throw new Error(
      "Choose a saved checklist, reminder title and future time.",
    );
  if (
    s.proposals.some(
      (p) =>
        p.status === "pending_approval" &&
        p.payload.kind === "calendar_event" &&
        p.payload.slot.title === body.title &&
        p.payload.slot.start === body.at,
    )
  )
    throw new Error("This reminder is already waiting for approval.");
  const runId = newId("R"),
    id = newId("P");
  s.proposals.push({
    id,
    runId,
    status: "pending_approval",
    payload: {
      kind: "calendar_event",
      slot: {
        id: newId("C"),
        title: body.title,
        start: body.at,
        end: iso(Date.parse(body.at) + H / 2),
        kind: "reminder",
      },
    },
    reason:
      "Seller-selected document reminder, not a verified application deadline.",
    createdAt: now(),
  });
  s.runs.unshift({
    id: runId,
    kind: "aidscout",
    manual: true,
    status: "awaiting_approval",
    startedAt: now(),
    proposalIds: [id],
    steps: [
      {
        at: now(),
        phase: "PREPARE",
        action: "Seller selected a checklist reminder",
      },
    ],
  });
  s.audit.unshift({
    at: now(),
    actor: "seller",
    action: "reminder_staged",
    proposalId: id,
    detail: `Checklist reminder: ${body.title}`,
  });
}
