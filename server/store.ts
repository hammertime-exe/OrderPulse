import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import seed from '../seed/state.json' with { type: 'json' };
import type { State } from '../shared/types.ts';

// Locally: one JSON file, re-read on every call so the agent and API share it.
// On AWS (STATE_TABLE set): one DynamoDB item holding the whole state, written with an optimistic version check.
// shortcut: single item caps state at 400 KB and every write costs ~1 WCU per KB; reset the demo between rehearsals, split per collection if it grows
const FILE = 'data/state.json';
const TABLE = process.env.STATE_TABLE;
const db = TABLE ? DynamoDBDocumentClient.from(new DynamoDBClient({})) : null;

async function load(consistent: boolean): Promise<State> {
  if (db) {
    const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: 'state' }, ConsistentRead: consistent }));
    return Item ? JSON.parse(Item.doc) : structuredClone(seed as State);
  }
  if (!existsSync(FILE)) {
    mkdirSync('data', { recursive: true });
    writeFileSync(FILE, JSON.stringify(seed, null, 2));
  }
  return JSON.parse(readFileSync(FILE, 'utf8'));
}

export const readState = () => load(false);

/** Read-modify-write. fn mutates the state in place; its return value is passed back. */
export async function updateState<T>(fn: (s: State) => T): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = await load(true);
    const prev = s.version;
    const out = fn(s);
    s.version = prev + 1;
    if (!db) {
      writeFileSync(FILE, JSON.stringify(s, null, 2));
      return out;
    }
    try {
      await db.send(new PutCommand({
        TableName: TABLE,
        Item: { pk: 'state', version: s.version, doc: JSON.stringify(s) },
        ConditionExpression: 'attribute_not_exists(pk) OR version = :v',
        ExpressionAttributeValues: { ':v': prev },
      }));
      return out;
    } catch (e) {
      if ((e as Error).name !== 'ConditionalCheckFailedException') throw e; // someone else wrote first: re-read and retry
    }
  }
  throw new Error('State is busy, please retry');
}

export const now = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
