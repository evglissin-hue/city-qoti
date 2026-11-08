import { expect, test, type Page } from '@playwright/test';
import { waitLive } from './helpers';

// C5E acceptance: photo mode saves a PNG larger than the canvas; `capture` returns a small PNG
// thumbnail (its main thread time is logged; a software renderer does the GPU's work on the CPU,
// so the 50 ms budget is checked on a laptop); and a resting winter valley in falling snow keeps
// drawing idle frames, with nothing from the season or the weather dropping the still frame.

interface Render {
  capture(o: { focus: [number, number]; radius: number; size: [number, number] }): Promise<Blob | null>;
  photo: {
    setPhoto(on: boolean): void;
    setDepthOfField(a: number): void;
    setTimeOfDay(h: number | null): void;
    savePng(): Promise<Blob>;
  };
  stats: { mode: string };
}

const hook = (page: Page): Promise<[number, number, number, number]> =>
  page.evaluate(() => {
    const q = window.__qoti as unknown as {
      renderer(): Render;
      startArea(): [number, number, number, number];
    };
    return q.startArea();
  });

const staticChanges = (page: Page): Promise<Record<string, number> | null> =>
  page.evaluate(() =>
    (window.__qoti as unknown as { staticChanges(): Record<string, number> | null }).staticChanges(),
  );

async function openWinter(page: Page, extra = ''): Promise<[number, number, number, number]> {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(`/?debug&fixture=winter&fixedres${extra}`);
  await waitLive(page);
  return hook(page);
}

test('photo mode saves a PNG and capture returns a thumbnail', async ({ page }) => {
  test.setTimeout(240_000);
  const [x0, z0, x1, z1] = await openWinter(page);
  const out = await page.evaluate(
    async ([fx, fz]) => {
      const r = (window.__qoti as unknown as { renderer(): Render }).renderer();
      const readSize = async (b: Blob) => {
        const bmp = await createImageBitmap(b);
        return [bmp.width, bmp.height];
      };
      const t0 = performance.now();
      const pending = r.capture({ focus: [fx, fz], radius: 18, size: [320, 200] });
      const syncMs = performance.now() - t0;
      const thumb = await pending;
      r.photo.setPhoto(true);
      r.photo.setDepthOfField(0.6);
      r.photo.setTimeOfDay(19);
      const png = await r.photo.savePng();
      r.photo.setPhoto(false);
      const canvas = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
      return {
        syncMs,
        thumbType: thumb?.type ?? null,
        thumbSize: thumb ? await readSize(thumb) : null,
        pngType: png.type,
        pngSize: await readSize(png),
        canvas: [canvas.width, canvas.height],
      };
    },
    [(x0 + x1 + 1) / 2, (z0 + z1 + 1) / 2] as [number, number],
  );
  console.log(`capture: ${out.syncMs.toFixed(1)} ms of main thread (software renderer)`);
  expect(out.thumbType).toBe('image/png');
  expect(out.thumbSize).toEqual([320, 200]);
  expect(out.pngType).toBe('image/png');
  expect(out.pngSize[0]).toBeGreaterThan(out.canvas[0]!);
});

test('a resting winter valley in falling snow draws idle frames', async ({ page }) => {
  test.setTimeout(300_000);
  const [x0, z0, x1, z1] = await openWinter(page, '&weather=snow');
  await page.evaluate(
    ([x, z]) => {
      const q = window.__qoti as unknown as {
        submit(c: unknown): void;
        setHour(h: number): void;
        look(x: number, z: number, d: number): void;
      };
      q.submit({ t: 'time.setSpeed', speed: 0 });
      q.setHour(11);
      q.look(x, z, 50);
    },
    [(x0 + x1 + 1) / 2, (z0 + z1 + 1) / 2] as [number, number],
  );
  // Let the snow ease in and the valley stream and settle: wait for the first idle frame (a slow
  // software runner can take a minute or two), then watch a while more.
  const mode = () =>
    page.evaluate(() => (window.__qoti as unknown as { renderer(): Render }).renderer().stats.mode);
  await expect.poll(mode, { timeout: 150_000, intervals: [2000] }).toBe('idle');
  const before = await staticChanges(page);
  const modes = new Set<string>();
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(2000);
    modes.add(await mode());
  }
  const after = await staticChanges(page);
  expect(modes.has('idle')).toBe(true);
  for (const key of ['season', 'weather']) expect(after?.[key] ?? 0).toBe(before?.[key] ?? 0);
});

// C5E part 2: the I3 pieces on show (defenses, a festival laid out for tonight with its bonfire,
// the circus, fireworks going up, a flood, and a raid's tracks and crows) still leave a resting
// valley drawing idle frames: what moves is in moving layers, and the festival's static pieces
// drop the still frame only when they change.
test('a resting valley with a festival, fireworks, a flood and omens draws idle frames', async ({ page }) => {
  test.setTimeout(300_000);
  await openWinter(page, '&omens&flood=0.6');
  await page.evaluate(() => {
    const q = window.__qoti as unknown as {
      submit(c: unknown): void;
      setHour(h: number): void;
      look(x: number, z: number, d: number): void;
      seasonsShowcase(): { center: [number, number] } | null;
      fireworks(x?: number, z?: number): boolean;
    };
    q.submit({ t: 'time.setSpeed', speed: 0 });
    const sc = q.seasonsShowcase();
    const [x, z] = sc?.center ?? [64, 64];
    q.setHour(20.5);
    q.look(x + 8, z + 4, 28);
    q.fireworks(x + 8, z + 2);
  });
  const mode = () =>
    page.evaluate(() => (window.__qoti as unknown as { renderer(): Render }).renderer().stats.mode);
  await expect.poll(mode, { timeout: 150_000, intervals: [2000] }).toBe('idle');
  const before = await staticChanges(page);
  const modes = new Set<string>();
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(2000);
    modes.add(await mode());
  }
  const after = await staticChanges(page);
  expect(modes.has('idle')).toBe(true);
  for (const key of ['festival', 'buildings', 'decor', 'season', 'weather'])
    expect(after?.[key] ?? 0).toBe(before?.[key] ?? 0);
});
