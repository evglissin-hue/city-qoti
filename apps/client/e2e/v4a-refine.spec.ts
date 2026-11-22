import { expect, test, type Page } from '@playwright/test';

// V4A acceptance (docs/build/cycle-v4a-rest-refinement.md): at rest the still frame develops to
// the preset's samples and settles into idle frames; moving the camera drops to the plain moving
// frame on the very next frame; lamps lighting one by one at rest fold into the developed picture
// and never take it back to the plain still frame; `?debug&refine=0` keeps today's still frame.
// The grown village on High, small so the software renderer keeps up.

/** The parts of the `?debug` hook these tests use. */
interface Debug {
  status(): string;
  submit(cmd: { t: 'time.setSpeed'; speed: number }): void;
  setHour(h: number): void;
  grownInfo(): { center: [number, number] };
  look(x: number, z: number, distance: number, turn: number, tilt: number): void;
  stats(): { mode: string; samples: number; sampleGoal: number; stillChange: string | null; drawn: number };
  renderer(): unknown;
  lampSequence(o: { count: number; everyMs: number }): number;
  lampSequenceLit(): number;
  lampSequenceStop(): void;
}

/** The camera parts of the renderer these tests turn. */
interface Rig {
  rig: { rotateBy(a: number, b: number): void; snap(): void };
  invalidate(): void;
}

interface Shot {
  mode: string;
  samples: number;
  goal: number;
  change: string | null;
  drawn: number;
}

async function open(page: Page, query = ''): Promise<void> {
  await page.setViewportSize({ width: 640, height: 400 });
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(
    `/?debug&fixture=grown&clean&fixedres&quality=high&season=summer&day=3&weather=clear${query}`,
  );
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240_000 });
  await page.evaluate(() => {
    const q = window.__qoti as unknown as Debug;
    q.submit({ t: 'time.setSpeed', speed: 0 });
    q.setHour(11);
    const info = q.grownInfo();
    q.look(info.center[0], info.center[1], 70, 0, 0);
  });
}

/** Starts a fresh rest (the camera nudged and put back) and waits until it has settled. */
async function settle(page: Page): Promise<Shot> {
  return page.evaluate(async () => {
    const q = window.__qoti as unknown as Debug;
    const r = q.renderer() as Rig;
    const frame = () => new Promise((res) => requestAnimationFrame(res));
    const nudge = (d: number) => {
      r.rig.rotateBy(d, 0);
      r.rig.snap();
      r.invalidate();
    };
    let drawn = q.stats().drawn;
    nudge(0.0005);
    while (q.stats().drawn === drawn) await frame();
    nudge(-0.0005);
    const t0 = performance.now();
    for (;;) {
      await frame();
      const s = q.stats();
      if (s.mode === 'idle' && s.samples >= s.sampleGoal) break;
      if (performance.now() - t0 > 180_000) break;
    }
    drawn = q.stats().drawn;
    // Two more drawn frames: settled frames stay idle.
    while (q.stats().drawn < drawn + 2 && performance.now() - t0 < 200_000) await frame();
    const s = q.stats();
    return { mode: s.mode, samples: s.samples, goal: s.sampleGoal, change: s.stillChange, drawn: s.drawn };
  });
}

test.describe('V4A: the developing picture', () => {
  test.setTimeout(600_000);

  test('develops at rest, settles, and drops to the plain moving frame the frame the camera moves', async ({
    page,
  }) => {
    await open(page);
    // Let the valley stream in before measuring a rest.
    await page.waitForTimeout(10_000);
    const settled = await settle(page);
    expect(settled.goal).toBeGreaterThanOrEqual(16);
    expect(settled.samples).toBe(settled.goal);
    expect(settled.mode).toBe('idle');

    const next = await page.evaluate(async () => {
      const q = window.__qoti as unknown as Debug;
      const r = q.renderer() as Rig;
      const drawn = q.stats().drawn;
      r.rig.rotateBy(0.05, 0);
      r.rig.snap();
      while (q.stats().drawn === drawn) await new Promise((res) => requestAnimationFrame(res));
      const s = q.stats();
      return { mode: s.mode, samples: s.samples, goal: s.sampleGoal, drawn: s.drawn - drawn };
    });
    expect(next).toEqual({ mode: 'moving', samples: 0, goal: 0, drawn: 1 });
  });

  test('folds lamps lighting at rest into the developed picture without ever restarting it', async ({
    page,
  }) => {
    await open(page);
    await page.setViewportSize({ width: 640, height: 400 });
    await page.evaluate(() => (window.__qoti as unknown as Debug).setHour(22.3));
    await page.waitForTimeout(10_000);
    const settled = await settle(page);
    expect(settled.samples).toBeGreaterThan(0);
    const seen = await page.evaluate(async (from: number) => {
      const q = window.__qoti as unknown as Debug;
      const frame = () => new Promise((res) => requestAnimationFrame(res));
      const count = q.lampSequence({ count: 4, everyMs: 300 });
      const shots: { mode: string; samples: number; goal: number; change: string | null; lit: number }[] = [];
      const t0 = performance.now();
      let drawn = q.stats().drawn;
      for (;;) {
        await frame();
        const s = q.stats();
        if (s.drawn !== drawn) {
          shots.push({
            mode: s.mode,
            samples: s.samples,
            goal: s.sampleGoal,
            change: s.stillChange,
            lit: q.lampSequenceLit(),
          });
          drawn = s.drawn;
        }
        if (q.lampSequenceLit() >= count && s.samples >= s.sampleGoal && s.mode === 'idle') break;
        if (performance.now() - t0 > 240_000) break;
      }
      q.lampSequenceStop();
      return { count, shots, from };
    }, settled.samples);
    expect(seen.count).toBe(4);
    const folds = seen.shots.filter((s) => s.mode === 'still');
    // Each lamp drew the still frame again (a fold), and none of them restarted the development.
    expect(folds.length).toBeGreaterThanOrEqual(1);
    for (const s of seen.shots) {
      expect(s.samples).toBeGreaterThanOrEqual(seen.from);
      expect(['first', 'targets', 'view']).not.toContain(s.change);
    }
    const last = seen.shots[seen.shots.length - 1]!;
    expect(last.lit).toBe(4);
    expect(last.samples).toBe(last.goal);
  });

  test('?debug&refine=0 keeps the plain still frame', async ({ page }) => {
    await open(page, '&refine=0');
    await page.waitForTimeout(10_000);
    const settled = await settle(page);
    expect(settled).toMatchObject({ mode: 'idle', samples: 0, goal: 0 });
  });
});
