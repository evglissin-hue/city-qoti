// V4 before and after shots (V4.0; a script, not a spec; v3-shots.mjs with rest sequences). The same
// scenes and cameras for every V4 PR, at 1440 x 900 with the UI hidden and dynamic resolution off,
// on the grown village (?debug&fixture=grown) in the summer clear look. Needs the client dev server
// (`npm run dev`; QOTI_CLIENT_PORT for another port, 5260):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v4-shots.mjs before [scene ...]
//   node apps/client/e2e/v4-shots.mjs compare <stageA> <stageB>
// The stage is `before` (V4.0) or a cycle's name. Scenes: street (the doorstep: 12 tiles from the
// door of a high street business, facing it from the road) and village (70 tiles), each by day,
// golden hour and night, and lamps (the street camera at golden hour and night, then lamps lighting
// one by one at rest: V4A's test scene for "the picture never pops as a lamp lights"). All by default.
// A shot is a REST SEQUENCE: once the scene has settled (V3's settle) the camera is nudged and put
// back, so a fresh rest begins, and the page is shot at 0, 0.3 and 0.6 s of rest, counted as wall
// time from the first still frame drawn (in software a frame takes seconds, so the actual time is
// recorded, with the samples, goal, still change and mode of each shot).
// Saves docs/build/screenshots/v4-<stage>-<scene>-<shot>-<t>.png (t is 0, 03 or 06; the lamps scene
// saves v4-<stage>-lamps-<shot>-rest.png and v4-<stage>-lamps-<shot>-<lit lamps>.png).
// `compare` sets every PNG pair of two stages side by side pixel by pixel (decoded in Chromium; no
// image library needed) and exits 1 when a pair differs by more than QOTI_TOLERANCE (the share of
// differing pixels in percent, 0 by default: exact). Two runs of one build can differ a little in
// software (water, smoke); the sim is paused by default so residents hold still (QOTI_HOLD=0 lets
// it run).
// Env: QOTI_QUALITY (medium), QOTI_OUT (the screenshots folder), QOTI_WAIT (least ms per scene
// before settling, 8000), QOTI_SETTLE_MAX (most ms to wait for a scene to settle, 240000), QOTI_SIZE
// (1440x900), QOTI_SHOTS (only these shot names, comma separated), QOTI_HUD=1 keeps the interface,
// QOTI_LAYERS=1 also prints triangles per render layer (slow), QOTI_QUERY (more URL parameters,
// e.g. refine=0), QOTI_HOLD (1: the sim paused; 0 to run it), QOTI_LAMP_MS (ms between lamps, 400),
// QOTI_TOLERANCE (compare: the most percent of pixels that may differ, 0).
import { chromium } from '@playwright/test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5260);
const base = `http://localhost:${clientPort}`;
const [stage = 'before', ...rest] = process.argv.slice(2);
const onlyShots = process.env.QOTI_SHOTS ? process.env.QOTI_SHOTS.split(',') : null;
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const quality = process.env.QOTI_QUALITY ?? 'medium';
const [vw, vh] = (process.env.QOTI_SIZE ?? '1440x900').split('x').map(Number);
const hold = process.env.QOTI_HOLD !== '0';
const extra = process.env.QOTI_QUERY ? `&${process.env.QOTI_QUERY}` : '';

const launch = () =>
  chromium.launch({
    ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });

/** `compare <a> <b>`: every PNG pair of the two stages, pixel by pixel. */
async function compare(a, b) {
  const tolerance = Number(process.env.QOTI_TOLERANCE ?? 0);
  const names = (s) =>
    existsSync(out)
      ? readdirSync(out)
          .filter((f) => f.startsWith(`v4-${s}-`) && f.endsWith('.png'))
          .map((f) => f.slice(`v4-${s}-`.length))
      : [];
  const inA = names(a);
  const inB = names(b);
  const both = inA.filter((n) => inB.includes(n)).sort();
  for (const n of inA) if (!inB.includes(n)) console.log(`only in ${a}: ${n}`);
  for (const n of inB) if (!inA.includes(n)) console.log(`only in ${b}: ${n}`);
  const browser = await launch();
  const page = await browser.newPage();
  const b64 = (f) => readFileSync(`${out}/${f}`).toString('base64');
  let bad = inA.length !== both.length || inB.length !== both.length ? 1 : 0;
  console.log(`\n| Shot | Pixels differing | Largest channel difference | Verdict |\n|---|---|---|---|`);
  for (const n of both) {
    const r = await page.evaluate(
      async ([x, y]) => {
        const load = (d) =>
          new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = `data:image/png;base64,${d}`;
          });
        const [ia, ib] = await Promise.all([load(x), load(y)]);
        if (ia.width !== ib.width || ia.height !== ib.height) return { size: true };
        const px = (i) => {
          const c = document.createElement('canvas');
          c.width = i.width;
          c.height = i.height;
          const g = c.getContext('2d');
          g.drawImage(i, 0, 0);
          return g.getImageData(0, 0, i.width, i.height).data;
        };
        const da = px(ia);
        const db = px(ib);
        let diff = 0;
        let max = 0;
        for (let k = 0; k < da.length; k += 4) {
          let m = 0;
          for (let c = 0; c < 4; c++) m = Math.max(m, Math.abs(da[k + c] - db[k + c]));
          if (m > 0) diff++;
          if (m > max) max = m;
        }
        return { share: (diff / (da.length / 4)) * 100, max };
      },
      [b64(`v4-${a}-${n}`), b64(`v4-${b}-${n}`)],
    );
    const name = n.replace(/\.png$/, '');
    if (r.size) {
      bad = 1;
      console.log(`| ${name} | size differs | n/a | FAIL |`);
      continue;
    }
    const ok = r.share <= tolerance;
    if (!ok) bad = 1;
    console.log(`| ${name} | ${r.share.toFixed(4)} % | ${r.max} | ${ok ? 'ok' : 'FAIL'} |`);
  }
  await browser.close();
  console.log(
    `\n${a} vs ${b}: ${both.length} pairs, tolerance ${tolerance} %: ${bad ? 'DIFFERENT' : 'equal'}`,
  );
  process.exit(bad);
}
if (stage === 'compare') await compare(rest[0], rest[1]);
const only = rest;

const SUMMER = 'season=summer&day=3&weather=clear';
const HOURS = [
  { name: 'day', hour: 11 },
  { name: 'golden', hour: 18 },
  { name: 'night', hour: 22.3 },
];
// Seconds of rest to shoot at, and their file suffixes.
const TIMES = [
  { t: 0, tag: '0' },
  { t: 0.3, tag: '03' },
  { t: 0.6, tag: '06' },
];
const SCENES = {
  street: {
    shots: HOURS.map((h) => ({ ...h, dist: 12, door: true, tilt: -0.22 })),
  },
  village: {
    shots: HOURS.map((h) => ({ ...h, dist: 70 })),
  },
  lamps: {
    lamps: true,
    shots: HOURS.filter((h) => h.name !== 'day').map((h) => ({ ...h, dist: 12, door: true, tilt: -0.22 })),
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

/**
 * Starts a fresh rest: nudges the camera a hair and back (the first once drawn, so the nudge is seen),
 * then waits for the first still frame after it. Returns the page's clock (ms) at that frame.
 */
async function freshRest(page) {
  const most = Number(process.env.QOTI_SETTLE_MAX ?? 240000);
  return page.evaluate(async (limit) => {
    const q = window.__qoti;
    const r = q.renderer();
    const frame = () => new Promise((res) => requestAnimationFrame(res));
    const until = async (test) => {
      const t0 = performance.now();
      while (!test() && performance.now() - t0 < limit) await frame();
    };
    const nudge = (d) => {
      r.rig.rotateBy(d, 0);
      r.rig.snap();
      r.invalidate();
    };
    const drawn = q.stats().drawn;
    nudge(0.0005);
    await until(() => q.stats().drawn > drawn);
    nudge(-0.0005);
    const stills = q.stats().stillRenders;
    await until(() => q.stats().stillRenders > stills && q.stats().mode !== 'moving');
    return performance.now();
  }, most);
}

const grab = (page, t0) =>
  page.evaluate((t0) => {
    const st = window.__qoti.stats();
    return {
      at: t0 === null ? null : (performance.now() - t0) / 1000,
      mode: st?.mode ?? '?',
      samples: st?.samples ?? 0,
      goal: st?.sampleGoal ?? 0,
      change: st?.stillChange ?? null,
      stillRenders: st?.stillRenders ?? 0,
      draws: st?.drawCalls ?? 0,
      tris: st?.triangles ?? 0,
      frameMs: st?.frameMs ?? 0,
      gpuMs: typeof st?.gpuMs === 'number' ? st.gpuMs : null,
    };
  }, t0);

const browser = await launch();
const rows = [];
for (const [scene, def] of Object.entries(SCENES)) {
  if (only.length && !only.includes(scene)) continue;
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(`${base}/?debug&fixture=grown&clean&fixedres&quality=${quality}&${SUMMER}${extra}`);
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
  // Residents frozen in place, so two runs of one build see the same street.
  if (hold) await page.evaluate(() => window.__qoti.submit({ t: 'time.setSpeed', speed: 0 }));
  const info = await page.evaluate(() => window.__qoti.grownInfo());
  console.log(scene, 'grown', JSON.stringify(info));
  const center = info.center;
  const door = info.door;
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
    const t0 = await freshRest(page);
    const record = (file, planned, s, tag) => {
      rows.push({ scene, shot: shot.name, tag, planned, ...s });
      console.log(file, JSON.stringify({ planned, tag, ...s }));
    };
    if (!def.lamps) {
      for (const { t, tag } of TIMES) {
        const left = t * 1000 - (await page.evaluate((t0) => performance.now() - t0, t0));
        if (left > 0) await page.waitForTimeout(left);
        const s = await grab(page, t0);
        const file = `${out}/v4-${stage}-${scene}-${shot.name}-${tag}.png`;
        await page.screenshot({ path: file, timeout: 240000 });
        record(file, t, s, tag);
      }
    } else {
      let s = await grab(page, t0);
      let file = `${out}/v4-${stage}-lamps-${shot.name}-rest.png`;
      await page.screenshot({ path: file, timeout: 240000 });
      record(file, 0, s, 'rest');
      const count = await page.evaluate(
        (ms) => window.__qoti.lampSequence({ count: 12, everyMs: ms }),
        Number(process.env.QOTI_LAMP_MS ?? 400),
      );
      for (const n of [0, 4, 8, 12].filter((n) => n <= count)) {
        // Lamp n is lit, then two more frames drawn (lighting a lamp drops the still frame at once,
        // so the second frame after it has certainly drawn it; the first may be one in flight).
        await page.evaluate(
          (n) =>
            new Promise((resolve) => {
              const q = window.__qoti;
              const t0 = performance.now();
              const wait = () => {
                if (q.lampSequenceLit() < n) return setTimeout(wait, 20);
                const base = q.stats().drawn;
                const next = () =>
                  q.stats().drawn >= base + 2 || performance.now() - t0 > 90000
                    ? resolve()
                    : requestAnimationFrame(next);
                next();
              };
              wait();
            }),
          n,
        );
        s = await grab(page, null);
        const lit = await page.evaluate(() => window.__qoti.lampSequenceLit());
        file = `${out}/v4-${stage}-lamps-${shot.name}-${n}.png`;
        await page.screenshot({ path: file, timeout: 240000 });
        record(file, 0, { ...s, lit }, String(n));
      }
      await page.evaluate(() => window.__qoti.lampSequenceStop());
    }
    if (process.env.QOTI_LAYERS === '1')
      console.log('  layers', JSON.stringify(await page.evaluate(() => window.__qoti.layerTriangles?.())));
  }
  await page.close();
}
await browser.close();

const ms = (v) => (v === null ? 'n/a' : v.toFixed(1));
console.log(`\n${quality}, ${vw} x ${vh}, ${stage}${extra ? `, ${extra.slice(1)}` : ''}:\n`);
console.log(
  '| Scene | Shot | t planned / actual s | Mode | Samples / goal | Still change | Draws | Triangles | Frame ms (CPU) | GPU ms |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const lamp = r.lit !== undefined ? `lit ${r.lit}` : null;
  const t = r.at === null ? (lamp ?? r.tag) : `${r.planned} / ${r.at.toFixed(2)}`;
  console.log(
    `| ${r.scene} | ${r.shot} ${r.tag} | ${t} | ${r.mode} | ${r.samples} / ${r.goal} | ${r.change ?? 'none'} | ${r.draws} | ${(r.tris / 1e6).toFixed(2)} M | ${ms(r.frameMs)} | ${ms(r.gpuMs)} |`,
  );
}
