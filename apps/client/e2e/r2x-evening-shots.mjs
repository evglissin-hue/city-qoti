// R2X shots and on-screen text of R2's evening interface on REAL sim data (a script, not a spec).
// The valleys come from r2x-evening-save.ts; each is copied over the client's grown fixture
// (never commit that copy: `git checkout apps/client/src/app/fixtures/grown.qoti` afterwards):
//   QOTI_CLIENT_PORT=5237 QOTI_RELAY_PORT=8847 npx vite --config apps/client/vite.config.ts apps/client  (dev server)
//   QOTI_SAVES=/dir/with/village-eve.qoti,winter-eve.qoti,first-eve.qoti \
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_CLIENT_PORT=5237 node apps/client/e2e/r2x-evening-shots.mjs
// (QOTI_SAVES is the directory holding the three saves.) Optional: QOTI_ONLY=village|winter|first runs
// one valley; the text file then holds only its shots (QOTI_TEXT overrides its name).
// 1250 x 800, deviceScaleFactor 2, the interface kept. Saves docs/build/screenshots/r2x-*.png and
// r2x-evening-text.md (innerText of the strip, feed, gap tags, card, inspector and edition per shot).
import { chromium } from '@playwright/test';
import { copyFileSync, writeFileSync } from 'node:fs';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5237);
const saves = process.env.QOTI_SAVES ?? '.';
const only = process.env.QOTI_ONLY ?? '';
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const textFile = process.env.QOTI_TEXT ?? 'r2x-evening-text.md';
const FIXTURE = 'apps/client/src/app/fixtures/grown.qoti';
const N = 192;

const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const texts = [];

async function openValley(file) {
  copyFileSync(`${saves}/${file}`, FIXTURE);
  const page = await browser.newPage({ viewport: { width: 1250, height: 800 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('console error:', m.text());
  });
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(`http://localhost:${clientPort}/?debug&fixture=grown&quality=medium&noguide`);
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
  await page.waitForFunction(() => window.__qoti.places().length > 0, null, { timeout: 60000 });
  for (const name of ['Done', 'Close', 'Later']) {
    const b = page.getByRole('button', { name, exact: true });
    if (await b.count())
      await b
        .first()
        .click()
        .catch(() => {});
  }
  // Pause at once: the sim runs in real time and the shots would drift hours from the saved evening.
  await page.evaluate(() => window.__qoti.submit({ t: 'time.setSpeed', speed: 0 }));
  await page.waitForTimeout(1500);
  await dismissCards(page);
  console.log(file, JSON.stringify(await page.evaluate(() => window.__qoti.clock())));
  return page;
}

/** Sweeps up any card in front (the fixture opens on a festival result), except the edition. */
async function dismissCards(page) {
  for (let k = 0; k < 6; k++) {
    const n = await page.evaluate(() => {
      let c = 0;
      for (const b of document.querySelectorAll('[role="dialog"] button.primary, .card button.primary'))
        if (b.offsetParent !== null && !b.closest('[data-testid="edition"]')) {
          console.log('dismissing a card in front: ' + b.textContent);
          b.click();
          c++;
        }
      return c;
    });
    if (!n) return;
    await page.waitForTimeout(600);
  }
}

async function settle(page, ms = 5000) {
  await page.waitForTimeout(ms);
}

async function grab(page, name, note = '') {
  await dismissCards(page);
  const parts = await page.evaluate(() => {
    const t = (id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      return el && el.offsetParent !== null ? el.innerText : null;
    };
    return {
      clock: window.__qoti.clock(),
      strip: t('hearth-strip') ?? t('ledger-strip'),
      feed: t('alerts'),
      tags: t('gap-tags'),
      card: t('place-card'),
      inspector: t('inspector') ?? (document.querySelector('.inspector-panel.resident')?.innerText ?? null),
      edition: t('edition'),
    };
  });
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 240000 });
  let md = `## ${name}\n\n${note ? note + '\n\n' : ''}clock: ${JSON.stringify(parts.clock)}\n\n`;
  for (const k of ['strip', 'feed', 'tags', 'card', 'inspector', 'edition'])
    if (parts[k]) md += `### ${k}\n\n\`\`\`\n${parts[k]}\n\`\`\`\n\n`;
  texts.push(md);
  console.log('shot', name);
}

const lens = (page, l) => page.evaluate((x) => window.__qoti.setLens(x), l);
const hour = (page, h) => page.evaluate((x) => window.__qoti.setHour(x), h);
async function town(page, on) {
  const active = await page.evaluate(
    () => document.querySelector('[data-testid="overlays"]')?.textContent?.includes('Town') ?? false,
  );
  if (active === on) return;
  // Clicks through the DOM: the button is "not stable" while SwiftShader is busy, so Playwright's wait never ends.
  const click = (id) => page.evaluate((i) => document.querySelector(`[data-testid="${i}"]`)?.click(), id);
  if (!(await page.getByTestId('overlay-town').count())) await click('overlays');
  await page.waitForSelector('[data-testid="overlay-town"]');
  await click('overlay-town');
  await page.waitForTimeout(300);
  if (await page.getByTestId('overlay-list').count()) await page.keyboard.press('Escape');
}
const select = (page, sel) => page.evaluate((s) => window.__qoti.select(s), sel);
const focus = (page, tile, d = 12) =>
  page.evaluate(([x, z, dd]) => window.__qoti.focusTile(x, z, dd), [tile % N, Math.floor(tile / N), d]);

/** Selects residents in turn until `ok(stopTimes)` holds for the Day section; returns the id or null. */
async function findResident(page, ok) {
  const ids = await page.evaluate(() => window.__qoti.residentIds());
  for (const id of ids) {
    await select(page, { kind: 'resident', id });
    try {
      await page.waitForSelector('[data-testid="resident-day"]', { timeout: 2500 });
    } catch {
      continue;
    }
    const times = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="day-stops"] .stop-time')].map((e) => e.textContent),
    );
    if (ok(times)) return id;
  }
  return null;
}

async function showDay(page, name, id) {
  await page.evaluate(() =>
    document.querySelector('[data-testid="resident-day"]')?.scrollIntoView({ block: 'center' }),
  );
  await settle(page, 2500);
  // The inspector must be on screen before the shot (one run caught the frame without it).
  for (let k = 0; k < 10; k++) {
    const r = await page.evaluate(() => document.querySelector('.inspector-panel.resident')?.getBoundingClientRect().toJSON() ?? null);
    if (r && r.width > 0 && r.right <= 1250) break;
    console.log('inspector not on screen yet', JSON.stringify(r));
    await select(page, { kind: 'resident', id });
    await settle(page, 2500);
  }
  await grab(page, name, `Resident id ${id}`);
}

if (!only || only === 'village') {
  const page = await openValley('village-eve.qoti');
  await lens(page, 'hearth');
  await settle(page);
  await grab(page, 'r2x-hearth-evening');

  await town(page, true);
  await settle(page, 1500);
  await grab(page, 'r2x-town-hearth-evening');
  await lens(page, 'ledger');
  await settle(page, 1500);
  await grab(page, 'r2x-town-ledger-evening');
  await lens(page, 'hearth');

  const places = await page.evaluate(() =>
    window.__qoti.places().map((p) => ({
      id: p.id,
      name: p.name,
      present: p.present,
      tonight: p.visitors[p.visitors.length - 1] ?? 0,
      tile: p.tile,
    })),
  );
  // Most residents present now; when nobody is (see the report), the most visitors tonight.
  places.sort((a, b) => b.present - a.present || b.tonight - a.tonight);
  const best = places[0];
  console.log('busiest place', JSON.stringify(best), 'of', places.length);
  await focus(page, best.tile, 12);
  await select(page, { kind: 'place', id: best.id });
  await settle(page, 2500);
  await grab(page, 'r2x-place-card-evening', `Place: ${best.name}, present ${best.present}`);
  await select(page, null);

  const found = await findResident(page, (t) => t.filter((x) => x !== 'later').length >= 2);
  if (found !== null) await showDay(page, 'r2x-resident-day-evening', found);
  else console.log('NO resident with 2+ arrived stops');
  await select(page, null);

  await town(page, false);
  await lens(page, 'ledger');
  await town(page, true);
  await hour(page, 13);
  await settle(page, 2500);
  await grab(page, 'r2x-town-ledger-day');
  await town(page, false);
  await lens(page, 'hearth');
  await focus(page, best.tile, 12);
  await select(page, { kind: 'place', id: best.id });
  await settle(page, 2500);
  await grab(page, 'r2x-place-card-day', `Place: ${best.name}`);
  await select(page, null);
  await hour(page, null);

  // Speed 3 until the 21:00 edition card comes up by itself.
  await page.evaluate(() => window.__qoti.submit({ t: 'time.setSpeed', speed: 3 }));
  const t0 = Date.now();
  try {
    // Other cards (a festival result) queue in front of the edition: sweep them up as they come.
    for (;;) {
      if (Date.now() - t0 > 300000) throw new Error('timeout');
      if (await page.locator('[data-testid="edition"]:visible').count()) break;
      await page.evaluate(() => {
        for (const b of document.querySelectorAll('[role="dialog"] button.primary, .card button.primary'))
          if (b.offsetParent !== null && !b.closest('[data-testid="edition"]')) {
            console.log('dismissing a card in front: ' + b.textContent);
            b.click();
          }
      });
      await page.waitForTimeout(2000);
    }
    console.log('edition after', Math.round((Date.now() - t0) / 1000), 's');
    await settle(page, 1500);
    await grab(page, 'r2x-edition');
  } catch {
    console.log('EDITION DID NOT COME UP', JSON.stringify(await page.evaluate(() => window.__qoti.clock())));
    await grab(page, 'r2x-edition-missing');
  }
  await page.close();
}

if (!only || only === 'winter') {
  const page = await openValley('winter-eve.qoti');
  await lens(page, 'hearth');
  await town(page, true);
  const braziers = await page.evaluate(() => window.__qoti.decorOf('brazier'));
  console.log('braziers', JSON.stringify(braziers));
  if (braziers.length)
    await page.evaluate(([x, z]) => window.__qoti.focusTile(Math.floor(x), Math.floor(z), 16), braziers[0]);
  await settle(page, 5000);
  await grab(page, 'r2x-winter-hearth', `braziers: ${braziers.length}`);
  await page.close();
}

if (!only || only === 'first') {
  const page = await openValley('first-eve.qoti');
  await lens(page, 'hearth');
  await settle(page, 5000);
  await grab(page, 'r2x-first-evening');
  const found = await findResident(page, (t) => t.length >= 1);
  if (found !== null) await showDay(page, 'r2x-first-evening-resident', found);
  else console.log('NO grown-up with a round in first-eve');
  await page.close();
}

writeFileSync(`${out}/${textFile}`, `# R2X evening interface, on-screen text\n\n${texts.join('')}`);
await browser.close();
