// V4 perf table (V4.0; a script, not a spec; v3-perf.mjs with the developing picture). For each scene
// and quality preset, three phases: moving (a scripted camera path: pan, orbit, zoom in and out),
// settling (from the first rest frame until the still frame has developed all its samples, or
// QOTI_REST seconds), and settled (the idle frames after it), plus the still frame's own cost. A
// Markdown table of average and 95th percentile GPU ms (frame ms where the browser has no GPU
// timer). Needs the client dev server (`npm run dev`; QOTI_CLIENT_PORT for another port, 5260):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v4-perf.mjs [scene ...]
// Scenes are all on the grown village (?debug&fixture=grown, as it is: no showcase), in the summer
// clear look: street (12 tiles, looking at a high street door), village (70) and far120.
// Headless Chromium draws in software, so only its draws and triangles mean anything: run it with
// QOTI_HEADED=1 on a laptop (or paste `await __qoti.perf()` into the console of a `?debug` valley)
// for timings. Settling ends at the first still frame while the sample goal is 0 (before V4A), and
// once the goal is 8 to 32 when `samples` reaches it. Moving, idle and still parts come from
// runPerf (app/perf.ts); the settling part is measured here, frame by frame.
// Env: QOTI_PRESETS (low,medium,high,ultra), QOTI_MOVE and QOTI_REST (seconds, 10), QOTI_STILL
// (seconds of the still part, 3), QOTI_SIZE (1440x900), QOTI_SETTLE (ms after a scene loads, 12000;
// then until no static layer changes, at most QOTI_SETTLE_MAX, 300000), QOTI_FIXEDRES=1 (dynamic
// resolution off), QOTI_HOLD=1 (the sim paused and the hour pinned), QOTI_HOUR (the hour to pin, 11
// with QOTI_HOLD), QOTI_QUERY (more URL parameters, e.g. refine=0) and QOTI_HEADED=1.
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5260);
const base = `http://localhost:${clientPort}`;
const only = process.argv.slice(2);
const [vw, vh] = (process.env.QOTI_SIZE ?? '1440x900').split('x').map(Number);
const move = Number(process.env.QOTI_MOVE ?? 10);
const rest = Number(process.env.QOTI_REST ?? 10);
const still = Number(process.env.QOTI_STILL ?? 3);
const headed = process.env.QOTI_HEADED === '1';
const hour = process.env.QOTI_HOUR ? Number(process.env.QOTI_HOUR) : undefined;
// QOTI_FIXEDRES=1 turns dynamic resolution off, so runs draw the same pixels.
const fixedres = process.env.QOTI_FIXEDRES === '1' ? '&fixedres' : '';

const SUMMER = 'season=summer&day=3&weather=clear';
const SCENES = {
  street: { fixture: 'grown', dist: 12, door: true, tilt: -0.22, q: SUMMER },
  village: { fixture: 'grown', dist: 70, q: SUMMER },
  far120: { fixture: 'grown', dist: 120, q: SUMMER },
};

const fmt = (v) => (v === null || v === undefined ? 'n/a' : v.toFixed(1));
const pair = (a, b) => `${fmt(a)} / ${fmt(b)}`;
/** A part's GPU ms (avg / p95), or its frame ms marked "(frame)" where there is no GPU timer. */
const gpuOrFrame = (p) =>
  !p || p.frames === 0
    ? 'n/a'
    : p.gpuAvg !== null
      ? pair(p.gpuAvg, p.gpuP95)
      : `${pair(p.frameAvg, p.frameP95)} (frame)`;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

const browser = await chromium.launch({
  headless: !headed,
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: headed
    ? ['--ignore-gpu-blocklist']
    : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

/**
 * The settling part: nudges the camera a hair and back, then watches every drawn frame until the still
 * frame has developed (`samples >= sampleGoal` after a still frame was drawn) or `limit` seconds pass.
 * Returns the time to settle and the frames, samples and GPU/frame ms of the frames on the way.
 */
const settling = (page, limit) =>
  page.evaluate(async (limit) => {
    const q = window.__qoti;
    const r = q.renderer();
    const frame = () => new Promise((res) => requestAnimationFrame(res));
    const nudge = (d) => {
      r.rig.rotateBy(d, 0);
      r.rig.snap();
      r.invalidate();
    };
    // A moving frame first (the nudge seen), then the rest begins with the camera back.
    let drawn = q.stats().drawn;
    nudge(0.0005);
    while (q.stats().drawn === drawn) await frame();
    nudge(-0.0005);
    const t0 = performance.now();
    const timer = r.gpuTimer;
    let seen = timer.total;
    drawn = q.stats().drawn;
    let last = t0;
    const frameMs = [];
    const gpu = [];
    const modes = { moving: 0, still: 0, idle: 0, sample: 0 };
    let stillSeen = false;
    let samples = 0;
    let done = false;
    while (performance.now() - t0 < limit * 1000) {
      const now = await new Promise((res) => requestAnimationFrame(res));
      const st = q.stats();
      if (st.drawn !== drawn) {
        modes[st.mode]++;
        frameMs.push(now - last);
        const fresh = Math.min(timer.total - seen, timer.history.length);
        if (fresh > 0) gpu.push(...timer.history.slice(-fresh));
        if (st.mode === 'still') stillSeen = true;
        if (st.mode === 'sample') samples++;
      }
      drawn = st.drawn;
      seen = timer.total;
      last = now;
      if (stillSeen && st.samples >= st.sampleGoal) {
        done = true;
        break;
      }
    }
    const st = q.stats();
    return {
      done,
      ms: performance.now() - t0,
      modes,
      samples,
      reached: st.samples,
      goal: st.sampleGoal,
      frameMs,
      gpu,
    };
  }, limit);

const HEAD = [
  '| Scene | Preset | Moving GPU ms (avg / p95) | Moving draws, triangles | Settle ms (frames, samples) | Still frame GPU ms (avg / p95), draws | Settled idle GPU ms (avg / p95) | Rest frames moving / still / idle / sample |',
  '|---|---|---|---|---|---|---|---|',
];

/** One row of the table. Low has no still-frame cache, so it never settles into a still frame. */
function line({ scene, preset, row, s }) {
  const m = row.moving;
  const frames = Object.values(s.modes).reduce((a, b) => a + b, 0);
  const sGpu = avg(s.gpu);
  const settleText =
    preset === 'low'
      ? 'n/a (no still-frame cache)'
      : `${Math.round(s.ms)}${s.done ? '' : ' (not settled)'} (${frames}, ${s.samples}${s.goal ? ` of ${s.goal}` : ''})${sGpu === null ? `, ${fmt(avg(s.frameMs))} frame` : `, ${fmt(sGpu)} GPU`}`;
  const st = row.still;
  const stillText = st ? `${gpuOrFrame(st)}, ${st.draws}` : 'n/a';
  const i = row.idle;
  const modes = `${i.modes.moving} / ${i.modes.still} / ${i.modes.idle} / ${i.modes.sample}`;
  return `| ${scene} | ${preset} | ${gpuOrFrame(m)} | ${m.draws}, ${(m.triangles / 1e6).toFixed(2)} M | ${settleText} | ${stillText} | ${gpuOrFrame(i)} | ${modes} |`;
}

// Each row is printed as it is measured too (a long software run can be cut short).
console.log(HEAD.join('\n'));
const rows = [];
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
  const at = def.door && info.door ? [info.door.x, info.door.z] : info.center;
  // QOTI_HOLD=1 pauses the sim and pins the hour: in a software renderer a frame spans dozens of
  // turns, so a busy valley changes something static in every frame and the still frame is drawn
  // again each time; holding still measures what a rest costs.
  if (process.env.QOTI_HOLD === '1')
    await page.evaluate((h) => {
      window.__qoti.submit({ t: 'time.setSpeed', speed: 0 });
      window.__qoti.setHour(h);
    }, hour ?? 11);
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
  // Then until the valley has streamed in (no static layer changed over three looks, three drawn
  // frames apart), so the parts measure rests and not the last chunks arriving.
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
  const presets = process.env.QOTI_PRESETS?.split(',') ?? ['low', 'medium', 'high', 'ultra'];
  for (const preset of presets) {
    // runPerf puts the preset back and the camera home; each preset starts from the same view. Its
    // moving, idle and still parts are this preset's; the settling part follows, on the same preset.
    const r = await page.evaluate((o) => window.__qoti.perf(o), {
      scene,
      move,
      rest,
      still,
      presets: [preset],
      ...(hour !== undefined ? { hour } : {}),
    });
    const row = r.rows[0];
    await page.evaluate((q) => window.__qoti.renderer().setQuality(q), preset);
    const s = await settling(page, rest);
    console.log(
      scene,
      preset,
      JSON.stringify({ settle: { done: s.done, ms: Math.round(s.ms), modes: s.modes, goal: s.goal } }),
    );
    rows.push({ scene, preset, row, s });
    console.log(line(rows[rows.length - 1]));
  }
  await page.close();
}
await browser.close();

console.log(
  `\n${headed ? 'headed' : 'headless (software renderer)'}, lean engine${fixedres ? ', fixed resolution' : ''}${process.env.QOTI_HOLD === '1' ? ', sim paused' : ''}, ${vw} x ${vh}, ${move} s moving, ${rest} s rest, ${still} s still:\n`,
);
console.log(HEAD.join('\n'));
for (const r of rows) console.log(line(r));
