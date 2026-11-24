import { run as runAidScout } from '../agent/aidscout.ts';
import { run as runOrder } from '../agent/order.ts';
import { now, updateState } from './store.ts';

// Agent Lambda, invoked asynchronously by the API Lambda. Writes its steps to DynamoDB; the UI polls for them.
export async function agent(e: { runId: string; kind: 'order' | 'aidscout'; input?: string }) {
  try {
    if (e.kind === 'order') await runOrder(e.runId);
    else await runAidScout(e.runId, e.input ?? '');
  } catch (err) {
    // Same failure handling as the local in-process path in api.ts
    await updateState((s) => {
      const r = s.runs.find((x) => x.id === e.runId);
      if (r) { r.status = 'failed'; r.error = (err as Error).message; }
      s.audit.unshift({ at: now(), actor: 'agent', action: 'run_failed', detail: `${e.kind} run ${e.runId}: ${(err as Error).message}` });
    });
  }
}
