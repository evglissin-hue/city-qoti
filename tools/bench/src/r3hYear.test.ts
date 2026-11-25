// R3H: a year with specialized buildings climbing. The autoplayer plays a Village year; levels climb
// along the way (the Chronicle says so), the money invariant holds through it, no health flag (the
// audit's own, level-stuck among them) is left, and the same year hashes the same twice.
import { START_TREASURY, hashState, moneyBalance } from '@qoti/sim';
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { explained } from './audit';
import { autoplay } from './autoplay';

const SEED = 'willow';
const DAYS = 70;

describe('R3H: a Village year with levels', () => {
  const first = autoplay(SEED, DAYS, { economy: 'standard', threat: 'standard', village: true });
  const w = first.hamlet.world;

  it('a specialized building climbed, and the Chronicle said so', () => {
    const climbed = w.chronicle.filter((c) => c.kind === 'specialized-grew');
    expect(climbed.length).toBeGreaterThan(0);
    const levelled = w.buildings.filter((b) => (b.level ?? 1) > 1 && content.buildingById.get(b.def)?.levels);
    for (const b of levelled) expect(b.stage).toBe('built');
  });

  it('the money invariant holds through it', () => {
    expect(moneyBalance(w)).toBe(START_TREASURY);
  });

  it('no level is stuck for a reason no command can change', () => {
    const stuck = first.health.filter((i) => i.kind === 'level-stuck' && !explained(i));
    expect(stuck, stuck.map((i) => i.text).join('\n')).toEqual([]);
  });

  it('the same year hashes the same twice', () => {
    const again = autoplay(SEED, DAYS, { economy: 'standard', threat: 'standard', village: true });
    expect(hashState(again.hamlet.world)).toBe(hashState(w));
  });
}, 600_000);
