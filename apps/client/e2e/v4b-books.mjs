// V4B: the books' ink pictures in the real interface (a script, not a spec): the Pattern Book's page
// slot, the season card, the Chronicle's column with an ink snapshot, a print-size picture, and a
// photo saved from photo mode; then the numbers (captures wait for rest, and none is taken while no
// book is open). Needs the client dev server (`npm run dev`; QOTI_CLIENT_PORT, 5262):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v4b-books.mjs [stage]
// Saves <out>/v4b-<stage>-<shot>.png (QOTI_OUT, docs/build/screenshots by default); QOTI_HOUR (11).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5262);
const [stage = 'books'] = process.argv.slice(2);
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const hour = Number(process.env.QOTI_HOUR ?? 11);
mkdirSync(out, { recursive: true });
const file = (name) => `${out}/v4b-${stage}-${name}.png`;

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text().slice(0, 300)));
await page.route('**/api/**', (r) => r.abort());
await page.addInitScript(() => {
  const t = setInterval(() => {
    if (window.__qoti?.status?.() !== 'live') return;
    window.__qoti.submit({ t: 'time.setSpeed', speed: 0 });
    clearInterval(t);
  }, 5);
});
await page.goto(
  `http://localhost:${clientPort}/?debug&fixture=grown&clean&fixedres&quality=medium&season=summer&day=3&weather=clear`,
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
const info = await page.evaluate((h) => {
  const q = window.__qoti;
  q.setHour(h);
  const g = q.grownInfo();
  q.focusTile(Math.floor(g.center[0]), Math.floor(g.center[1]), 70);
  return g;
}, hour);
await page.waitForTimeout(8000);

const frames = (n) =>
  page.evaluate(
    (n) =>
      new Promise((r) => {
        let k = 0;
        const step = () => (++k >= n ? r() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    n,
  );

// 1. Nothing is captured while no book is open: a minute of the valley at rest, books closed.
const numbers = process.env.QOTI_NUMBERS !== '0';
const idle = !numbers
  ? { taken: 'skipped' }
  : await page.evaluate(async () => {
      const r = window.__qoti.renderer();
      const before = r.captures.taken;
      await new Promise((res) => setTimeout(res, 60000));
      return { taken: r.captures.taken - before };
    });
console.log('idle minute, books closed: captures taken', idle.taken);

// 2. A capture asked while the camera moves waits for the rest.
const moving = !numbers
  ? 'skipped'
  : await page.evaluate(async (c) => {
      const r = window.__qoti.renderer();
      let moves = 0;
      let stop = false;
      const spin = () => {
        if (stop) return;
        r.rig.rotateBy(0.01, 0);
        moves++;
        requestAnimationFrame(spin);
      };
      requestAnimationFrame(spin);
      const waited0 = r.captures.waitedFrames;
      let doneAtMove = -1;
      const p = r
        .capture({ focus: c, radius: 14, size: [480, 360], style: 'ink' })
        .then(() => (doneAtMove = moves));
      await new Promise((res) => setTimeout(res, 6000));
      const during = doneAtMove;
      stop = true;
      const movedTotal = moves;
      await p;
      return {
        capturedWhileMoving: during !== -1,
        movesWhileWaiting: movedTotal,
        waitedFrames: r.captures.waitedFrames - waited0,
        ms: r.captures.lastMs,
      };
    }, info.street);
console.log('capture asked mid-move:', JSON.stringify(moving));
await page.evaluate((c) => {
  const q = window.__qoti;
  q.focusTile(Math.floor(c[0]), Math.floor(c[1]), 70);
}, info.center);
await frames(6);

// 3. The Pattern Book's page with its slot.
const found = await page.evaluate(() => {
  const q = window.__qoti;
  // Put away the cards the grown valley arrives with, so the books are seen alone.
  const ui = q.ui();
  for (const k of ['letter', 'chapter', 'edition', 'festivalCard', 'raidCard', 'rankUp', 'storyLetter'])
    if (ui[k]) ui[k].value = null;
  const m = q.renderer().mirror;
  const p = [...m.patterns.values()].find((v) => v.discovered && v.sites.length);
  if (!p) return null;
  q.openPanel('patterns');
  q.ui().bookPage.value = p.id;
  return p.id;
});
console.log('pattern page', found);
if (found) {
  await page.waitForSelector('[data-testid="page-picture"] img', { timeout: 240000 });
  await page.waitForTimeout(800);
  await page.getByTestId('patterns').screenshot({ path: file('patternbook') });
  console.log('saved', file('patternbook'));
}
await page.evaluate(() => window.__qoti.openPanel(null));

// 4. The season card.
const card = await page.evaluate(() => {
  return window.__qoti.showSeasonCard();
});
if (card) {
  await page.waitForSelector('[data-testid="season-card-picture"] img', { timeout: 240000 });
  await page.waitForTimeout(800);
  await page.getByTestId('season-card').screenshot({ path: file('seasoncard') });
  console.log('saved', file('seasoncard'));
  await page.evaluate(() => (window.__qoti.ui().almanac.value = null));
} else console.log('no season card in this valley');

// 5. The Chronicle with an ink snapshot (the flow C5F built, drawn as a new entry would be).
await page.evaluate(async (c) => {
  const q = window.__qoti;
  const r = q.renderer();
  const ui = q.ui();
  const entries = r.mirror.chronicle.value;
  const pick = [...entries].reverse().slice(0, 2);
  const next = new Map(ui.snapshots.value);
  for (const e of pick) {
    const snap = e.snapshot ?? { focus: c, radius: 18 };
    const blob = await r.capture({ focus: snap.focus, radius: snap.radius, size: [320, 200], style: 'ink' });
    if (blob) next.set(e.id, URL.createObjectURL(blob));
  }
  ui.snapshots.value = next;
  q.openPanel('chronicle');
}, info.center);
await page.waitForSelector('.gazette-picture img', { timeout: 240000 });
await page.waitForTimeout(800);
await page.getByTestId('chronicle').screenshot({ path: file('chronicle') });
console.log('saved', file('chronicle'));
await page.evaluate(() => window.__qoti.openPanel(null));

// 6. A print-size picture (the storybook's 80 x 60 mm at 1600 x 1200).
const print = await page.evaluate(async (c) => {
  const r = window.__qoti.renderer();
  const blob = await r.capture({ focus: c, radius: 16, size: [1600, 1200], style: 'ink' });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { b64: btoa(s), ms: r.captures.lastMs };
}, info.street);
writeFileSync(file('print'), Buffer.from(print.b64, 'base64'));
console.log('saved', file('print'), `(capture ${print.ms.toFixed(0)} ms)`);

// 7. A photo saved from photo mode.
await page.evaluate(() => (window.__qoti.ui().photo.value = true));
await page.waitForSelector('[data-testid="photo-strip"]');
await frames(4);
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 240000 }),
  page.getByTestId('photo-save').click(),
]);
await download.saveAs(file('photo'));
console.log('saved', file('photo'));
await browser.close();
