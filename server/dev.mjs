import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import handler from './app.mjs';

// One origin for the browser and API, including Arena's HTTPS preview proxy.
const server = createServer((request, response) => {
  if (request.url?.startsWith('/api/')) return void handler(request, response);
  vite.middlewares(request, response);
});
const vite = await createViteServer({
  server: { middlewareMode: true, hmr: { server } }, appType: 'spa',
});
const port = Number(process.env.PORT ?? 5173);
server.requestTimeout = 30_000;
server.listen(port, '0.0.0.0', () => console.log(`Orbit website and API listening on 0.0.0.0:${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => { server.close(); void vite.close().then(() => process.exit(0)); });
}
