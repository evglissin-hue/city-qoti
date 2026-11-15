// V2X: the rest check (a script, not a spec). A static layer that changes on every frame at rest
// keeps the still-frame cache redrawing and, unless it is shadowless, the shadow map too: the idle
// budget is gone and nothing on screen says so. This opens a scene, lets it settle, then counts
// static changes by layer (`__qoti.staticChanges()`) over a quiet spell and fails if any layer
// changed. Run it after a change to a static layer, with the sim held (a running sim builds and
// lights things, which are real changes):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_CLIENT_PORT=5214 node apps/client/e2e/v2-rest.mjs grown medium 22
// Args: scene (grown, town, village or hamlet), quality (medium), hour (11).
// Env: QOTI_SETTLE (ms to settle first, 240000: a software renderer streams a grown village in
// about four minutes; on a laptop seconds), QOTI_QUIET (ms to count over, 40000), QOTI_RUN=1 (keep
// the sim running).
// As built (2026-11-12, V2X's frozen build, SwiftShader): the grown village on Medium at 22:00,
// held, changed nothing in 40 s after a four-minute settle; after a 90 s settle it was still
// streaming (terrain, trees, nature, buildings and the lights that follow them).
import { chromium } from 'playwright';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5173);
const [scene = 'grown', quality = 'medium', hour = '11'] = process.argv.slice(2);
const settleMs = Number(process.env.QOTI_SETTLE ?? 240000);
const quietMs = Number(process.env.QOTI_QUIET ?? 40000);
const fixture = scene === 'grown' || scene === 'hamlet' ? scene : 'village';

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  `http://localhost:${clientPort}/?debug&fixture=${fixture}&clean&fixedres&quality=${quality}&season=summer&day=3&weather=clear`,
);
await page.waitForFunction(() => window.__qoti?.renderer, null, { timeout: 120000 });
for (const name of ['Done', 'Close', 'Later']) {
  const b = page.getByRole('button', { name, exact: true });
  if (await b.count())
    await b
      .first()
      .click()
      .catch(() => {});
}
let center = null;
if (scene === 'town') center = (await page.evaluate(() => window.__qoti.townShowcase())).center;
if (scene === 'village') await page.evaluate(() => window.__qoti.villageShowcase(true));
if (scene === 'grown') center = (await page.evaluate(() => window.__qoti.grownInfo())).center;
if (!center) {
  const [x0, z0, x1, z1] = await page.evaluate(() => window.__qoti.startArea());
  center = [(x0 + x1 + 1) / 2, (z0 + z1 + 1) / 2];
}
if (process.env.QOTI_RUN !== '1')
  await page.evaluate(() => window.__qoti.submit({ t: 'time.setSpeed', speed: 0 }));
await page.evaluate(
  ([x, z, h]) => {
    window.__qoti.setHour(h);
    window.__qoti.look(x, z, 80, 0, 0);
  },
  [center[0], center[1], Number(hour)],
);
await page.waitForTimeout(settleMs);
const before = await page.evaluate(() => window.__qoti.staticChanges());
await page.waitForTimeout(quietMs);
const after = await page.evaluate(() => window.__qoti.staticChanges());
const changed = {};
for (const [k, v] of Object.entries(after)) if (v !== (before[k] ?? 0)) changed[k] = v - (before[k] ?? 0);
console.log(JSON.stringify({ scene, quality, hour, settleMs, quietMs, changed }));
await browser.close();
if (Object.keys(changed).length) {
  console.error(`static layers still changing at rest: ${Object.keys(changed).join(', ')}`);
  process.exit(1);
}
