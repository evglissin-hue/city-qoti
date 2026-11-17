import { buildView, createWorld, defaultSettings } from '@qoti/sim';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mirror } from '../state/mirror';
import { computeAlerts } from './alerts';
import { eveningMocks } from './mocks/evening';

// R2D: the evening edition reaches the feed when the player chose a line over the card.
function withEdition(): Mirror {
  const m = new Mirror();
  m.load(buildView(createWorld('r2d-edition-feed', defaultSettings())));
  m.evening.value = eveningMocks(m).evening;
  return m;
}

describe('the edition in the feed', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is a line in both lenses when the setting says so, and absent otherwise', () => {
    const m = withEdition();
    const first = m.evening.value!.lines[0]!.text;
    expect(computeAlerts(m).some((a) => a.text === first)).toBe(false);
    const store = new Map([['qoti.settings.v1', JSON.stringify({ editionInFeed: true })]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: () => {} });
    const lines = computeAlerts(m).filter((a) => a.text === first);
    expect(lines.map((a) => a.lens).sort()).toEqual(['hearth', 'ledger']);
  });
});
