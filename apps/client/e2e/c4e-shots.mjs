// C4E screenshot and render-stats script (not a spec). Opens the village fixture live
// (?debug&fixture=village), optionally dresses it with the debug village showcase, and shoots views:
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_CLIENT_PORT=5185 \
//     node apps/client/e2e/c4e-shots.mjs <outDir> <prefix> <shot> [<shot> ...]
// A shot is name=x,z,distance,hour[,turn,tilt] (turn and tilt in radians, relative to the default
// view). Env: QOTI_SHOWCASE=0 skips the showcase, QOTI_DENSE=1 grows it to about 150 buildings,
// QOTI_SYNTH=<n> adds n synthetic residents, QOTI_OVERLAY=<kind> shows an overlay, QOTI_LENS
// sets the lens, QOTI_QUALITY the preset, QOTI_WAIT the settle time per shot in ms.
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5173);
const base = `http://localhost:${clientPort}`;
const [out = 'docs/build/screenshots', prefix = 'c4e', ...shots] = process.argv.slice(2);
const quality = process.env.QOTI_QUALITY ?? 'medium';
const [vw, vh] = (process.env.QOTI_SIZE ?? '1280x800').split('x').map(Number);

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
await page.route('**/api/**', (r) => r.abort());
await page.goto(`${base}/?debug&fixture=village&fixedres&quality=${quality}`);
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 180000 });
for (const name of ['Done', 'Close', 'Later']) {
  const b = page.getByRole('button', { name, exact: true });
  if (await b.count())
    await b
      .first()
      .click()
      .catch(() => {});
}
if (process.env.QOTI_SHOWCASE !== '0') {
  const n = await page.evaluate((d) => window.__qoti.villageShowcase(d), process.env.QOTI_DENSE === '1');
  console.log('showcase', JSON.stringify(n));
}
if (process.env.QOTI_SYNTH)
  await page.evaluate(
    (n) => window.__qoti.synthResidents(n, { center: [64, 60], radius: 30 }),
    Number(process.env.QOTI_SYNTH),
  );
if (process.env.QOTI_LENS) await page.evaluate((l) => window.__qoti.setLens(l), process.env.QOTI_LENS);
if (process.env.QOTI_OVERLAY)
  await page.evaluate((k) => window.__qoti.renderer()?.setOverlay(k), process.env.QOTI_OVERLAY);
if (process.env.QOTI_HUD === '0')
  await page.addStyleTag({
    content: 'body > *:not(canvas):not(#app), .hud, header, footer { visibility: hidden !important; }',
  });
await page.waitForTimeout(Number(process.env.QOTI_SETTLE ?? 8000));

for (const shot of shots) {
  const i = shot.indexOf('=');
  const name = shot.slice(0, i);
  const [x, z, dist, hour, turn = 0, tilt = 0] = shot
    .slice(i + 1)
    .split(',')
    .map(Number);
  await page.evaluate(
    ([x, z, d, h, t, tl]) => {
      window.__qoti.setHour(h);
      window.__qoti.look(x, z, d, t, tl);
    },
    [x, z, dist, hour, turn, tilt],
  );
  await page.waitForTimeout(Number(process.env.QOTI_WAIT ?? 7000));
  const stats = await page.evaluate(() => {
    const r = window.__qoti.renderer();
    const s = window.__qoti.stats();
    const layer = (id) => r?.layers?.find((l) => l.id === id);
    return {
      draws: s?.drawCalls,
      tris: s?.triangles,
      buildings: window.__qoti.counts()?.buildings,
      residents: layer('agents')?.drawn,
      carts: layer('carts')?.drawn,
      animals: layer('animals')?.count,
    };
  });
  console.log(name, JSON.stringify(stats));
  await page.screenshot({ path: `${out}/${prefix}-${name}.png`, timeout: 180000 });
}
await browser.close();
