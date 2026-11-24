import type { ClashReport, OrderRequest, State } from './types.ts';

/** Rule-based clash check: calendar overlap, working hours, stock shortfall, missing fields. Implemented in feat/clash-engine. */
export function checkOrder(req: OrderRequest, state: Pick<State, 'orders' | 'stock' | 'recipes' | 'calendar'>): ClashReport {
  throw new Error('checkOrder: not implemented yet (feat/clash-engine)');
}
