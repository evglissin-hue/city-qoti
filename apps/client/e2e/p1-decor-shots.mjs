// Screenshot script for playtest round seven's decor (not a spec). Needs the client dev server:
//   QOTI_CLIENT_PORT=5186 QOTI_RELAY_PORT=8886 npm run dev -w @qoti/client
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/p1-decor-shots.mjs docs/build/screenshots
// The decor picker card (a costed piece with its effect), and the Customize panel with flower swatches.
import { chromium } from '@playwright/test';

const port = process.env.QOTI_CLIENT_PORT ?? '5186';
const out = process.argv[2] ?? 'docs/build/screenshots';
const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM || undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.addInitScript(() =>
  localStorage.setItem('qoti.settings.v1', JSON.stringify({ uiScale: 1, reducedMotion: true })),
);
await page.goto(`http://localhost:${port}/?debug&clean&quality=low&fixture=hamlet`);
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 180000 });
await page.keyboard.press('Space');
await page.evaluate(() => window.__qoti.look(60, 60, 40));
await page.waitForTimeout(2000);
await page.evaluate(() => {
  window.__qoti.setLens('hearth');
  window.__qoti.selectTool('decor', 'tool-rack');
});
await page.waitForTimeout(1500);
// The picker scrolls; let it grow so the whole card shows.
await page.evaluate(() => {
  const el = document.querySelector('[data-testid=decor-picker]');
  el.style.maxHeight = 'none';
  el.style.overflow = 'visible';
  el.querySelector('.picker-cards')?.setAttribute('style', 'max-height:none;overflow:visible');
});
await page.waitForTimeout(500);
await page.getByTestId('decor-picker').screenshot({ path: `${out}/p1-decor-picker.png`, timeout: 120000 });
console.log('shot picker');
await page.evaluate(() => window.__qoti.selectTool('decor', 'weathervane'));
await page.waitForTimeout(800);
await page.getByTestId('decor-picker').screenshot({ path: `${out}/p1-decor-picker-weathervane.png` });
await browser.close();
