// R3F: the lamplighter's round at rest, measured (a script, not a spec): what each lamp coming on
// costs the still frame, the handshake with V4A (docs/build/v4-wave-notes.md, Handshakes). The
// lights layer's debug lamplight scene plays tonight's round from the sim's clock (`live`), the sim
// at its top speed and the camera at rest on the street; every quarter second it records the lamps
// lit, the light map's revisions, still frames and shadow renders, and the light map's own redraw
// log (`?debug`). Needs the client dev server (`npm run dev`; QOTI_CLIENT_PORT, 5230 by default):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/r3f-walk.mjs
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
await page.addStyleTag({ content: '.game-ui { display: none !important; }' });
const info = await page.evaluate(() => {
  const r = window.__qoti.renderer();
  const lights = r.layers.find((l) => l.id === 'lights');
  window.__r3f = lights.showcase();
  window.__r3f.live(0.5);
  const [x, z] = window.__r3f.street;
  window.__qoti.look(x, z, 16, 1.94 - r.rig.look.yaw, 0);
  window.__qoti.submit({ t: 'time.setSpeed', speed: 3 });
  return { lamps: window.__r3f.lamps.length };
});
console.log('scene', JSON.stringify(info));

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
    };
  });

const rows = [];
let last = await sample();
const start = Date.now();
// Wait for the evening, then watch until the round is done (or 12 minutes pass).
while (Date.now() - start < 12 * 60 * 1000) {
  await page.waitForTimeout(250);
  const s = await sample();
  if (s.lit !== last.lit || s.hour !== last.hour)
    rows.push({
      hour: s.hour,
      lit: s.lit,
      mapSteps: s.map - last.map,
      stillSteps: s.still - last.still,
      shadowSteps: s.shadow - last.shadow,
      lightStep: s.hour !== last.hour,
    });
  last = s;
  if (s.lit >= info.lamps && s.hour >= 18.75) break;
}
await browser.close();

console.log('| Hour | Lamps lit | Light map redraws | Still frames | Shadow renders | Light step |');
console.log('|---|---|---|---|---|---|');
for (const r of rows)
  console.log(
    `| ${r.hour} | ${r.lit} | ${r.mapSteps} | ${r.stillSteps} | ${r.shadowSteps} | ${r.lightStep ? 'yes' : ''} |`,
  );
const lampRows = rows.filter((r) => !r.lightStep);
const shadowWithoutLight = lampRows.reduce((n, r) => n + r.shadowSteps, 0);
const ms = redraws.map((r) => r.ms);
console.log(
  `\nlamp steps ${lampRows.length}; light map redraws a lamp step at most ${Math.max(0, ...lampRows.map((r) => r.mapSteps))}; ` +
    `shadow renders on lamp steps ${shadowWithoutLight}; redraws logged ${ms.length}, ms min ${Math.min(...ms).toFixed(2)} ` +
    `median ${ms.sort((a, b) => a - b)[Math.floor(ms.length / 2)]?.toFixed(2)} max ${Math.max(...ms).toFixed(2)} (discs ${redraws.at(-1)?.discs})`,
);
