import type { Proposal, ProposalPayload, State } from "../shared/types.ts";
import { checkOrder } from "../shared/clash.ts";
import { orderContext } from "./management.ts";
import { freeStock, materialNeed } from "../shared/clash.ts";
import { fmt } from "../shared/time.ts";
import { now } from "./store.ts";

const t = (iso: string) => fmt(Date.parse(iso));

export const describe = (p: ProposalPayload): string => {
  switch (p.kind) {
    case "sheet_row":
      return `Order ${p.order.id}: ${p.order.quantity} × ${p.order.product} for ${p.order.customer}, pickup ${t(p.order.pickupAt)}`;
    case "calendar_event":
      return `Calendar: "${p.slot.title}" ${t(p.slot.start)} → ${t(p.slot.end)}`;
    case "customer_reply":
      return `Reply to ${p.to}: "${p.subject}"`;
    case "checklist":
      return `Checklist "${p.title}" (${p.items.length} items)`;
  }
};

/** Recheck live state just before writing, so a stale proposal never overwrites a newer reality. */
function staleReason({ payload: p, runId }: Proposal, s: State): string | null {
  const run = s.runs.find((r) => r.id === runId);
  if (p.kind === "sheet_row") {
    if (
      p.previousOrder &&
      JSON.stringify(s.orders.find((o) => o.id === p.order.id)) !==
        JSON.stringify(p.previousOrder)
    )
      return "the original order changed";
    if (run?.manual) {
      const result = checkOrder(
        {
          sourceMessageId: "",
          customer: p.order.customer,
          product: p.order.product,
          quantity: p.order.quantity,
          customization: p.order.customization,
          pickupAt: p.order.pickupAt,
          constraints: [],
        },
        orderContext(s, p.previousOrder),
      );
      if (result.clashes.length)
        return result.clashes.map((c) => c.message).join(" ");
    }
    if (!p.previousOrder && s.orders.some((o) => o.id === p.order.id))
      return `order ${p.order.id} already exists`;
    // A shortfall the agent already flagged comes with a restock reminder; a new one means another order took the stock.
    const flagged =
      s.runs
        .find((r) => r.id === runId)
        ?.report?.clashes.filter((c) => c.kind === "stock")
        .map((c) => c.evidence) ?? [];
    for (const [item, perUnit] of Object.entries(
      s.recipes[p.order.product]?.materials ?? {},
    )) {
      const { stock, free } = freeStock(item, orderContext(s, p.previousOrder)),
        need = materialNeed(perUnit, p.order.quantity, stock?.unit);
      if (!flagged.includes(item) && need > free)
        return `not enough ${item} left (need ${need} ${stock?.unit ?? ""}, ${Math.max(free, 0)} free)`;
    }
  }
  if (p.kind === "calendar_event" && p.slot.kind !== "reminder") {
    const start = Date.parse(p.slot.start),
      end = Date.parse(p.slot.end);
    const replacement = s.proposals.find(
      (x) =>
        x.runId === runId &&
        x.payload.kind === "sheet_row" &&
        x.payload.previousOrder &&
        x.status === "pending_approval",
    );
    const previous =
      replacement?.payload.kind === "sheet_row"
        ? replacement.payload.previousOrder
        : undefined;
    const hit = orderContext(s, previous).calendar.find(
      (c) =>
        c.kind !== "reminder" &&
        Date.parse(c.start) < end &&
        start < Date.parse(c.end),
    );
    if (hit)
      return `calendar changed since the proposal: now overlaps "${hit.title}"`;
  }
  return null;
}

function execute(p: ProposalPayload, proposalId: string, s: State) {
  switch (p.kind) {
    case "sheet_row": {
      if (p.previousOrder) {
        s.orders[s.orders.findIndex((o) => o.id === p.order.id)] = p.order;
        s.calendar = s.calendar.filter(
          (c) => c.orderId !== p.order.id || c.kind === "reminder",
        );
      } else s.orders.push(p.order);
      const msg = s.inbox.find((m) => m.id === p.order.sourceMessageId);
      if (msg) msg.read = true;
      break;
    }
    case "calendar_event":
      s.calendar.push(p.slot);
      break;
    case "customer_reply":
      s.sent.push({
        at: now(),
        to: p.to,
        subject: p.subject,
        body: p.body,
        proposalId,
      });
      break;
    case "checklist":
      break; // stays on the proposal; items are ticked via /api/checklist/toggle
  }
}

function settleRuns(s: State, touched: Proposal[]) {
  for (const runId of new Set(touched.map((p) => p.runId))) {
    const run = s.runs.find((r) => r.id === runId);
    const props = s.proposals.filter((p) => p.runId === runId);
    if (!run || props.some((p) => p.status === "pending_approval")) continue;
    run.status = "done";
    // Nothing written for this order: put its message back so the next check can pick it up again.
    const msg =
      run.kind === "order" && !props.some((p) => p.status === "executed")
        ? s.inbox.find((m) => m.id === run.input)
        : undefined;
    if (msg) msg.read = false;
  }
}

export type Result = {
  id: string;
  ok: boolean;
  status?: Proposal["status"];
  error?: string;
};

function decide(
  s: State,
  ids: string[],
  act: (p: Proposal) => Result,
): Result[] {
  const touched: Proposal[] = [];
  const results = ids.map((id): Result => {
    const p = s.proposals.find((x) => x.id === id);
    if (!p) return { id, ok: false, error: "not found" };
    // Idempotent: a proposal is acted on once; repeats and double-clicks are no-ops.
    if (p.status !== "pending_approval")
      return { id, ok: false, status: p.status, error: `already ${p.status}` };
    touched.push(p);
    const r = act(p);
    s.runs
      .find((x) => x.id === p.runId)
      ?.steps.push({
        at: now(),
        phase: "EXECUTE",
        action: `${p.status}: ${describe(p.payload)}`,
        detail: r.error,
      });
    return r;
  });
  settleRuns(s, touched);
  return results;
}

/** The only code path that applies a proposal's effect. Call inside updateState. */
export const approve = (s: State, ids: string[]) => {
  // A run's changes stand or fall together: no confirmation reply or slot for an order row that was not written,
  // whether it is stale now, failed in an earlier approval, or was rejected.
  for (const run of s.runs.filter((r) => r.manual && r.kind === "order")) {
    const pending = s.proposals.filter(
      (p) => p.runId === run.id && p.status === "pending_approval",
    );
    if (
      pending.some((p) => ids.includes(p.id)) &&
      (pending.some((p) => !ids.includes(p.id)) ||
        s.proposals.some((p) => p.runId === run.id && p.status === "rejected"))
    )
      return ids.map((id) => ({
        id,
        ok: false,
        error:
          "Approve all linked manual order changes together, or reject the whole draft.",
      }));
  }
  ids = [...ids].sort(
    (a, b) =>
      Number(
        s.proposals.find((p) => p.id === b)?.payload.kind === "sheet_row",
      ) -
      Number(s.proposals.find((p) => p.id === a)?.payload.kind === "sheet_row"),
  );
  const needsReview = s.proposals.some(
    (p) =>
      ids.includes(p.id) && p.status === "pending_approval" && p.reviewRequired,
  );
  if (needsReview)
    return ids.map((id) => ({
      id,
      ok: false,
      error:
        "Review and save the customer reply after changing the order before approving.",
    }));
  // A confirmation reply must not promise an order whose required changes are still pending.
  const prematureReply = s.proposals.find((p) => {
    if (
      !ids.includes(p.id) ||
      p.status !== "pending_approval" ||
      p.payload.kind !== "customer_reply"
    )
      return false;
    const core = s.proposals.filter(
      (x) =>
        x.runId === p.runId &&
        (x.payload.kind === "sheet_row" ||
          (x.payload.kind === "calendar_event" &&
            x.payload.slot.kind !== "reminder")),
    );
    return core.some(
      (x) => x.status === "pending_approval" && !ids.includes(x.id),
    );
  });
  if (prematureReply)
    return ids.map((id) => ({
      id,
      ok: false,
      error:
        "Approve the linked order and required calendar slots before its confirmation reply, or approve the whole plan together.",
    }));
  const blocked = new Set(
    s.proposals
      .filter(
        (p) =>
          p.status === "failed" ||
          (p.status === "rejected" && p.payload.kind === "sheet_row") ||
          (ids.includes(p.id) &&
            p.status === "pending_approval" &&
            staleReason(p, s)),
      )
      .map((p) => p.runId),
  );
  return decide(s, ids, (p) => {
    const stale =
      staleReason(p, s) ??
      (blocked.has(p.runId)
        ? "the order row or a time slot in this run was not written"
        : null);
    if (stale) {
      blocked.add(p.runId);
      p.status = "failed";
      s.audit.unshift({
        at: now(),
        actor: "seller",
        action: "approve_failed",
        proposalId: p.id,
        detail: `${describe(p.payload)} — not written: ${stale}`,
      });
      return { id: p.id, ok: false, status: p.status, error: stale };
    }
    execute(p.payload, p.id, s);
    p.status = "executed";
    s.audit.unshift({
      at: now(),
      actor: "seller",
      action: `approved ${p.payload.kind}`,
      proposalId: p.id,
      detail: describe(p.payload),
    });
    return { id: p.id, ok: true, status: p.status };
  });
};

/** Rejecting changes nothing except the proposal's status and the audit log. */
export const reject = (s: State, ids: string[]) =>
  decide(s, ids, (p) => {
    p.status = "rejected";
    s.audit.unshift({
      at: now(),
      actor: "seller",
      action: `rejected ${p.payload.kind}`,
      proposalId: p.id,
      detail: describe(p.payload),
    });
    return { id: p.id, ok: true, status: p.status };
  });
