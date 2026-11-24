import { createServer } from 'node:http';
import { handle, type Reply } from './api.ts';

// Local API on :8787; Vite proxies /api here.
createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let reply: Reply;
  try {
    reply = await handle(req.method ?? 'GET', new URL(req.url ?? '/', 'http://x').pathname, raw ? JSON.parse(raw) : undefined);
  } catch (e) {
    reply = { status: e instanceof SyntaxError ? 400 : 500, body: { error: (e as Error).message } };
  }
  res.writeHead(reply.status, { 'content-type': 'application/json' }).end(JSON.stringify(reply.body));
}).listen(8787, () => console.log('API on http://localhost:8787'));
