import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { handler } from './server/workshop.mjs';
import { localStore } from './server/local-store.mjs';
import { quoteApi, appointmentsApi } from './server/customer-api.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  plugins: [react(), {
    name: 'workshop-local-api',
    configureServer(server) {
      const store = localStore(root + '.local-data');
      const routes = {
        '/api/workshop': handler(store),
        '/api/quote': quoteApi(store),
        '/api/appointments': appointmentsApi(store),
      };
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const run = routes[url.pathname];
        if (!run) return next();
        try {
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 10000) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large.' }));
              return;
            }
            chunks.push(chunk);
          }
          const response = await run(new Request(url, {
            method: req.method,
            headers: req.headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
          }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) {
          console.error(error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Local server error.' }));
        }
      });
    },
  }],
  resolve: { alias: { '@': root + 'src' } },
});
