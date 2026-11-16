// R2F before and after shots of a grown street (a script, not a spec). The valley is laid by
// r2f-street-grow.ts and loaded as the client's grown fixture (?debug&fixture=grown), so copy it over
// apps/client/src/app/fixtures/grown.qoti in a scratch checkout first (never commit that change):
//   cp /path/after.qoti apps/client/src/app/fixtures/grown.qoti
//   QOTI_CLIENT_PORT=5236 QOTI_RELAY_PORT=8846 npx vite --config apps/client/vite.config.ts apps/client  (dev server)
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_CLIENT_PORT=5236 node apps/client/e2e/r2f-street.mjs after 106 139.5
// Args: stage (before or after), the street block's center tile (x z), as r2f-street-grow.ts
// prints it, then optionally the high street row's tile for the fourth shot (default 102 135.5). Takes four shots at 1440 x 900, deviceScaleFactor 2, the interface hidden, 11:00:
// day (default distance 40), street (distance 30, the grid fills the frame) and row (distance 20 at the row), and ledger (the street zoom with the Ledger lens and its
// zones overlay: lot outlines and zone tints). Saves docs/build/screenshots/r2f-<stage>-<shot>.png.
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5236);
const [stage = 'after', cx = '106', cz = '139.5', rx = '102', rz = '135.5'] = process.argv.slice(2);
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const x = Number(cx);
const z = Number(cz);

const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.route('**/api/**', (r) => r.abort());
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
await page.addStyleTag({ content: '.game-ui { display: none !important; }' });

async function settle(ms) {
  await page.waitForTimeout(ms);
  for (let k = 0; k < 40; k++) {
    const counts = [];
    for (let j = 0; j < 3; j++)
      counts.push(
        await page.evaluate(
          () =>
            new Promise((res) => {
              let n = 0;
              const step = () =>
                ++n >= 3 ? res(window.__qoti.stats()?.triangles ?? 0) : requestAnimationFrame(step);
              requestAnimationFrame(step);
            }),
        ),
      );
    if (Math.max(...counts) - Math.min(...counts) <= Math.max(...counts) * 0.02) return;
  }
}

async function shot(name, dist, lens, tilt, at = [x, z]) {
  await page.evaluate(
    ([lx, lz, d, l, t]) => {
      window.__qoti.setLens(l);
      window.__qoti.ui().overlay.value = l === 'ledger' ? 'zones' : 'off';
      window.__qoti.setHour(11);
      window.__qoti.look(lx, lz, d, 0, t);
    },
    [at[0], at[1], dist, lens, tilt],
  );
  await settle(Number(process.env.QOTI_WAIT ?? 8000));
  const file = `${out}/r2f-${stage}-${name}.png`;
  await page.screenshot({ path: file, timeout: 240000 });
  console.log(file, JSON.stringify(await page.evaluate(() => window.__qoti.clock())));
}

await shot('day', 40, 'hearth', 0);
await shot('street', 30, 'hearth', 0);
await shot('ledger', 30, 'ledger', 0);
// The west block's high street row (where the houses grew), by day at distance 20.
await shot('row', 20, 'hearth', 0, [Number(rx), Number(rz)]);
await browser.close();
