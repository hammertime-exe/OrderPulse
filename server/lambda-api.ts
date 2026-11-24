import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { handle, setRunAgent } from './api.ts';

// API Lambda behind a Function URL: JSON API under /api/, the built dashboard and mock sites for everything else.
const lambda = new LambdaClient({});
setRunAgent(async (run) => {
  await lambda.send(new InvokeCommand({
    FunctionName: process.env.AGENT_FUNCTION,
    InvocationType: 'Event', // fire and forget; the UI polls state for steps
    Payload: JSON.stringify({ runId: run.id, kind: run.kind, input: run.input }),
  }));
});

type UrlEvent = { rawPath: string; body?: string; isBase64Encoded?: boolean; requestContext: { http: { method: string } } };
type UrlResult = { statusCode: number; headers: Record<string, string>; body: string; isBase64Encoded?: boolean };

const WEB = new URL('./web/', import.meta.url);
const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', json: 'application/json', png: 'image/png', ico: 'image/x-icon' };
const TEXT = new Set(['html', 'js', 'css', 'svg', 'json']);

export async function api(event: UrlEvent): Promise<UrlResult> {
  const path = event.rawPath;
  if (path.startsWith('/api/')) {
    let body: unknown;
    try {
      body = event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body) : undefined;
    } catch {
      return { statusCode: 400, headers: { 'content-type': 'application/json' }, body: '{"error":"invalid JSON"}' };
    }
    const r = await handle(event.requestContext.http.method, path, body).catch((e: Error) => ({ status: 500, body: { error: e.message } }));
    return { statusCode: r.status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(r.body) };
  }

  const file = new URL(path === '/' ? 'index.html' : path.slice(1), WEB);
  if (!file.href.startsWith(WEB.href) || !existsSync(fileURLToPath(file))) return { statusCode: 404, headers: { 'content-type': 'text/plain' }, body: 'Not found' };
  const ext = file.pathname.split('.').pop() ?? '';
  const buf = readFileSync(fileURLToPath(file));
  const text = TEXT.has(ext);
  return { statusCode: 200, headers: { 'content-type': TYPES[ext] ?? 'application/octet-stream' }, body: text ? buf.toString() : buf.toString('base64'), isBase64Encoded: !text };
}
