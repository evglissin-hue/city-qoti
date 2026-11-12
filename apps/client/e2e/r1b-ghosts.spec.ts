import { expect, test, type Page } from '@playwright/test';
import { HAMLET_QUERY, screenOf, waitLive } from './helpers';

// R1B: the build ghost runs the same site rules as the sim. A Windmill hard against a building
// is refused with the open-ground message under the cursor; on open ground it is not.

const ELBOW_ROOM = 'needs elbow room';

async function hoverHint(page: Page, tile: [number, number]): Promise<string> {
  const p = await screenOf(page, tile);
  await page.mouse.move(p.x - 6, p.y - 6);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  return (await page.getByTestId('cursor-hint').textContent()) ?? '';
}

test('the Windmill ghost says it needs elbow room beside a building, and accepts open ground', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(`/${HAMLET_QUERY}&fixture=hamlet`);
  await waitLive(page);
  await page.getByTestId('lens-ledger').click();
  await page.getByTestId('tool-building').click();
  await page.getByTestId('group-specialized').click();
  await page.getByTestId('variant-windmill').click();

  // Walk the tiles just north of the town hall (it stands at 44, 46 in the fixture) until the
  // ghost is clear of it but still within two tiles: the open-ground rule is the one that refuses.
  let refused = '';
  for (let z = 44; z >= 36 && !refused.includes(ELBOW_ROOM); z--) {
    refused = await hoverHint(page, [45, z]);
  }
  expect(refused).toContain(ELBOW_ROOM);

  // On open ground, away from every building, the same ghost has no such complaint.
  const spot = await page.evaluate(() => window.__qoti.findBuildingSpot('windmill', 0));
  expect(spot).not.toBeNull();
  const open = await hoverHint(page, spot!.tile);
  expect(open).not.toContain(ELBOW_ROOM);
});
