// P3C weather contact sheet (a script, not a spec): the look in the weather and hours the owner
// plays in, so a broken, unlit or stand-in frame is caught before a playtest. For each fixture (the
// grown village and a fresh hamlet), season and the weathers that season has (clear, rain, fog;
// snow in winter), it shoots the default camera (70 tiles, 45 degrees) and the nearest (12 tiles,
// 30 degrees, the play clamp's limits) at noon, dusk, 22:00 and dawn, then lays each fixture and
// season out as one sheet: a row per weather and camera, a column per hour. Needs the client dev
// server (`npm run dev`; QOTI_CLIENT_PORT for another port, 5230):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/p3c-contact.mjs after [fixture ...]
// The stage names the sheets: docs/build/screenshots/p3c-<stage>-sheet-<fixture>-<season>.png. The
// frames themselves go to QOTI_FRAMES (a folder in the system's temp dir by default).
// Env: QOTI_SEASONS (spring,summer,autumn,winter), QOTI_HOURS (noon,dusk,night,dawn), QOTI_SIZE (a
// frame, 720x450), QOTI_QUALITY (medium), QOTI_WAIT (least ms per frame, 5000), QOTI_OUT (the sheets'
// folder), QOTI_FRAMES. Each frame waits until the scene has finished streaming (as v3-shots.mjs).
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5230);
const base = `http://localhost:${clientPort}`;
const [stage = 'after', ...onlyFixtures] = process.argv.slice(2);
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const frames = process.env.QOTI_FRAMES ?? join(tmpdir(), `p3c-contact-${stage}`);
const quality = process.env.QOTI_QUALITY ?? 'medium';
const [vw, vh] = (process.env.QOTI_SIZE ?? '720x450').split('x').map(Number);
mkdirSync(frames, { recursive: true });
mkdirSync(out, { recursive: true });

const FIXTURES = onlyFixtures.length ? onlyFixtures : ['grown', 'hamlet'];
/** The day each season is shot on: blossom out in spring, leaves falling in autumn, deep snow. */
const SEASONS = {
  spring: { day: 3, weathers: ['clear', 'rain', 'fog'] },
  summer: { day: 3, weathers: ['clear', 'rain'] },
  autumn: { day: 5, weathers: ['clear', 'rain', 'fog'] },
  winter: { day: 3, weathers: ['clear', 'snow', 'fog'] },
};
const HOURS = { noon: 12, dusk: 19.2, night: 22, dawn: 6 };
const seasons = (process.env.QOTI_SEASONS ?? Object.keys(SEASONS).join(',')).split(',');
const hours = (process.env.QOTI_HOURS ?? Object.keys(HOURS).join(',')).split(',');
/** The play camera's default and its nearest (distance in tiles, pitch in degrees). */
const CAMERAS = [
  { name: 'default', dist: 70, pitch: 45 },
  { name: 'nearest', dist: 12, pitch: 30 },
];

/** As v3-shots.mjs: at least `least` ms, then until the triangle count holds within 2%. */
async function settle(page, least) {
  const start = Date.now();
  await page.waitForTimeout(least);
  const counts = [];
  while (Date.now() - start < 240000) {
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
}

const browser = await chromium.launch({
  ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

for (const fixture of FIXTURES) {
  for (const season of seasons) {
    const spec = SEASONS[season];
    if (!spec) continue;
    const cells = [];
    for (const weather of spec.weathers) {
      const page = await browser.newPage({ viewport: { width: vw, height: vh } });
      page.on('pageerror', (e) => console.log('pageerror:', e.message));
      await page.route('**/api/**', (r) => r.abort());
      await page.goto(
        `${base}/?debug&fixture=${fixture}&clean&fixedres&quality=${quality}&season=${season}&day=${spec.day}&weather=${weather}`,
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
      const info = await page.evaluate(() => window.__qoti.grownInfo());
      for (const cam of CAMERAS) {
        // The nearest camera looks at the high street's door when there is one, else the middle.
        const at = cam.name === 'nearest' && info?.door ? [info.door.x, info.door.z] : info.center;
        for (const hour of hours) {
          await page.evaluate(
            ([x, z, d, h, pitch]) => {
              window.__qoti.setHour(h);
              const r = window.__qoti.renderer();
              window.__qoti.look(x, z, d, 0, 0);
              // The pitch from the top of the play clamp (65 degrees) down to the one asked for.
              r.rig.rotateBy(0, 10);
              r.rig.rotateBy(0, ((pitch - 65) * Math.PI) / 180);
              r.rig.snap();
              // snap() leaves the camera where it was when the ground under the view is unchanged.
              r.rig.apply();
            },
            [at[0], at[1], cam.dist, HOURS[hour], cam.pitch],
          );
          await settle(page, Number(process.env.QOTI_WAIT ?? 5000));
          const file = join(frames, `${fixture}-${season}-${weather}-${cam.name}-${hour}.png`);
          await page.screenshot({ path: file, timeout: 240000 });
          cells.push({ row: `${weather}, ${cam.name}`, hour, file });
          console.log(file);
        }
      }
      await page.close();
    }
    // The sheet: a row per weather and camera, a column per hour, each frame at half size.
    const rows = [...new Set(cells.map((c) => c.row))];
    const img = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
    const w = Math.round(vw / 2);
    const html = `<!doctype html><meta charset="utf-8"><style>
      body { margin: 0; background: #2b2722; color: #efe6d6; font: 13px/1.3 sans-serif; }
      table { border-collapse: collapse; } td, th { padding: 3px; vertical-align: top; }
      th { text-align: left; font-weight: 600; } img { display: block; width: ${w}px; }
    </style><h3 style="margin:8px">${fixture}, ${season} (day ${spec.day}), ${stage}</h3><table>
      <tr><th></th>${hours.map((h) => `<th>${h}</th>`).join('')}</tr>
      ${rows
        .map(
          (r) =>
            `<tr><th>${r}</th>${hours
              .map((h) => {
                const c = cells.find((x) => x.row === r && x.hour === h);
                return `<td>${c ? `<img src="${img(c.file)}">` : ''}</td>`;
              })
              .join('')}</tr>`,
        )
        .join('')}
    </table>`;
    const sheet = await browser.newPage({ viewport: { width: w * hours.length + 160, height: 400 } });
    await sheet.setContent(html);
    const path = `${out}/p3c-${stage}-sheet-${fixture}-${season}.png`;
    await sheet.screenshot({ path, fullPage: true });
    await sheet.close();
    console.log('sheet', path);
  }
}
await browser.close();
