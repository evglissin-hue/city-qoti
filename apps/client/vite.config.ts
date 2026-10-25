import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const relay = { '/api': { target: 'http://localhost:8787', ws: true, changeOrigin: true } };

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
  server: { port: 5173, strictPort: true, proxy: relay },
  preview: { port: 4173, strictPort: true, proxy: relay },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
  plugins: [versionJson()],
});
