// R3X screenshots (a script, not a spec): the master's sign and the two master pieces.
//
// The grown village showcase (`__qoti.villageShowcase`, debug only, this client's Mirror) stands a
// street of businesses at mixed levels; this script then gives every other business, and the
// specialized buildings that can have one, a master (`BuildingView.master`, set here through the
// Mirror's own `apply`, never the sim), so a mastered business stands beside one without. Needs the
// client dev server (QOTI_CLIENT_PORT, default 5247):
//   QOTI_CLIENT_PORT=5247 QOTI_RELAY_PORT=8857 npm run dev -w @qoti/client
//   node apps/client/e2e/r3x-master-shots.mjs [outDir]
// The default framing is the west end of the workshop row (a lodge, a weaver and a windmill with masters
// beside a carpenter without). Writes r3x-master-sign-day.png, -night.png, -close.png and r3x-master-decor.png (deviceScaleFactor 1).
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

async function shot(name, hour, x, z, dist, turn = 0, tilt = 0) {
  await page.evaluate(([h]) => window.__qoti.setHour(h), [hour]);
  await page.evaluate(([a, b, d, t, u]) => window.__qoti.look(a, b, d, t, u), [x, z, dist, turn, tilt]);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 240000 });
  console.log(name);
}

// Close-ups go below the play camera's 12 tile limit: photo mode's free camera (3 tiles); photo mode
// also blurs the edges (depth of field), so it is switched off again after each close shot.
async function free(on) {
  await page.evaluate((v) => window.__qoti.renderer().photo.setPhoto(v), on);
}

if (!only || only === 'sign') {
  const at = process.env.QOTI_AT?.split(',').map(Number) ?? [49.5, 59.5];
  const dist = Number(process.env.QOTI_DIST ?? 15);
  await shot('r3x-master-sign-day', 11, at[0], at[1], dist);
  await shot('r3x-master-sign-night', 21.5, at[0], at[1], dist);
  await free(true);
  const close = process.env.QOTI_CLOSE_AT?.split(',').map(Number) ?? [50.1, 59.3];
  await shot(
    'r3x-master-sign-close',
    11,
    close[0],
    close[1],
    Number(process.env.QOTI_CLOSE ?? 2.6),
    Number(process.env.QOTI_TURN ?? 0),
    Number(process.env.QOTI_TILT ?? 0),
  );
  await free(false);
}

if (!only || only === 'decor') {
  // A lawn with the two pieces beside the cherry tree and a bench for scale: three free tiles in a row.
  const spot = await page.evaluate(() => {
    const m = window.__qoti.mirror();
    const near = (x, z) =>
      [...m.decor.values()].some((d) => Math.abs(d.fx / 256 - x) < 2.5 && Math.abs(d.fz / 256 - z) < 2.5);
    for (let z = 50; z < 75; z++)
      for (let x = 40; x < 95; x++) {
        let free = true;
        for (let dz = -2; dz <= 3 && free; dz++)
          for (let dx = -1; dx < 8 && free; dx++)
            if (
              near(x + dx, z + dz) ||
              m.occupant(x + dx, z + dz) ||
              m.road(x + dx, z + dz) ||
              m.water(x + dx, z + dz) ||
              m.tree(x + dx, z + dz)
            )
              free = false;
        if (free) return [x, z];
      }
    return null;
  });
  console.log('decor spot', spot);
  if (spot) {
    const [x, z] = spot;
    await page.evaluate(
      ([x0, z0]) => {
        const m = window.__qoti.mirror();
        const put = (id, def, tx, tz, rot = 0) => ({
          e: 'decor.added',
          d: { id, def, fx: Math.round((tx + 0.5) * 256), fz: Math.round((tz + 0.5) * 256), rot, builtBy: 0 },
        });
        m.apply({
          t: m.lastTurn.value,
          events: [
            put(910001, 'ornamental-tree', x0 + 1.2, z0 + 1),
            put(910002, 'carved-stone', x0 + 3.2, z0 + 1),
            put(910003, 'cherry-tree', x0 + 5, z0 + 1),
            put(910004, 'bench', x0 + 3.2, z0 + 2.6),
          ],
          patches: [],
        });
      },
      [x, z],
    );
    await free(true);
    await shot('r3x-master-decor', 11, x + 2.4, z + 1, Number(process.env.QOTI_DECOR ?? 6.5));
    await free(false);
  }
}
await browser.close();
