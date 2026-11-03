import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';
import { hashesAt } from './helpers';

// C5F acceptance: every season page opens on the live winter and raid fixtures, and festival
// planning, the Watch's posture, the captive choice and the threat dial round trip between two
// browsers (a raid fixture moved online, a partner joining it). The panels' own clicks send the
// commands; the relay, sims and mirrors are real.

const expect = baseExpect.configure({ timeout: 120_000 });

interface SeasonsLike {
  festival: { plan: { by: number; menu: [string, number, number][]; twist: string } | null } | null;
  watch: { posture: [number, number][] } | null;
  threat: { captives?: number[] } | null;
  raid: { captures: number[] } | null;
  settings: { threat: string };
}

const seasons = (p: Page) =>
  p.evaluate(() => (window.__qoti as unknown as { seasons(): SeasonsLike }).seasons());

async function waitLive(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240_000 });
}

async function openBook(page: Page, lens: 'hearth' | 'ledger', id: string): Promise<void> {
  await page.getByTestId(`lens-${lens}`).click();
  await page.getByTestId(`book-${id}`).click();
}

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

test('the season pages open on the live winter fixture', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/?debug&quality=low&fixture=winter');
  await waitLive(page);
  await openBook(page, 'hearth', 'festival');
  await expect(page.getByTestId('festival')).toBeVisible();
  await expect(page.getByTestId('festival-menu')).toContainText(/put by/);
  await openBook(page, 'hearth', 'field-guide');
  await expect(page.getByTestId('guide-entries')).toBeVisible();
  await openBook(page, 'ledger', 'watch');
  await expect(page.getByTestId('watch-roster')).toBeVisible();
  await page.getByTestId('book-trade').click();
  await page.getByTestId('trade-dock').click();
  await expect(page.getByTestId('dock-frozen')).toBeVisible();
  await page.getByTestId('trade-commissions').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('weather')).toBeVisible();
  await page.getByTestId('weather').click();
  await expect(page.getByTestId('season-card')).toBeVisible();
  await page.getByTestId('card-trial').click();
  await expect(page.getByTestId('trial')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('photo-open').click();
  await expect(page.getByTestId('photo-strip')).toBeVisible();
  await expect(page.locator('.topbar')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('photo-strip')).toHaveCount(0);
});

test('the raid fixture shows the raid bar and the captive choice', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/?debug&quality=low&fixture=raid');
  await waitLive(page);
  await expect(page.getByTestId('raid-bar')).toBeVisible();
  await expect(page.getByTestId('raid-bell')).toBeDisabled();
  await expect(page.getByTestId('captive-choice')).toBeVisible();
});

async function raidForTwo(browser: Browser) {
  const a = await (await browser.newContext()).newPage();
  await a.goto('/?debug&quality=low&fixture=raid');
  await waitLive(a);
  await a.getByTestId('settings-open').click();
  await a.getByTestId('move-online').click();
  await a.getByTestId('move-online-yes').click();
  await expect(a.getByTestId('invite-link')).toHaveValue(/#v=[0-9a-f]{32}&s=1&k=[0-9a-f]{32}$/);
  await waitLive(a);
  const link = await a.getByTestId('invite-link').inputValue();
  await a.getByRole('button', { name: 'Done' }).click();
  const b = await (await browser.newContext()).newPage();
  const invite = new URL(link);
  invite.search = '?debug&quality=low';
  await b.goto(invite.toString());
  await b.getByTestId('join').click();
  await waitLive(b);
  return { a, b };
}

test('festival, posture, captives and the threat dial round trip between two seats', async ({ browser }) => {
  test.setTimeout(900_000);
  const { a, b } = await raidForTwo(browser);

  // The captive choice: seat 1 offers a home, and the card leaves both screens.
  await expect(a.getByTestId('captive-choice')).toBeVisible();
  await expect(b.getByTestId('captive-choice')).toBeVisible();
  await b.getByTestId('captive-home').click();
  await expect(a.getByTestId('captive-choice')).toHaveCount(0);
  await expect(b.getByTestId('captive-choice')).toHaveCount(0);

  // Seat 1 plans the festival on the poster: a site by the map tool's draft, a dish on the menu.
  await openBook(b, 'hearth', 'festival');
  await b.getByTestId('festival-pick-site').click();
  const spot = await b.evaluate(() => window.__qoti.findBuildingSpot('town-hall'));
  // The site box goes on open ground near the start; drag it on the map like a player.
  const from = await b.evaluate(([x, z]) => window.__qoti.screenOf(x!, z!), [spot!.x - 3, spot!.z - 3]);
  const to = await b.evaluate(([x, z]) => window.__qoti.screenOf(x!, z!), [spot!.x + 3, spot!.z + 3]);
  await b.mouse.move(from!.x, from!.y);
  await b.mouse.down();
  await b.mouse.move(to!.x, to!.y, { steps: 8 });
  await b.mouse.up();
  await expect(b.getByTestId('festival-site')).toContainText(/Open ground/);
  const add = b.locator('[data-testid^="menu-add-"]').first();
  if (await add.count()) await add.click();
  await b.getByTestId('festival-send').click();
  await expect.poll(async () => (await seasons(a)).festival?.plan?.by).toBe(1);

  // Seat 0 posts the Watch's guard points from the Watch board.
  await openBook(a, 'ledger', 'watch');
  await a.getByTestId('watch-place-guards').click();
  const g = await a.evaluate(() => window.__qoti.findDecorSpot('bench'));
  const at = await a.evaluate(([x, z]) => window.__qoti.screenOf(x, z), g!.tile);
  await a.mouse.click(at!.x, at!.y);
  await a.getByTestId('watch-send-posture').click();
  await expect
    .poll(async () =>
      (await seasons(b)).watch?.posture.some(([x, z]) => x === g!.tile[0] && z === g!.tile[1]),
    )
    .toBe(true);

  // Seat 0 turns the threat dial in Settings; seat 1's valley follows.
  await a.keyboard.press('Escape');
  await a.getByTestId('settings-open').click();
  await a.getByTestId('settings-threat-fierce').click();
  await expect.poll(async () => (await seasons(b)).settings.threat).toBe('fierce');

  const turn = await a.evaluate(() => window.__qoti.lastTurn());
  const after = await hashesAt(a, b, turn + 50);
  expect(after.a).toBe(after.b);
});
