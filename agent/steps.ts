import type { Phase } from '../shared/types.ts';
import { now, updateState } from '../server/store.ts';

/** Append one visible step to a run's activity timeline (the UI polls for these). */
export const step = (runId: string, phase: Phase, action: string, extra: { url?: string; detail?: string } = {}) =>
  updateState((s) => {
    s.runs.find((r) => r.id === runId)?.steps.push({ at: now(), phase, action, ...extra });
  });
