import type { Proposal, ProposalPayload, State } from '../shared/types.ts';
import { now } from './store.ts';

export const describe = (p: ProposalPayload): string => {
  switch (p.kind) {
    case 'sheet_row': return `Order ${p.order.id}: ${p.order.quantity} × ${p.order.product} for ${p.order.customer}, pickup ${p.order.pickupAt}`;
    case 'calendar_event': return `Calendar: "${p.slot.title}" ${p.slot.start} → ${p.slot.end}`;
    case 'customer_reply': return `Reply to ${p.to}: "${p.subject}"`;
    case 'checklist': return `Checklist "${p.title}" (${p.items.length} items)`;
  }
};

/** Recheck live state just before writing, so a stale proposal never overwrites a newer reality. */
function staleReason(p: ProposalPayload, s: State): string | null {
  if (p.kind === 'sheet_row' && s.orders.some((o) => o.id === p.order.id)) return `order ${p.order.id} already exists`;
  if (p.kind === 'calendar_event' && p.slot.kind !== 'reminder') {
    const start = Date.parse(p.slot.start), end = Date.parse(p.slot.end);
    const hit = s.calendar.find((c) => c.kind !== 'reminder' && Date.parse(c.start) < end && start < Date.parse(c.end));
    if (hit) return `calendar changed since the proposal: now overlaps "${hit.title}"`;
  }
  return null;
}

function execute(p: ProposalPayload, proposalId: string, s: State) {
  switch (p.kind) {
    case 'sheet_row': {
      s.orders.push(p.order);
      const msg = s.inbox.find((m) => m.id === p.order.sourceMessageId);
      if (msg) msg.read = true;
      break;
    }
    case 'calendar_event': s.calendar.push(p.slot); break;
    case 'customer_reply': s.sent.push({ at: now(), to: p.to, subject: p.subject, body: p.body, proposalId }); break;
    case 'checklist': break; // stays on the proposal; items are ticked via /api/checklist/toggle
  }
}

function settleRuns(s: State, touched: Proposal[]) {
  for (const runId of new Set(touched.map((p) => p.runId))) {
    const run = s.runs.find((r) => r.id === runId);
    if (run && !s.proposals.some((p) => p.runId === runId && p.status === 'pending_approval')) run.status = 'done';
  }
}

export type Result = { id: string; ok: boolean; status?: Proposal['status']; error?: string };

function decide(s: State, ids: string[], act: (p: Proposal) => Result): Result[] {
  const touched: Proposal[] = [];
  const results = ids.map((id): Result => {
    const p = s.proposals.find((x) => x.id === id);
    if (!p) return { id, ok: false, error: 'not found' };
    // Idempotent: a proposal is acted on once; repeats and double-clicks are no-ops.
    if (p.status !== 'pending_approval') return { id, ok: false, status: p.status, error: `already ${p.status}` };
    touched.push(p);
    return act(p);
  });
  settleRuns(s, touched);
  return results;
}

/** The only code path that applies a proposal's effect. Call inside updateState. */
export const approve = (s: State, ids: string[]) =>
  decide(s, ids, (p) => {
    const stale = staleReason(p.payload, s);
    if (stale) {
      p.status = 'failed';
      s.audit.unshift({ at: now(), actor: 'seller', action: 'approve_failed', proposalId: p.id, detail: `${describe(p.payload)} — not written: ${stale}` });
      return { id: p.id, ok: false, status: p.status, error: stale };
    }
    execute(p.payload, p.id, s);
    p.status = 'executed';
    s.audit.unshift({ at: now(), actor: 'seller', action: `approved ${p.payload.kind}`, proposalId: p.id, detail: describe(p.payload) });
    return { id: p.id, ok: true, status: p.status };
  });

/** Rejecting changes nothing except the proposal's status and the audit log. */
export const reject = (s: State, ids: string[]) =>
  decide(s, ids, (p) => {
    p.status = 'rejected';
    s.audit.unshift({ at: now(), actor: 'seller', action: `rejected ${p.payload.kind}`, proposalId: p.id, detail: describe(p.payload) });
    return { id: p.id, ok: true, status: p.status };
  });
