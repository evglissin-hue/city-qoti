// R3F: the lamplighter's round at rest, measured (a script, not a spec): what each lamp coming on
// costs the still frame, the handshake with V4A (docs/build/v4-wave-notes.md, Handshakes). The
// lights layer's debug lamplight scene plays tonight's round from the sim's clock (`live`), the sim
// at its top speed and the camera at rest on the street; every quarter second it records the lamps
// lit, the light map's revisions, still frames and shadow renders, and the light map's own redraw
// log (`?debug`). Needs the client dev server (`npm run dev`; QOTI_CLIENT_PORT, 5230 by default):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/r3f-walk.mjs
// QOTI_WALK_MAX_MIN (12) caps the round in real minutes; at 1x it needs more.
// QOTI_WALK_SHOTS=<folder> also saves a frame each time the lamps lit change (the player's chair).
// QOTI_WALK_SPEED=1|3 sets the sim speed (3 by default). Every row also carries the developing
// picture's samples and sample goal (V4A) and the frame mode: a lamp folds samples in, it never
// restarts the development (samples must not drop back to 0 once developed).
// Prints a row a lamp and the totals: light map redraws a lamp step (one at most), shadow renders
// during the walk that no light step explains (none), and the redraws' milliseconds.
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5230);
const base = `http://localhost:${clientPort}`;
const [vw, vh] = (process.env.QOTI_SIZE ?? '1250x800').split('x').map(Number);
const quality = process.env.QOTI_QUALITY ?? 'medium';

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const redraws = [];
page.on('console', (m) => {
  const t = m.text();
  const hit = /light map: (\d+) discs, (\d+) draws, ([\d.]+) ms/.exec(t);
  if (hit) redraws.push({ discs: Number(hit[1]), draws: Number(hit[2]), ms: Number(hit[3]) });
  else if (m.type() === 'error') console.log('console:', t);
});
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.route('**/api/**', (r) => r.abort());
// QOTI_WALK_FILE=<a .qoti saved at about 17:10> opens that valley from a file instead of the village
// fixture (06:00), skipping the day's run to the evening (which takes minutes under software GL).
const file = process.env.QOTI_WALK_FILE;
if (file) {
  await page.goto(`${base}/?debug&clean&fixedres&quality=${quality}`);
  await page.evaluate(() => document.querySelector('details.title-options')?.setAttribute('open', ''));
  await page.getByTestId('open-file').setInputFiles(file);
  await page.getByTestId('open-imported-solo').click();
  await page.waitForFunction(() => window.__qoti?.phase?.() === 'ready', null, { timeout: 240000 });
} else {
  await page.goto(
    `${base}/?debug&fixture=village&clean&fixedres&quality=${quality}&season=summer&day=3&weather=clear`,
  );
}
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
const speed = Number(process.env.QOTI_WALK_SPEED ?? 3);
// The village fixture opens at 06:00. With the canvas hidden the sim runs about ten times faster, so
// run on at the top speed to just before the lamplighter's round (QOTI_WALK_FROM, 17.2 by default),
// then pause, show the canvas and let the picture develop before the round is played at `speed`.
const from = Number(process.env.QOTI_WALK_FROM ?? 17.2);
await page.evaluate(() => {
  const st = document.createElement('style');
  st.id = 'walk-fast';
  st.textContent = 'canvas{display:none!important}';
  document.head.append(st);
});
const early = await page.evaluate((from) => {
  const c = window.__qoti.clock();
  return c.hour + c.minute / 60 < from;
}, from);
if (early) await page.evaluate(() => window.__qoti.submit({ t: 'time.setSpeed', speed: 3 }));
for (let i = 0; i < 20000; i++) {
  const c = await page.evaluate(() => window.__qoti.clock());
  if (i % 10 === 0) console.log('fast-forward', JSON.stringify(c));
  if (c.hour + c.minute / 60 >= from) break;
  await page.waitForTimeout(1000);
}
await page.evaluate(() => {
  window.__qoti.submit({ t: 'time.setSpeed', speed: 0 });
  document.getElementById('walk-fast')?.remove();
});
// QOTI_WALK_REAL=1 plays the valley's own lamplighter (a valley file with candles in store, where the
// sim publishes its own lamps) instead of the debug scene, whose view the sim's own would replace at
// the evening's settling; the camera rests on the town hall.
const real = process.env.QOTI_WALK_REAL === '1';
const info = await page.evaluate((real) => {
  const r = window.__qoti.renderer();
  const lights = r.layers.find((l) => l.id === 'lights');
  if (real) {
    const hall = window.__qoti.mirror().buildings.get(window.__qoti.buildingsOf('town-hall')[0]);
    window.__qoti.focusTile(hall.x, hall.z, 22);
    window.__qoti.setHour(null);
    return { lamps: 0 };
  }
  window.__r3f = lights.showcase();
  window.__r3f.live(0.5);
  const [x, z] = window.__r3f.street;
  window.__qoti.look(x, z, 16, 1.94 - r.rig.look.yaw, 0);
  return { lamps: window.__r3f.lamps.length };
}, real);
console.log('scene', JSON.stringify(info));
// Paused at rest until the picture has developed, then the round is played.
for (let i = 0; i < 2400; i++) {
  const st = await page.evaluate(() => window.__qoti.stats());
  if (st.mode === 'idle' && st.sampleGoal > 0 && st.samples >= st.sampleGoal) break;
  await page.waitForTimeout(250);
}
console.log(
  'developed',
  JSON.stringify(
    await page.evaluate(() => {
      const st = window.__qoti.stats();
      return {
        samples: st.samples,
        goal: st.sampleGoal,
        mode: st.mode,
        hour: window.__qoti.renderer().env.shown.hour,
      };
    }),
  ),
);
await page.evaluate((speed) => window.__qoti.submit({ t: 'time.setSpeed', speed }), speed);

const sample = () =>
  page.evaluate(() => {
    const r = window.__qoti.renderer();
    const st = window.__qoti.stats();
    return {
      hour: r.env.shown.hour,
      lit: r.layers.find((l) => l.id === 'lights').lit().lamps.length,
      map: r.env.lightMapRevision,
      still: st.stillRenders,
      shadow: st.shadowRenders,
      samples: st.samples ?? 0,
      goal: st.sampleGoal ?? 0,
      mode: st.mode ?? '',
      total: window.__qoti.supplies()?.lamps?.length ?? 0,
    };
  });

const rows = [];
let last = await sample();
const start = Date.now();
// Wait for the evening, then watch until the round is done (or 12 minutes pass).
while (Date.now() - start < Number(process.env.QOTI_WALK_MAX_MIN ?? 12) * 60 * 1000) {
  await page.waitForTimeout(250);
  const s = await sample();
  if (process.env.QOTI_WALK_SHOTS && s.lit !== last.lit)
    await page.screenshot({
      path: `${process.env.QOTI_WALK_SHOTS}/walk-${String(s.lit).padStart(2, '0')}.png`,
    });
  if (s.lit !== last.lit || s.hour !== last.hour || s.samples !== last.samples)
    rows.push({
      samples: s.samples,
      goal: s.goal,
      mode: s.mode,
      hour: s.hour,
      lit: s.lit,
      mapSteps: s.map - last.map,
      stillSteps: s.still - last.still,
      shadowSteps: s.shadow - last.shadow,
      lightStep: s.hour !== last.hour,
    });
  last = s;
  const total = real ? s.total : info.lamps;
  if (total > 0 && s.lit >= total && s.hour >= 18.75) break;
}
await browser.close();

console.log(
  '| Hour | Lamps lit | Samples | Goal | Mode | Light map redraws | Still frames | Shadow renders | Light step |',
);
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows)
  console.log(
    `| ${r.hour} | ${r.lit} | ${r.samples} | ${r.goal} | ${r.mode} | ${r.mapSteps} | ${r.stillSteps} | ${r.shadowSteps} | ${r.lightStep ? 'yes' : ''} |`,
  );
const lampRows = rows.filter((r) => !r.lightStep && r.lit !== undefined);
const shadowWithoutLight = lampRows.reduce((n, r) => n + r.shadowSteps, 0);
const ms = redraws.map((r) => r.ms);
console.log(
  `\nlamp steps ${lampRows.length}; light map redraws a lamp step at most ${Math.max(0, ...lampRows.map((r) => r.mapSteps))}; ` +
    `shadow renders on lamp steps ${shadowWithoutLight}; redraws logged ${ms.length}, ms min ${Math.min(...ms).toFixed(2)} ` +
    `median ${ms.sort((a, b) => a - b)[Math.floor(ms.length / 2)]?.toFixed(2)} max ${Math.max(...ms).toFixed(2)} (discs ${redraws.at(-1)?.discs})`,
);
