// I3 (C5F): wall ghosts agree with the sim (like roads in mirror.test.ts). For random runs over the
// threat fixture, the ghost's rule on the client's Mirror and the sim's own wall.paint validation on
// its state give the same answer, reason included, enclosures among them.
import { content, type BuildingDef } from '@qoti/content';
import { buildView, commandHandlers, rngFromSeed, type Command } from '@qoti/sim';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { threatFixture } from '../../../../../packages/sim/test/fixtures/threat';
import { Mirror } from '../../state/mirror';
import { proposeRoute } from '../route';
import { wallGhost } from './seasons';

const DEFS = ['palisade', 'stone-wall'];
const saved = new Map<string, BuildingDef['modes']>();

// C5D unhides the defense pieces (modes); until then open them for the test, and put them back.
beforeAll(() => {
  for (const id of DEFS) {
    const def = content.buildingById.get(id) as BuildingDef;
    saved.set(id, def.modes);
    delete (def as { modes?: unknown }).modes;
  }
});
afterAll(() => {
  for (const id of DEFS) (content.buildingById.get(id) as { modes?: unknown }).modes = saved.get(id);
});

describe('wall ghosts', () => {
  it('agree with wall.paint validation for random runs, enclosures included', () => {
    const f = threatFixture();
    const state = f.state;
    const mirror = new Mirror();
    mirror.load(buildView(state));
    const handler = commandHandlers.find((c) => c.type === 'wall.paint')!;
    const rng = rngFromSeed('wall-ghosts');
    const [sx, sz, ex, ez] = state.meta.startArea;
    const reasons = new Map<string, number>();
    const pick = (a: number, b: number) => rng.range(a, b);
    for (let i = 0; i < 400; i++) {
      let tiles: [number, number][];
      if (i % 4 === 0) {
        // A ring round a building: the enclosures.
        const b = state.buildings[pick(0, state.buildings.length - 1)]!;
        const r = pick(1, 3);
        tiles = [];
        for (let x = b.x - r; x <= b.x + r + 1; x++) tiles.push([x, b.z - r], [x, b.z + r + 1]);
        for (let z = b.z - r + 1; z <= b.z + r; z++) tiles.push([b.x - r, z], [b.x + r + 1, z]);
      } else {
        const a: [number, number] = [pick(sx - 10, ex + 10), pick(sz - 10, ez + 10)];
        const b: [number, number] = [a[0] + pick(-12, 12), a[1] + pick(-12, 12)];
        tiles = proposeRoute(a, b, rng.int(2) === 0);
      }
      const def = DEFS[i % 2]!;
      const cmd = { t: 'wall.paint', def, tiles } as Extract<Command, { t: 'wall.paint' }>;
      const sim = handler.validate(state, 0, cmd as never);
      const ghost = wallGhost({ mirror }, def, tiles);
      const fromGhost = ghost.ok ? null : (ghost.reason ?? 'INVALID');
      // The sim also checks the rank (LOCKED); the fixture is a Village, so both agree there too.
      expect(fromGhost, `run ${i}: ${JSON.stringify(tiles.slice(0, 4))}`).toBe(sim);
      reasons.set(sim ?? 'ok', (reasons.get(sim ?? 'ok') ?? 0) + 1);
    }
    expect(reasons.get('ok') ?? 0).toBeGreaterThan(10);
    expect(reasons.get('WOULD_ENCLOSE') ?? 0).toBeGreaterThan(0);
    expect(reasons.get('OCCUPIED') ?? 0).toBeGreaterThan(0);
  });
});
