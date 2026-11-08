import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

// QOTI_CLIENT_PORT and QOTI_RELAY_PORT let several checkouts run side by side.
const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5173);
const relayPort = Number(process.env.QOTI_RELAY_PORT ?? 8787);
const relay = {
  '/api': { target: `http://localhost:${relayPort}`, ws: true, changeOrigin: true },
};

/** Emits /version.json ({ simVersion, build }) next to the client build, for update checks. */
function versionJson(): Plugin {
  return {
    name: 'qoti-version-json',
    generateBundle() {
      const source = readFileSync(
        fileURLToPath(new URL('../../packages/sim/src/version.generated.ts', import.meta.url)),
        'utf8',
      );
      const simVersion = /SIM_VERSION = '([0-9a-f]+)'/.exec(source)?.[1] ?? 'unknown';
      const build = new Date().toISOString();
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ simVersion, build }),
      });
    },
  };
}

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  // host: true lets a second laptop on the same network join during development.
  server: { port: clientPort, strictPort: true, host: true, proxy: relay },
  preview: { port: 4173, strictPort: true, proxy: relay },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
  plugins: [versionJson()],
});
