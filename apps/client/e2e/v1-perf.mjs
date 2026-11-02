// V1 perf table (V1.0; a script, not a spec). For each scene and quality preset: a 10 s scripted
// camera path (pan, orbit, zoom in and out) and a 10 s rest with residents walking, reporting
// average and 95th percentile frame ms and GPU ms, moving and idle, as a Markdown table. Needs the
// client dev server (`npm run dev`; QOTI_CLIENT_PORT for another port):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v1-perf.mjs [scene ...]
// Scenes are hamlet, village (the village of 130) and town (1,000 buildings and 2,000 residents).
// Headless Chromium draws in software, so only its draws and triangles mean anything: run it with
// QOTI_HEADED=1 on a laptop (or paste `await __qoti.perf()` into the console of a `?debug` valley)
// for timings. Env: QOTI_PRESETS (low,medium,high,ultra), QOTI_MOVE and QOTI_REST (seconds, 10),
// QOTI_SIZE (1440x900), QOTI_SETTLE (ms after a scene loads, 12000).
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5173);
const base = `http://localhost:${clientPort}`;
const only = process.argv.slice(2);
const [vw, vh] = (process.env.QOTI_SIZE ?? '1440x900').split('x').map(Number);
const move = Number(process.env.QOTI_MOVE ?? 10);
const rest = Number(process.env.QOTI_REST ?? 10);
const headed = process.env.QOTI_HEADED === '1';

const SCENES = {
  hamlet: { fixture: 'hamlet' },
  village: { fixture: 'village', setup: 'village', center: [64, 60], dist: 70 },
  town: { fixture: 'village', setup: 'town', dist: 90 },
};

const browser = await chromium.launch({
  headless: !headed,
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: headed
    ? ['--ignore-gpu-blocklist']
    : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const tables = [];
for (const [scene, def] of Object.entries(SCENES)) {
  if (only.length && !only.includes(scene)) continue;
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(`${base}/?debug&fixture=${def.fixture}&clean&quality=medium`);
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
  for (const name of ['Done', 'Close', 'Later']) {
    const b = page.getByRole('button', { name, exact: true });
    if (await b.count())
      await b
        .first()
        .click()
        .catch(() => {});
  }
  let center = def.center;
  if (def.setup === 'village') await page.evaluate(() => window.__qoti.villageShowcase(true));
  else if (def.setup === 'town') center = (await page.evaluate(() => window.__qoti.townShowcase())).center;
  else await page.evaluate(() => window.__qoti.synthResidents(60));
  if (!center) {
    const [x0, z0, x1, z1] = await page.evaluate(() => window.__qoti.startArea());
    center = [(x0 + x1 + 1) / 2, (z0 + z1 + 1) / 2];
  }
  await page.evaluate(([x, z, d]) => window.__qoti.look(x, z, d), [center[0], center[1], def.dist ?? 45]);
  await page.waitForTimeout(Number(process.env.QOTI_SETTLE ?? 12000));
  const presets = process.env.QOTI_PRESETS?.split(',');
  const r = await page.evaluate((o) => window.__qoti.perf(o), {
    scene,
    move,
    rest,
    ...(presets ? { presets } : {}),
  });
  console.log(`\n${scene}:\n${r.table}`);
  tables.push(r.table);
  await page.close();
}
await browser.close();

// One table for all scenes: the header once, then every scene's rows.
const lines = tables.flatMap((t, i) => t.split('\n').slice(i === 0 ? 0 : 2));
console.log(
  `\n${headed ? 'headed' : 'headless (software renderer)'}, ${vw} x ${vh}, ${move} s moving, ${rest} s idle:\n`,
);
console.log(lines.join('\n'));
