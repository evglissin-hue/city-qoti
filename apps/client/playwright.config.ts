import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Starts the local relay and the Vite client, then runs the specs in e2e/. Locally, servers
// that are already running (npm run dev) are reused.
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
    baseURL: 'http://localhost:5173',
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
          args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run start -w @qoti/dev-server',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: !process.env.CI,
      env: { DEV_DATA_DIR: join(tmpdir(), 'qoti-e2e-devdata') },
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @qoti/client',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
