// V4X: `capture`'s `samples`, timed and shot (a script, not a spec; needs `npm run dev`).
//   QOTI_CLIENT_PORT=5269 QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v4x-capture.mjs [times|shots|check]
// `shots`: an ink slot and a plain capture at samples 0 and 16 on the grown village's street at
//   golden hour, saved as docs/build/screenshots/v4x-capture-{ink,plain}-{0,16}.png and the labeled
//   side-by-side v4x-capture-samples.jpg. `times`: the cost of a capture, slot ink and plain at
//   samples 0, 8, 16, and print ink at 0 and 8. `check`: a capture with samples returns a PNG of the
//   asked size and leaves the main view's still frame alone (no restart, samples and change kept).
// Both stats before and after a capture are printed. Env: QOTI_OUT, QOTI_QUALITY (medium).
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const port = Number(process.env.QOTI_CLIENT_PORT ?? 5260);
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const quality = process.env.QOTI_QUALITY ?? 'medium';
const [mode = 'shots'] = process.argv.slice(2);
const SLOT = [480, 360];
const PRINT = [1600, 1200];

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(
  `http://localhost:${port}/?debug&fixture=grown&clean&fixedres&quality=${quality}&season=summer&day=3&weather=clear`,
);
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
for (const name of ['Done', 'Close', 'Later']) {
  const b = page.getByRole('button', { name, exact: true });
  if (await b.count()) await b.first().click().catch(() => {});
}
await page.addStyleTag({ content: '.game-ui { display: none !important; }' });
await page.evaluate(() => window.__qoti.submit({ t: 'time.setSpeed', speed: 0 }));
const info = await page.evaluate(() => window.__qoti.grownInfo());
const door = info.door ?? info.center;
await page.evaluate(
  ([x, z]) => {
    const q = window.__qoti;
    q.setHour(18);
    q.look(x, z, 12, 0, -0.22);
  },
  [door.x, door.z],
);
await page.waitForTimeout(8000);
// The animation clock stopped and the smoke put out, so the main view really rests (else every
// drawn frame is a fresh still frame, the grown village's chimneys being what they are).
await page.evaluate(() => {
  const r = window.__qoti.renderer();
  r.env.motion = false;
  r.env.time.value = 100;
  r.env.staticTime.value = 100;
  r.layers.find((l) => l.id === 'effects')?.setSmoke(false);
  r.invalidateStatic('capture-script');
});
// Let a still frame be kept, and develop to its goal.
await page.evaluate(
  (quick) =>
    new Promise((res) => {
      const t0 = performance.now();
      const step = () => {
        const s = window.__qoti.stats();
        if (s.mode !== 'moving' && (quick || s.samples >= s.sampleGoal) && performance.now() - t0 > 4000) res();
        else if (performance.now() - t0 > 240000) res();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }),
  mode === 'probe',
);

/** One capture in the page: its time, the PNG's size and the stats before and after. */
const run = (style, size, samples, keep) =>
  page.evaluate(
    async ([style, size, samples, keep, focus]) => {
      const q = window.__qoti;
      const r = q.renderer();
      const pick = (s) => ({
        samples: s.samples,
        goal: s.sampleGoal,
        change: s.stillChange,
        stillRenders: s.stillRenders,
        shadowRenders: s.shadowRenders,
        mode: s.mode,
      });
      const before = pick(q.stats());
      const t0 = performance.now();
      const blob = await r.capture({ focus, radius: 14, size, style, samples });
      const ms = performance.now() - t0;
      // Two frames later: the main view must not have restarted.
      for (let i = 0; i < 2; i++) await new Promise((res) => requestAnimationFrame(res));
      const after = pick(q.stats());
      const bmp = blob ? await createImageBitmap(blob) : null;
      let data = null;
      if (keep && blob) {
        data = await new Promise((res) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.readAsDataURL(blob);
        });
      }
      return { ms, bytes: blob?.size ?? 0, w: bmp?.width ?? 0, h: bmp?.height ?? 0, before, after, data };
    },
    [style, size, samples, keep, [door.x + 0.5, door.z + 0.5]],
  );

const show = (r) => ({ ...r, data: undefined });

if (mode === 'times') {
  const rows = [];
  for (const [style, size, samples] of [
    ['ink', SLOT, 0],
    ['ink', SLOT, 8],
    ['ink', SLOT, 16],
    ['plain', SLOT, 0],
    ['plain', SLOT, 8],
    ['plain', SLOT, 16],
    ['ink', PRINT, 0],
    ['ink', PRINT, 8],
  ]) {
    const r = await run(style, size, samples, false);
    rows.push(`| ${style} | ${size.join('x')} | ${samples} | ${Math.round(r.ms)} |`);
    console.log(JSON.stringify({ style, size, samples, ...show(r) }));
  }
  console.log('\n| Style | Size | Samples | ms |\n|---|---|---|---|\n' + rows.join('\n'));
} else if (mode === 'probe') {
  const by = () => page.evaluate(() => Object.fromEntries(window.__qoti.renderer().statics.bySource));
  for (let i = 0; i < 6; i++) {
    const a = await by();
    console.log(i, a.buildings, a.meadow, a.nature, a.terrain);
    await page.waitForTimeout(20000);
  }
} else if (mode === 'baseline') {
  const st = () => page.evaluate(() => ({ ...window.__qoti.stats() }));
  const a = await st();
  await page.waitForTimeout(30000);
  const b = await st();
  console.log(JSON.stringify({ a: [a.stillRenders, a.samples, a.sampleGoal, a.drawn, a.stillChange], b: [b.stillRenders, b.samples, b.sampleGoal, b.drawn, b.stillChange] }));
} else if (mode === 'check') {
  const r = await run('ink', SLOT, 4, false);
  const p = await run('plain', SLOT, 4, false);
  for (const x of [r, p]) {
    const ok =
      x.w === SLOT[0] &&
      x.h === SLOT[1] &&
      x.bytes > 1000 &&
      x.after.stillRenders === x.before.stillRenders &&
      x.after.samples === x.before.samples &&
      x.after.change === x.before.change;
    console.log(ok ? 'OK' : 'FAIL', JSON.stringify(show(x)));
    if (!ok) process.exitCode = 1;
  }
} else {
  const shots = {};
  for (const style of ['ink', 'plain'])
    for (const n of [0, 16]) {
      const r = await run(style, SLOT, n, true);
      console.log(JSON.stringify({ style, n, ...show(r) }));
      shots[`${style}-${n}`] = r.data;
      writeFileSync(`${out}/v4x-capture-${style}-${n}.png`, Buffer.from(r.data.split(',')[1], 'base64'));
    }
  // Side by side, labeled, at full size (2 x 2).
  const jpg = await page.evaluate(async (shots) => {
    const load = (d) =>
      new Promise((res) => {
        const i = new Image();
        i.onload = () => res(i);
        i.src = d;
      });
    const [w, h] = [480, 360];
    const c = document.createElement('canvas');
    c.width = w * 2 + 30;
    c.height = (h + 30) * 2 + 10;
    const g = c.getContext('2d');
    g.fillStyle = '#f4ecd8';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#2b2118';
    g.font = '16px sans-serif';
    const cells = [
      ['ink-0', 'ink, samples 0'],
      ['ink-16', 'ink, samples 16'],
      ['plain-0', 'plain, samples 0'],
      ['plain-16', 'plain, samples 16'],
    ];
    for (let i = 0; i < 4; i++) {
      const [k, label] = cells[i];
      const x = 10 + (i % 2) * (w + 10);
      const y = 10 + Math.floor(i / 2) * (h + 40);
      g.fillText(label, x, y + 14);
      g.drawImage(await load(shots[k]), x, y + 22);
    }
    return c.toDataURL('image/jpeg', 0.92);
  }, shots);
  writeFileSync(`${out}/v4x-capture-samples.jpg`, Buffer.from(jpg.split(',')[1], 'base64'));
}
await browser.close();
