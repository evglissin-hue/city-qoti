import { content } from '@qoti/content';
import { DEMAND_KINDS } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { mockView } from '../ui/mocks/session';
import { Mirror } from '../state/mirror';
import { zoneOpen } from '../ui/village';
import {
  BRUSHES,
  brushOfZone,
  buildingChoices,
  ledgerShelf,
  ledgerShelves,
  SHOPS_STAND_IN,
  buildingGroup,
  costBlock,
  decorChoices,
  lockHint,
  teasableLater,
  buildingLock,
} from './catalog';

function mirror(overrides: Parameters<typeof mockView>[0] = {}): Mirror {
  const m = new Mirror();
  m.load(mockView(overrides));
  return m;
}

describe('catalog', () => {
  it('offers buildings by valley mode, and only homely ones in the Hearth lens', () => {
    const standard = buildingChoices('standard', 'ledger').map((d) => d.id);
    expect(standard).toContain('windmill');
    // R1: businesses grow on zoned lots; the picker never offers them.
    for (const grown of ['workshop', 'farmstead', 'corner-shop']) expect(standard).not.toContain(grown);
    expect(standard).not.toContain('house');
    expect(standard).not.toContain('town-hall');
    const sandbox = buildingChoices('sandbox', 'ledger').map((d) => d.id);
    expect(sandbox).toContain('house');
    const hearth = buildingChoices('standard', 'hearth').map((d) => d.id);
    expect(hearth).toContain('cottage');
    expect(hearth).toContain('well');
    expect(hearth).not.toContain('windmill');
    expect(buildingGroup(content.buildingById.get('cottage')!)).toBe('homes');
    expect(buildingGroup(content.buildingById.get('well')!)).toBe('services');
    expect(buildingGroup(content.buildingById.get('windmill')!)).toBe('specialized');
    expect(buildingGroup(content.buildingById.get('apiary')!)).toBe('specialized');
  });

  it('shelves every specialized building as Specialized', () => {
    const specialized = content.buildings.filter((d) => d.specialized);
    expect(specialized.length).toBe(13);
    for (const d of specialized) {
      expect(buildingGroup(d), d.id).toBe('specialized');
      expect(ledgerShelf(d), d.id).toBe('specialized');
    }
  });

  it('puts every Ledger-placeable building on exactly one shelf, in every mode', () => {
    for (const mode of ['standard', 'sandbox'] as const) {
      const placeable = buildingChoices(mode, 'ledger', true);
      expect(placeable.length).toBeGreaterThan(10);
      for (const d of placeable) {
        const shelves = ledgerShelves(mode).filter((s) => s !== 'zones' && ledgerShelf(d) === s);
        expect(shelves, `${mode} ${d.id}`).toHaveLength(1);
        // Specialized defs stand on Specialized and nothing else does.
        expect(ledgerShelf(d) === 'specialized', d.id).toBe(!!d.specialized);
      }
    }
    // Hand-placed homes ride at the end of Services, never on a shelf of their own.
    expect(ledgerShelf(content.buildingById.get('cottage')!)).toBe('services');
    // The Zones shelf is for standard valleys, where zoning exists.
    expect(ledgerShelves('standard')).toEqual(['zones', 'specialized', 'services']);
    expect(ledgerShelves('sandbox')).toEqual(['specialized', 'services']);
  });

  it('has a brush for each demand bar, in demand order, and each zone belongs to one brush', () => {
    expect(BRUSHES.map((b) => b.kind)).toEqual(DEMAND_KINDS);
    for (const z of content.zones) expect(brushOfZone(z.id), z.id).toBeDefined();
    expect(brushOfZone('homes-medium')?.kind).toBe('homes');
  });

  it('the Shops card is the Market Stall before Village, and the Shops brush from Village', () => {
    expect(content.buildingById.get(SHOPS_STAND_IN)).toBeDefined();
    expect(zoneOpen('hamlet', 'shops')).toBe(false);
    expect(zoneOpen('village', 'shops')).toBe(true);
    // The stall needs no rank, so the stand-in is always placeable.
    expect(buildingLock(mirror(), content.buildingById.get(SHOPS_STAND_IN)!)).toBeNull();
    // Townhouses wait for the same rank (the Homes card shows its second density only then).
    expect(zoneOpen('hamlet', 'homes-medium')).toBe(false);
    expect(zoneOpen('village', 'homes-medium')).toBe(true);
  });

  it('explains a refusal by coins or lean times before the sim has to', () => {
    const m = mirror();
    expect(costBlock(m, { coins: 50 })).toBeNull();
    expect(costBlock(m, { coins: 5000 })).toBe('CANNOT_AFFORD');
    const lean = mirror({
      budget: { treasury: -100, leanTimes: true, today: [], yesterday: [], season: [], lastSeason: null },
    });
    expect(costBlock(lean, { coins: 1 })).toBe('LEAN_TIMES');
    const creative = mirror({ settings: { ...mockView().settings, mode: 'sandbox' } });
    expect(costBlock(creative, { coins: 5000 })).toBeNull();
  });

  it('keeps Pattern Book decor locked in standard valleys until unlocked, with the hint', () => {
    const m = mirror();
    const choices = decorChoices(m, 'hearth', false);
    expect(choices.find((c) => c.def.id === 'birdbath')?.locked).toBe(true);
    expect(choices.find((c) => c.def.id === 'curved-bench')?.locked).toBe(false);
    expect(choices.find((c) => c.def.id === 'bench')?.locked).toBe(false);
    // Locked pieces sort last.
    expect(choices[choices.length - 1]!.locked).toBe(true);
    // Hinted pattern: the hint shows. Unhinted: a promise of one.
    expect(lockHint(m, 'hanging-lantern')).toContain(content.patternById.get('lantern-walk')!.hint);
    expect(lockHint(m, 'birdbath')).toContain('nobody has a hint for yet');
    const creative = mirror({ settings: { ...mockView().settings, mode: 'sandbox' } });
    expect(decorChoices(creative, 'hearth', false).every((c) => !c.locked)).toBe(true);
    expect(decorChoices(m, 'hearth', true).map((c) => c.def.id)).toContain('fence');
  });

  it('does not tease buildings for a rank whose Charter does not exist (no Town rank dead end)', () => {
    const wall = content.buildingById.get('stone-wall')!;
    expect(wall.requires?.rank).toBe('town');
    expect(content.charters.some((c) => c.rank === 'town')).toBe(false);
    const village = content.buildings.filter((b) => b.requires?.rank === 'village');
    expect(village.length).toBeGreaterThan(0);
    const teased = teasableLater([wall, ...village]).map((d) => d.id);
    expect(teased).not.toContain('stone-wall');
    expect(teased.sort()).toEqual(village.map((d) => d.id).sort());
    // And the locked-in-the-picker behavior is unchanged: the wall still reports its rank lock.
    expect(buildingLock(mirror(), wall)?.kind).toBe('rank');
  });
});
