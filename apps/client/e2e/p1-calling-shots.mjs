// Screenshots of the Calling card, the goal pill and the Charter board's line (P1, playtest item 19;
// not a spec). Needs the client dev server and its relay:
//   PORT=8890 npm run dev -w @qoti/dev-server
//   QOTI_CLIENT_PORT=5190 QOTI_RELAY_PORT=8890 npm run dev -w @qoti/client
//   QOTI_CLIENT_PORT=5190 QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/p1-calling-shots.mjs docs/build/screenshots
// ?calling=offer (solo valley), =together (two seats, the partner away) and =chosen are debug
// switches of the village fixture (apps/client/src/app/fixture.ts).
import { chromium } from '@playwright/test';

const port = process.env.QOTI_CLIENT_PORT ?? '5190';
const out = process.argv[2] ?? 'docs/build/screenshots';
const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM || undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

async function open(mode) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.addInitScript(() =>
    localStorage.setItem('qoti.settings.v1', JSON.stringify({ uiScale: 1, reducedMotion: true })),
  );
  await page.goto(`http://localhost:${port}/?debug&clean&quality=low&fixture=village&calling=${mode}`);
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 180000 });
  await page.evaluate(() => window.__qoti.look(60, 60, 40));
  await page.waitForTimeout(2500);
  return page;
}

// The goal pill while the County's question is open, then the card it opens.
let page = await open('offer');
await page.screenshot({ path: `${out}/p1-calling-pill.png`, clip: { x: 0, y: 0, width: 1280, height: 120 } });
await page.getByTestId('goal-pill').click();
await page.waitForSelector('[data-testid="calling-card"]');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/p1-calling-card.png` });
await page.close();

// Two seats, the partner away: Choose waits for both.
page = await open('together');
await page.getByTestId('goal-pill').click();
await page.waitForSelector('[data-testid="calling-card"]');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/p1-calling-together.png` });
await page.close();

// After the choice the Charter board names the calling.
page = await open('chosen');
await page.keyboard.press('h');
await page.waitForSelector('[data-testid="charter-calling"]');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/p1-calling-charter.png` });
await page.close();

await browser.close();
