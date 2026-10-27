// C4P screenshot script (not a spec). Opens the village fixture live (?debug&fixture=village),
// optionally dresses it with the debug village showcase and the roads scene, and shoots views:
//   QOTI_CLIENT_PORT=5190 node apps/client/e2e/c4p-shots.mjs <outDir> <prefix> <shot> [<shot> ...]
// A shot is name=x,z,distance,hour[,turn,tilt] (turn and tilt in radians, relative to the default
// view). Env: QOTI_SHOWCASE=1 adds the village showcase, QOTI_ROADS=0 skips the roads scene,
// QOTI_FOLK=1 adds the folk scene, QOTI_WAIT the settle time per shot in ms.
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5173);
const base = `http://localhost:${clientPort}`;
const [out = 'docs/build/screenshots', prefix = 'c4p', ...shots] = process.argv.slice(2);
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
if (process.env.QOTI_SHOWCASE === '1') await page.evaluate(() => window.__qoti.villageShowcase(false));
if (process.env.QOTI_ROADS !== '0')
  console.log('roads', JSON.stringify(await page.evaluate(() => window.__qoti.roadsShowcase?.())));
if (process.env.QOTI_FOLK === '1')
  console.log('folk', JSON.stringify(await page.evaluate(() => window.__qoti.folkShowcase?.())));
await page.addStyleTag({
  content: '.game > *:not(.viewport) { visibility: hidden !important; }',
});
await page.waitForTimeout(Number(process.env.QOTI_SETTLE ?? 6000));

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
  await page.waitForTimeout(Number(process.env.QOTI_WAIT ?? 5000));
  const stats = await page.evaluate(() => {
    const s = window.__qoti.stats();
    return { draws: s?.drawCalls, tris: s?.triangles };
  });
  await page.screenshot({ path: `${out}/${prefix}-${name}.png` });
  console.log(name, JSON.stringify(stats));
}
await browser.close();
