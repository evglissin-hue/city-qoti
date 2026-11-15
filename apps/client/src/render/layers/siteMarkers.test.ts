// P2-D: the sites' waiting markers show in the Ledger without the Status overlay, not in the Hearth.
import { BuildingStatus } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { shownStatusBits } from './overlays';

const WAITING = BuildingStatus.waitingMaterials | BuildingStatus.waitingBuilders;

describe('shownStatusBits', () => {
  it('shows the waiting markers over sites when site markers are on (the Ledger)', () => {
    expect(shownStatusBits(null, true, 'construction', WAITING)).toBe(WAITING);
    expect(shownStatusBits('resources', true, 'construction', WAITING)).toBe(WAITING);
  });

  it('needs the Status overlay otherwise (the Hearth)', () => {
    expect(shownStatusBits(null, false, 'construction', WAITING)).toBe(0);
    expect(shownStatusBits('status', false, 'construction', WAITING)).toBe(WAITING);
  });

  it('marks only sites, and keeps the no-road mark always on', () => {
    expect(shownStatusBits(null, true, 'built', WAITING)).toBe(0);
    const bits = BuildingStatus.noRoad | BuildingStatus.noWorkers;
    expect(shownStatusBits(null, false, 'built', bits)).toBe(BuildingStatus.noRoad);
    expect(shownStatusBits(null, true, 'built', bits)).toBe(BuildingStatus.noRoad);
  });
});
