// V3B streets shots (a script, not a spec; v3-shots.mjs with the synthetic streets scene). Opens the
// game on the grown village (?debug&fixture=grown), injects `__qoti.streetsShowcase()` into this
// client's Mirror and shoots four views of it, each by day, golden hour (18:00) and night (22:20),
// at 1440 x 900 with the UI hidden and dynamic resolution off, in the summer clear look.
//   QOTI_CLIENT_PORT=5246 QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v3b-streets-shots.mjs e7 [view ...]
// The stage is a cycle's name (e7 for the showcase's own check); views are block (the Ledger's
// height, 70 tiles), stepped (street level on the 24-home row), corner (a close look at the north
// west corner) and gardens (down into the hollow), all by default.
// Saves docs/build/screenshots/v3b-<stage>-streets-<view>-<shot>.png.
// Env: QOTI_CLIENT_PORT (5230), QOTI_CHROMIUM, QOTI_QUALITY (medium), QOTI_OUT (the screenshots
// folder), QOTI_WAIT (least ms per shot, 8000), QOTI_SETTLE_MAX (240000), QOTI_SIZE (1440x900),
// QOTI_SHOTS (only these shot names, comma separated: day, golden, night).
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5230);
const base = `http://localhost:${clientPort}`;
const [stage = 'e7', ...only] = process.argv.slice(2);
const onlyShots = process.env.QOTI_SHOTS ? process.env.QOTI_SHOTS.split(',') : null;
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const quality = process.env.QOTI_QUALITY ?? 'medium';
const [vw, vh] = (process.env.QOTI_SIZE ?? '1440x900').split('x').map(Number);
const LOOK = 'season=summer&day=3&weather=clear';
const HOURS = [
  { name: 'day', hour: 11 },
  { name: 'golden', hour: 18 },
  { name: 'night', hour: 22.3 },
];

// Each view looks at `at(center, scene)` from `dist`; `yaw` is the absolute camera yaw (radians,
// null keeps the current one) and `pitch` the absolute camera pitch in degrees (30 to 65 in play).
// Offsets are in tiles from the block's center (bx + 7, bz + 5).
const VIEWS = {
  block: { dist: 70, at: () => [0, 0], pitch: 50 },
  stepped: { dist: 16, at: () => [0, 14], pitch: 30, yaw: 0 },
  corner: { dist: 9, at: () => [-6, -4], pitch: 30, yaw: Number(process.env.QOTI_CORNER_YAW ?? 3.9) },
  gardens: { dist: 16, at: () => [0, 0], pitch: 60 },
};

async function settle(page, least) {
  const start = Date.now();
  await page.waitForTimeout(least);
  const counts = [];
  const most = Number(process.env.QOTI_SETTLE_MAX ?? 240000);
  while (Date.now() - start < most) {
    counts.push(
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            let n = 0;
            const step = () =>
              ++n >= 3 ? resolve(window.__qoti.stats()?.triangles ?? 0) : requestAnimationFrame(step);
            requestAnimationFrame(step);
          }),
      ),
    );
    const last = counts.slice(-3);
    if (last.length === 3 && Math.max(...last) - Math.min(...last) <= Math.max(...last) * 0.02) return;
  }
  console.log('  (still streaming after', most / 1000, 's)');
}

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
page.on('framenavigated', (f) => f === page.mainFrame() && console.log('NAV', f.url().slice(0, 90)));
page.on('crash', () => console.log('CRASH'));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
await page.route('**/api/**', (r) => r.abort());
await page.goto(`${base}/?debug&fixture=grown&clean&fixedres&quality=${quality}&${LOOK}`);
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
for (const name of ['Done', 'Close', 'Later']) {
  const b = page.getByRole('button', { name, exact: true });
  if (await b.count())
    await b
      .first()
      .click()
      .catch(() => {});
}
if (process.env.QOTI_HUD !== '1')
  await page.addStyleTag({ content: '.game-ui { display: none !important; }' });
// Pause the sim (space) so the village does not grow new homes into the scene while we shoot.
await page.keyboard.press(' ');
await page.waitForTimeout(1500);
const showcase = await page.evaluate(() => window.__qoti.streetsShowcase());
console.log('streetsShowcase', JSON.stringify(showcase));
const [cx, cz] = showcase.center;

for (const [view, def] of Object.entries(VIEWS)) {
  if (only.length && !only.includes(view)) continue;
  const [ox, oz] = def.at();
  for (const shot of HOURS) {
    if (onlyShots && !onlyShots.includes(shot.name)) continue;
    await page.evaluate(
      ([x, z, d, h, yaw, pitch]) => {
        window.__qoti.setHour(h);
        const look = window.__qoti.renderer().rig.look;
        window.__qoti.look(
          x,
          z,
          d,
          yaw === null ? 0 : yaw - look.yaw,
          (pitch * Math.PI) / 180 - window.__qoti.renderer().rig.view.pitch,
        );
      },
      [cx + ox, cz + oz, def.dist, shot.hour, def.yaw ?? null, def.pitch],
    );
    await settle(page, Number(process.env.QOTI_WAIT ?? 8000));
    const file = `${out}/v3b-${stage}-streets-${view}-${shot.name}.png`;
    await page.screenshot({ path: file, timeout: 240000 });
    console.log(file);
  }
}
await browser.close();
