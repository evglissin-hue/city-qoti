// V3D: the endpaper map's shots and its handover check. Needs the client dev server
// (`npm run dev`; QOTI_CLIENT_PORT, 5234 for V3D).
//   node apps/client/e2e/v3d-endpaper.mjs [shots] [sweep]
// `shots`: a fresh valley and the grown village (`?debug&fixture=grown`) at the cover ramp (200,
// 220 and 240 tiles) by day (11:00) and night (22:20), and the grown village in winter at 220 and
// 240; saves docs/build/screenshots/v3d-<valley>-<dist>-<hour>.png and prints draws and the map's
// state. `sweep`: pulls the camera back from 190 to 250 tiles on the grown village, in steps and in
// one glide, and fails on a frame where the map shows before it was drawn, a skipped scene with no
// map, or a jump in the picture's brightness between steps larger than the fade explains.
// Env: QOTI_QUALITY (medium), QOTI_OUT (the screenshots folder), QOTI_WAIT (ms per shot, 6000).
import { chromium } from 'playwright';
import sharp from 'sharp';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5234);
const base = `http://localhost:${clientPort}`;
const quality = process.env.QOTI_QUALITY ?? 'medium';
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const wait = Number(process.env.QOTI_WAIT ?? 6000);
const what = process.argv.slice(2);
const want = (w) => what.length === 0 || what.includes(w);
const vw = 1440;
const vh = 900;

const SUMMER = 'season=summer&day=3&weather=clear';
const WINTER = 'season=winter&weather=clear';

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

async function open(fixture, look) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  await page.route('**/api/**', (r) => r.abort());
  const fx = fixture ? `&fixture=${fixture}` : '';
  await page.goto(`${base}/?debug${fx}&clean&fixedres&quality=${quality}&${look}`);
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
  for (const name of ['Done', 'Close', 'Later']) {
    const b = page.getByRole('button', { name, exact: true });
    if (await b.count())
      await b
        .first()
        .click()
        .catch(() => {});
  }
  await page.addStyleTag({ content: '.game-ui { display: none !important; }' });
  let center;
  if (fixture === 'grown') center = (await page.evaluate(() => window.__qoti.grownInfo())).center;
  else {
    const [x0, z0, x1, z1] = await page.evaluate(() => window.__qoti.startArea());
    center = [(x0 + x1 + 1) / 2, (z0 + z1 + 1) / 2];
  }
  return { page, center };
}

/** The map's state and the last frame's draws. */
const state = (page) =>
  page.evaluate(() => {
    const r = window.__qoti.renderer();
    const e = r.env.endpaper;
    const st = window.__qoti.stats();
    return {
      cover: +e.cover.toFixed(3),
      rev: e.revision,
      ready: e.ready === true,
      ms: Math.round(e.ms ?? 0),
      skip: r.env.skipScene,
      draws: st?.drawCalls ?? 0,
      mode: st?.mode,
    };
  });

/** Mean and spread of the picture's luminance (0 to 255). */
async function luma(buf) {
  const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let sq = 0;
  const n = info.width * info.height;
  for (let i = 0; i < n; i++) {
    sum += data[i];
    sq += data[i] * data[i];
  }
  const mean = sum / n;
  return { mean, sd: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}

const frames = (page, n) =>
  page.evaluate(
    (k) =>
      new Promise((res) => {
        let i = 0;
        const step = () => (++i >= k ? res() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    n,
  );

const rows = [];
let failed = false;

if (want('shots')) {
  const sets = [
    { valley: 'fresh', fixture: null, look: SUMMER, dists: [200, 220, 240], hours: ['day', 'night'] },
    { valley: 'grown', fixture: 'grown', look: SUMMER, dists: [200, 220, 240], hours: ['day', 'night'] },
    { valley: 'winter', fixture: 'grown', look: WINTER, dists: [220, 240], hours: ['day'] },
  ];
  const HOUR = { day: 11, night: 22.3 };
  for (const set of sets) {
    const { page, center } = await open(set.fixture, set.look);
    for (const dist of set.dists)
      for (const hour of set.hours) {
        await page.evaluate(
          ([x, z, d, h]) => {
            window.__qoti.setHour(h);
            window.__qoti.look(x, z, d, 0, 0);
          },
          [center[0], center[1], dist, HOUR[hour]],
        );
        await page.waitForTimeout(wait);
        await frames(page, 4);
        const s = await state(page);
        const file = `${out}/v3d-${set.valley}-${dist}-${hour}.png`;
        const buf = await page.screenshot({ path: file, timeout: 240000 });
        const l = await luma(buf);
        const row = { valley: set.valley, dist, hour, ...s, luma: Math.round(l.mean), sd: Math.round(l.sd) };
        rows.push(row);
        console.log(file, JSON.stringify(row));
      }
    await page.close();
  }
  console.log(`\n${quality}, ${vw} x ${vh}:\n`);
  console.log('| Valley | Distance | Hour | Cover | Draws | Mode | Map drawn | Map ms |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of rows)
    console.log(
      `| ${r.valley} | ${r.dist} | ${r.hour} | ${r.cover} | ${r.draws} | ${r.mode} | ${r.ready ? `rev ${r.rev}` : 'no'} | ${r.ms} |`,
    );
}

if (want('sweep')) {
  const { page, center } = await open('grown', SUMMER);
  await page.evaluate(([x, z]) => {
    window.__qoti.setHour(11);
    window.__qoti.look(x, z, 190, 0, 0);
  }, center);
  await page.waitForTimeout(wait);
  // A frame watcher: every animation frame, the map's state; any frame where the map shows before
  // it was drawn, or the scene is skipped with no map, is a blank or parchment-only frame.
  await page.evaluate(() => {
    const w = (window.__v3dWatch = { frames: 0, bad: [] });
    const r = window.__qoti.renderer();
    const tick = () => {
      const e = r.env.endpaper;
      w.frames++;
      if (e.cover > 0 && !e.ready) w.bad.push(`cover ${e.cover.toFixed(3)} before a drawing`);
      if (r.env.skipScene && (!e.ready || e.cover < 1)) w.bad.push(`skip at cover ${e.cover.toFixed(3)}`);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  let prev = null;
  console.log('\nsweep (steps):');
  for (let d = 190; d <= 250; d += 5) {
    await page.evaluate(([x, z, dd]) => window.__qoti.look(x, z, dd, 0, 0), [center[0], center[1], d]);
    await page.waitForTimeout(1500);
    await frames(page, 3);
    const s = await state(page);
    const l = await luma(await page.screenshot());
    // The fade moves brightness smoothly: a 5 tile step is an eighth of the ramp.
    const jump = prev ? Math.abs(l.mean - prev.mean) : 0;
    const flag = jump > 22 || l.sd < 4 ? '  <-- check' : '';
    if (flag) failed = true;
    console.log(`  ${d} tiles`, JSON.stringify({ ...s, luma: Math.round(l.mean), sd: Math.round(l.sd) }), flag);
    prev = l;
  }
  // One glide in from 250 to 190 and back out, as a player's wheel would.
  for (const d of [190, 250]) {
    await page.evaluate(([x, z, dd]) => window.__qoti.look(x, z, dd, 0, 0), [center[0], center[1], d]);
    await page.waitForTimeout(3000);
  }
  const w = await page.evaluate(() => window.__v3dWatch);
  console.log(`\nwatched ${w.frames} frames; bad frames: ${w.bad.length}`, w.bad.slice(0, 5));
  if (w.bad.length) failed = true;
  await page.close();
}

await browser.close();
if (failed) {
  console.log('\nFAILED: see the flagged steps above');
  process.exit(1);
}
