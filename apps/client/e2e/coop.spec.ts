import { expect, test } from '@playwright/test';
import { clickTile, counts, DEBUG_QUERY, dragTiles, hashesAt, waitLive } from './helpers';

// Acceptance: two tabs share a valley through the dev server, see each other's placements
// within 250 ms, keep equal hashes, pause together, and a reloaded tab catches up.
test('two seats build together in one valley', async ({ browser }) => {
  const contextA = await browser.newContext();
  const a = await contextA.newPage();
  await a.goto(`/${DEBUG_QUERY}`);
  await a.getByTestId('new-online').click();
  await waitLive(a);
  const link = await a.getByTestId('invite-link').inputValue();
  expect(link).toMatch(/#v=[0-9a-f]{32}&s=1&k=[0-9a-f]{32}$/);
  await a.getByRole('button', { name: 'Done' }).click();

  const contextB = await browser.newContext();
  const b = await contextB.newPage();
  const invite = new URL(link);
  invite.search = DEBUG_QUERY;
  await b.goto(invite.toString());
  // The token moves into local storage and leaves the address bar.
  await expect.poll(() => b.url()).not.toContain('k=');
  await b.getByTestId('join').click();
  await waitLive(b);
  await expect(b.getByText('Player 2 (you)')).toBeVisible();

  // A paints a path; B sees it.
  await a.getByTestId('tool-path').click();
  const run = await a.evaluate(() => window.__qoti.findRoadRun(5));
  expect(run).not.toBeNull();
  const roadsBefore = (await counts(b)).roads;
  await dragTiles(a, run![0]!, run![4]!);
  await expect.poll(async () => (await counts(b)).roads).toBe(roadsBefore + 5);

  // A places a cottage; B sees it within 250 ms of the click.
  await a.getByTestId('tool-building').click();
  await a.getByTestId('variant-cottage').click();
  const spot = await a.evaluate(() => window.__qoti.findBuildingSpot('cottage', 0));
  expect(spot).not.toBeNull();
  const sinceA = Date.now();
  await clickTile(a, spot!.tile);
  await expect.poll(async () => (await counts(b)).buildings).toBe(1);
  await expect.poll(async () => (await counts(a)).buildings).toBe(1);
  const submitted = await a.evaluate(() => window.__qoti.lastSubmitAt());
  const seenByB = await b.evaluate((since) => window.__qoti.seenSince('building', since), sinceA);
  const latency = seenByB! - submitted;
  console.log(`cottage visible to B ${latency} ms after A clicked`);
  expect(latency).toBeLessThan(250);

  // B places a bench; A sees it.
  await b.getByTestId('tool-decor').click();
  await b.getByTestId('variant-bench').click();
  const bench = await b.evaluate(() => window.__qoti.findDecorSpot('bench'));
  expect(bench).not.toBeNull();
  const sinceB = Date.now();
  await clickTile(b, bench!.tile);
  await expect.poll(async () => (await counts(a)).decor).toBe(1);
  const benchLatency =
    (await a.evaluate((since) => window.__qoti.seenSince('decor', since), sinceB))! -
    (await b.evaluate(() => window.__qoti.lastSubmitAt()));
  console.log(`bench visible to A ${benchLatency} ms after B clicked`);
  expect(benchLatency).toBeLessThan(250);

  // After 100 more turns, both seats report the same hash.
  const turn = await a.evaluate(() => window.__qoti.lastTurn());
  const after = await hashesAt(a, b, turn + 100);
  console.log(`turn ${after.t}: A ${after.a}, B ${after.b}`);
  expect(after.a).toBe(after.b);

  // A pauses: B's clock stops and B is told who paused.
  await a.getByTestId('speed-0').click();
  await expect(b.getByTestId('speed-note')).toContainText('Paused by Player 1');
  await expect.poll(async () => (await b.evaluate(() => window.__qoti.clock()))!.speed).toBe(0);
  const t1 = (await b.evaluate(() => window.__qoti.clock()))!.tick;
  await b.waitForTimeout(1200);
  const t2 = (await b.evaluate(() => window.__qoti.clock()))!.tick;
  expect(t2).toBe(t1);

  // A resumes, then B reloads and catches up to the same hash.
  await a.getByTestId('speed-1').click();
  await b.reload();
  await waitLive(b);
  expect((await counts(b)).buildings).toBe(1);
  expect((await counts(b)).decor).toBe(1);
  const reloaded = await hashesAt(a, b, (await a.evaluate(() => window.__qoti.lastTurn())) + 1);
  console.log(`after reload, turn ${reloaded.t}: A ${reloaded.a}, B ${reloaded.b}`);
  expect(reloaded.a).toBe(reloaded.b);

  await contextA.close();
  await contextB.close();
});
