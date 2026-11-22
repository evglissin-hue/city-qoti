// R3F shots (a script, not a spec): the lamplighter's round as it lights, a street half lit and
// fully lit, candle-lit homes beside plain ones, and every resting piece beside its supplied self,
// at the default zoom (70 tiles) and the nearest (12), by day and by lamplight. The scene is the
// lights layer's debug lamplight scene (render/lamplightShowcase.ts) on the village fixture, since
// R3A's walk and settling are stand-ins until R3X: it writes `supplies.updated` itself, in this
// client's Mirror only. The sim is held and the animation clock frozen, so two runs of one build see
// the same picture. Needs the client dev server (`npm run dev`; QOTI_CLIENT_PORT, 5230 by default):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/r3f-shots.mjs [stage] [shot ...]
// Saves docs/build/screenshots/r3f-<stage>-<shot>.png (stage `after` by default) at 1250 x 800 on
// Medium, and prints each shot's draws, triangles and lamps lit.
// Env: QOTI_QUALITY (medium), QOTI_SIZE (1250x800), QOTI_OUT (the screenshots folder), QOTI_WAIT
// (least ms per shot, 6000), QOTI_HUD=1 keeps the interface.
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5230);
const base = `http://localhost:${clientPort}`;
const [stage = 'after', ...only] = process.argv.slice(2);
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const quality = process.env.QOTI_QUALITY ?? 'medium';
const [vw, vh] = (process.env.QOTI_SIZE ?? '1250x800').split('x').map(Number);
const wait = Number(process.env.QOTI_WAIT ?? 6000);

// Along the street from the north-east (the verge of lamps and the row behind it face the camera),
// close (16) and nearest (12); the default zoom (70) from the default yaw.
const STREET = { at: 'street', dist: 16, yaw: 1.94 };
const NEAR = { at: 'street', dist: 12, yaw: 1.94 };
const WIDE = { at: 'street', dist: 70, yaw: 0.5 };
const ROWS = { at: 'street', dist: 14, yaw: 2.6, dz: 1, man: false };
const ROUND = [0, 3, 6, 9, 12, 15];

/** Each shot: where the camera looks, the hour, and the scene's pose (lamps lit, candles, rests). */
const SHOTS = [
  // The round as it lights: 17:30 to 18:30, a lamp every few minutes (lit counts in round order).
  ...ROUND.map((lit, i) => ({ name: `round-${i}`, ...STREET, hour: 17.5 + i * 0.2, lit, candles: 0.5 })),
  { name: 'round-near-1740', ...NEAR, hour: 17.67, lit: 7, candles: 0 },
  { name: 'round-wide-1740', ...WIDE, hour: 17.67, lit: 7 },
  // A street half lit (the round at 17:40) and fully lit (21:00), close and wide.
  { name: 'street-half-1740', ...STREET, hour: 17.67, lit: 7 },
  { name: 'street-full-2100', ...STREET, hour: 21, man: false },
  { name: 'street-wide-2100', ...WIDE, hour: 21, man: false },
  // 19:00 with candles for half the street's lanterns: the kept end lit, the rest resting unlit.
  { name: 'street-kept-1900', ...STREET, hour: 19, supplied: 8, man: false },
  { name: 'street-kept-wide-1900', ...WIDE, hour: 19, supplied: 8, man: false },
  // A candle-lit row against the same row on the share alone, and homes with and without, mixed.
  { name: 'candles-row-2100', ...ROWS, hour: 21, candles: 'south' },
  { name: 'candles-none-2100', ...ROWS, hour: 21, candles: 0 },
  { name: 'candles-mixed-2000', ...ROWS, hour: 20, candles: 0.5 },
  // Every resting piece (right) beside its supplied self (left), nearest zoom, by day and by
  // lamplight; and the whole lineup at the default zoom.
  ...[0, 1, 2, 3].flatMap((row) => [
    { name: `rest-row${row}-day`, at: `row${row}`, dist: 12, yaw: 0, hour: 11 },
    { name: `rest-row${row}-night`, at: `row${row}`, dist: 12, yaw: 0, hour: 21.5 },
  ]),
  { name: 'rest-wide-day', at: 'lineup', dist: 70, yaw: 0, hour: 11 },
  { name: 'rest-wide-night', at: 'lineup', dist: 70, yaw: 0, hour: 21.5 },
];

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
await page.route('**/api/**', (r) => r.abort());
await page.goto(
  `${base}/?debug&fixture=village&clean&fixedres&quality=${quality}&season=summer&day=3&weather=clear`,
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
if (process.env.QOTI_HUD !== '1')
  await page.addStyleTag({ content: '.game-ui { display: none !important; }' });
// The sim held, so the scene's own view of the supplies is the only one.
await page.evaluate(() => window.__qoti.submit({ t: 'time.setSpeed', speed: 0 }));
await page.waitForTimeout(500);
const info = await page.evaluate(() => {
  const lights = window.__qoti.renderer().layers.find((l) => l.id === 'lights');
  window.__r3f = lights.showcase();
  return { street: window.__r3f.street, lineup: window.__r3f.lineup, rows: window.__r3f.rows };
});
console.log('scene', JSON.stringify(info));

const rows = [];
for (const s of SHOTS) {
  if (only.length && !only.includes(s.name)) continue;
  await page.evaluate(
    ([s, info]) => {
      const r = window.__qoti.renderer();
      // Moving again for the camera's jump; frozen below once the scene has settled.
      r.env.motion = true;
      window.__qoti.setHour(s.hour);
      window.__r3f.pose({
        hour: s.hour,
        lit: s.lit,
        candles: s.candles,
        supplied: s.supplied,
        lamplighter: s.man,
      });
      const at =
        s.at === 'lineup' ? info.lineup : s.at === 'street' ? info.street : info.rows[Number(s.at.slice(3))];
      window.__qoti.look(at[0] + (s.dx ?? 0), at[1] + (s.dz ?? 0), s.dist, s.yaw - r.rig.look.yaw, 0);
    },
    [s, info],
  );
  await page.waitForTimeout(wait);
  // The animation clock stopped at one time, so smoke, water and flames draw alike in every run.
  await page.evaluate(() => {
    const r = window.__qoti.renderer();
    r.env.motion = false;
    r.env.time.value = 100;
    r.env.staticTime.value = 100;
    r.invalidateStatic('shots');
  });
  await page.waitForTimeout(2500);
  const stat = await page.evaluate(() => {
    const st = window.__qoti.stats();
    const lit = window.__qoti
      .renderer()
      .layers.find((l) => l.id === 'lights')
      .lit();
    return { draws: st?.drawCalls ?? st?.calls, triangles: st?.triangles, lamps: lit.lamps.length };
  });
  const file = `${out}/r3f-${stage}-${s.name}.png`;
  await page.screenshot({ path: file });
  rows.push({ shot: s.name, hour: s.hour, ...stat });
  console.log(file, JSON.stringify(stat));
}
await browser.close();
console.log('\n| Shot | Hour | Draws | Triangles | Lamps lit |\n|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.shot} | ${r.hour} | ${r.draws} | ${r.triangles} | ${r.lamps} |`);
