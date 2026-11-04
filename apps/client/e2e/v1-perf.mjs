// V1 perf table (V1.0; a script, not a spec). For each scene and quality preset: a 10 s scripted
// camera path (pan, orbit, zoom in and out) and a 10 s rest with residents walking, reporting
// average and 95th percentile frame ms and GPU ms, moving and idle, as a Markdown table. Needs the
// client dev server (`npm run dev`; QOTI_CLIENT_PORT for another port):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v1-perf.mjs [scene ...]
// Scenes are hamlet, village (the village of 130) and town (1,000 buildings and 2,000 residents).
// Headless Chromium draws in software, so only its draws and triangles mean anything: run it with
// QOTI_HEADED=1 on a laptop (or paste `await __qoti.perf()` into the console of a `?debug` valley)
// for timings. Env: QOTI_PRESETS (low,medium,high,ultra), QOTI_MOVE and QOTI_REST (seconds, 10),
// QOTI_SIZE (1440x900), QOTI_SETTLE (ms after a scene loads, 12000; V1D: then until no static
// layer changes, at most QOTI_SETTLE_MAX, 300000), QOTI_FIXEDRES=1
// (dynamic resolution off) and QOTI_HOLD=1 (the sim paused and the hour pinned; see below).
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5173);
const base = `http://localhost:${clientPort}`;
const only = process.argv.slice(2);
const [vw, vh] = (process.env.QOTI_SIZE ?? '1440x900').split('x').map(Number);
const move = Number(process.env.QOTI_MOVE ?? 10);
const rest = Number(process.env.QOTI_REST ?? 10);
const headed = process.env.QOTI_HEADED === '1';
// V1D: QOTI_FIXEDRES=1 turns dynamic resolution off, so runs draw the same pixels (in a
// software renderer every frame is slow, so it would otherwise step moving frames down).
const fixedres = process.env.QOTI_FIXEDRES === '1' ? '&fixedres' : '';

const SCENES = {
  hamlet: { fixture: 'hamlet' },
  village: { fixture: 'village', setup: 'village', center: [64, 60], dist: 70 },
  town: { fixture: 'village', setup: 'town', dist: 90 },
  // C5E: the village of 130 in winter with snow falling, on a summer evening with 80 more folk
  // about (the festival's crowd), and the raid fixture at dusk (only on request: not in the default run).
  'village-winter': {
    fixture: 'village',
    setup: 'village',
    center: [64, 60],
    dist: 70,
    q: 'season=winter&day=3&weather=snow',
    only: true,
  },
  'village-crowd': {
    fixture: 'village',
    setup: 'village',
    center: [64, 60],
    dist: 70,
    q: 'season=summer&day=5',
    crowd: 80,
    only: true,
  },
  raid: { fixture: 'raid', dist: 60, only: true },
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
  if (only.length ? !only.includes(scene) : def.only) continue;
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(
    `${base}/?debug&fixture=${def.fixture}&clean&quality=medium${fixedres}${def.q ? `&${def.q}` : ''}${process.env.QOTI_QUERY ? `&${process.env.QOTI_QUERY}` : ''}`,
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
  let center = def.center;
  if (def.setup === 'village') await page.evaluate(() => window.__qoti.villageShowcase(true));
  if (def.crowd) await page.evaluate((n) => window.__qoti.synthResidents(n), def.crowd);
  else if (def.setup === 'town') center = (await page.evaluate(() => window.__qoti.townShowcase())).center;
  else if (def.fixture === 'hamlet') await page.evaluate(() => window.__qoti.synthResidents(60));
  if (!center) {
    const [x0, z0, x1, z1] = await page.evaluate(() => window.__qoti.startArea());
    center = [(x0 + x1 + 1) / 2, (z0 + z1 + 1) / 2];
  }
  // V1D: QOTI_HOLD=1 pauses the sim and pins the hour. In a software renderer a frame spans dozens
  // of turns, so a busy valley changes something static (a stock pile, the sun's quarter-hour step)
  // in every frame and the still-frame cache is drawn again each time; holding still measures what
  // an idle frame costs (water and smoke still move, so idle frames keep drawing).
  if (process.env.QOTI_HOLD === '1')
    await page.evaluate(() => {
      window.__qoti.submit({ t: 'time.setSpeed', speed: 0 });
      window.__qoti.setHour(11);
    });
  await page.evaluate(([x, z, d]) => window.__qoti.look(x, z, d), [center[0], center[1], def.dist ?? 45]);
  await page.waitForTimeout(Number(process.env.QOTI_SETTLE ?? 12000));
  // V1D: then until the valley has streamed in (no static layer changed over three looks, three
  // drawn frames apart), so the idle part measures idle frames and not the last chunks arriving.
  const settleStart = Date.now();
  const revs = [];
  while (Date.now() - settleStart < Number(process.env.QOTI_SETTLE_MAX ?? 300000)) {
    revs.push(
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            let n = 0;
            const step = () =>
              ++n >= 3 ? resolve(window.__qoti.renderer()?.staticRevision ?? 0) : requestAnimationFrame(step);
            requestAnimationFrame(step);
          }),
      ),
    );
    const last = revs.slice(-3);
    if (last.length === 3 && last[0] === last[2]) break;
  }
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
  `\n${headed ? 'headed' : 'headless (software renderer)'}, lean engine${fixedres ? ', fixed resolution' : ''}${process.env.QOTI_HOLD === '1' ? ', sim paused' : ''}, ${vw} x ${vh}, ${move} s moving, ${rest} s idle:\n`,
);
console.log(lines.join('\n'));
