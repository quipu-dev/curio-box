/// <reference types="vitest" />
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { type Plugin, defineConfig } from 'vite';

function curioAssetProxyPlugin(): Plugin {
  return {
    name: 'curio-asset-proxy-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/__curio_proxy__')) {
          const parsed = new URL(req.url, 'http://localhost');
          const targetUrl = parsed.searchParams.get('url');
          if (!targetUrl) {
            res.statusCode = 400;
            return res.end('Missing url parameter');
          }

          try {
            const remoteRes = await fetch(targetUrl, { redirect: 'follow' });
            res.writeHead(remoteRes.status, {
              'Content-Type': remoteRes.headers.get('content-type') || 'application/javascript',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=86400',
            });
            const buffer = Buffer.from(await remoteRes.arrayBuffer());
            return res.end(buffer);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            res.statusCode = 502;
            return res.end(`Proxy Error: ${msg}`);
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [react(), curioAssetProxyPlugin()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
