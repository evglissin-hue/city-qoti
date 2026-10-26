import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Starts the local relay and the Vite client, then runs the specs in e2e/. Locally, servers
// that are already running (npm run dev) are reused. QOTI_CLIENT_PORT and QOTI_RELAY_PORT move
// both servers so several checkouts can test side by side.
const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5173);
const relayPort = Number(process.env.QOTI_RELAY_PORT ?? 8787);
// QOTI_CHROMIUM points at a preinstalled Chromium when the bundled one is missing (sandboxes).
const executablePath = process.env.QOTI_CHROMIUM || undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${clientPort}`,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        // CI machines have no GPU: WebGL runs on SwiftShader.
        launchOptions: {
          ...(executablePath && { executablePath }),
          args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run start -w @qoti/dev-server',
      url: `http://localhost:${relayPort}/api/health`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(relayPort), DEV_DATA_DIR: join(tmpdir(), `qoti-e2e-devdata-${relayPort}`) },
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @qoti/client',
      url: `http://localhost:${clientPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
