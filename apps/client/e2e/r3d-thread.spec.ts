import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { waitLive } from './helpers';

// R3D: Follow the thread, the Town Book and R3's controls, read from the screen at 1250 x 800 (the
// owner's laptop window), in both lenses, by day and by lamplight.
// - The Thread runs on the real sim: in the grown village (a real autoplayed town with orchards,
//   cider makers and a market stall), `__qoti.threadScene()` records a cider's door pairs through a
//   debug worker message, so the sentence and its route are the sim's own. Real towns sell a Treat or
//   two at places of an evening so far (the wave notes: Treats are scarce, R3E measures, R3X tunes).
// - The Town Book's pages, the places' supplies and the masters are stand-ins until R3A to R3C land,
//   so `&evening&r3` lays the R3 mocks over the village fixture, as R2D's e2e did for the evening.
const SHOTS = fileURLToPath(new URL('../../../docs/build/screenshots', import.meta.url));
const GROWN = '?debug&clean&quality=low&noguide&fixture=grown';
const MOCKS = '?debug&clean&quality=low&noguide&fixture=village&mock&evening&r3';
const LIGHTS = [
  ['day', 13],
  ['lamp', 22],
] as const;
const LENSES = ['hearth', 'ledger'] as const;

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/r3d-${name}.png`, animations: 'disabled' });
}

async function open(page: Page, query: string) {
  await page.setViewportSize({ width: 1250, height: 800 });
  await page.goto(`/${query}`);
  await waitLive(page);
  // Hold the clock still: the counts halve at midnight and the shots should agree with each other.
  await page.evaluate(() => window.__qoti.submit({ t: 'time.setSpeed', speed: 0 }));
  // A result card waiting from the fixture's last night (the grown village's festival) would cover
  // the screen: put it away, as a player would.
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    for (const [name, value] of [
      ['festivalCard', null],
      ['raidCard', null],
      ['almanac', null],
      ['edition', null],
      ['chapter', false],
    ] as const)
      window.__qoti.setUi(name, value);
  });
}

test('a cider followed from the orchard to the folk who drank it, its route on the ground', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await open(page, GROWN);
  const scene = await page.evaluate(() => window.__qoti.threadScene());
  expect(
    scene,
    'the grown village has an orchard, a cider maker, a store, a stall and a place',
  ).not.toBeNull();
  const { press, place, placeName, at } = scene!;
  // Pull back over the press so its route, out to the orchard and the place, is on screen.
  await page.evaluate(([x, z]) => window.__qoti.focusTile(x, z, 46), at);

  for (const [light, hour] of LIGHTS) {
    await page.evaluate((h) => window.__qoti.setHour(h), hour);
    for (const lens of LENSES) {
      await page.getByTestId(`lens-${lens}`).click();
      await page.evaluate((id) => window.__qoti.select({ kind: 'building', id }), press);
      const thread = page.getByTestId('thread');
      await expect(thread).toContainText('This cider: fruit from');
      await expect(thread).toContainText('pressed here');
      await expect(thread).toContainText(`mugs drunk at ${placeName}`);
      await expect(thread).toContainText(/taken home by \d+ households/);
      // Its names are links; the route is drawn while the inspector is open.
      await expect(thread.getByRole('button')).toHaveCount(3);
      await expect.poll(() => page.evaluate(() => window.__qoti.groundHighlight())).toBe('thread');
      await shot(page, `thread-press-${lens}-${light}`);
    }
  }
  await page.evaluate(() => window.__qoti.setHour(13));

  // A click on the place's name opens its card; the card keeps its outline until the Thread is hovered.
  await page.getByTestId('thread').getByRole('button', { name: placeName }).click();
  await expect(page.getByTestId('place-card')).toBeVisible();
  // The pointer is still where the link was, over the card's own Thread: move it off first.
  await page.mouse.move(600, 400);
  await expect.poll(() => page.evaluate(() => window.__qoti.groundHighlight())).toBe('inspector');
  const atPlace = page.getByTestId('thread');
  await expect(atPlace).toContainText('The cider here: fruit from');
  await expect(atPlace).toContainText('14 mugs drunk here');
  await atPlace.hover();
  await expect.poll(() => page.evaluate(() => window.__qoti.groundHighlight())).toBe('thread');
  await shot(page, 'thread-place-hover');
  await page.mouse.move(600, 400);
  await expect.poll(() => page.evaluate(() => window.__qoti.groundHighlight())).toBe('inspector');

  // The good's card in Balances tells the same cider from the town's side.
  await page.evaluate(() => window.__qoti.select(null));
  await page.getByTestId('lens-ledger').click();
  await page.evaluate(() => {
    window.__qoti.setUi('balancesFamily', 'treats');
    window.__qoti.setUi('marketGood', 'cider');
    window.__qoti.openPanel('balances');
  });
  await expect(page.getByTestId('good-card').getByTestId('thread')).toContainText('Cider: fruit from');
  await page.getByTestId('good-card').scrollIntoViewIfNeeded();
  await shot(page, 'thread-good-ledger');
  expect(place).toBeTruthy();
});

test('the Town Book shows its pages and three hints in both lenses', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, MOCKS);
  await page.waitForFunction(() => window.__qoti.places().length > 0);
  for (const [light, hour] of LIGHTS) {
    await page.evaluate((h) => window.__qoti.setHour(h), hour);
    for (const lens of LENSES) {
      await page.getByTestId(`lens-${lens}`).click();
      // P3B's one Books shelf lists the Town Book in both lenses; it opens from there or with U.
      await page.getByTestId('books').click();
      await expect(page.getByTestId('book-town-book')).toBeVisible();
      if (light === 'day') await shot(page, `books-shelf-${lens}`);
      await page.getByTestId('book-town-book').click();
      const book = page.getByTestId('town-book');
      await expect(book).toBeVisible();
      await expect(book.getByTestId('town-book-hint')).toHaveCount(3);
      await shot(page, `town-book-cover-${lens}-${light}`);
      await book
        .getByRole('button', { name: /Cider|Pie|Jam|Mead|Honey|Cordial/ })
        .first()
        .click();
      await expect(book.getByTestId('town-book-page')).toBeVisible();
      await expect(book.getByTestId('town-book-picture')).toBeVisible();
      await shot(page, `town-book-page-${lens}-${light}`);
      await page.keyboard.press('Escape');
      await expect(book).toBeHidden();
    }
  }
});

test('a place kept first and one let rest, each undone; the carrier buys for places and is undone', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await open(page, MOCKS);
  await page.waitForFunction(() => window.__qoti.places().some((p) => (p.supplies?.length ?? 0) > 0));
  const [kept, rested] = await page.evaluate(() =>
    window.__qoti
      .places()
      .filter((p) => (p.supplies?.length ?? 0) > 0)
      .map((p) => p.id)
      .slice(0, 2),
  );
  for (const [light, hour] of LIGHTS) {
    await page.evaluate((h) => window.__qoti.setHour(h), hour);
    await page.getByTestId('lens-hearth').click();
    await page.evaluate((id) => window.__qoti.select({ kind: 'place', id }), kept!);
    await expect(page.getByTestId('place-priority')).toBeVisible();
    await expect(page.getByTestId('place-supplies')).toBeVisible();
    await shot(page, `place-supplies-${light}`);
  }
  await page.evaluate(() => window.__qoti.setHour(13));

  for (const [id, choice] of [
    [kept!, 'keep'],
    [rested ?? kept!, 'rest'],
  ] as const) {
    await page.evaluate((pid) => window.__qoti.select({ kind: 'place', id: pid }), id);
    const before = await page
      .getByTestId('place-priority')
      .locator('[aria-checked="true"]')
      .getAttribute('data-testid');
    await page.getByTestId(`place-priority-${choice}`).click();
    await expect(page.getByTestId(`place-priority-${choice}`)).toHaveAttribute('aria-checked', 'true');
    await shot(page, `place-${choice}`);
    await page.evaluate(() => window.__qoti.undo());
    await expect(page.getByTestId(before!)).toHaveAttribute('aria-checked', 'true');
  }

  // Balances: what places drew, and the carrier's switch to buy for them too.
  await page.evaluate(() => window.__qoti.select(null));
  await page.getByTestId('lens-ledger').click();
  for (const [light, hour] of LIGHTS) {
    await page.evaluate((h) => window.__qoti.setHour(h), hour);
    await page.evaluate(() => {
      window.__qoti.setUi('balancesFamily', 'wares');
      window.__qoti.openPanel('balances');
    });
    const toggle = page.getByTestId('carrier-places-wares');
    await expect(toggle).toBeVisible();
    await toggle.scrollIntoViewIfNeeded();
    await shot(page, `balances-places-${light}`);
  }
  await page.evaluate(() => window.__qoti.setHour(13));
  // The switch sends carrier.setRule with `places`, and undo sends it back. The sim stores it, but
  // its Balances line does not report `forPlaces` until R3A fills it (view/balances.ts, R3A's line),
  // so the switch's own state is not read back here yet: the undo stack is.
  const toggle = page.getByTestId('carrier-places-wares');
  const size = await page.evaluate(() => window.__qoti.undoSize());
  await toggle.click();
  await expect.poll(() => page.evaluate(() => window.__qoti.undoSize())).toBe(size + 1);
  await page.evaluate(() => window.__qoti.undo());
  await expect.poll(() => page.evaluate(() => window.__qoti.undoSize())).toBe(size);
});

test('masters, apprentices, the lamplighter, a candle and callings, in both lenses', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, MOCKS);
  await page.waitForFunction(() => window.__qoti.businesses().some((b) => b.masterId));
  const ids = await page.evaluate(() => {
    const b = window.__qoti.businesses().find((x) => x.masterId)!;
    const sup = window.__qoti.supplies();
    return {
      business: b.id,
      master: b.masterId!,
      apprentice: b.apprentices?.[0] ?? null,
      hall: window.__qoti.buildingsOf('town-hall')[0]!,
      home: sup?.candles[0] ?? null,
    };
  });
  for (const [light, hour] of LIGHTS) {
    await page.evaluate((h) => window.__qoti.setHour(h), hour);
    for (const lens of LENSES) {
      await page.getByTestId(`lens-${lens}`).click();
      await page.evaluate((id) => window.__qoti.select({ kind: 'resident', id }), ids.master);
      await expect(page.getByTestId('resident-master')).toBeVisible();
      await shot(page, `resident-master-${lens}-${light}`);
      await page.evaluate((id) => window.__qoti.select({ kind: 'building', id }), ids.business);
      await expect(page.getByTestId('building-master')).toBeVisible();
      await shot(page, `building-master-${lens}-${light}`);
    }
    await page.evaluate((id) => window.__qoti.select({ kind: 'building', id }), ids.hall);
    await expect(page.getByTestId('building-lamplighter')).toBeVisible();
    await shot(page, `town-hall-${light}`);
    if (ids.home !== null) {
      await page.evaluate((id) => window.__qoti.select({ kind: 'building', id }), ids.home);
      await expect(page.getByTestId('building-candle')).toBeVisible();
      await shot(page, `home-candle-${light}`);
    }
    if (ids.apprentice !== null) {
      await page.evaluate((id) => window.__qoti.select({ kind: 'resident', id }), ids.apprentice);
      await expect(page.getByTestId('resident-apprentice')).toBeVisible();
    }
    await page.evaluate(() => window.__qoti.select(null));
    await page.evaluate(() => window.__qoti.openPanel('charter'));
    await expect(page.getByTestId('charter-callings')).toBeVisible();
    await shot(page, `charter-callings-${light}`);
    await page.getByTestId('lens-ledger').click();
    await page.evaluate(() => window.__qoti.openPanel('businesses'));
    await shot(page, `businesses-${light}`);
    await page.evaluate(() => window.__qoti.openPanel(null));
  }
});
