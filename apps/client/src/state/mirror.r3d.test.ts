import { buildView, createWorld, defaultSettings, type SimEvent } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { r3Mocks } from '../ui/mocks/r3';
import { Mirror } from './mirror';

// R3D: the Mirror keeps tonight's supplies and the Town Book, from the snapshot and their events.
function mirror(): Mirror {
  const m = new Mirror();
  m.load(buildView(createWorld('r3d-mirror', defaultSettings())));
  return m;
}

const apply = (m: Mirror, events: SimEvent[]) => m.apply({ t: m.lastTurn.value + 1, events, patches: [] });

describe('the Mirror keeps the Town Book and the supplies', () => {
  it('starts with neither and replaces each whole on its event', () => {
    const m = mirror();
    // The sim's stand-in views (R3.0) are empty until R3A and R3C fill them.
    expect(m.townBook.value?.pages ?? []).toHaveLength(0);
    const mocks = r3Mocks(m);
    apply(m, [
      { e: 'supplies.updated', s: mocks.supplies },
      { e: 'townBook.updated', t: mocks.townBook },
    ]);
    expect(m.supplies.value).toBe(mocks.supplies);
    expect(m.townBook.value).toBe(mocks.townBook);
    const empty = { pages: [], hints: [], callings: [], leanings: [0, 0, 0] };
    apply(m, [{ e: 'townBook.updated', t: empty }]);
    expect(m.townBook.value).toBe(empty);
    expect(m.supplies.value).toBe(mocks.supplies);
  });

  it('loads them from a snapshot and drops them when a snapshot has none', () => {
    const m = mirror();
    const mocks = r3Mocks(m);
    m.load({
      ...buildView(createWorld('r3d-mirror', defaultSettings())),
      supplies: mocks.supplies,
      townBook: mocks.townBook,
    });
    expect(m.townBook.value?.pages).toHaveLength(mocks.townBook.pages.length);
    const { supplies: _s, townBook: _t, ...bare } = buildView(createWorld('r3d-mirror', defaultSettings()));
    m.load(bare);
    expect(m.townBook.value).toBeNull();
    expect(m.supplies.value).toBeNull();
  });
});
