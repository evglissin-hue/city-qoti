import { expect as baseExpect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { hashesAt } from './helpers';

// C5X part 2: two browsers play a full year on the live relay (four seasons, compressed at the
// top speed), with the threat dial at Standard: the village fixture moved online, a partner
// joining it, then the clock runs while both seats are compared and the year's moments are shot
// (a festival evening, snow, dusk, a raid if one comes). Opt in with QOTI_YEAR=1: a year at 3x is
// about fifty minutes, longer under software rendering. Stills go to QOTI_YEAR_SHOTS (default
// test-results/c5x-year), a summary to summary.json beside them.

const expect = baseExpect.configure({ timeout: 240_000 });
const SHOTS = process.env.QOTI_YEAR_SHOTS ?? 'test-results/c5x-year';
const TICKS_PER_DAY = 4800;
const DAYS = Number(process.env.QOTI_YEAR_DAYS ?? 24);

interface Seasons {
  festival: { live: boolean; festival: { id: string } } | null;
  raid: { raiders?: unknown[] } | null;
  settings: { threat: string };
  weather: { today: string; events: { event: string }[]; frozen: boolean } | null;
  trial: { status: string } | null;
}

const seasons = (p: Page) =>
  p.evaluate(() => (window.__qoti as unknown as { seasons(): Seasons | null }).seasons());
const tick = (p: Page) => p.evaluate(() => window.__qoti.clock()?.tick ?? 0);
const clock = (p: Page) =>
  p.evaluate(() => window.__qoti.clock() as unknown as { season: number; hour: number; year: number } | null);

async function waitLive(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240_000 });
}

/** Puts away whatever season page or card sits on the desk. */
async function clearDesk(page: Page): Promise<void> {
  for (const id of ['season-report-close', 'season-card-close', 'raid-result-close', 'captive-send']) {
    const b = page.getByTestId(id);
    if (await b.isVisible().catch(() => false)) await b.click().catch(() => undefined);
  }
}

test('two browsers play a full year online', async ({ browser }) => {
  test.skip(!process.env.QOTI_YEAR, 'set QOTI_YEAR=1 to play a year (about an hour)');
  test.setTimeout((DAYS * 6 + 30) * 60_000);
  const a = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await a.goto('/?debug&quality=low&fixture=village');
  await waitLive(a);
  await a.getByTestId('speed-0').click();
  await a.getByTestId('settings-open').click();
  await a.getByTestId('move-online').click();
  await a.getByTestId('move-online-yes').click();
  await expect(a.getByTestId('invite-link')).toHaveValue(/#v=[0-9a-f]{32}&s=1&k=[0-9a-f]{32}$/);
  await waitLive(a);
  const link = await a.getByTestId('invite-link').inputValue();
  await a.getByRole('button', { name: 'Done' }).click();
  await a.getByTestId('settings-open').click();
  await a.getByTestId('settings-threat-standard').click();
  await a.keyboard.press('Escape');
  const b = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const invite = new URL(link);
  invite.search = '?debug&quality=low';
  await b.goto(invite.toString());
  await b.getByTestId('join').click();
  await waitLive(b);
  await expect.poll(async () => (await seasons(b))?.settings.threat).toBe('standard');

  const start = await tick(a);
  const end = start + DAYS * TICKS_PER_DAY;
  await a.getByTestId('speed-3').click();
  const log: string[] = [];
  const shot = async (name: string) => {
    await a.screenshot({ path: `${SHOTS}/${name}-a.png` });
    await b.screenshot({ path: `${SHOTS}/${name}-b.png` });
    log.push(`shot ${name}`);
  };
  const seen = new Set<string>();
  const hashes: { t: number; same: boolean }[] = [];
  const weather = new Set<string>();
  let lastHashAt = -Infinity;
  for (let now = await tick(a); now < end; now = await tick(a)) {
    await a.waitForTimeout(5_000);
    await clearDesk(a);
    await clearDesk(b);
    const s = await seasons(a);
    const day = Math.floor((now - start) / TICKS_PER_DAY);
    const c = await clock(a);
    const hour = c?.hour ?? 0;
    if (s?.weather?.today) weather.add(s.weather.today);
    for (const e of s?.weather?.events ?? []) weather.add(`event:${e.event}`);
    const season = `${c?.year ?? 0}.${c?.season ?? 0}`;
    const moments: [string, boolean][] = [
      [`festival-${season}-${s?.festival?.festival.id ?? ''}`, !!s?.festival?.live],
      ['snow', s?.weather?.today === 'snow'],
      ['frozen', !!s?.weather?.frozen],
      [`dusk-${season}`, hour === 19],
      ['raid', !!s?.raid],
    ];
    for (const [name, on] of moments) {
      if (on && !seen.has(name)) {
        seen.add(name);
        await shot(name);
      }
    }
    if (now - lastHashAt > TICKS_PER_DAY) {
      lastHashAt = now;
      const turn = await a.evaluate(() => window.__qoti.lastTurn());
      const h = await hashesAt(a, b, turn);
      hashes.push({ t: h.t, same: h.a === h.b });
      log.push(`day ${day} hour ${hour}: hashes ${h.a === h.b ? 'match' : 'DIFFER'} at ${h.t}`);
      expect(h.a).toBe(h.b);
    }
  }
  await a.getByTestId('speed-0').click();
  const s = await seasons(a);
  const summary = {
    days: DAYS,
    festivals: [...seen].filter((m) => m.startsWith('festival-')),
    trial: s?.trial?.status ?? null,
    weather: [...weather].sort(),
    moments: [...seen].sort(),
    hashChecks: hashes.length,
    resyncs: [
      await a.evaluate(() => window.__qoti.resyncs()),
      await b.evaluate(() => window.__qoti.resyncs()),
    ],
    log,
  };
  writeFileSync(`${SHOTS}/summary.json`, JSON.stringify(summary, null, 2));
  expect(hashes.every((h) => h.same)).toBe(true);
});
