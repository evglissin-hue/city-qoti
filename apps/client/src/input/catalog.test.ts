import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { mockView } from '../ui/mocks/session';
import { Mirror } from '../state/mirror';
import { buildingChoices, buildingGroup, costBlock, decorChoices, lockHint } from './catalog';

function mirror(overrides: Parameters<typeof mockView>[0] = {}): Mirror {
  const m = new Mirror();
  m.load(mockView(overrides));
  return m;
}

describe('catalog', () => {
  it('offers buildings by valley mode, and only homely ones in the Hearth lens', () => {
    const standard = buildingChoices('standard', 'ledger').map((d) => d.id);
    expect(standard).toContain('bakery');
    expect(standard).not.toContain('house');
    expect(standard).not.toContain('town-hall');
    const sandbox = buildingChoices('sandbox', 'ledger').map((d) => d.id);
    expect(sandbox).toContain('house');
    const hearth = buildingChoices('standard', 'hearth').map((d) => d.id);
    expect(hearth).toContain('cottage');
    expect(hearth).toContain('well');
    expect(hearth).not.toContain('bakery');
    expect(buildingGroup(content.buildingById.get('storehouse')!)).toBe('services');
    expect(buildingGroup(content.buildingById.get('windmill')!)).toBe('food');
    expect(buildingGroup(content.buildingById.get('sawpit')!)).toBe('materials');
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
    expect(lockHint(m, 'hanging-lantern')).toContain(
      'A long path, never more than a few steps from a light.',
    );
    expect(lockHint(m, 'birdbath')).toContain('nobody has a hint for yet');
    const creative = mirror({ settings: { ...mockView().settings, mode: 'sandbox' } });
    expect(decorChoices(creative, 'hearth', false).every((c) => !c.locked)).toBe(true);
    expect(decorChoices(m, 'hearth', true).map((c) => c.def.id)).toContain('fence');
  });
});
