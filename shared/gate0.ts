import type { Gate0Result } from './types.ts';

/** Gate 0 portal check: exact official-host match, lookalike and redirect screening. Implemented in feat/gate0. */
export function gate0(url: string, finalUrl: string = url): Gate0Result {
  throw new Error('gate0: not implemented yet (feat/gate0)');
}
