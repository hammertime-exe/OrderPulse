import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { State } from '../shared/types.ts';

// Local store: one JSON file, re-read on every call so the agent and API share it.
// feat/aws-deploy swaps this for DynamoDB when STATE_TABLE is set.
const FILE = 'data/state.json';
const SEED = new URL('../seed/state.json', import.meta.url);

export async function readState(): Promise<State> {
  if (!existsSync(FILE)) {
    mkdirSync('data', { recursive: true });
    writeFileSync(FILE, readFileSync(SEED));
  }
  return JSON.parse(readFileSync(FILE, 'utf8'));
}

/** Read-modify-write. fn mutates the state in place; its return value is passed back. */
export async function updateState<T>(fn: (s: State) => T): Promise<T> {
  const s = await readState();
  const out = fn(s);
  s.version++;
  writeFileSync(FILE, JSON.stringify(s, null, 2));
  return out;
}

export const now = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
