import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { siteRuleLine, siteRuleWords } from './siteRule';

describe('site rules in words', () => {
  it('says each kind of rule the way the picker promises', () => {
    expect(siteRuleWords({ kind: 'woods', trees: 12, within: 8 })).toBe('Beside woods (12 grown trees)');
    expect(siteRuleWords({ kind: 'river' })).toBe('On the river bank');
    expect(siteRuleWords({ kind: 'openGround', clear: 2 })).toBe('On open ground');
    expect(siteRuleWords({ kind: 'road' })).toBe('Beside a road');
    expect(siteRuleWords({ kind: 'valleyRoad', within: 6 })).toBe('Near the valley road');
    expect(siteRuleWords({ kind: 'waterEdge' })).toBe("At the water's edge");
    expect(siteRuleWords({ kind: 'deposit', deposit: 'stone' })).toBe('On a stone deposit');
    expect(siteRuleWords({ kind: 'deposit', deposit: 'clay' })).toBe('On clay');
    expect(siteRuleWords({ kind: 'fertility', min: 40 })).toBe('On good soil');
  });

  it('has words for every site rule a specialized building uses, and every one has a rule', () => {
    const specialized = content.buildings.filter((d) => d.specialized);
    expect(specialized.length).toBeGreaterThan(0);
    for (const d of specialized) {
      expect(d.placement?.length, `${d.id} has a site rule`).toBeGreaterThan(0);
      for (const rule of d.placement ?? []) {
        const words = siteRuleWords(rule);
        expect(words, `${d.id} ${rule.kind}`).toMatch(/\S/);
        expect(words).not.toContain('undefined');
        expect(words).not.toContain('\u2014');
      }
      expect(siteRuleLine(d), d.id).toMatch(/\S/);
    }
  });
});
