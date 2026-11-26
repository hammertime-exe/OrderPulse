import { createServer } from 'node:http';
import { handle, type Reply } from './api.ts';

// Local API on :8787; Vite proxies /api here.
createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const url = new URL(req.url ?? '/', 'http://x');
  let reply: Reply;
  try {
    reply = await handle(req.method ?? 'GET', url.pathname, raw ? JSON.parse(raw) : undefined, {
      cookie: req.headers.cookie,
      query: url.searchParams,
      origin: new URL(process.env.APP_URL ?? 'http://localhost:5173').origin, // the browser's origin; Vite rewrites Host to :8787
    });
  } catch (e) {
    reply = { status: e instanceof SyntaxError ? 400 : 500, body: { error: (e as Error).message } };
  }
  res.writeHead(reply.status, { 'content-type': 'application/json', ...reply.headers, ...(reply.cookies?.length ? { 'set-cookie': reply.cookies } : {}) })
    .end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body));
}).listen(8787, () => console.log('API on http://localhost:8787'));
