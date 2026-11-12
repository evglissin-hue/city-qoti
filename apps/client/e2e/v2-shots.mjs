// V2 before and after shots (V2.0; a script, not a spec; v1-shots.mjs with V2's scenes). The same
// scenes and cameras for every V2 PR, at 1440 x 900 with the UI hidden and dynamic resolution off,
// each by day, golden hour and night (night matters most in V2). Needs the client dev server
// (`npm run dev`; QOTI_CLIENT_PORT for another port):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v2-shots.mjs before [scene ...]
// The stage is `before` (V2.0), `after` (V2X) or a track's name; scenes are hamlet, village, town,
// winter and grown (the village the bench's autoplayer grew, ?debug&fixture=grown; all by default).
// Saves docs/build/screenshots/v2-<stage>-<scene>-<shot>.png and prints draw calls, triangles,
// frame ms and GPU ms for each shot, then the lot as a Markdown table.
// Each shot waits until the scene has finished streaming in (the triangle count holds within 2%
// over three looks, three drawn frames apart), so a slow software renderer and a laptop see the
// same scene.
// Env: QOTI_QUALITY (medium), QOTI_OUT (the screenshots folder), QOTI_WAIT (least ms per shot,
// 8000), QOTI_SETTLE_MAX (most ms to wait for a scene to settle, 240000), QOTI_SIZE (1440x900),
// QOTI_HUD=1 keeps the interface, QOTI_LAYERS=1 also prints triangles per render layer (slow).
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5173);
const base = `http://localhost:${clientPort}`;
const [stage = 'before', ...only] = process.argv.slice(2);
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const quality = process.env.QOTI_QUALITY ?? 'medium';
const [vw, vh] = (process.env.QOTI_SIZE ?? '1440x900').split('x').map(Number);

// A shot looks at `at` (tiles; default the scene's center) from `dist` at `hour`. `tilt` (radians,
// negative is lower) only on a scene's last shot, since the camera keeps it.
// Town shots take `at` as an offset from the town's center; the others as absolute tiles. The
// grown village's center is the middle of its buildings, and `street: true` looks at its high
// street instead (both from `__qoti.grownInfo()`).
// V2.0: every scene pins its season's look and clear weather (`look`, the renderer's debug
// override; the sim is untouched). The hour is pinned per shot, but the season blend follows the
// sim's clock: the hamlet fixture starts on the first morning of spring, mid-thaw, so unpinned its
// day shot was snowy and its night shot green, and the grown village starts an hour before autumn.
const SUMMER = 'season=summer&day=3&weather=clear';
const SCENES = {
  hamlet: {
    fixture: 'hamlet',
    look: SUMMER,
    shots: [
      { name: 'day', hour: 11, dist: 60 },
      { name: 'golden', hour: 18, dist: 30 },
      { name: 'night', hour: 22.3, dist: 30 },
      { name: 'close', hour: 11, dist: 18 },
    ],
  },
  // The village of 130: the village fixture dressed by the dense village showcase.
  village: {
    fixture: 'village',
    look: SUMMER,
    setup: 'village',
    center: [64, 60],
    shots: [
      { name: 'wide', hour: 11, dist: 110 },
      { name: 'golden', hour: 18, dist: 45 },
      { name: 'night', hour: 22.3, dist: 45 },
      { name: 'street', hour: 15, dist: 20, at: [58, 60], tilt: -0.22 },
    ],
  },
  // About 1,000 buildings, 6,000 decor and trees and 2,000 synthetic residents.
  town: {
    fixture: 'village',
    look: SUMMER,
    setup: 'town',
    shots: [
      { name: 'wide', hour: 11, dist: 170 },
      { name: 'golden', hour: 18, dist: 60 },
      { name: 'night', hour: 22.3, dist: 60 },
      { name: 'street', hour: 15, dist: 22, at: [5, 0], tilt: -0.22 },
    ],
  },
  winter: {
    fixture: 'winter',
    look: 'season=winter&day=3&weather=clear',
    shots: [
      { name: 'day', hour: 11, dist: 80 },
      { name: 'night', hour: 22.3, dist: 45 },
    ],
  },
  // V2.0: the grown village (about 150 residents at Village rank, as the autoplayer left it).
  grown: {
    fixture: 'grown',
    look: SUMMER,
    setup: 'grown',
    shots: [
      { name: 'wide', hour: 11, dist: 110 },
      { name: 'golden', hour: 18, dist: 50 },
      { name: 'night', hour: 22.3, dist: 50 },
      { name: 'street', hour: 15, dist: 22, street: true, tilt: -0.22 },
    ],
  },
};

/**
 * Waits at least `least` ms, then until the triangle count holds within 2% over three looks, each
 * three drawn frames apart (a software renderer can take seconds a frame).
 */
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
const rows = [];
for (const [scene, def] of Object.entries(SCENES)) {
  if (only.length && !only.includes(scene)) continue;
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(`${base}/?debug&fixture=${def.fixture}&clean&fixedres&quality=${quality}&${def.look}`);
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
  for (const name of ['Done', 'Close', 'Later']) {
    const b = page.getByRole('button', { name, exact: true });
    if (await b.count())
      await b
        .first()
        .click()
        .catch(() => {});
  }
  // The look alone: the interface (clock, news, toolbar) changes from run to run.
  if (process.env.QOTI_HUD !== '1')
    await page.addStyleTag({ content: '.game-ui { display: none !important; }' });
  let center = def.center;
  if (def.setup === 'village') {
    const r = await page.evaluate(() => window.__qoti.villageShowcase(true));
    console.log(scene, 'showcase', JSON.stringify(r));
  } else if (def.setup === 'town') {
    const r = await page.evaluate(() => window.__qoti.townShowcase());
    console.log(scene, 'showcase', JSON.stringify(r));
    center = r.center;
  }
  let street = null;
  if (def.setup === 'grown') {
    const r = await page.evaluate(() => window.__qoti.grownInfo());
    console.log(scene, 'grown', JSON.stringify(r));
    center = r.center;
    street = r.street;
  }
  if (!center) {
    const [x0, z0, x1, z1] = await page.evaluate(() => window.__qoti.startArea());
    center = [(x0 + x1 + 1) / 2, (z0 + z1 + 1) / 2];
  }
  for (const shot of def.shots) {
    const at =
      shot.street && street
        ? street
        : shot.at
          ? def.setup === 'town'
            ? [center[0] + shot.at[0], center[1] + shot.at[1]]
            : shot.at
          : center;
    await page.evaluate(
      ([x, z, d, h, tilt]) => {
        window.__qoti.setHour(h);
        window.__qoti.look(x, z, d, 0, tilt);
      },
      [at[0], at[1], shot.dist, shot.hour, shot.tilt ?? 0],
    );
    await settle(page, Number(process.env.QOTI_WAIT ?? 8000));
    const s = await page.evaluate(() => {
      const st = window.__qoti.stats();
      return {
        draws: st?.drawCalls ?? 0,
        tris: st?.triangles ?? 0,
        frameMs: st?.frameMs ?? 0,
        gpuMs: typeof st?.gpuMs === 'number' ? st.gpuMs : null,
      };
    });
    const file = `${out}/v2-${stage}-${scene}-${shot.name}.png`;
    await page.screenshot({ path: file, timeout: 240000 });
    const row = { scene, shot: shot.name, ...s };
    rows.push(row);
    console.log(file, JSON.stringify(row));
    if (process.env.QOTI_LAYERS === '1')
      console.log('  layers', JSON.stringify(await page.evaluate(() => window.__qoti.layerTriangles?.())));
  }
  await page.close();
}
await browser.close();

const ms = (v) => (v === null ? 'n/a' : v.toFixed(1));
console.log(`\n${quality}, ${vw} x ${vh}, ${stage}:\n`);
console.log('| Scene | Shot | Draws | Triangles | Frame ms (CPU) | GPU ms |');
console.log('|---|---|---|---|---|---|');
for (const r of rows)
  console.log(
    `| ${r.scene} | ${r.shot} | ${r.draws} | ${(r.tris / 1e6).toFixed(2)} M | ${ms(r.frameMs)} | ${ms(r.gpuMs)} |`,
  );
