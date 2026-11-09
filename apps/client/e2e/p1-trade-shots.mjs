// Screenshots of the Trade book's Deals page (playtest item 9; not a spec). Needs the dev server:
//   QOTI_CLIENT_PORT=5191 QOTI_RELAY_PORT=8891 PORT=8891 npm run dev
//   QOTI_CLIENT_PORT=5191 QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/p1-trade-shots.mjs docs/build/screenshots
import { chromium } from '@playwright/test';

const base = `http://localhost:${process.env.QOTI_CLIENT_PORT ?? '5191'}`;
const out = process.argv[2] ?? 'docs/build/screenshots';
const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM || undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`${base}/?debug&clean&quality=low&fixture=village`);
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 180000 });
await page.keyboard.press('Space');
await page.waitForTimeout(2000);
const ui = (n, v) => page.evaluate(([a, b]) => window.__qoti.setUi(a, b), [n, v]);
await ui('tradeTab', 'deals');
await page.evaluate(() => window.__qoti.openPanel('trade'));
await page.waitForTimeout(1200);
await page.getByTestId('trade').screenshot({ path: `${out}/p1-trade-deals.png` });
// One click on a buy and a sell deal.
await page.locator('[data-testid^="deal-toggle-millhaven-"]').first().click();
await page.locator('[data-testid="deal-toggle-millhaven-wheat"]').click();
await page.waitForTimeout(1500);
await page.getByTestId('trade').screenshot({ path: `${out}/p1-trade-deals-on.png` });
await page.getByTestId('trade-orders').click();
await page.waitForTimeout(400);
await page.getByTestId('trade').screenshot({ path: `${out}/p1-trade-orders.png` });
await browser.close();
