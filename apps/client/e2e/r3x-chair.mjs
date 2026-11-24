// R3X player's chair, round 1 (a script, not a spec). Drives the real game, one scenario per run:
//   QOTI_CLIENT_PORT=5254 QOTI_RELAY_PORT=8864 npm run dev
//   node apps/client/e2e/r3x-chair.mjs <scenario> [...]
// Shots go to docs/build/screenshots/r3x-chair-<n>-<name>.png at 1280x800, scale 1. It prints the
// visible text of the cards it opens so the words can be read in place.
import { chromium } from '@playwright/test';

const base = `http://localhost:${process.env.QOTI_CLIENT_PORT ?? 5254}`;
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';

async function launch() {
  const browser = await chromium.launch({
    executablePath: process.env.QOTI_CHROMIUM ?? '/opt/pw-browsers/chromium',
    args: [
      '--no-sandbox',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.route('**/api/**', (r) => r.abort());
  return { browser, page };
}
const live = (page) =>
  page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
async function dismiss(page) {
  for (const name of ['Done', 'Thank you, Tobias', 'Back to it', 'Close', 'Later', 'Maybe later']) {
    const b = page.getByRole('button', { name, exact: true });
    if (await b.count())
      await b
        .first()
        .click({ timeout: 1500 })
        .catch(() => {});
  }
}
async function shot(page, n, name) {
  await page.waitForTimeout(500);
  const file = `${out}/${process.env.QOTI_PREFIX ?? 'r3x-chair'}-${n}-${name}.png`;
  await page.screenshot({ path: file, timeout: 240000 });
  console.log('shot', file);
}
/** The visible text of a selector (default the whole page), one trimmed line per row. */
async function say(page, label, sel) {
  const loc = sel ? page.locator(sel) : page.locator('body');
  const t = (
    await loc
      .first()
      .innerText()
      .catch(() => '(none)')
  )
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  console.log(`--- ${label}`);
  for (const l of t) console.log('  | ' + l);
}
const q = (page, fn, arg) => page.evaluate(fn, arg);

const S = {};

S.first = async (page) => {
  await page.goto(`${base}/?debug&quality=low`);
  await say(page, 'title');
  await shot(page, 1, 'title');
  await page.getByTestId('new-solo').click();
  await live(page);
  await page.waitForTimeout(3000);
  await say(page, 'opening screen');
  await shot(page, 1, 'opening');
  await page
    .getByRole('button', { name: 'Back to it' })
    .click()
    .catch(() => {});
  await page.evaluate(() => window.__qoti.focusStart(26, true));
  // Take the lane north 12 tiles, zone beside it, set a quarry and a fishery down, as P3A's newcomers do.
  const ext = await q(page, () => {
    const t = window.__qoti;
    const [x0, z0, x1, z1] = t.startArea();
    const lane = [];
    for (let z = z0 - 14; z <= z1 + 14; z++)
      for (let x = x0 - 40; x <= x1 + 40; x++) if (t.roadAt(x, z)) lane.push([x, z]);
    const top = lane.reduce((m, p) => (p[1] < m[1] ? p : m));
    const e = [];
    for (let z = top[1] - 1; z >= top[1] - 12; z--) e.push([top[0], z]);
    return e;
  });
  const submit = (c) => q(page, (c) => window.__qoti.submit(c), c);
  await submit({ t: 'road.paint', kind: 'lane', tiles: ext });
  await page.waitForTimeout(1500);
  await submit({
    t: 'zone.paint',
    zone: 'crafts',
    tiles: ext.flatMap(([x, z]) => [1, 2, 3].map((d) => [x - d, z])),
  });
  for (const def of ['quarry', 'fishery']) {
    const s = await q(page, (d) => window.__qoti.findRoadSpot(d), def);
    if (s) await submit({ t: 'build.place', def, x: s.x, z: s.z, rot: s.rot });
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(2000);
  await say(page, 'after first build, day 1');
  await shot(page, 1, 'first-build');
  await submit({ t: 'time.setSpeed', speed: 2 });
  await page.waitForTimeout(8000);
  await dismiss(page);
  await say(page, 'a little later');
  console.log('guide', JSON.stringify(await q(page, () => window.__qoti.guide())));
  await shot(page, 1, 'guide-later');
};

// ---- shared helpers for the grown-valley scenarios ----
const GROWN = '?debug&clean&quality=low&noguide&fixture=grown';
// The Mirror's hour and minute move in coarse steps; the tick is exact (200 ticks an hour, day starts 06:00).
const clock = (page) =>
  q(page, () => {
    const c = window.__qoti.clock();
    const m = Math.floor((((c.tick + 1200) % 4800) * 60) / 200);
    return { ...c, hour: Math.floor(m / 60), minute: m % 60 };
  });
const submit = (page, c) => q(page, (c) => window.__qoti.submit(c), c);
async function open(page, query = GROWN) {
  await page.goto(`${base}/${query}`);
  await live(page);
  await page.waitForTimeout(1500);
  await submit(page, { t: 'time.setSpeed', speed: 0 });
  await clearCards(page);
}
async function clearUi(page) {
  await q(page, () => {
    for (const [name, value] of [
      ['festivalCard', null],
      ['raidCard', null],
      ['almanac', null],
      ['edition', null],
      ['chapter', false],
      ['letter', null],
      ['rankUp', null],
      ['storyLetter', null],
      ['seasonCard', null],
    ])
      try {
        window.__qoti.setUi(name, value);
      } catch {
        /* not a signal here */
      }
  });
}
async function clearCards(page) {
  await clearUi(page);
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button'))
      if (/Thank you, Tobias/.test(b.textContent ?? '')) b.click();
  });
  await page.waitForTimeout(300);
  await dismiss(page);
}
/** Runs the sim at `speed` until the clock reads `day` (null: any later day than now) at hour:minute, then holds it. */
async function advanceTo(page, hour, minute, speed = 3, nextDay = true) {
  const c0 = await clock(page);
  // The canvas hidden, the sim runs about ten times faster on this machine (rendering is the bottleneck).
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.id = 'chair-fast';
    s.textContent = 'canvas,.game-ui{display:none!important}';
    document.head.append(s);
  });
  await submit(page, { t: 'time.setSpeed', speed });
  for (let i = 0; i < 4000; i++) {
    await page.waitForTimeout(100);
    const c = await clock(page).catch((e) => {
      if (i % 100 === 0) console.log('clock error', e.message.slice(0, 200));
      return c0;
    });
    const past = !nextDay || c.day !== c0.day || c.season !== c0.season || c.year !== c0.year;
    if (past && c.hour * 60 + c.minute >= hour * 60 + minute) break;
    if (i % 100 === 0) await clearUi(page);
    if (i % 100 === 0 && process.env.QOTI_TRACE) console.log('  ..', stamp(c), c.tick, c.speed);
  }
  await submit(page, { t: 'time.setSpeed', speed: 0 });
  await page.evaluate(() => document.getElementById('chair-fast')?.remove());
  await page.waitForTimeout(400);
  return clock(page);
}
const stamp = (c) => `day ${c.day} ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
async function _hideHud(page, on) {
  await page.evaluate((on) => {
    let s = document.getElementById('chair-hide');
    if (!s) {
      s = document.createElement('style');
      s.id = 'chair-hide';
      document.head.append(s);
    }
    s.textContent = on ? '.game-ui{visibility:hidden!important}' : '';
  }, on);
}
/** The first building of a def, or its screen spot. */
const idOf = (page, def) => q(page, (d) => window.__qoti.buildingsOf(d)[0] ?? null, def);
const lookAt = (page, x, z, d) => q(page, ([x, z, d]) => window.__qoti.focusTile(x, z, d), [x, z, d]);
const posOf = (page, id) =>
  q(
    page,
    (id) => {
      const b = window.__qoti.mirror().buildings.get(id);
      return b ? [b.x, b.z] : null;
    },
    id,
  );
const select = async (page, sel) => {
  await q(page, (s) => window.__qoti.select(s), sel);
  if (sel)
    await page
      .locator('[class*="inspector"]')
      .first()
      .waitFor({ timeout: 15000 })
      .catch(() => console.log('(no inspector)'));
  await page.waitForTimeout(500);
};

S.evening = async (page) => {
  await openFile(page, `${SNAPS}/grown-1720.qoti`);
  const hall = await idOf(page, 'town-hall');
  console.log('town hall', hall, await posOf(page, hall));
  // The valley was run on to 17:20 in Node (r3x-chair-make.ts), lights as the sim has them.
  let c = await clock(page);
  console.log('at', stamp(c));
  const [hx, hz] = await posOf(page, hall);
  await lookAt(page, hx, hz, 22);
  await q(page, () => window.__qoti.setHour(null));
  const sup = () =>
    q(page, () => {
      const s = window.__qoti.supplies();
      const t = window.__qoti.clock().tick;
      return {
        tick: t,
        night: s.night,
        lit: s.lamps.filter((l) => l.out <= t).length,
        reached: s.lamps.filter((l) => l.reach <= t).length,
        lamps: s.lamps.length,
        resting: s.resting.length,
        candles: s.candles.length,
        cu: s.candleUntil,
        lamplighters: s.lamplighters,
      };
    });
  console.log('supplies 17:20', JSON.stringify(await sup()));
  await select(page, { kind: 'building', id: hall });
  await page.waitForTimeout(800);
  await say(page, 'Town Hall inspector 17:20', '[class*="inspector"]');
  await shot(page, 2, 'hall-1720');
  await select(page, null);
  for (const [i, [h, m]] of [
    [17, 35],
    [17, 45],
    [17, 55],
    [18, 5],
  ].entries()) {
    c = await advanceTo(page, h, m, 3, false);
    console.log('at', stamp(c), JSON.stringify(await sup()));
    await shot(page, 2, `lamps-${i}-${String(c.hour).padStart(2, '0')}${String(c.minute).padStart(2, '0')}`);
  }
};

/** Saves the running valley through Settings > Save valley file; returns the path. */
async function saveValley(page, path) {
  await q(page, () => window.__qoti.setUi('settingsOpen', true));
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.getByTestId('save-valley-file').click();
  await (await dl).saveAs(path);
  return path;
}
const SNAPS =
  process.env.QOTI_SNAPS ??
  '/tmp/claude-0/-home-user-city-qoti/f5ca3bcd-c351-53bd-a2bc-00aa2b3c6d7a/scratchpad';
/** Opens a saved valley file solo (as the title's file opener does). */
async function openFile(page, file) {
  await page.goto(`${base}/?debug&quality=low&noguide`);
  await page.evaluate(() => document.querySelector('details.title-options')?.setAttribute('open', ''));
  await page.getByTestId('open-file').setInputFiles(file);
  await page.getByTestId('open-imported-solo').click();
  await page.waitForFunction(() => window.__qoti?.phase?.() === 'ready', null, { timeout: 90000 });
  await submit(page, { t: 'valley.setSettings', settings: { eveningLingers: false } });
  await submit(page, { t: 'time.setSpeed', speed: 0 });
  await clearCards(page);
}

S.snap1720 = async (page) => {
  await open(page);
  const c = await advanceTo(page, 17, 20);
  console.log('at', stamp(c));
  console.log('saved', await saveValley(page, `${SNAPS}/grown-1720.qoti`));
};

const supNow = (page) =>
  q(page, () => {
    const s = window.__qoti.supplies();
    const t = window.__qoti.clock().tick;
    return {
      tick: t,
      night: s.night,
      lamps: s.lamps.length,
      lit: s.lamps.filter((l) => l.out <= t).length,
      resting: s.resting.length,
      candleHomes: s.candles.length,
      lamplighters: s.lamplighters,
    };
  });
const tileXZ = (t) => [t % 192, Math.floor(t / 192)];
/** Opens a place's card with the camera on it and says and shoots it. */
async function placeCard(page, n, name, id, dist = 16) {
  const p = await q(page, (id) => window.__qoti.places().find((p) => p.id === id) ?? null, id);
  if (!p) return console.log('no place', id);
  const [x, z] = tileXZ(p.tile);
  await lookAt(page, x, z, dist);
  await select(page, { kind: 'place', id });
  await page.waitForTimeout(900);
  console.log(
    `place ${id} "${p.name}" priority=${p.priority ?? 'normal'} resting=${JSON.stringify(p.resting ?? [])}`,
  );
  await say(page, `place card ${name}`, '[class*="inspector"]');
  await shot(page, n, name);
}
async function eveningRun(
  page,
  file,
  tag,
  n,
  times = [
    [17, 40],
    [18, 6],
    [21, 45],
  ],
) {
  await openFile(page, `${SNAPS}/${file}`);
  const hall = await idOf(page, 'town-hall');
  const [hx, hz] = await posOf(page, hall);
  await lookAt(page, hx, hz, 20);
  await q(page, () => window.__qoti.setHour(null));
  let c = await clock(page);
  console.log('open at', stamp(c), JSON.stringify(await supNow(page)));
  await select(page, { kind: 'building', id: hall });
  await page.waitForTimeout(700);
  await say(page, `Town Hall inspector ${stamp(c)}`, '[class*="inspector"]');
  await shot(page, n, `${tag}-hall-1720`);
  await select(page, null);
  for (const [h, m] of times) {
    c = await advanceTo(page, h, m, 3, false);
    console.log('at', stamp(c), JSON.stringify(await supNow(page)));
    await shot(
      page,
      n,
      `${tag}-lamps-${String(c.hour).padStart(2, '0')}${String(c.minute).padStart(2, '0')}`,
    );
  }
  await select(page, { kind: 'building', id: hall });
  await page.waitForTimeout(700);
  await say(page, `Town Hall inspector ${stamp(c)}`, '[class*="inspector"]');
  await shot(page, n, `${tag}-hall-1805`);
  await select(page, null);
  const places = await q(page, () =>
    window.__qoti
      .places()
      .filter((p) => p.supplies && p.supplies.length)
      .map((p) => ({
        id: p.id,
        n: p.name,
        rest: (p.resting ?? []).length,
        pri: p.priority ?? 'normal',
        pieces: p.supplies.reduce((a, s) => a + s.pieces, 0),
        goods: p.supplies.map((s) => s.good).join('+'),
      })),
  );
  console.log('places with supplies', places.length, 'resting ones', places.filter((p) => p.rest).length);
  for (const p of places.slice(0, 40)) console.log('  ', JSON.stringify(p));
  return places;
}

S.willow = async (page) => {
  // The autoplayed town keeps no candles or wood in store: the dark evening, everything resting.
  const places = await eveningRun(page, 'willow-1720.qoti', 'dark', 2);
  const big = places.find((p) => p.id.startsWith('site:lantern-walk'));
  const fire = places.find((p) => p.id.startsWith('fire:'));
  for (const [nm, p] of [
    ['lanternwalk', big],
    ['brazier', fire],
  ])
    if (p) await placeCard(page, 2, `dark-card-${nm}`, p.id);
};
S.short = async (page) => {
  const places = await eveningRun(page, 'willow-short-1720.qoti', 'short', 2);
  const rest = places.filter((p) => p.rest > 0).sort((a, b) => b.rest - a.rest);
  const kept = places.filter((p) => p.rest === 0).sort((a, b) => b.pieces - a.pieces);
  const mid = places.filter((p) => p.rest > 0 && p.rest < p.pieces);
  for (const [nm, p] of [
    ['resting', rest[0]],
    ['kept', kept[0]],
    ['partly', mid[0]],
  ])
    if (p) await placeCard(page, 2, `short-card-${nm}`, p.id);
};
S.nowood = async (page) => {
  const places = await eveningRun(page, 'willow-nowood-2145.qoti', 'nowood', 3, []);
  for (const p of places.filter((p) => p.id.startsWith('fire:')).slice(0, 2))
    await placeCard(page, 3, `nowood-card-${p.id.replace(':', '')}`, p.id);
};
S.warm = async (page) => {
  // 60 candles and plenty of wood: some lamps lit, the rest resting (candles short), braziers burning.
  const places = await eveningRun(page, 'willow-warm-1720.qoti', 'warm', 2, [
    [17, 40],
    [18, 6],
  ]);
  const rest = places
    .filter((p) => p.rest > 0 && !p.id.startsWith('fire:'))
    .sort((a, b) => b.rest - a.rest)[0];
  const kept = places
    .filter((p) => p.rest === 0 && !p.id.startsWith('fire:'))
    .sort((a, b) => b.pieces - a.pieces)[0];
  for (const [nm, p] of [
    ['kept', kept],
    ['resting', rest],
  ])
    if (p) await placeCard(page, 2, `warm-card-${nm}`, p.id);
};
S.warmfire = async (page) => {
  const places = await eveningRun(page, 'willow-warm-2145.qoti', 'warmfire', 3, []);
  for (const p of places.filter((p) => p.id.startsWith('fire:')).slice(0, 2))
    await placeCard(page, 3, `warm-card-${p.id.replace(':', '')}`, p.id);
};
S.nowood = async (page) => {
  // Candles but no firewood at all: the braziers are cold.
  const places = await eveningRun(page, 'willow-nowood-2145.qoti', 'nowood', 3, []);
  const fires = places.filter((p) => p.id.startsWith('fire:'));
  for (const p of fires.slice(0, 2)) await placeCard(page, 3, `nowood-card-${p.id.replace(':', '')}`, p.id);
};

/** Selects a building and shoots it, camera on it, with the interface as a player sees it. */
async function lookBuilding(page, n, name, id, dist = 11) {
  const [x, z] = await posOf(page, id);
  await lookAt(page, x, z, dist);
  await select(page, { kind: 'building', id });
  const def = await q(
    page,
    (id) => {
      const b = window.__qoti.mirror().buildings.get(id);
      return `${b.def}/${b.trade ?? '-'} level ${b.level ?? '-'}`;
    },
    id,
  );
  console.log(`building ${id} ${def}`);
  await say(page, `inspector ${name}`, '[class*="inspector"]');
  await shot(page, n, name);
}
async function bookPanel(page, n, name, id) {
  await q(page, (id) => window.__qoti.openPanel(id), id);
  await page.waitForTimeout(1200);
  await say(page, `panel ${id}`, 'aside.book-slot');
  await shot(page, n, name);
}

S.masters = async (page) => {
  await openFile(page, `${SNAPS}/willow-1720.qoti`);
  await q(page, () => window.__qoti.setHour(13));
  await lookBuilding(page, 4, 'weaver-master', 76);
  await select(page, { kind: 'resident', id: 951 });
  await say(page, 'resident 951 (the weaver master)', '[class*="inspector"]');
  await shot(page, 4, 'master-resident');
  await select(page, null);
  await bookPanel(page, 4, 'businesses-book', 'businesses');
  await q(page, () => window.__qoti.openPanel(null));
  await lookBuilding(page, 10, 'chandler-level2', 126);
  await lookBuilding(page, 10, 'shop-level3', 565);
  await lookBuilding(page, 5, 'lodge-specialized', 27, 14);
  // A home's Next tier line: the first residential building.
  const home = await q(page, () => {
    const m = window.__qoti.mirror();
    for (const b of m.buildings.values())
      if (/cottage|townhouse|house/.test(b.def) && b.stage === 'built') return b.id;
    return null;
  });
  if (home) await lookBuilding(page, 10, 'home-next-tier', home, 12);
  // The default camera, off a specialized building: the level pole from the default distance.
  const [lx, lz] = await posOf(page, 27);
  await lookAt(page, lx, lz, 40);
  await select(page, null);
  await shot(page, 5, 'lodge-default-camera');
  await bookPanel(page, 6, 'charter-board', 'charter');
};
S.book = async (page) => {
  // 06:05 the morning after an evening's close: the three hints are out.
  await openFile(page, `${SNAPS}/willow-book-0605.qoti`);
  await bookPanel(page, 6, 'town-book-hints', 'town-book');
  // Turn the page: the right-hand leaf.
  await page
    .getByTestId('town-book-next')
    .click({ timeout: 3000 })
    .catch(() => console.log('(no next page)'));
  await page.waitForTimeout(600);
  await say(page, 'town book, after next', 'aside.book-slot');
};
S.gone = async (page) => {
  await openFile(page, `${SNAPS}/willow-gone-1720.qoti`);
  await q(page, () => window.__qoti.setHour(13));
  await lookBuilding(page, 4, 'dairy-gone', 437);
  await bookPanel(page, 4, 'businesses-book-gone', 'businesses');
  await q(page, () => window.__qoti.openPanel(null));
  await say(page, 'news feed (left)', '.alerts, [data-testid="alerts"], aside');
  await shot(page, 4, 'feed-gone');
};

const prio = (page, id) =>
  q(page, (id) => window.__qoti.places().find((p) => p.id === id)?.priority ?? 'normal', id);
const undoSize = (page) => q(page, () => window.__qoti.undoSize());
S.priority = async (page) => {
  await openFile(page, `${SNAPS}/willow-warm-1720.qoti`);
  await submit(page, { t: 'time.setSpeed', speed: 1 }); // commands ride on turns; let a few run
  const A = 'site:lantern-walk:15836';
  const B = 'site:lantern-walk:15072';
  const pa = await q(page, (id) => window.__qoti.places().find((p) => p.id === id), A);
  const [x, z] = tileXZ(pa.tile);
  await lookAt(page, x, z, 16);
  await select(page, { kind: 'place', id: A });
  console.log('before', await prio(page, A), await prio(page, B), 'undo', await undoSize(page));
  await page.getByTestId('place-priority').getByRole('radio', { name: 'Keep first' }).click();
  await page.waitForTimeout(2500);
  console.log('after Keep first on A:', await prio(page, A), 'undo', await undoSize(page));
  await say(page, 'place card A after Keep first', '[class*="inspector"]');
  await shot(page, 8, 'priority-keep');
  await q(page, (id) => window.__qoti.places().find((p) => p.id === id), B);
  await select(page, { kind: 'place', id: B });
  await page.getByTestId('place-priority').getByRole('radio', { name: 'Let it rest' }).click();
  await page.waitForTimeout(2500);
  console.log('after Let it rest on B:', await prio(page, B), 'undo', await undoSize(page));
  await shot(page, 8, 'priority-rest');
  // Undo both, with the keyboard.
  await page
    .locator('body')
    .click({ position: { x: 5, y: 5 } })
    .catch(() => {});
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(2500);
    console.log(
      `after Ctrl+Z #${i + 1}:`,
      'A',
      await prio(page, A),
      'B',
      await prio(page, B),
      'undo',
      await undoSize(page),
    );
    console.log(
      'toasts:',
      JSON.stringify(await q(page, () => window.__qoti.ui().toasts.value)).slice(0, 300),
    );
  }
  await shot(page, 8, 'priority-undone');
  // The carrier's places switch in Balances, and undone.
  await select(page, null);
  await q(page, () => window.__qoti.openPanel('balances'));
  await page.waitForTimeout(1200);
  const sw = page.getByTestId('carrier-places-wares');
  console.log('switch present', await sw.count());
  if (await sw.count()) {
    const state = async () =>
      q(page, () =>
        window.__qoti
          .mirror()
          .balances.value.lines.filter((l) => l.family === 'wares' || l.family === 'fuel')
          .map((l) => `${l.family}:${l.forPlaces}`),
      );
    console.log('before', await state());
    await say(page, 'Balances wares line', '[data-testid="families"]');
    await sw
      .getByRole('checkbox')
      .or(sw)
      .first()
      .click()
      .catch((e) => console.log('click failed', e.message.slice(0, 100)));
    await page.waitForTimeout(2500);
    console.log('after switch', await state(), 'undo', await undoSize(page));
    await shot(page, 8, 'balances-places-on');
    await page
      .locator('body')
      .click({ position: { x: 5, y: 400 } })
      .catch(() => {});
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(2500);
    console.log('after Ctrl+Z', await state(), 'undo', await undoSize(page));
    await shot(page, 8, 'balances-places-undone');
  }
};

S.balances = async (page) => {
  await openFile(page, `${SNAPS}/willow-warm-1720.qoti`);
  await submit(page, { t: 'time.setSpeed', speed: 1 });
  await q(page, () => window.__qoti.openPanel('balances'));
  await page.waitForTimeout(1500);
  await say(page, 'Balances', 'aside.book-slot');
  await page
    .locator('aside.book-slot')
    .getByText('Wares', { exact: true })
    .first()
    .click({ timeout: 5000 })
    .catch((e) => console.log('no Wares row', e.message.slice(0, 80)));
  await page.waitForTimeout(1000);
  const sw = page.getByTestId('carrier-places-wares');
  console.log('switch present', await sw.count());
  await say(page, 'Balances, Wares open', 'aside.book-slot');
  await shot(page, 8, 'balances-wares');
  const state = () =>
    q(page, () =>
      window.__qoti
        .mirror()
        .balances.value.lines.filter((l) => l.family === 'wares')
        .map((l) => `${l.family}:${l.forPlaces}`),
    );
  if (await sw.count()) {
    console.log('before', await state());
    await sw.click();
    await page.waitForTimeout(2500);
    console.log('after switch', await state(), 'undo', await undoSize(page));
    await shot(page, 8, 'balances-places-on');
    await page
      .locator('.top-bar, body')
      .first()
      .click({ position: { x: 5, y: 5 } })
      .catch(() => {});
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(2500);
    console.log('after Ctrl+Z', await state(), 'undo', await undoSize(page));
    await shot(page, 8, 'balances-places-undone');
  }
};

S.thread = async (page) => {
  await open(page, GROWN);
  await q(page, () => window.__qoti.setHour(13));
  const scene = await q(page, () => window.__qoti.threadScene());
  if (!scene) return console.log('no thread scene in this valley');
  console.log('scene', JSON.stringify(scene));
  const { press, at } = scene;
  await lookAt(page, at[0], at[1], 40);
  await select(page, { kind: 'building', id: press });
  await page.waitForTimeout(800);
  await say(page, 'cider maker inspector', '[class*="inspector"]');
  console.log('ground layer', await q(page, () => window.__qoti.groundHighlight()));
  await shot(page, 7, 'cider-maker');
  // A name in the sentence is a link: the place.
  await page
    .getByTestId('thread')
    .getByRole('button', { name: /Pickering/ })
    .first()
    .click({ timeout: 8000 })
    .catch((e) => console.log('link click failed', e.message.slice(0, 80)));
  await page.waitForTimeout(1200);
  await say(page, 'place card by the link', '[class*="inspector"]');
  console.log('ground layer', await q(page, () => window.__qoti.groundHighlight()));
  await shot(page, 7, 'place-by-link');
  // A home: the first household home.
  const home = await q(page, () => {
    const m = window.__qoti.mirror();
    for (const b of m.buildings.values())
      if (b.stage === 'built' && /cottage|townhouse/.test(b.def)) return b.id;
    return null;
  });
  if (home) {
    await select(page, { kind: 'building', id: home });
    await page.waitForTimeout(800);
    await say(page, 'a home', '[class*="inspector"]');
    await shot(page, 7, 'home');
  }
};

S.grownhall = async (page) => {
  await openFile(page, `${SNAPS}/grown-1720.qoti`);
  const hall = await idOf(page, 'town-hall');
  const [hx, hz] = await posOf(page, hall);
  await lookAt(page, hx, hz, 22);
  await q(page, () => window.__qoti.setHour(null));
  const c = await advanceTo(page, 18, 5, 3, false);
  console.log('at', stamp(c), JSON.stringify(await supNow(page)));
  await clearCards(page);
  await select(page, { kind: 'building', id: hall });
  await say(page, 'Town Hall inspector 18:05 (grown)', '[class*="inspector"]');
  await shot(page, 1, 'grown-hall-1805');
};
S.lamp = async (page) => {
  await openFile(page, `${SNAPS}/grown-candles-1720.qoti`);
  const hall = await idOf(page, 'town-hall');
  const [hx, hz] = await posOf(page, hall);
  await lookAt(page, hx, hz, 22);
  await q(page, () => window.__qoti.setHour(null));
  await clearCards(page);
  await select(page, { kind: 'building', id: hall });
  await say(page, 'Town Hall inspector 17:20 (warm willow)', '[class*="inspector"]');
  await shot(page, 1, 'warm-hall-1720');
  await select(page, null);
  let found = 0;
  for (const m of [35, 38, 42, 47]) {
    const c = await advanceTo(page, 17 + Math.floor(m / 60), m % 60, 3, false);
    const ag = await q(page, () => window.__qoti.agentsWith(8192));
    console.log('at', stamp(c), 'lamplighter agents', JSON.stringify(ag), JSON.stringify(await supNow(page)));
    if (ag.length && found < 2) {
      found++;
      await clearCards(page);
      await lookAt(page, ag[0][1], ag[0][2], 9);
      await page.waitForTimeout(600);
      await shot(
        page,
        1,
        `lamplighter-${found}-${String(c.hour).padStart(2, '0')}${String(c.minute).padStart(2, '0')}`,
      );
    }
  }
  await clearCards(page);
  await lookAt(page, hx, hz, 22);
  await select(page, { kind: 'building', id: hall });
  await say(page, 'Town Hall inspector 18:05 (warm willow)', '[class*="inspector"]');
  await shot(page, 1, 'warm-hall-1805');
};

const listPlaces = (page) =>
  q(page, () =>
    window.__qoti
      .places()
      .filter((p) => p.supplies && p.supplies.length)
      .map((p) => ({
        id: p.id,
        n: p.name,
        rest: (p.resting ?? []).length,
        pri: p.priority ?? 'normal',
        pieces: p.supplies.reduce((a, s) => a + s.pieces, 0),
        goods: p.supplies.map((s) => s.good).join('+'),
      })),
  );
S.before = async (page) => {
  // 17:20 and 18:06 of the warm willow evening: the same place, before and after the settling.
  await openFile(page, `${SNAPS}/willow-warm-1720.qoti`);
  await q(page, () => window.__qoti.setHour(null));
  const ps = await listPlaces(page);
  const lw = ps.find((p) => p.id.startsWith('site:lantern-walk'));
  const fire = ps.find((p) => p.id.startsWith('fire:'));
  const porch = ps.filter((p) => !p.id.startsWith('fire:') && !p.id.startsWith('site:lantern-walk'));
  console.log(
    'places',
    ps.length,
    'lw',
    lw?.id,
    'fire',
    fire?.id,
    'others',
    porch
      .slice(0, 8)
      .map((p) => p.id + ':' + p.n + ':' + p.goods)
      .join(' | '),
  );
  for (const [nm, p] of [
    ['lanternwalk', lw],
    ['brazier', fire],
  ])
    if (p) await placeCard(page, 3, `before-${nm}-1720`, p.id);
  await select(page, null);
  await advanceTo(page, 18, 6, 3, false);
  await clearCards(page);
  for (const [nm, p] of [
    ['lanternwalk', lw],
    ['brazier', fire],
  ])
    if (p) await placeCard(page, 3, `after-${nm}-1806`, p.id);
  console.log('after places', JSON.stringify((await listPlaces(page)).filter((p) => p.rest > 0).slice(0, 5)));
};
S.porch = async (page) => {
  await openFile(page, `${SNAPS}/willow-warm-1720.qoti`);
  await q(page, () => window.__qoti.setHour(null));
  const ps = await listPlaces(page);
  console.log(ps.map((p) => `${p.id}|${p.n}|${p.goods}|${p.pieces}`).join('\n'));
  const c = ps.find(
    (p) => /candle/.test(p.goods) && !p.id.startsWith('site:lantern-walk') && !p.id.startsWith('fire:'),
  );
  if (c) await placeCard(page, 6, 'porch-candles', c.id, 12);
  else console.log('no candle place other than lantern walks');
};
S.fresh = async (page) => {
  await page.goto(`${base}/?debug&quality=low&noguide`);
  await page.getByTestId('new-solo').click();
  await live(page);
  await page.waitForTimeout(2500);
  await clearCards(page);
  await q(page, () => window.__qoti.openPanel('town-book'));
  await page.waitForTimeout(1200);
  await say(page, 'town book, fresh valley', 'aside.book-slot');
  await shot(page, 5, 'book-fresh');
};

S.porch5 = async (page) => {
  await openFile(page, `${SNAPS}/willow-warm-1720.qoti`);
  await q(page, () => window.__qoti.setHour(null));
  await placeCard(page, 6, 'porch-household', 'porch:5', 12);
};

S.lampshot = async (page) => {
  // R3X: the lamplighter at a lamp north of the Town Hall, from the north (the hall's roof hid him).
  await openFile(page, `${SNAPS}/grown-candles-1720.qoti`);
  await q(page, () => window.__qoti.setHour(null));
  await clearCards(page);
  for (const [h, m] of [
    [17, 46],
    [17, 52],
  ]) {
    const c = await advanceTo(page, h, m, 3, false);
    const ag = await q(page, () => window.__qoti.agentsWith(8192));
    console.log('at', stamp(c), 'lamplighter agents', JSON.stringify(ag));
    if (!ag.length) continue;
    await clearCards(page);
    await q(page, ([x, z]) => window.__qoti.look(x, z, 6, Math.PI / 2, 0), [ag[0][1], ag[0][2]]);
    await page.waitForTimeout(800);
    await shot(
      page,
      1,
      `lamplighter-north-${String(c.hour).padStart(2, '0')}${String(c.minute).padStart(2, '0')}`,
    );
  }
};

const names = process.argv.slice(2);
for (const name of names) {
  const { browser, page } = await launch();
  try {
    console.log(`\n===== ${name}`);
    await S[name](page);
  } catch (e) {
    console.log('SCENARIO FAILED', name, e.message);
  } finally {
    await browser.close();
  }
}
