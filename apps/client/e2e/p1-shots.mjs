// Screenshot script for the Village chapter and the seed in Settings (P1; not a spec). Needs the dev server:
//   PORT=8889 npm run dev -w @qoti/dev-server  and  QOTI_CLIENT_PORT=5189 QOTI_RELAY_PORT=8889 npm run dev -w @qoti/client
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_CLIENT_PORT=5189 node apps/client/e2e/p1-shots.mjs docs/build/screenshots
import { chromium } from '@playwright/test';

const port = process.env.QOTI_CLIENT_PORT ?? '5189';
const out = process.argv[2] ?? 'docs/build/screenshots';
const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM || undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:${port}/?debug&clean&quality=low&fixture=village&trial=passed`);
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 180000 });
await page.getByTestId('chapter').waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/p1-chapter-card.png` });
console.log('shot p1-chapter-card');
await page.getByTestId('chapter-close').click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/p1-chapter-pill.png`, clip: { x: 0, y: 0, width: 1280, height: 140 } });
console.log('shot p1-chapter-pill');
await page.evaluate(() => window.__qoti.setUi('settingsOpen', true));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/p1-chapter-settings.png` });
console.log('shot p1-chapter-settings');
await page.evaluate(() => {
  window.__qoti.setUi('settingsOpen', false);
  window.__qoti.setUi('chapter', true);
});
await page.getByTestId('chapter-new-valley').click();
await page.getByTestId('fresh-note').waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/p1-chapter-title.png` });
console.log('shot p1-chapter-title');
await browser.close();
