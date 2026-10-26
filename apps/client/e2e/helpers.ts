import { expect, type Page } from '@playwright/test';

/** The window.__qoti debug hook (see src/app/debug.ts), typed loosely for tests. */
export interface QotiHook {
  status(): string;
  counts(): { buildings: number; decor: number; notes: number; trees: number; roads: number } | null;
  lastTurn(): number;
  clock(): { tick: number; speed: number } | null;
  lastHash(): { t: number; h: string } | null;
  hashAt(t: number): string | null;
  lastSubmitAt(): number;
  seenSince(kind: string, since: number): number | null;
  screenOf(x: number, z: number): { x: number; y: number } | null;
  screenOfFp(fx: number, fz: number): { x: number; y: number } | null;
  findBuildingSpot(def: string, rot?: number): { x: number; z: number; tile: [number, number] } | null;
  findDecorSpot(def: string): { fx: number; fz: number; tile: [number, number] } | null;
  findRoadRun(len: number): [number, number][] | null;
  runGolden(script: unknown): Promise<string>;
  resyncs(): number;
  corrupt(): void;
  // I1 (C3E)
  mode(): string | null;
  residentIds(): number[];
  buildingsOf(def: string): number[];
  select(sel: { kind: string; id: number } | null): void;
  undoSize(): number;
}

declare global {
  interface Window {
    __qoti: QotiHook;
  }
}

/** I0 specs play creative (sandbox) valleys; HAMLET_QUERY starts standard ones. */
export const DEBUG_QUERY = '?debug&quality=low&creative';
export const HAMLET_QUERY = '?debug&quality=low';

export async function waitLive(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 60_000 });
}

export async function counts(page: Page) {
  const c = await page.evaluate(() => window.__qoti.counts());
  if (!c) throw new Error('No valley loaded');
  return c;
}

export async function screenOf(page: Page, tile: [number, number]): Promise<{ x: number; y: number }> {
  const p = await page.evaluate(([x, z]) => window.__qoti.screenOf(x, z), tile);
  if (!p) throw new Error(`Tile ${tile.join(',')} is off screen`);
  return p;
}

/** Drags the left mouse button from one tile center to another. */
export async function dragTiles(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await screenOf(page, from);
  const b = await screenOf(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
}

/** Clicks at a tile center after hovering it, as a player would. */
export async function clickTile(page: Page, tile: [number, number]): Promise<void> {
  const p = await screenOf(page, tile);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.click(p.x, p.y);
}

/** Waits until both pages have reported a hash for the same turn at or after `fromTurn`, and returns both. */
export async function hashesAt(
  a: Page,
  b: Page,
  fromTurn: number,
): Promise<{ t: number; a: string; b: string }> {
  const t = Math.ceil(fromTurn / 50) * 50;
  await expect
    .poll(
      async () => {
        const ha = await a.evaluate((turn) => window.__qoti.hashAt(turn), t);
        const hb = await b.evaluate((turn) => window.__qoti.hashAt(turn), t);
        return ha !== null && hb !== null;
      },
      { timeout: 40_000 },
    )
    .toBe(true);
  return {
    t,
    a: (await a.evaluate((turn) => window.__qoti.hashAt(turn), t))!,
    b: (await b.evaluate((turn) => window.__qoti.hashAt(turn), t))!,
  };
}
