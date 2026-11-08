import { describe, expect, it } from 'vitest';
import type { MirrorChange } from '../../state/mirror';
import { CUE_RULES, cueForCommand, cuesFor, type CueScene } from './index';
import { CUE_GAP, CUES_PER_SECOND, CueLimiter } from './limiter';

const base: CueScene = {
  achievements: 0,
  patterns: 0,
  sites: new Set([5]),
  built: new Set([1]),
  sales: 100,
  day: 2,
  hour: 10,
  raid: false,
  bell: false,
  festival: false,
  wolves: false,
  storm: false,
};

function change(over: Partial<MirrorChange> = {}): MirrorChange {
  return {
    full: false,
    letters: [],
    notices: [],
    rankUp: null,
    together: [],
    ...over,
  } as unknown as MirrorChange;
}

describe('cues', () => {
  it('lists one rule per cue, sorted by id', () => {
    const ids = CUE_RULES.map((r) => r.id);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('maps changes to cues', () => {
    expect(cuesFor(base, base, change())).toEqual([]);
    expect(cuesFor(base, { ...base, sites: new Set(), built: new Set([1, 5]) }, change())).toEqual(['built']);
    expect(cuesFor(base, { ...base, sales: 140 }, change())).toEqual(['coins']);
    // A new day resets the ledger line; that is not a sale.
    expect(cuesFor(base, { ...base, day: 3, sales: 140 }, change())).toEqual([]);
    expect(cuesFor(base, { ...base, raid: true }, change())).toEqual(['raid-horn']);
    expect(cuesFor(base, { ...base, raid: true, bell: true }, change())).toEqual(['bell', 'raid-horn']);
    expect(cuesFor(base, { ...base, wolves: true, hour: 20 }, change())).toEqual(['howl']);
    expect(cuesFor(base, { ...base, achievements: 1, patterns: 1 }, change())).toEqual([
      'achievement',
      'pattern',
    ]);
    expect(cuesFor(base, base, change({ rankUp: { rank: 'village', text: '' } }))).toEqual(['rank-up']);
    expect(cuesFor(base, base, change({ notices: [{ kind: 'letter', text: '' }] }))).toEqual(['letter']);
  });

  it('plays nothing on a full load', () => {
    expect(cuesFor(base, { ...base, achievements: 4, raid: true }, change({ full: true }))).toEqual([]);
  });

  it('knows the commands that place and remove', () => {
    expect(cueForCommand('build.place')).toBe('place');
    expect(cueForCommand('road.paint')).toBe('place');
    expect(cueForCommand('decor.remove')).toBe('remove');
    expect(cueForCommand('zone.clear')).toBe('remove');
    expect(cueForCommand('time.setSpeed')).toBeNull();
  });
});

describe('cue limiter', () => {
  it('plays a box drag of 40 houses as one sound', () => {
    const l = new CueLimiter();
    let played = 0;
    for (let i = 0; i < 40; i++) if (l.allow('place', 10 + i * 0.002)) played++;
    expect(played).toBe(1);
    expect(l.allow('place', 10 + CUE_GAP.place + 0.01)).toBe(true);
  });

  it('caps cues per second across kinds', () => {
    const l = new CueLimiter();
    const ids = ['place', 'coins', 'letter', 'ping', 'pattern', 'achievement'] as const;
    const played = ids.filter((id, i) => l.allow(id, 5 + i * 0.01)).length;
    expect(played).toBe(CUES_PER_SECOND);
    expect(l.allow('achievement', 6.2)).toBe(true);
  });
});
