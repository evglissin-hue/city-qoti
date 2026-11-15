// V3 perf table (V3.0; a script, not a spec; v2-perf.mjs with V3's scenes). For each scene and
// quality preset: a 10 s scripted camera path (pan, orbit, zoom in and out) and a 10 s rest with
// residents walking, reporting average and 95th percentile frame ms and GPU ms, moving and idle, as
// a Markdown table. Needs the client dev server (`npm run dev`; QOTI_CLIENT_PORT for another port,
// 5230):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v3-perf.mjs [scene ...]
// Scenes are all on the grown village (?debug&fixture=grown, as it is: no showcase), in the summer
// clear look: street (12 tiles, the play camera's closest, looking at a high street door), village
// (70, the Ledger's height), far120, far200 and far240.
// Headless Chromium draws in software, so only its draws and triangles mean anything: run it with
// QOTI_HEADED=1 on a laptop (or paste `await __qoti.perf()` into the console of a `?debug` valley)
// for timings. Env: QOTI_PRESETS (low,medium,high,ultra), QOTI_MOVE and QOTI_REST (seconds, 10),
// QOTI_SIZE (1440x900), QOTI_SETTLE (ms after a scene loads, 12000; then until no static layer
// changes, at most QOTI_SETTLE_MAX, 300000), QOTI_FIXEDRES=1 (dynamic resolution off), QOTI_HOLD=1
// (the sim paused and the hour pinned), QOTI_HOUR (the hour to pin, 11 with QOTI_HOLD; the Hour
// column) and QOTI_QUERY (more URL parameters, e.g. lights=loop).
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5230);
const base = `http://localhost:${clientPort}`;
const only = process.argv.slice(2);
const [vw, vh] = (process.env.QOTI_SIZE ?? '1440x900').split('x').map(Number);
const move = Number(process.env.QOTI_MOVE ?? 10);
const rest = Number(process.env.QOTI_REST ?? 10);
const headed = process.env.QOTI_HEADED === '1';
// V2A: QOTI_HOUR=22 measures at night (the light pinned to that hour, the Hour column filled);
// QOTI_QUERY=lights=loop measures the 32-light loop on the same build.
const hour = process.env.QOTI_HOUR ? Number(process.env.QOTI_HOUR) : undefined;
// V1D: QOTI_FIXEDRES=1 turns dynamic resolution off, so runs draw the same pixels (in a
// software renderer every frame is slow, so it would otherwise step moving frames down).
const fixedres = process.env.QOTI_FIXEDRES === '1' ? '&fixedres' : '';

const SUMMER = 'season=summer&day=3&weather=clear';
const SCENES = {
  street: { fixture: 'grown', dist: 12, door: true, tilt: -0.22, q: SUMMER },
  village: { fixture: 'grown', dist: 70, q: SUMMER },
  far120: { fixture: 'grown', dist: 120, q: SUMMER },
  far200: { fixture: 'grown', dist: 200, q: SUMMER },
  far240: { fixture: 'grown', dist: 240, q: SUMMER },
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
  const info = await page.evaluate(() => window.__qoti.grownInfo());
  const center = info.center;
  const at = def.door && info.door ? [info.door.x, info.door.z] : center;
  // V1D: QOTI_HOLD=1 pauses the sim and pins the hour. In a software renderer a frame spans dozens
  // of turns, so a busy valley changes something static (a stock pile, the sun's quarter-hour step)
  // in every frame and the still-frame cache is drawn again each time; holding still measures what
  // an idle frame costs (water and smoke still move, so idle frames keep drawing).
  if (process.env.QOTI_HOLD === '1')
    await page.evaluate((h) => {
      window.__qoti.submit({ t: 'time.setSpeed', speed: 0 });
      window.__qoti.setHour(h);
    }, hour ?? 11);
  // V2A: QOTI_HOUR pins the light without holding the sim (with QOTI_HOLD it replaces 11:00).
  else if (hour !== undefined) await page.evaluate((h) => window.__qoti.setHour(h), hour);
  await page.evaluate(
    ([x, z, d, yaw, tilt]) => {
      // `look` turns relative to the current view: ask for the door's yaw by the difference.
      const turn = yaw === null ? 0 : yaw - window.__qoti.renderer().rig.look.yaw;
      window.__qoti.look(x, z, d, turn, tilt);
    },
    [at[0], at[1], def.dist, def.door && info.door ? info.door.yaw : null, def.tilt ?? 0],
  );
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
    ...(hour !== undefined ? { hour } : {}),
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
