// P3B shots: the whole frame in both lenses at 1250, 1366 and 1440 px (768 tall, the owner's
// laptop), by day and by lamplight, in a fresh hamlet and the grown village (a script, not a spec):
//   QOTI_CLIENT_PORT=5251 QOTI_RELAY_PORT=8861 npx vite --config apps/client/vite.config.ts apps/client
//   QOTI_TAG=before QOTI_CLIENT_PORT=5251 node apps/client/e2e/p3b-shots.mjs
// Saves docs/build/screenshots/p3b-<tag>-<valley>-<lens>-<width>-<light>.png and prints, for each
// shot, how much of the valley the frame covers (the share of a 6 px grid where the topmost element
// is part of the interface, not the canvas or a label on the ground) and any overlap between the
// bottom bar, the minimap, the feed and the top bar. QOTI_ONLY=hamlet|grown runs one valley;
// QOTI_WIDTHS=1250 narrows the widths.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const port = Number(process.env.QOTI_CLIENT_PORT ?? 5251);
const tag = process.env.QOTI_TAG ?? 'after';
const only = process.env.QOTI_ONLY ?? '';
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const widths = (process.env.QOTI_WIDTHS ?? '1250,1366,1440').split(',').map(Number);
const HEIGHT = 768;

const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

const VALLEYS = [
  ['hamlet', '?debug&fixture=hamlet&quality=low&noguide&mock'],
  ['grown', '?debug&fixture=grown&quality=low&noguide'],
].filter(([v]) => !only || v === only);

const rows = [];

async function dismiss(page) {
  for (let k = 0; k < 6; k++) {
    const n = await page.evaluate(() => {
      let c = 0;
      for (const b of document.querySelectorAll('[role="dialog"] button.primary, .card button.primary'))
        if (b.offsetParent !== null) {
          b.click();
          c++;
        }
      return c;
    });
    if (!n) return;
    await page.waitForTimeout(500);
  }
}

/** The frame's share of the screen, and any overlap between its big pieces. */
async function measure(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    let covered = 0;
    let total = 0;
    for (let y = 3; y < innerHeight; y += 6)
      for (let x = 3; x < innerWidth; x += 6) {
        total++;
        const el = document.elementFromPoint(x, y);
        if (!el || el === canvas) continue;
        // Labels on the ground (gap tags, names, emotes) are part of the picture, not the frame.
        if (el.closest('.gap-tag, .presence-label, .emote-bubble, .world-label, .hover-label')) continue;
        if (el.closest('.game-ui, header, footer, aside, section')) covered++;
      }
    const box = (sel) => {
      const e = document.querySelector(sel);
      if (!e || e.offsetParent === null) return null;
      const r = e.getBoundingClientRect();
      return r.width && r.height ? r : null;
    };
    const parts = {
      bar: box('.toolbar-row'),
      corner: box('.view-corner'),
      minimap: box('.minimap') ?? box('.minimap-fold'),
      feed: box('.side.left'),
      top: box('.topbar'),
    };
    const hits = [];
    const names = Object.keys(parts);
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const a = parts[names[i]];
        const b = parts[names[j]];
        if (!a || !b) continue;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > 1) hits.push(`${names[i]}/${names[j]} ${Math.round(w)}x${Math.round(h)}`);
      }
    const n = (k) => (parts[k] ? Math.round(parts[k].width) + 'x' + Math.round(parts[k].height) : '-');
    return {
      covered: Math.round((covered / total) * 1000) / 10,
      overlaps: hits,
      sizes: names.map((k) => `${k} ${n(k)}`).join(', '),
      controls: document.querySelectorAll('footer button:not([hidden])').length,
    };
  });
}

for (const [valley, query] of VALLEYS) {
  const page = await browser.newPage({ viewport: { width: widths[0], height: HEIGHT } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(`http://localhost:${port}/${query}`);
  await page.addStyleTag({ content: '.debug-overlay { display: none !important; }' });
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
  await page.evaluate(() => window.__qoti.submit({ t: 'time.setSpeed', speed: 0 }));
  await page.waitForTimeout(2000);
  await dismiss(page);
  for (const width of widths) {
    await page.setViewportSize({ width, height: HEIGHT });
    for (const lens of ['hearth', 'ledger']) {
      await page.evaluate((l) => window.__qoti.setLens(l), lens);
      for (const [light, hour] of [
        ['day', 11],
        ['lamp', 21],
      ]) {
        await page.evaluate((h) => window.__qoti.setHour(h), hour);
        await page.mouse.move(width / 2, 300);
        await page.waitForTimeout(1200);
        await dismiss(page);
        const name = `p3b-${tag}-${valley}-${lens}-${width}-${light}`;
        await page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' });
        const m = await measure(page);
        rows.push({ name, ...m });
        console.log(name, JSON.stringify(m));
      }
    }
  }
  await page.close();
}
await browser.close();
const md = [
  `# P3B frame measures (${tag})`,
  '',
  '| Shot | Frame covers | Footer buttons | Overlaps | Sizes |',
  '|---|---|---|---|---|',
  ...rows.map(
    (r) => `| ${r.name} | ${r.covered}% | ${r.controls} | ${r.overlaps.join('; ') || 'none'} | ${r.sizes} |`,
  ),
  '',
].join('\n');
writeFileSync(`${out}/p3b-${tag}-measures.md`, md);
