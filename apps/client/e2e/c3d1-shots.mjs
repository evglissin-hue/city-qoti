// Scratch screenshot script for the C3D-1 world look (not a spec). Needs the relay and the client
// running (see CLAUDE.md), then:
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/c3d1-shots.mjs <outDir> <prefix> [shots]
// Creates a fresh standard valley with a fixed seed through the relay's API, joins it through the
// invite fragment and takes day, dusk, night, close-up and wide shots from the same cameras.
// Prints renderer stats (draw calls, triangles) for each shot.
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5184);
const base = `http://localhost:${clientPort}`;
const out = process.argv[2] ?? 'docs/build/screenshots';
const prefix = process.argv[3] ?? 'c3d1';
const only = process.argv[4] ? process.argv[4].split(',') : null;
const seed = process.env.QOTI_SEED ?? 'storybook-1';
const quality = process.env.QOTI_QUALITY ?? 'medium';

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

const res = await fetch(`${base}/api/valleys`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ seed, settings: { mode: 'standard', townName: 'Qoti' } }),
});
const valley = await res.json();

const shots = [
  // name, hour, camera distance, rotate key presses (ms of E)
  ['day', 10.5, 60, 0],
  ['dusk', 19.2, 60, 0],
  ['night', 22.5, 60, 0],
  ['closeup', 15, 20, 0],
  ['wide', 13, 150, 0],
  ['river', 11, 34, 0],
].filter(([n]) => !only || only.includes(n));

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console:', m.text());
});
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`${base}/?debug&quality=${quality}${valley.invites[0]}`);
await page.getByTestId('join').click();
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 120000 });
// Close the invite or welcome dialog if one is open.
for (const name of ['Done', 'Close']) {
  const b = page.getByRole('button', { name });
  if (await b.count()) await b.first().click().catch(() => {});
}
await page.waitForTimeout(1500);
for (const [name, hour, dist, rot] of shots) {
  await page.evaluate(
    ([h, d]) => {
      window.__qoti.setHour(h);
      window.__qoti.focusStart(d, true);
    },
    [hour, dist],
  );
  if (rot) {
    await page.keyboard.down('e');
    await page.waitForTimeout(rot);
    await page.keyboard.up('e');
  }
  if (name === 'river') {
    await page.evaluate((d) => {
      const w = window.__qoti.nearestWater?.();
      if (w) window.__qoti.look(w[0], w[1], d);
    }, dist);
  }
  await page.waitForTimeout(7000);
  const stats = await page.evaluate(() => window.__qoti.stats());
  console.log(name, JSON.stringify({ draws: stats?.drawCalls, tris: stats?.triangles }));
  await page.screenshot({ path: `${out}/${prefix}-${name}.png`, timeout: 180000 });
}
await page.close();
await browser.close();
