// R3X screenshots (a script, not a spec): the master's sign and the two master pieces.
//
// The grown village showcase (`__qoti.villageShowcase`, debug only, this client's Mirror) stands a
// street of businesses at mixed levels; this script then gives every other business, and the
// specialized buildings that can have one, a master (`BuildingView.master`, set here through the
// Mirror's own `apply`, never the sim), so a mastered business stands beside one without. Needs the
// client dev server (QOTI_CLIENT_PORT, default 5247):
//   QOTI_CLIENT_PORT=5247 QOTI_RELAY_PORT=8857 npm run dev -w @qoti/client
//   node apps/client/e2e/r3x-master-shots.mjs [outDir]
// Writes r3x-master-sign-day.png, -night.png, -close.png and r3x-master-decor.png (deviceScaleFactor 1).
// Env: QOTI_CHROMIUM (default /opt/pw-browsers/chromium), QOTI_ONLY ('sign' or 'decor').
import { chromium } from '@playwright/test';

const port = Number(process.env.QOTI_CLIENT_PORT ?? 5247);
const out = process.argv[2] ?? 'docs/build/screenshots';
const only = process.env.QOTI_ONLY;
const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1250, height: 800 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.route('**/api/**', (r) => r.abort());
await page.goto(
  `http://localhost:${port}/?debug&fixture=village&clean&quality=medium&fixedres&season=summer&day=3`,
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
await page.evaluate(() => {
  window.__qoti.villageShowcase(false, false);
  window.__qoti.submit({ t: 'time.setSpeed', speed: 0 });
});
await page.addStyleTag({ content: '.game-ui { visibility: hidden !important; }' });

// Every other business gets a master; so does every specialized building that can have one.
const masters = await page.evaluate(() => {
  const m = window.__qoti.mirror();
  const specialized = new Set(['fishery', 'foresters-lodge', 'quarry', 'windmill']);
  const list = [];
  let i = 0;
  for (const b of m.buildings.values()) {
    if (b.stage !== 'built') continue;
    if (b.trade) {
      if (i++ % 2 === 0) list.push(b.id);
    } else if (specialized.has(b.def)) list.push(b.id);
  }
  const events = list.map((id) => ({ e: 'building.updated', b: { ...m.buildings.get(id), master: true } }));
  m.apply({ t: m.lastTurn.value, events, patches: [] });
  return list.map((id) => {
    const b = m.buildings.get(id);
    return { id, def: b.def, trade: b.trade ?? null, level: b.level ?? 1, x: b.x, z: b.z, rot: b.rot };
  });
});
console.log('masters', masters.length);
console.log(JSON.stringify(masters));

async function shot(name, hour, x, z, dist, turn = 0, tilt = 0) {
  await page.evaluate(([h]) => window.__qoti.setHour(h), [hour]);
  await page.evaluate(([a, b, d, t, u]) => window.__qoti.look(a, b, d, t, u), [x, z, dist, turn, tilt]);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 240000 });
  console.log(name);
}

if (!only || only === 'sign') {
  const at = process.env.QOTI_AT?.split(',').map(Number) ?? [60, 58];
  await shot('r3x-master-sign-day', 11, at[0], at[1], Number(process.env.QOTI_DIST ?? 26));
  await shot('r3x-master-sign-night', 21.5, at[0], at[1], Number(process.env.QOTI_DIST ?? 26));
  await shot('r3x-master-sign-close', 11, at[0], at[1], Number(process.env.QOTI_CLOSE ?? 10));
}
await browser.close();
