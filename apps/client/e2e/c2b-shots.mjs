// Scratch screenshot script (not a spec): node apps/client/e2e/c2b-shots.mjs
import { chromium } from '@playwright/test';
const base = 'http://localhost:5193';
const out = process.argv[2];
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
async function shot(hour, name, setup) {
  const page = await browser.newPage({ viewport: { width: 760, height: 480 } });
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(`${base}/?debug&quality=low&hour=${hour}`);
  await page.getByTestId('new-solo').click();
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 90000 });
  await page.evaluate(() => {
    const q = window.__qoti;
    for (const def of ['house', 'cottage', 'well', 'shed', 'cottage', 'house']) {
      const s = q.findBuildingSpot(def, 0);
      if (s) q.submit({ t: 'build.place', def, x: s.x, z: s.z, rot: 0 });
    }
    for (const def of ['lantern', 'bench', 'lantern', 'bench', 'lantern', 'barrels']) {
      const s = q.findDecorSpot(def);
      if (s) q.submit({ t: 'decor.place', def, fx: s.fx, fz: s.fz, rot: 0 });
    }
    const run = q.findRoadRun(10);
    if (run) q.submit({ t: 'road.paint', kind: 'path', tiles: run });
  });
  await page.waitForTimeout(2500);
  for (const [n, fn] of setup) {
    if (fn)
      (await page.keyboard.down(fn[0]), await page.waitForTimeout(fn[1]), await page.keyboard.up(fn[0]));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/c2b-render-${name}-${n}.png`, timeout: 120000 });
  }
  await page.close();
}

await shot(19.5, 'dusk', [['wide', null]]);
await browser.close();
