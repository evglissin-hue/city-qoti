// Entry point for `npm run dev -w @qoti/dev-server`. PORT and DEV_DATA_DIR override the defaults.
import { fileURLToPath } from 'node:url';
import { startDevServer } from './server';

const port = Number(process.env.PORT ?? 8787);
const dataDir = process.env.DEV_DATA_DIR ?? fileURLToPath(new URL('../../../.devdata', import.meta.url));

const server = await startDevServer({ port, dataDir });

async function shutdown(): Promise<void> {
  await server.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
