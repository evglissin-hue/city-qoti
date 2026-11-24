// P3D boot numbers: time from navigation start to an interactive menu (the first view's primary
// button visible and enabled) and to the backdrop's first live frame (the `qoti:backdrop-first-frame`
// mark), median of N cold loads, from a production build served by `vite preview`:
//   npm run build -w @qoti/client
//   npx vite preview --config apps/client/vite.config.ts apps/client --port 4399 &
//   QOTI_URL=http://localhost:4399 node apps/client/e2e/p3d-boot.mjs
// QOTI_RUNS=5 sets the load count. SwiftShader stands in for a GPU, so absolute numbers are slow;
// compare before with after on the same machine.
import { chromium } from '@playwright/test';

/** The first view's primary button: change it here when the menu changes. */
const MENU_SELECTOR = process.env.QOTI_MENU_SELECTOR ?? '[data-testid=new-online]';
const MARK_BACKDROP = 'qoti:backdrop-first-frame';
// Automation keeps the painted valley unless the page asks for the live one.
const url = new URL(process.env.QOTI_URL ?? 'http://localhost:4399');
url.searchParams.set('backdrop', 'live');
const runs = Number(process.env.QOTI_RUNS ?? 5);

const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

const menu = [];
const live = [];
const bytes = [];
for (let i = 0; i < runs; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  let total = 0;
  page.on('response', async (r) => {
    try {
      const b = await r.body();
      if (/\.(js|css)(\?|$)/.test(r.url())) total += b.length;
    } catch {
      // A redirect or a cancelled request has no body.
    }
  });
  await page.addInitScript((sel) => {
    window.__menuAt = null;
    const tick = () => {
      const el = document.querySelector(sel);
      if (el && !el.disabled && el.getClientRects().length > 0) window.__menuAt = performance.now();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, MENU_SELECTOR);
  await page.goto(url.href, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__menuAt !== null, null, { timeout: 60_000 });
  menu.push(await page.evaluate(() => window.__menuAt));
  const at = await page
    .waitForFunction((m) => performance.getEntriesByName(m)[0]?.startTime ?? null, MARK_BACKDROP, {
      timeout: 25_000,
    })
    .then((h) => h.jsonValue())
    .catch(() => null);
  live.push(at);
  bytes.push(total);
  await ctx.close();
}
await browser.close();
const r = (x) => (x == null ? 'none' : `${Math.round(x)} ms`);
console.log(`menu interactive: median ${r(median(menu))}  runs ${menu.map(Math.round).join(', ')}`);
console.log(
  `backdrop first frame: median ${r(median(live))}  runs ${live.map((x) => (x == null ? 'none' : Math.round(x))).join(', ')}`,
);
console.log(`js+css bytes loaded: median ${Math.round(median(bytes) / 1024)} KB`);
