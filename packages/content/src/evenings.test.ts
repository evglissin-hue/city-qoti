import { describe, expect, it } from 'vitest';
import { content } from './index';

// R2.0: the evening data (docs/spec/19-evenings.md). Shapes and sanity, never tuned values.

const KINDS = ['sit', 'eat', 'view', 'play', 'meet', 'walk'];
const EM = '—';
const EN = '–';

describe('seats and standing on decor', () => {
  it('every seat or bench piece has whole seats', () => {
    for (const d of content.decor) {
      if (d.tags?.includes('seat') || d.tags?.includes('bench')) {
        expect(Number.isInteger(d.seats) && (d.seats ?? 0) > 0, `${d.id} needs seats`).toBe(true);
      }
    }
  });

  it('child seats come with seats and the play tag', () => {
    const kids = content.decor.filter((d) => d.childSeats);
    expect(kids.map((d) => d.id).sort()).toEqual(['see-saw', 'swing']);
    for (const d of kids) {
      expect(Number.isInteger(d.seats) && (d.seats ?? 0) > 0, d.id).toBe(true);
      expect(d.tags, d.id).toContain('play');
    }
  });

  it('standing room is a whole number above zero', () => {
    for (const d of content.decor) {
      if (d.standing !== undefined) expect(Number.isInteger(d.standing) && d.standing > 0, d.id).toBe(true);
    }
  });

  it('warm pieces are fires', () => {
    for (const d of content.decor) {
      if (d.warm) expect(d.tags, d.id).toContain('fire');
    }
  });

  it('the brazier is a Village piece with standing room', () => {
    const b = content.decorById.get('brazier');
    expect(b).toBeDefined();
    expect(b?.standing).toBe(8);
    expect(b?.warm).toBe(true);
    const village = content.charters.find((c) => c.id === 'village');
    expect(village?.unlocks).toContain('brazier');
  });

  it('the bonfire gathers eight and is warm', () => {
    const b = content.decorById.get('bonfire');
    expect(b?.standing).toBe(8);
    expect(b?.warm).toBe(true);
  });
});

describe('hosts', () => {
  const hosts = content.buildings.filter((b) => b.host);

  it('the five hosts exist', () => {
    expect(hosts.map((b) => b.id).sort()).toEqual([
      'bath-house',
      'market-square',
      'market-stall',
      'tavern',
      'well',
    ]);
  });

  it('every host holds somebody and names valid kinds', () => {
    for (const b of hosts) {
      const h = b.host!;
      expect(h.seats + h.standing, b.id).toBeGreaterThan(0);
      expect(h.kinds.length, b.id).toBeGreaterThan(0);
      for (const k of h.kinds) expect(KINDS, `${b.id} ${k}`).toContain(k);
    }
  });

  it('the tavern and the bath-house are sheltered and warm', () => {
    for (const id of ['tavern', 'bath-house']) {
      const h = content.buildingById.get(id)?.host;
      expect(h?.sheltered, id).toBe(true);
      expect(h?.warm, id).toBe(true);
    }
  });
});

describe('places tuning and gaps', () => {
  it('numbers are whole and percents sit within 0..100', () => {
    for (const [k, v] of Object.entries(content.places)) {
      // R2A's lists (walk and meet patterns, view pieces, the ice's kinds) are checked below.
      if (Array.isArray(v)) continue;
      expect(Number.isInteger(v), k).toBe(true);
      if (/Percent$/.test(k) && k !== 'plainCostPercent' && k !== 'noisyCostPercent') {
        expect(v, k).toBeGreaterThanOrEqual(0);
        expect(v, k).toBeLessThanOrEqual(100);
      }
    }
    expect(content.places.standingShare).toBeLessThanOrEqual(100);
  });

  it("R2A's lists name real patterns, pieces and kinds", () => {
    const p = content.places;
    for (const id of [...p.walkPatterns, ...p.meetPatterns]) {
      expect(
        content.patterns.some((x) => x.id === id),
        id,
      ).toBe(true);
    }
    for (const id of p.viewPieces) expect(content.decorById.has(id), id).toBe(true);
    for (const k of p.iceKinds) expect(['sit', 'eat', 'view', 'play', 'meet', 'walk']).toContain(k);
    expect(p.afternoonHour).toBeLessThan(p.eveningHour);
  });

  it('the hours and scores are ordered', () => {
    const p = content.places;
    expect(p.eveningHour).toBeLessThan(p.homeHour);
    expect(p.homeHour).toBeLessThanOrEqual(p.festivalHomeHour);
    expect(p.minScore).toBeGreaterThanOrEqual(p.stayInScore);
  });

  it('gaps come in order with words and a closing line', () => {
    expect(content.gaps.map((g) => g.kind)).toEqual([
      'nothingToSell',
      'nobodyPasses',
      'nowhereToGo',
      'shortOfSupplies',
    ]);
    for (const g of content.gaps) {
      expect(g.text.length, g.kind).toBeGreaterThan(0);
      for (const t of g.text) expect(t.trim().length, g.kind).toBeGreaterThan(0);
      expect(g.closes.trim().length, g.kind).toBeGreaterThan(0);
    }
  });
});

describe('baskets and achievements', () => {
  it('craftsfolk ask for evenings', () => {
    expect(content.basketByTier.get('craftsfolk')?.evenings).toBe(50);
  });

  it('the three evening feats exist', () => {
    for (const id of ['out-of-an-evening', 'a-seat-for-everyone', 'mind-the-gap']) {
      expect(content.achievementById.get(id), id).toBeDefined();
    }
  });

  it('no new evening string uses a dash as punctuation', () => {
    const strings: string[] = [];
    for (const g of content.gaps) strings.push(...g.text, g.closes);
    for (const id of ['out-of-an-evening', 'a-seat-for-everyone', 'mind-the-gap']) {
      const a = content.achievementById.get(id)!;
      strings.push(a.name, a.description);
    }
    const b = content.decorById.get('brazier')!;
    strings.push(b.name);
    for (const s of strings) {
      expect(s.includes(EM), s).toBe(false);
      expect(s.includes(EN), s).toBe(false);
    }
  });
});
