// R2.0 player's chair: a Village saved before R2 had claimed its Charter before the brazier was among
// its unlocks, so the piece stayed locked forever in a migrated valley. The migration now unlocks it
// for a town at Village rank or above. The class check: a migrated valley holds every unlock of every
// Charter it has claimed.
import { content } from '@qoti/content';
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { base64ToBytes } from '../../src/state/base64';
import v6 from '../golden/v6-hazel-day3.json';
import { deserialize } from '../../src/state/serialize';

/** The version 6 fixture with its rank (and claim history) rewritten, as bytes. */
function v6At(rank: string): Uint8Array {
  const save = JSON.parse(strFromU8(gunzipSync(base64ToBytes(v6.save)))) as {
    charter: { rank: string; history: { rank: string; tick: number; seats: number[] }[] };
    hearth: { unlocked: string[] };
  };
  save.charter.rank = rank;
  if (rank !== 'hamlet') {
    save.charter.history = [{ rank, tick: 1, seats: [0] }];
    const village = content.charterById.get('village')!;
    // As the claim did before R2: every Village unlock but the brazier, which did not exist yet.
    for (const u of village.unlocks)
      if (u !== 'brazier' && !save.hearth.unlocked.includes(u)) save.hearth.unlocked.push(u);
  }
  return gzipSync(strToU8(JSON.stringify(save)), { level: 6, mtime: 0 });
}

describe('migration 6 to 7 and the Charter unlocks', () => {
  it('unlocks the brazier for a Village, once', () => {
    const state = deserialize(v6At('village'));
    expect(state.hearth.unlocked.filter((u) => u === 'brazier')).toHaveLength(1);
  });

  it('leaves a Hamlet without it (its claim will bring it)', () => {
    expect(deserialize(v6At('hamlet')).hearth.unlocked).not.toContain('brazier');
  });

  it('holds every unlock of every Charter a migrated valley has claimed', () => {
    for (const rank of ['village', 'town']) {
      const state = deserialize(v6At(rank));
      const claimed = new Set(state.charter.history.map((h) => h.rank));
      claimed.add('village');
      for (const c of content.charters) {
        if (!claimed.has(c.rank)) continue;
        for (const u of c.unlocks)
          expect(state.hearth.unlocked, `${rank}: ${c.id} unlocks ${u}`).toContain(u);
      }
    }
  });
});
