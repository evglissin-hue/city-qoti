import { expect, test, type Page } from '@playwright/test';
import { counts, DEBUG_QUERY, hashesAt, waitLive } from './helpers';

// Opt-in soak: QOTI_SOAK_MINUTES=5 npm run e2e -- soak
// Two seats take turns doing mixed actions for a few minutes; their hashes must stay equal
// at every checkpoint. It stands in for the brief's "5 minutes of mixed actions" check.
const minutes = Number(process.env.QOTI_SOAK_MINUTES ?? 0);

test.skip(!minutes, 'Set QOTI_SOAK_MINUTES to run the soak test');
test.setTimeout((minutes + 3) * 60_000);

async function act(page: Page, step: number): Promise<void> {
  await page.evaluate((n) => {
    const q = window.__qoti as unknown as {
      submit(cmd: unknown): number;
      findRoadRun(len: number): [number, number][] | null;
      findBuildingSpot(def: string, rot?: number): { x: number; z: number } | null;
      findDecorSpot(def: string): { fx: number; fz: number } | null;
      counts(): { buildings: number } | null;
    };
    const kinds = ['road', 'building', 'decor', 'tree', 'note', 'speed', 'remove'];
    const kind = kinds[n % kinds.length];
    const defs = ['cottage', 'house', 'well', 'shed', 'windmill'];
    if (kind === 'road') {
      const run = q.findRoadRun(3 + (n % 4));
      if (run) q.submit({ t: 'road.paint', kind: n % 2 ? 'path' : 'lane', tiles: run });
    } else if (kind === 'building') {
      const def = defs[n % defs.length]!;
      const spot = q.findBuildingSpot(def, 0);
      if (spot) q.submit({ t: 'build.place', def, x: spot.x, z: spot.z, rot: (n % 4) as 0 | 1 | 2 | 3 });
    } else if (kind === 'decor') {
      const def = ['bench', 'lantern', 'flower-bed', 'planter'][n % 4]!;
      const spot = q.findDecorSpot(def);
      if (spot) q.submit({ t: 'decor.place', def, fx: spot.fx, fz: spot.fz, rot: n % 64 });
    } else if (kind === 'tree') {
      const spot = q.findDecorSpot('bench');
      if (spot) q.submit({ t: 'tree.plant', species: 'oak', x: spot.fx >> 8, z: spot.fz >> 8 });
    } else if (kind === 'note') {
      const spot = q.findDecorSpot('bench');
      if (spot) q.submit({ t: 'note.pin', x: spot.fx >> 8, z: spot.fz >> 8, text: `Soak note ${n}` });
    } else if (kind === 'speed') {
      q.submit({ t: 'time.setSpeed', speed: [1, 2, 3, 1][n % 4] });
    } else {
      q.submit({ t: 'build.remove', ids: [n] });
    }
  }, step);
}

test('hashes stay equal through minutes of mixed actions', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await a.goto(`/${DEBUG_QUERY}`);
  await a.getByTestId('new-online').click();
  await waitLive(a);
  const link = new URL(await a.getByTestId('invite-link').inputValue());
  await a.getByRole('button', { name: 'Done' }).click();
  link.search = DEBUG_QUERY;
  const b = await (await browser.newContext()).newPage();
  await b.goto(link.toString());
  await b.getByTestId('join').click();
  await waitLive(b);

  const end = Date.now() + minutes * 60_000;
  let step = 0;
  let checkpoints = 0;
  let nextCheck = Date.now() + 15_000;
  while (Date.now() < end) {
    await act(step % 2 ? b : a, step);
    step++;
    await a.waitForTimeout(400);
    if (Date.now() >= nextCheck) {
      const turn = await a.evaluate(() => window.__qoti.lastTurn());
      const h = await hashesAt(a, b, turn + 1);
      expect(h.a, `turn ${h.t}`).toBe(h.b);
      checkpoints++;
      nextCheck = Date.now() + 15_000;
    }
  }
  const final = await hashesAt(a, b, (await a.evaluate(() => window.__qoti.lastTurn())) + 1);
  expect(final.a).toBe(final.b);
  expect(await counts(a)).toEqual(await counts(b));
  console.log(`soak: ${step} actions, ${checkpoints + 1} matching checkpoints, last turn ${final.t}`);
  console.log(`counts: ${JSON.stringify(await counts(a))}`);
});
