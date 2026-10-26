// Scratch screenshot script for the C3D-1 world look (not a spec). Needs the relay and the client
// running (see CLAUDE.md), then:
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/c3d1-shots.mjs <outDir> <prefix> [shots]
// Creates a fresh standard valley with a fixed seed through the relay's API, joins it through the
// invite fragment and takes day, dusk, night, close-up and wide shots from the same cameras.
// Prints renderer stats (draw calls, triangles) for each shot.
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5184);
const base = `http://localhost:${clientPort}`;
const out = process.argv[2] ?? 'docs/build/screenshots';
const prefix = process.argv[3] ?? 'c3d1';
const only = process.argv[4] ? process.argv[4].split(',') : null;
const seed = process.env.QOTI_SEED ?? 'storybook-1';
const quality = process.env.QOTI_QUALITY ?? 'medium';

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

const res = await fetch(`${base}/api/valleys`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ seed, settings: { mode: 'standard', townName: 'Qoti' } }),
});
const valley = await res.json();

const shots = [
  // name, hour, camera distance, rotate key presses (ms of E)
  ['day', 10.5, 60, 0],
  ['dusk', 19.2, 60, 0],
  ['night', 22.5, 60, 0],
  ['closeup', 15, 20, 0],
  ['wide', 13, 150, 0],
  ['river', 11, 34, 0],
].filter(([n]) => !only || only.includes(n));

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console:', m.text());
});
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`${base}/?debug&quality=${quality}${valley.invites[0]}`);
await page.getByTestId('join').click();
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 120000 });
// Close the invite or welcome dialog if one is open.
for (const name of ['Done', 'Close']) {
  const b = page.getByRole('button', { name });
  if (await b.count())
    await b
      .first()
      .click()
      .catch(() => {});
}
// Far chunks stream in after the first frame; at SwiftShader speed that takes a while.
await page.waitForTimeout(40000);
for (const [name, hour, dist, rot] of shots) {
  await page.evaluate(
    ([h, d]) => {
      window.__qoti.setHour(h);
      window.__qoti.focusStart(d, true);
    },
    [hour, dist],
  );
  if (rot) {
    await page.keyboard.down('e');
    await page.waitForTimeout(rot);
    await page.keyboard.up('e');
  }
  if (name === 'river') {
    await page.evaluate((d) => {
      const w = window.__qoti.nearestWater?.();
      if (w) window.__qoti.look(w[0], w[1], d);
    }, dist);
  }
  await page.waitForTimeout(7000);
  const stats = await page.evaluate(() => window.__qoti.stats());
  console.log(name, JSON.stringify({ draws: stats?.drawCalls, tris: stats?.triangles }));
  await page.screenshot({ path: `${out}/${prefix}-${name}.png`, timeout: 180000 });
}

// Feature shots (after the before-and-after set, so those stay comparable): lanterns and a bench
// by the town hall, a path, a plank bridge over the river and a field with crops at every stage.
const features = [
  ['bridge', 11, 14],
  ['fields', 10, 16],
  ['lanterns', 22, 18],
  ['rim', 16.5, 46],
  ['horizon', 18.4, 70],
].filter(([n]) => !only || only.includes(n));
if (features.length) {
  for (const def of ['lantern', 'lantern', 'bench', 'lantern', 'lantern']) {
    await page.evaluate((d) => {
      const s = window.__qoti.findDecorSpot(d);
      if (s) window.__qoti.submit({ t: 'decor.place', def: d, fx: s.fx, fz: s.fz, rot: 0 });
    }, def);
    await page.waitForTimeout(1500);
  }
  const bridge = await page.evaluate(() => {
    const q = window.__qoti;
    const w = q.nearestWater();
    if (!w) return null;
    // Cross the river the short way, from bank to bank.
    let best = null;
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
    ]) {
      const tiles = [];
      let x = w[0];
      let z = w[1];
      while (q.isWater(x - dx, z - dz)) {
        x -= dx;
        z -= dz;
      }
      tiles.push([x - dx, z - dz]);
      while (q.isWater(x, z)) {
        tiles.push([x, z]);
        x += dx;
        z += dz;
      }
      tiles.push([x, z]);
      if (!best || tiles.length < best.length) best = tiles;
    }
    q.submit({ t: 'road.paint', kind: 'path', tiles: best });
    return { at: w, tiles: best };
  });
  console.log('bridge', JSON.stringify(bridge));
  const field = await page.evaluate(() => {
    const q = window.__qoti;
    const a = q.startArea();
    const x0 = a[0] + 1;
    const z0 = a[1] + 2;
    // Look checks only: the field sim (C3C) is not in yet, so paint the client's mirror.
    q.paintLayer('terrain', x0, z0, x0 + 5, z0 + 6, 7);
    q.paintLayer('crop', x0, z0, x0 + 5, z0 + 6, (x) => Math.min(255, (x - x0) * 51));
    return [x0 + 3, z0 + 3.5];
  });
  // SwiftShader draws about a frame a second: give the chunk rebuilds time to land.
  await page.waitForTimeout(15000);
  for (const [name, hour, dist] of features) {
    await page.evaluate(
      ([n, h, d, b, f]) => {
        const q = window.__qoti;
        q.setHour(h);
        if (n === 'bridge' && b) q.look(b.at[0], b.at[1], d);
        else if (n === 'fields') q.look(f[0], f[1], d);
        else if (n === 'rim') {
          // The valley's rocky rim, mountains and mist, seen from inside.
          const a = q.startArea();
          q.look(a[0] < 96 ? 26 : 166, (a[1] + a[3]) / 2, d, 0, 0);
        } else if (n === 'horizon') {
          // Tilted low so the sky, clouds and the misty rim show.
          const a = q.startArea();
          q.look((a[0] + a[2]) / 2, (a[1] + a[3]) / 2, d, 0.4, -0.5);
        } else q.focusStart(d, true);
      },
      [name, hour, dist, bridge, field],
    );
    await page.waitForTimeout(10000);
    const stats = await page.evaluate(() => window.__qoti.stats());
    console.log(name, JSON.stringify({ draws: stats?.drawCalls, tris: stats?.triangles }));
    await page.screenshot({ path: `${out}/${prefix}-${name}.png`, timeout: 180000 });
  }
}
await page.close();
await browser.close();
