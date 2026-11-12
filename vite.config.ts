import { defineConfig, type Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { handlePair } from './server/pair.js';

/** The phone hand-off relay, mounted on the dev server too. */
const pair: Plugin = {
  name: 'pair-relay',
  configureServer(server) {
    server.middlewares.use((req, res, next) => { if (!handlePair(req, res)) next(); });
  },
};

export default defineConfig({
  // `npm run dev:https`: phones only allow the camera on https pages (or localhost).
  plugins: [pair, ...(process.env.HTTPS ? [basicSsl()] : [])],
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  worker: { format: 'es' },
});
