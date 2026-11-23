// R3X level pole screenshots (from r3h-shots.mjs) (a script, not a spec): every specialized building at levels 1, 2 and 3 side by side
// (the village showcase's `levels` scene: three rows of trios on open ground south of the street, nothing else around), by day and at
// 22:00 (lamplight), 1280 px wide, from the game's default camera angle (yaw 0.5, pitch 45 degrees;
// apps/client/src/input/camera.ts). One sheet per time of day at the default distance, then a close-up
// of each kit's trio. Needs the client dev server (QOTI_CLIENT_PORT, default 5250):
//   QOTI_CLIENT_PORT=5250 QOTI_RELAY_PORT=8859 npm run dev -w @qoti/client
//   node apps/client/e2e/r3h-shots.mjs [outDir]
// Env: QOTI_CHROMIUM (default /opt/pw-browsers/chromium), QOTI_ONLY (a kit id, to shoot one trio, or 'sheet' for the sheets only).
import { chromium } from '@playwright/test';

const port = Number(process.env.QOTI_CLIENT_PORT ?? 5250);
const out = process.argv[2] ?? 'docs/build/screenshots';
const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.route('**/api/**', (r) => r.abort());
await page.goto(
  `http://localhost:${port}/?debug&fixture=village&clean&quality=medium&fixedres&season=summer&day=3`,
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
const placed = await page.evaluate(() => {
  const r = window.__qoti.villageShowcase(false, true);
  window.__qoti.submit({ t: 'time.setSpeed', speed: 0 });
  return r;
});
console.log('placed', placed.buildings, 'buildings');
const rows = placed.levelRows;
await page.addStyleTag({ content: '.game-ui { visibility: hidden !important; }' });

async function shot(name, hour, x, z, dist) {
  await page.evaluate(([h]) => window.__qoti.setHour(h), [hour]);
  await page.evaluate(([a, b, d]) => window.__qoti.look(a, b, d, 0, 0), [x, z, dist]);
  await page.waitForTimeout(10000);
  await page.screenshot({ path: `${out}/r3x-level-pole-${name}.png`, timeout: 240000 });
  console.log(name);
}

const only = process.env.QOTI_ONLY;
const DEFS = ['foresters-lodge', 'quarry', 'fishery', 'brickworks'];
for (const [tag, hour] of [
  ['day', 11],
  ['night', 22],
]) {
  if (only === 'sheet') {
    // The default distance (70): the two rows as a player sees them from the default camera.
    const x0 = Math.min(...rows.map((r) => r.x));
    const x1 = Math.max(...rows.map((r) => r.x + 3 * (r.w + 1) - 1));
    const z0 = Math.min(...rows.map((r) => r.z));
    const z1 = Math.max(...rows.map((r) => r.z + r.d));
    await shot(`sheet-${tag}`, hour, (x0 + x1) / 2, (z0 + z1) / 2, 70);
  }
  for (const r of rows) {
    if (only ? r.def !== only : !DEFS.includes(r.def)) continue;
    const span = 3 * (r.w + 1) - 1;
    const d = process.env.QOTI_CLOSE ? Math.max(14, span * 1.5) : 70; // default distance unless QOTI_CLOSE
    await shot(`${r.def}-${tag}`, hour, r.x + span / 2, r.z + r.d / 2, d);
  }
}
await browser.close();
