import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import handler from './app.mjs';
import { createInfrastructureFromEnv } from './infrastructure.mjs';
import { applyHeaders, pageSecurityHeaders } from './security-headers.mjs';

// Initialize infrastructure on startup
let infrastructureInitialized = false;
async function initializeInfrastructure() {
  if (infrastructureInitialized) return;
  
  try {
    const infrastructure = createInfrastructureFromEnv();
    await infrastructure.initialize();
    console.log('[Infrastructure] Initialized successfully');
    
    // Log health status
    const health = infrastructure.getHealthStatus();
    console.log('[Infrastructure] Health:', JSON.stringify(health, null, 2));
    
    infrastructureInitialized = true;
  } catch (error) {
    console.error('[Infrastructure] Initialization failed:', error.message);
    // Don't throw - allow app to start in degraded mode
  }
}

// Initialize infrastructure
initializeInfrastructure();

// One origin for the browser and API, including Arena's HTTPS preview proxy.
// The policy is reported rather than enforced locally: the Vite dev server
// injects the React Fast Refresh preamble as an inline module script, which a
// strict script-src would block. `vite preview` and the Vercel deployment
// (vercel.json) enforce the same policy.
const pageHeaders = pageSecurityHeaders({ enforceCsp: false });

const server = createServer((request, response) => {
  if (request.url?.startsWith('/api/')) return void handler(request, response);
  applyHeaders(response, pageHeaders);
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