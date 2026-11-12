// R1E screenshots and draw counts (a script, not a spec): the village of 130 (the C4E showcase,
// which since R1X builds R1's businesses and specialized buildings itself, every business with a
// trade, a level and a keeper), shot from the Ledger's height and close up, by day and at dusk. Needs the client dev
// server (QOTI_CLIENT_PORT, default 5225):
//   node apps/client/e2e/r1e-shots.mjs [outDir] [prefix]
// Env: QOTI_CHROMIUM (default /opt/pw-browsers/chromium), QOTI_QUERY (more URL params; default season=summer&day=3), QOTI_SHOTS=0 (counts only). Ends with the village view's perf table on Medium.
import { chromium } from '@playwright/test';

const port = Number(process.env.QOTI_CLIENT_PORT ?? 5225);
const out = process.argv[2] ?? 'docs/build/screenshots';
const prefix = process.argv[3] ?? 'r1e';
const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.route('**/api/**', (r) => r.abort());
await page.goto(
  `http://localhost:${port}/?debug&fixture=village&clean&quality=medium&fixedres&${process.env.QOTI_QUERY ?? 'season=summer&day=3'}`,
);
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
for (const name of ['Done', 'Close', 'Later']) {
  const b = page.getByRole('button', { name, exact: true });
  if (await b.count())
    await b
      .first()
      .click()
      .catch(() => {});
}
await page.evaluate(() => {
  window.__qoti.villageShowcase(true);
  window.__qoti.submit({ t: 'time.setSpeed', speed: 0 });
});

async function settle() {
  await page.waitForTimeout(8000);
}

async function shot(name, hour, x, z, dist, turn = 0, tilt = 0) {
  await page.evaluate(([h]) => window.__qoti.setHour(h), [hour]);
  await page.evaluate(([a, b, d, t, l]) => window.__qoti.look(a, b, d, t, l), [x, z, dist, turn, tilt]);
  await settle();
  const st = await page.evaluate(() => {
    const s = window.__qoti.stats();
    return s ? { draws: s.drawCalls, triangles: s.triangles } : null;
  });
  if (process.env.QOTI_SHOTS !== '0')
    await page.screenshot({ path: `${out}/${prefix}-${name}.png`, timeout: 240000 });
  console.log(`${name}: ${JSON.stringify(st)}`);
}

// The Ledger's height over the town (the perf script's village view), then the street and the farms.
await shot('town-day', 11, 64, 62, 70);
await shot('town-dusk', 19.5, 64, 62, 70);
// Close up: the farms on the farm lane (west and east), the crafts on the lower lane, and the
// Granary and Brickworks on the street.
for (const [name, x, z, d, turn] of [
  ['farms-west', 42, 40, 22, 0],
  ['farms-east', 77, 40, 22, 0],
  ['crafts', 80, 86, 20, 0],
  ['specialized', 86, 63, 16, 0.3],
]) {
  await shot(`${name}-day`, 11, x, z, d, turn);
  await shot(`${name}-dusk`, 19.5, x, z, d, turn);
}
// The village view's moving frames on Medium (the perf script's table), for the budget check.
await page.evaluate(([x, z]) => window.__qoti.look(x, z, 70), [64, 60]);
await page.evaluate(() => window.__qoti.setHour(11));
await settle();
const layers = await page.evaluate(() => window.__qoti.layerTriangles());
console.log('layers:', JSON.stringify(layers));
const perf = await page.evaluate(() =>
  window.__qoti.perf({ scene: 'village', move: 6, rest: 4, presets: ['medium'] }),
);
console.log(perf?.table ?? 'no perf');
await browser.close();
