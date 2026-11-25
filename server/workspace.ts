import type {
  BusinessProfile,
  ProposalPayload,
  Recipe,
  State,
  StockItem,
} from "../shared/types.ts";

import { checkOrder } from "../shared/clash.ts";

import { H, iso } from "../shared/time.ts";

import { orderContext } from "./management.ts";
import { now } from "./store.ts";

const text = (value: unknown, max = 160): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

const number = (
  value: unknown,
  min: number,
  max = 1_000_000,
): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

const safeName = (value: unknown): value is string =>
  text(value) &&
  !["__proto__", "constructor", "prototype"].includes(value.trim());

const date = (value: unknown): value is string =>
  typeof value === "string" &&
  /(Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));

/** Validate the entire settings document before changing live state. */

export function saveWorkspace(s: State, body: unknown) {
  const input = body as {
    business?: BusinessProfile;
    stock?: StockItem[];
    recipes?: Record<string, Recipe>;
    version?: number;
  } | null;

  if (input?.version !== s.version)
    throw new Error(
      "Workspace changed. Reload the saved settings and try again.",
    );

  if (
    s.runs.some((r) => r.status === "running") ||
    s.proposals.some((p) => p.status === "pending_approval")
  )
    throw new Error(
      "Finish the active run and resolve pending approvals before changing business settings.",
    );

  const business = input?.business;

  if (
    !business ||
    !text(business.name, 80) ||
    !["baker", "tailor", "crafter", "caterer", "other"].includes(
      business.category,
    )
  )
    throw new Error("Enter a business name and select a business type.");

  if (
    !Array.isArray(input.stock) ||
    input.stock.length > 100 ||
    !input.stock.every(
      (x) => x && safeName(x.item) && text(x.unit, 24) && number(x.onHand, 0),
    )
  )
    throw new Error(
      "Materials need a name, unit and non-negative quantity (maximum 100 materials).",
    );

  const stock = input.stock.map((x) => ({
    item: x.item.trim(),
    unit: x.unit.trim(),
    onHand: x.onHand,
  }));

  if (new Set(stock.map((x) => x.item)).size !== stock.length)
    throw new Error("Material names must be unique.");

  if (
    !input.recipes ||
    typeof input.recipes !== "object" ||
    Array.isArray(input.recipes)
  )
    throw new Error("Add at least one product.");

  const products = Object.entries(input.recipes);

  if (!products.length || products.length > 100)
    throw new Error("Add between 1 and 100 products.");

  for (const [name, r] of products) {
    if (
      !safeName(name) ||
      name !== name.trim() ||
      !r ||
      !text(r.unit, 24) ||
      !number(r.prepHours, 0.25, 13) ||
      !r.materials ||
      typeof r.materials !== "object" ||
      Array.isArray(r.materials) ||
      !Object.keys(r.materials).length
    )
      throw new Error(
        "Each product needs a name, unit, 0.25–13 preparation hours and at least one material.",
      );

    for (const [item, amount] of Object.entries(r.materials))
      if (!stock.some((x) => x.item === item) || !number(amount, 0.001))
        throw new Error(`Check material quantities for ${name}.`);
  }

  for (const [name, recipe] of Object.entries(s.recipes)) {
    if (
      s.orders.some((o) => o.product === name) &&
      JSON.stringify(input.recipes[name]) !== JSON.stringify(recipe)
    )
      throw new Error(
        `The product "${name}" is used by existing orders. Keep its recipe unchanged; add a new product for a different recipe.`,
      );
  }

  for (const old of s.stock) {
    if (
      products.some(([, r]) => Object.hasOwn(r.materials, old.item)) &&
      stock.find((x) => x.item === old.item)?.unit !== old.unit
    )
      throw new Error(
        `Keep the recorded unit for ${old.item}; its recipe quantities use ${old.unit}.`,
      );
  }

  s.business = { name: business.name.trim(), category: business.category };

  s.stock = stock;

  s.recipes = structuredClone(input.recipes);

  s.audit.unshift({
    at: now(),
    actor: "seller",
    action: "business_settings_saved",
    detail: `${s.business.name}: ${products.length} products, ${stock.length} materials`,
  });
}

/** Editing stages new drafts only. Execution still goes through the approval engine. */

export function editProposal(s: State, body: unknown) {
  const input = body as {
    id?: string;
    payload?: ProposalPayload;
    expectedPayload?: ProposalPayload;
  } | null;

  const p = s.proposals.find((x) => x.id === input?.id);

  if (!p || p.status !== "pending_approval")
    throw new Error("This proposal is no longer waiting for approval.");

  if (JSON.stringify(input?.expectedPayload) !== JSON.stringify(p.payload))
    throw new Error(
      "This draft changed. Close the editor and reopen it to load the latest version.",
    );

  const next = structuredClone(input?.payload);

  if (!next || next.kind !== p.payload.kind)
    throw new Error("Proposal type cannot change.");

  const related = s.proposals.filter((x) => x.runId === p.runId);

  if (next.kind === "customer_reply" && p.payload.kind === "customer_reply") {
    if (
      next.to !== p.payload.to ||
      !text(next.subject, 250) ||
      !text(next.body, 10_000)
    )
      throw new Error(
        "Enter a subject and reply. The original recipient cannot change.",
      );
  } else if (next.kind === "sheet_row" && p.payload.kind === "sheet_row") {
    if (related.some((x) => x.status !== "pending_approval"))
      throw new Error(
        "Order details can only change before any proposal in this run has been approved or rejected.",
      );

    if (
      JSON.stringify(next.previousOrder) !==
      JSON.stringify(p.payload.previousOrder)
    )
      throw new Error("The original order reference cannot change.");
    const old = p.payload.order,
      o = next.order;

    if (
      !o ||
      o.id !== old.id ||
      o.sourceMessageId !== old.sourceMessageId ||
      o.status !== old.status ||
      !text(o.customer) ||
      !Object.hasOwn(s.recipes, o.product) ||
      !number(o.quantity, 0.001) ||
      typeof o.customization !== "string" ||
      o.customization.length > 2000 ||
      !date(o.pickupAt)
    )
      throw new Error(
        "Check customer, product, positive quantity and pickup date.",
      );

    const report = checkOrder(
      {
        sourceMessageId: o.sourceMessageId ?? "",
        customer: o.customer,
        product: o.product,
        quantity: o.quantity,
        customization: o.customization,
        pickupAt: o.pickupAt,
        constraints: [],
      },
      orderContext(s, p.payload.previousOrder),
    );

    if (report.clashes.length)
      throw new Error(
        `Cannot save this order: ${report.clashes.map((c) => c.message).join(" ")}`,
      );

    for (const item of related) {
      if (
        item.payload.kind === "calendar_event" &&
        item.payload.slot.orderId === o.id
      ) {
        const slot = item.payload.slot;

        if (slot.kind === "prep") {
          slot.start = report.prep!.start;
          slot.end = report.prep!.end;
          slot.title = `Prep: ${o.id} ${o.product}`;
        }

        if (slot.kind === "pickup") {
          slot.start = o.pickupAt;
          slot.end = iso(Date.parse(o.pickupAt) + H / 4);
          slot.title = `Pickup: ${o.id} ${o.customer}`;
        }

        if (slot.kind === "reminder") {
          slot.start = iso(Date.parse(report.prep!.start) - 2 * H);
          slot.end = iso(Date.parse(report.prep!.start) - H);
        }

        item.reason =
          "Updated by seller with the revised order. Review before approving.";
      }
    }

    const run = s.runs.find((r) => r.id === p.runId);

    if (run) {
      run.report = report;
      run.request = {
        sourceMessageId: o.sourceMessageId ?? "",
        customer: o.customer,
        product: o.product,
        quantity: o.quantity,
        customization: o.customization,
        pickupAt: o.pickupAt,
        constraints: run.request?.constraints ?? [],
      };
    }

    // Keep the seller's wording. Require explicit review of the reply after an order edit.

    for (const item of related)
      if (item.payload.kind === "customer_reply") {
        item.reviewRequired = true;
        item.reason =
          "Order details changed. Edit and save this reply to confirm it matches the revised order.";
      }
  } else if (
    next.kind === "calendar_event" &&
    p.payload.kind === "calendar_event"
  ) {
    const old = p.payload.slot,
      slot = next.slot;

    if (
      !slot ||
      slot.id !== old.id ||
      slot.kind !== old.kind ||
      slot.orderId !== old.orderId ||
      !text(slot.title) ||
      !date(slot.start) ||
      !date(slot.end) ||
      Date.parse(slot.end) <= Date.parse(slot.start)
    )
      throw new Error("Enter a title and a valid end time after the start.");

    if (slot.orderId && slot.kind !== "reminder")
      throw new Error(
        "Edit the linked order to update its preparation and pickup slots together.",
      );

    if (
      slot.kind !== "reminder" &&
      s.calendar.some(
        (x) =>
          x.kind !== "reminder" &&
          Date.parse(x.start) < Date.parse(slot.end) &&
          Date.parse(slot.start) < Date.parse(x.end),
      )
    )
      throw new Error(
        "The revised event overlaps an existing calendar booking.",
      );
  } else throw new Error("This proposal does not support editing.");

  p.payload = next;

  p.reviewRequired = false;

  p.reason = "Edited by seller; saved as a draft awaiting approval.";

  s.audit.unshift({
    at: now(),
    actor: "seller",
    action: "proposal_edited",
    proposalId: p.id,
    detail: `Revised ${next.kind}; no order, booking or message written.`,
  });
}
