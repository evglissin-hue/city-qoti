// V3 before and after shots (V3.0; a script, not a spec; v2-shots.mjs with V3's scenes). The same
// scenes and cameras for every V3 PR, at 1440 x 900 with the UI hidden and dynamic resolution off,
// each by day, golden hour and night, all on the grown village (?debug&fixture=grown) in the summer
// clear look. Needs the client dev server (`npm run dev`; QOTI_CLIENT_PORT for another port, 5230):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v3-shots.mjs before [scene ...]
// The stage is `before` (V3.0) or a cycle's name; scenes are street (the doorstep: 12 tiles from the
// door of a high street business, facing it from the road), village (the Ledger's height, 70 tiles)
// and far120, far200 and far240 (the far view at that distance), all by default.
// Saves docs/build/screenshots/v3-<stage>-<scene>-<shot>.png and prints draw calls, triangles,
// frame ms and GPU ms for each shot, then the lot as a Markdown table.
// Each shot waits until the scene has finished streaming in (the triangle count holds within 2%
// over three looks, three drawn frames apart), so a slow software renderer and a laptop see the
// same scene.
// Env: QOTI_QUALITY (medium), QOTI_OUT (the screenshots folder), QOTI_WAIT (least ms per shot,
// 8000), QOTI_SETTLE_MAX (most ms to wait for a scene to settle, 240000), QOTI_SIZE (1440x900),
// QOTI_SHOTS (only these shot names, comma separated),
// QOTI_HUD=1 keeps the interface, QOTI_LAYERS=1 also prints triangles per render layer (slow).
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5230);
const base = `http://localhost:${clientPort}`;
const [stage = 'before', ...only] = process.argv.slice(2);
// V2X: QOTI_SHOTS=night,nightstreet takes only those shots of each scene (for quick A/B looks).
const onlyShots = process.env.QOTI_SHOTS ? process.env.QOTI_SHOTS.split(',') : null;
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const quality = process.env.QOTI_QUALITY ?? 'medium';
const [vw, vh] = (process.env.QOTI_SIZE ?? '1440x900').split('x').map(Number);

// A shot looks at the grown village's center from `dist` at `hour`; `door: true` looks at the door
// from `__qoti.grownInfo()` instead, from the road side. `tilt` (radians, negative is lower) is
// applied once per scene, since the camera keeps it.
// Every scene pins the summer clear look (`look`, the renderer's debug override; the sim is
// untouched). The hour is pinned per shot, but the season blend follows the sim's clock, and the
// grown village starts an hour before autumn.
const SUMMER = 'season=summer&day=3&weather=clear';
const HOURS = [
  { name: 'day', hour: 11 },
  { name: 'golden', hour: 18 },
  { name: 'night', hour: 22.3 },
];
const far = (dist) => ({
  fixture: 'grown',
  look: SUMMER,
  setup: 'grown',
  shots: HOURS.map((h) => ({ ...h, dist })),
});
const SCENES = {
  street: {
    fixture: 'grown',
    look: SUMMER,
    setup: 'grown',
    shots: HOURS.map((h) => ({ ...h, dist: 12, door: true, tilt: -0.22 })),
  },
  village: {
    fixture: 'grown',
    look: SUMMER,
    setup: 'grown',
    shots: HOURS.map((h) => ({ ...h, dist: 70 })),
  },
  far120: far(120),
  far200: far(200),
  far240: far(240),
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
  let door = null;
  if (def.setup === 'grown') {
    const r = await page.evaluate(() => window.__qoti.grownInfo());
    console.log(scene, 'grown', JSON.stringify(r));
    center = r.center;
    door = r.door;
  }
  if (!center) {
    const [x0, z0, x1, z1] = await page.evaluate(() => window.__qoti.startArea());
    center = [(x0 + x1 + 1) / 2, (z0 + z1 + 1) / 2];
  }
  let tilted = false;
  for (const shot of def.shots) {
    if (onlyShots && !onlyShots.includes(shot.name)) continue;
    const at = shot.door && door ? [door.x, door.z] : center;
    await page.evaluate(
      ([x, z, d, h, yaw, tilt]) => {
        window.__qoti.setHour(h);
        // `look` turns relative to the current view: ask for the door's yaw by the difference.
        const turn = yaw === null ? 0 : yaw - window.__qoti.renderer().rig.look.yaw;
        window.__qoti.look(x, z, d, turn, tilt);
      },
      [
        at[0],
        at[1],
        shot.dist,
        shot.hour,
        shot.door && door ? door.yaw : null,
        tilted ? 0 : (shot.tilt ?? 0),
      ],
    );
    if (shot.tilt) tilted = true;
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
    const file = `${out}/v3-${stage}-${scene}-${shot.name}.png`;
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
