// P3A newcomer playthrough (a script, not a spec). Plays the first days of a fresh valley as a
// newcomer pair does (tools/bench/src/newcomer.ts): on the first morning a lane out to the first
// work, Workshops and Farmland zoned beside it and the first workplaces set down at once, no homes;
// Homes zoned on the third morning; no places, no decor. Commands go through `__qoti.submit`.
// For each moment that matters it prints the words the feed, alerts, bars and inspector show about
// hands, food and homes, and saves a shot. Needs the client and relay on their own ports:
//   QOTI_CLIENT_PORT=5250 QOTI_RELAY_PORT=8860 npm run dev
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/p3a-newcomer-shots.mjs
// Saves docs/build/screenshots/p3a-newcomer-<moment>.png (morning1, hands-short, first-homes,
// level-up) at 1440 x 900, device scale 2, interface visible. Env: QOTI_CLIENT_PORT (5250),
// QOTI_OUT (the screenshots folder), QOTI_MAX_DAY (stop after this day, 8).
import { chromium } from '@playwright/test';

const base = `http://localhost:${process.env.QOTI_CLIENT_PORT ?? 5250}`;
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const maxDay = Number(process.env.QOTI_MAX_DAY ?? 8);
const WORK = ['quarry', 'fishery', 'foresters-lodge', 'market-stall', 'windmill'];

const browser = await chromium.launch({
  executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`${base}/?debug&quality=low`);
await page.getByTestId('new-online').click();
await page.getByTestId('found-valley').click();
await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
const sleep = (ms) => page.waitForTimeout(ms);
const clock = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      return await page.evaluate(() => window.__qoti.clock());
    } catch {
      // The page navigated (a resync reload); wait for the valley to be live again.
      await page
        .waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 })
        .catch(() => {});
    }
  }
  throw new Error('page never came back');
};
const submit = (cmd) => page.evaluate((c) => window.__qoti.submit(c), cmd);
const stamp = async () => {
  const c = await clock();
  return `day ${c.day} ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
};
const dismiss = async () => {
  for (const name of ['Done', 'Back to it', 'Close', 'Later']) {
    const b = page.getByRole('button', { name, exact: true });
    if (await b.count())
      await b
        .first()
        .click()
        .catch(() => {});
  }
};
await dismiss();
await page.evaluate(() => window.__qoti.setLens('ledger'));

const WORDS =
  /hand|food|hungry|worker|workers|home|homes|empty|short|nobody|level|grow|build|farm|bread|supper|breakfast/i;
const seen = new Set();
/** The visible lines that mention hands, food or homes, new since the last look (all when `all`). */
async function words(all = false) {
  const text = await page.locator('body').innerText();
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && WORDS.test(l) && !/^(buildings|hash|sim|turn|draws)/.test(l));
  const fresh = all ? lines : lines.filter((l) => !seen.has(l));
  for (const l of lines) seen.add(l);
  return fresh;
}
async function shot(name) {
  const file = `${out}/p3a-newcomer-${name}.png`;
  console.log(`\n== ${name} (${await stamp()}) ==`);
  for (const l of await words(true)) console.log('  | ' + l);
  await page.screenshot({ path: file });
  console.log('  saved', file);
}

// First morning: the lane out, the work set down, the land zoned.
const geo = await page.evaluate(() => {
  const q = window.__qoti;
  const [x0, z0, x1, z1] = q.startArea();
  const lane = [];
  for (let z = z0 - 14; z <= z1 + 14; z++)
    for (let x = x0 - 40; x <= x1 + 40; x++) if (q.roadAt(x, z)) lane.push([x, z]);
  return { lane };
});
// The lane's north end at the start (a stub of the County lane): carry it north 12 tiles.
const north = geo.lane.filter(([x]) => x === geo.lane.reduce((m, t) => (t[1] < m[1] ? t : m))[0]);
const [lx, lz] = north.reduce((m, t) => (t[1] < m[1] ? t : m));
const ext = [];
for (let z = lz - 1; z >= lz - 12; z--) ext.push([lx, z]);
await submit({ t: 'road.paint', kind: 'lane', tiles: ext });
await sleep(1500);
// Zone both sides of the new lane: Workshops on the west side, Farmland on the east.
const side = (dx, depth) => {
  const t = [];
  for (const [x, z] of ext) for (let d = 1; d <= depth; d++) t.push([x + dx * d, z]);
  return t;
};
await submit({ t: 'zone.paint', zone: 'crafts', tiles: side(-1, 3) });
await submit({ t: 'zone.paint', zone: 'farms', tiles: side(1, 3) });
// The first work, at once: each at a spot with its door on a lane, else anywhere it fits.
for (const def of WORK) {
  const spot = await page.evaluate((d) => window.__qoti.findRoadSpot(d), def);
  if (spot) await submit({ t: 'build.place', def, x: spot.x, z: spot.z, rot: spot.rot });
  else console.log('  no spot with a door on a lane for', def);
  await sleep(300);
}
await dismiss();
await page.evaluate(() => window.__qoti.focusStart(26, true));
await submit({ t: 'time.setSpeed', speed: 2 });
await sleep(6000);
await shot('morning1');

// Then let the days run, looking every few seconds; one shot at the first word of hands or food
// being short, one when the first homes stand, one at a business level-up if it comes.
const startFolk = (await page.evaluate(() => window.__qoti.town()))?.population ?? 0;
let shortShot = false;
let homesShot = false;
let levelShot = false;
let zonedHomes = false;
for (let i = 0; i < 4000; i++) {
  await sleep(1500);
  await dismiss();
  const c = await clock();
  if (c.day >= 3 && c.hour >= 6 && !zonedHomes) {
    zonedHomes = true;
    const tiles = [];
    for (const [x, z] of ext) for (let d = 5; d <= 6; d++) tiles.push([x - d, z]);
    await submit({ t: 'zone.paint', zone: 'homes-low', tiles });
    console.log(`\n[${await stamp()}] zoned Homes`);
  }
  const fresh = await words();
  if (fresh.length) console.log(`[${await stamp()}]`, fresh.join(' || '));
  const text = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  ).toLowerCase();
  const town = await page.evaluate(() => window.__qoti.town()).catch(() => null);
  if (
    !shortShot &&
    /(short of hands|no hands|hands? (are |is )?short|need (more )?(hands|workers)|workers? (are )?short|short of (food|hands|workers)|nobody to work|nobody at work|go hungry|hungry|nobody (works )?here|have nobody yet|jobs are open)/.test(
      text,
    )
  ) {
    shortShot = true;
    await shot('hands-short');
  }
  if (!homesShot && town && town.population > startFolk) {
    homesShot = true;
    await shot('first-homes');
  }
  if (!levelShot && /level(ed)? up|grown into|now a (bakery|farm)|promoted/.test(text)) {
    levelShot = true;
    await shot('level-up');
  }
  if (c.day >= maxDay) break;
}
if (!shortShot) {
  console.log('\nNo hands-short words appeared by day', maxDay);
  await shot('day-end');
}
await browser.close();
