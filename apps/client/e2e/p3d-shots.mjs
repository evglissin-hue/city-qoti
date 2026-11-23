// P3D shots: the front door, by day and at dusk (a script, not a spec):
//   QOTI_CLIENT_PORT=5251 QOTI_RELAY_PORT=8861 npx vite --config apps/client/vite.config.ts apps/client
//   QOTI_CLIENT_PORT=5251 node apps/client/e2e/p3d-shots.mjs
// (or `npm run build -w @qoti/client` then `npx vite preview` and QOTI_CLIENT_PORT=4173, much faster)
// Saves docs/build/screenshots/p3d-after-<light>-<view>.png at 1366 x 768 (views: one
// recent valley, several, the second step, an invite waiting, the valleys list, settings). Other
// sizes: QOTI_SIZES=1250x680,1440x900,1728x1000,420x760 adds a -<width> suffix.
// QOTI_VIEWS=one,second narrows the views; the view `nowebgl` shoots the painted fallback
// (p3d-after-nowebgl-<light>.png).
import { chromium } from '@playwright/test';

const port = Number(process.env.QOTI_CLIENT_PORT ?? 5251);
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const sizes = (process.env.QOTI_SIZES ?? '1366x768').split(',').map((s) => s.split('x').map(Number));
const lights = (process.env.QOTI_LIGHTS ?? 'day,dusk').split(',');
const only = (process.env.QOTI_VIEWS ?? '').split(',').filter(Boolean);

const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

const now = Date.now();
const valley = (id, name, extra) => ({
  valleyId: id,
  seat: 0,
  token: `t-${id}`,
  mode: 'solo',
  name,
  lastPlayed: now - 3 * 3600_000,
  ...extra,
});
const ONE = [valley('v1', 'Thistlecombe', { season: 2, day: 12, year: 1, rank: 'village', seed: 'abc123' })];
const SEVERAL = [
  valley('v1', 'Thistlecombe', { season: 2, day: 12, year: 1, rank: 'village', seed: 'abc123' }),
  {
    ...valley('v2', 'Marrowbrook', { season: 0, day: 3, year: 2, partner: 'Juniper', creative: true }),
    mode: 'online',
    lastPlayed: now - 30 * 3600_000,
  },
  { ...valley('v3', 'Fernhollow', {}), lastPlayed: now - 9 * 86400_000, old: true },
];
const INVITED = [
  {
    valleyId: 'inv1',
    seat: 1,
    token: 'k',
    mode: 'online',
    name: 'A shared valley',
    lastPlayed: now,
    pending: true,
  },
];

const VIEWS = [
  ['first', [], async () => {}],
  ['one', ONE, async () => {}],
  ['several', SEVERAL, async () => {}],
  ['invited', INVITED, async () => {}],
  ['second', ONE, (p) => p.getByTestId('new-online').click()],
  [
    'second-more',
    [],
    async (p) => {
      await p.getByTestId('new-solo').click();
      await p.locator('summary', { hasText: 'More' }).click();
    },
  ],
  ['valleys', SEVERAL, (p) => p.getByTestId('more-valleys').click()],
  ['settings', ONE, (p) => p.getByTestId('title-settings-open').click()],
  ['nowebgl', [], async () => {}],
  [
    'paste',
    [],
    async (p) => {
      await p.getByTestId('invite-paste-open').click();
      await p.getByTestId('invite-paste').fill('not a link');
      await p.getByTestId('invite-paste-go').click();
    },
  ],
];

for (const [w, h] of sizes) {
  {
    for (const light of lights) {
      for (const [name, recent, act] of VIEWS) {
        if (only.length && !only.includes(name)) continue;
        const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
        page.on('pageerror', (e) => console.log('pageerror:', e.message));
        if (name === 'nowebgl')
          await page.addInitScript(() => {
            const real = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
              if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
              return real.call(this, type, ...rest);
            };
          });
        await page.addInitScript((list) => {
          if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('qoti.recent', JSON.stringify(list));
            sessionStorage.setItem('seeded', '1');
          }
        }, recent);
        await page.goto(`http://localhost:${port}/?quality=low&titleLight=${light}`);
        await page.getByTestId('new-solo').waitFor();
        // The live valley (QOTI_LIVE=0 shoots over the painted one): from a production build
        // (vite preview) it is up in seconds; under vite dev on SwiftShader it can take minutes.
        if (process.env.QOTI_LIVE !== '0' && name !== 'nowebgl')
          await page.locator('[data-backdrop="live"]').waitFor({ state: 'attached', timeout: 240_000 });
        await page.waitForTimeout(1500);
        await act(page);
        await page.waitForTimeout(900);
        const suffix = sizes.length > 1 || w !== 1366 ? `-${w}` : '';
        const file = name === 'nowebgl' ? `nowebgl-${light}` : `${light}-${name}`;
        await page.screenshot({
          path: `${out}/p3d-after-${file}${suffix}.png`,
          animations: 'disabled',
        });
        await page.close();
      }
    }
  }
}
await browser.close();
