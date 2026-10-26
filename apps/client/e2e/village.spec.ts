import { expect, test } from '@playwright/test';
import { clickTile, counts, DEBUG_QUERY, dragTiles, waitLive } from './helpers';

// C4F: the village UI against a live village (the sim's village fixture), and plans and requests
// round-tripping between two browsers.

const VILLAGE_QUERY = '?debug&quality=low&fixture=village';

interface VillageHook {
  setLens(lens: string): void;
  select(sel: { kind: string; id: number } | null): void;
  residentIds(): number[];
  zoneAt(x: number, z: number): number;
  plans(): { id: number; name: string; status: string; comments: { text: string }[]; seenBy: number[] }[];
  requests(): { id: number; from: number; status: string; text: string }[];
  look(x: number, z: number, distance: number): void;
}

test('every village panel opens and works against a live village', async ({ page }) => {
  test.setTimeout(240_000);
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(`/${VILLAGE_QUERY}`);
  await waitLive(page);
  await expect(page.getByTestId('rank')).toContainText('Village');
  await expect(page.getByTestId('minimap')).toBeVisible();

  // Ledger books.
  await page.getByTestId('lens-ledger').click();
  await page.getByTestId('book-market').click();
  await page.getByTestId('price-bread').click();
  await expect(page.getByTestId('good-card')).toContainText('Households wanted');
  await page.getByTestId('market-profit').click();
  await expect(page.getByTestId('profit')).toContainText('Bakery');
  await page.getByTestId('book-trade').click();
  await expect(page.getByTestId('neighbor-millhaven')).toContainText('Millhaven');
  await page.getByTestId('trade-orders').click();
  await expect(page.getByTestId('order-planks')).toBeVisible();
  await page.getByTestId('trade-caravans').click();
  await expect(page.getByTestId('caravans')).toBeVisible();
  await page.getByTestId('book-policies').click();
  await page.getByTestId('wage-110').click();
  await expect(page.getByTestId('wage-110')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('credit')).toBeVisible();
  await page.getByTestId('book-notebook').click();
  await expect(page.getByTestId('idea-cobbles')).toHaveClass(/unlocked/);
  await page.keyboard.press('Escape');

  // Zoning along lane A paints the zone layer and sketches lots while dragging.
  await page.evaluate(() => (window.__qoti as unknown as VillageHook).look(46, 53, 22));
  await page.getByTestId('tool-zone').click();
  await page.getByTestId('variant-homes-medium').click();
  await dragTiles(page, [42, 51], [47, 53]);
  await expect
    .poll(() => page.evaluate(() => (window.__qoti as unknown as VillageHook).zoneAt(44, 52)))
    .toBe(2);
  await page.keyboard.press('Escape');

  // Hearth: the letters book, a resident, the Charter board from the pennant.
  await page.getByTestId('lens-hearth').click();
  await page.getByTestId('book-letters').click();
  await expect(page.getByTestId('letters')).toBeVisible();
  await page.keyboard.press('Escape');
  const someone = await page.evaluate(() => window.__qoti.residentIds()[0]!);
  await page.evaluate((id) => window.__qoti.select({ kind: 'resident', id }), someone);
  await expect(page.getByTestId('resident-inspector')).toBeVisible();
  await page.evaluate(() => window.__qoti.select(null));
  await page.getByTestId('rank').click();
  await expect(page.getByTestId('charter-board')).toBeVisible();
  await page.keyboard.press('Escape');

  // The fixture's open plan: approve it and the bench gets built.
  const decor = (await counts(page)).decor;
  await page.getByTestId('tool-plan').click();
  const plan = (await page.evaluate(() => (window.__qoti as unknown as VillageHook).plans()))[0]!;
  await expect(page.getByTestId(`plan-${plan.id}`)).toContainText(plan.name);
  await page.getByTestId(`plan-approve-${plan.id}`).click();
  await expect.poll(async () => (await counts(page)).decor).toBe(decor + 1);

  // A note for the partner (the feed comes back once the book is put away).
  await page.keyboard.press('Escape');
  await page.getByTestId('request-ask').click();
  await page.getByTestId('ask-text').click();
  await page.getByTestId('ask-note').fill('A lantern by the well, please.');
  await page.getByTestId('ask-send').click();
  await expect(page.getByTestId('requests')).toContainText('A lantern by the well');
});

test('plans and requests round trip between two browsers', async ({ browser }) => {
  test.setTimeout(240_000);
  const contextA = await browser.newContext();
  const a = await contextA.newPage();
  await a.goto(`/${DEBUG_QUERY}`);
  await a.getByTestId('new-online').click();
  await waitLive(a);
  const link = await a.getByTestId('invite-link').inputValue();
  await a.getByRole('button', { name: 'Done' }).click();

  const contextB = await browser.newContext();
  const b = await contextB.newPage();
  const invite = new URL(link);
  invite.search = DEBUG_QUERY;
  await b.goto(invite.toString());
  await b.getByTestId('join').click();
  await waitLive(b);

  // A sketches a bench with the ordinary decor tool and proposes it.
  await a.getByTestId('tool-plan').click();
  await a.getByTestId('sketch-start').click();
  await a.getByTestId('tool-decor').click();
  await a.getByTestId('variant-bench').click();
  const spot = await a.evaluate(() => window.__qoti.findDecorSpot('bench'));
  expect(spot).not.toBeNull();
  await clickTile(a, spot!.tile);
  await expect(a.getByTestId('sketch-bar')).toContainText('a bench');
  expect((await counts(a)).decor).toBe(0);
  await a.getByTestId('sketch-review').click();
  await a.getByTestId('sketch-name').fill('A bench for two');
  await a.getByTestId('sketch-propose').click();

  // B sees it as new, says something, and A reads it.
  const plans = () => b.evaluate(() => (window.__qoti as unknown as VillageHook).plans());
  await expect.poll(async () => (await plans()).length).toBe(1);
  const id = (await plans())[0]!.id;
  await b.getByTestId('tool-plan').click();
  await expect(b.getByTestId(`plan-${id}`)).toContainText('A bench for two');
  await expect(b.getByTestId(`plan-${id}`)).toContainText('a bench');
  await b.getByTestId(`plan-comment-${id}`).fill('Lovely. Facing the river?');
  await b.getByTestId(`plan-say-${id}`).click();
  await expect(a.getByTestId(`plan-${id}`)).toContainText('Lovely. Facing the river?');
  // B opened it, so A no longer sees "not yet seen".
  await expect(a.getByTestId(`plan-unseen-${id}`)).toHaveCount(0);

  // B approves: the bench is built for both.
  await b.getByTestId(`plan-approve-${id}`).click();
  await expect.poll(async () => (await counts(a)).decor).toBe(1);
  await expect.poll(async () => (await counts(b)).decor).toBe(1);

  // A asks B for something; B marks it done; A sees it done.
  await a.getByTestId('request-ask').click();
  await a.getByTestId('ask-text').click();
  await a.getByTestId('ask-note').fill('A lantern for the bench, please.');
  await a.getByTestId('ask-send').click();
  const requests = () => b.evaluate(() => (window.__qoti as unknown as VillageHook).requests());
  await expect.poll(async () => (await requests()).length).toBe(1);
  const req = (await requests())[0]!;
  await expect(b.getByTestId(`request-${req.id}`)).toContainText('A lantern for the bench');
  await b.getByTestId(`request-done-${req.id}`).click();
  await expect(a.getByTestId(`request-${req.id}`)).toContainText('done');

  await contextA.close();
  await contextB.close();
});
