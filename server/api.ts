import seed from '../seed/state.json' with { type: 'json' };
import type { Run, State } from '../shared/types.ts';
import { approve, reject } from './approval.ts';
import { newId, now, readState, updateState } from './store.ts';

export type Reply = { status: number; body: unknown };

const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string');

// Agents live in agent/order.ts and agent/aidscout.ts, each exporting run(runId, input?).
// Locally they run in this process; feat/aws-deploy swaps this for an async Lambda invoke.
let runAgent = async (run: Run) => {
  const file = run.kind === 'order' ? '../agent/order.ts' : '../agent/aidscout.ts'; // variable: these land on other branches
  const mod = await import(file);
  await mod.run(run.id, run.input);
};
export const setRunAgent = (fn: typeof runAgent) => { runAgent = fn; };

// The agent Lambda stops at 120 s; a run silent for 3 minutes died without reaching its catch (timeout or restart).
// Judged on the server clock: shown as failed on read, saved as failed when the next run starts.
const expire = (s: State) => {
  for (const r of s.runs)
    if (r.status === 'running' && !(Date.now() - Date.parse(r.steps.at(-1)?.at ?? r.startedAt ?? '') < 180_000)) {
      r.status = 'failed';
      r.error = 'The agent stopped responding (timed out or restarted)';
    }
  return s;
};

async function startRun(kind: Run['kind'], input?: string): Promise<string> {
  const run: Run = { id: newId('R'), kind, status: 'running', input, startedAt: now(), steps: [], proposalIds: [] };
  await updateState((s) => { expire(s); s.runs.unshift(run); });
  runAgent(run).catch((e: Error) =>
    updateState((s) => {
      const r = s.runs.find((x) => x.id === run.id);
      if (r) { r.status = 'failed'; r.error = e.message; }
      s.audit.unshift({ at: now(), actor: 'agent', action: 'run_failed', detail: `${kind} run ${run.id}: ${e.message}` });
    }),
  );
  return run.id;
}

export async function handle(method: string, path: string, body: any): Promise<Reply> {
  const route = `${method} ${path}`;
  switch (route) {
    case 'GET /api/state':
      return { status: 200, body: expire(await readState()) };
    case 'POST /api/runs':
      if (body?.kind === 'order') return { status: 202, body: { runId: await startRun('order') } };
      if (body?.kind === 'aidscout' && typeof body.input === 'string' && body.input.length < 2048)
        return { status: 202, body: { runId: await startRun('aidscout', body.input) } };
      return { status: 400, body: { error: 'kind must be "order", or "aidscout" with an input URL' } };
    case 'POST /api/proposals/approve':
    case 'POST /api/proposals/reject': {
      if (!isIds(body?.ids)) return { status: 400, body: { error: 'ids must be a non-empty string array' } };
      const fn = path.endsWith('approve') ? approve : reject;
      return { status: 200, body: { results: await updateState((s) => fn(s, body.ids)) } };
    }
    case 'POST /api/checklist/toggle': {
      const ok = await updateState((s) => {
        const p = s.proposals.find((x) => x.id === body?.proposalId);
        const item = p?.payload.kind === 'checklist' ? p.payload.items.find((i) => i.id === body?.itemId) : undefined;
        if (!p || !item) return false;
        item.done = !item.done;
        s.audit.unshift({ at: now(), actor: 'seller', action: item.done ? 'checked' : 'unchecked', proposalId: p.id, detail: item.text, source: item.sourceUrl });
        return true;
      });
      return ok ? { status: 200, body: { ok } } : { status: 404, body: { error: 'checklist item not found' } };
    }
    case 'POST /api/reset':
      await updateState((s) => { Object.assign(s, structuredClone(seed as State), { version: s.version }); });
      return { status: 200, body: { ok: true } };
  }
  return { status: 404, body: { error: `no route ${route}` } };
}
