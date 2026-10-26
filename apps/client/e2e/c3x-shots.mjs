// Scratch screenshot script for C3X (not a spec): opens a .qoti valley grown by the autoplayer
// (tools/bench, see export) as a solo valley through the title screen's "Open a valley file", lets
// the residents walk, and shoots the integrated hamlet. Needs the client dev server (npm run dev):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/c3x-shots.mjs <file.qoti> <outDir> [prefix]
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5173);
const base = `http://localhost:${clientPort}`;
const file = process.argv[2];
const out = process.argv[3] ?? 'docs/build/screenshots';
const prefix = process.argv[4] ?? 'c3x';
const quality = process.env.QOTI_QUALITY ?? 'medium';

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
await page.goto(`${base}/?debug&quality=${quality}`);
await page.locator('summary', { hasText: 'More' }).click();
await page.getByTestId('open-file').setInputFiles(file);
await page.getByTestId('open-imported-solo').click();
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 120000 });
for (const name of ['Done', 'Close']) {
  const b = page.getByRole('button', { name, exact: true });
  if (await b.count())
    await b
      .first()
      .click()
      .catch(() => {});
}
await page.waitForTimeout(30000);

const shots = (process.env.QOTI_SHOTS ?? 'wide,town,close,dusk,night').split(',');
const cams = {
  wide: [10.5, 70],
  town: [11, 34],
  close: [15.2, 16],
  dusk: [19.3, 30],
  evening: [17.6, 22],
  street: [17.4, 11],
  night: [22.3, 30],
};
for (const name of shots) {
  const [hour, dist] = cams[name];
  await page.evaluate(
    ([h, d]) => {
      window.__qoti.setHour(h);
      window.__qoti.focusStart(d, true);
    },
    [hour, dist],
  );
  await page.waitForTimeout(9000);
  const stats = await page.evaluate(() => window.__qoti.stats());
  console.log(name, JSON.stringify({ draws: stats?.drawCalls, tris: stats?.triangles }));
  await page.screenshot({ path: `${out}/${prefix}-${name}.png`, timeout: 180000 });
}
await browser.close();
