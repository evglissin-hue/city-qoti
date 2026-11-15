// C5H: where the guide's arrows point, when they are done, and who sees the guide.
import { content } from '@qoti/content';
import type { GuideView } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { guideShown, letterParts, pointDone, pointTargets, type GuideUiNow } from './guide';
import { lenses, overlays } from './lenses';
import { panels } from './panels';

const step = (point: GuideView['point'], lens: GuideView['lens'] = 'ledger'): GuideView => ({
  step: 0,
  of: 8,
  id: 'x',
  lens,
  letter: '',
  hint: '',
  ...(point && { point }),
  done: [],
  hidden: [false, false, false, false],
  over: false,
});

const ui = (o: Partial<GuideUiNow> = {}): GuideUiNow => ({
  lens: 'ledger',
  panel: null,
  overlay: null,
  tool: 'inspect',
  overlayListOpen: false,
  ...o,
});

describe('the guide arrows', () => {
  it('point at the tool, or at the lens it lives in, until it is in hand', () => {
    const g = step({ tool: 'lane' });
    expect(pointTargets(g, ui())).toEqual(['tool-lane', 'lens-ledger']);
    expect(pointTargets(g, ui({ tool: 'lane' }))).toEqual([]);
    expect(pointDone(g, ui({ tool: 'lane' }))).toBe(true);
  });

  it('point at a book until it is open', () => {
    const g = step({ panel: 'wishes' }, 'hearth');
    expect(pointTargets(g, ui({ lens: 'ledger' }))).toEqual(['book-wishes', 'lens-hearth']);
    expect(pointTargets(g, ui({ lens: 'hearth', panel: 'wishes' }))).toEqual([]);
  });

  it('point at the overlay menu, then the overlay, in its lens', () => {
    const g = step({ overlay: 'charm' }, 'hearth');
    expect(pointTargets(g, ui({ lens: 'ledger' }))).toEqual(['lens-hearth']);
    expect(pointTargets(g, ui({ lens: 'hearth' }))).toEqual(['overlays']);
    expect(pointTargets(g, ui({ lens: 'hearth', overlayListOpen: true }))).toEqual([
      'overlay-charm',
      'overlays',
    ]);
    expect(pointTargets(g, ui({ lens: 'hearth', overlay: 'charm' }))).toEqual([]);
  });

  it("a 'both' step points through the seat's own lens", () => {
    expect(pointTargets(step({ tool: 'building' }, 'both'), ui({ lens: 'hearth' }))).toEqual([
      'tool-building',
      'lens-hearth',
    ]);
  });

  it("name only tools, books and overlays the client has (the content's points)", () => {
    // R1D: the zone brush for the homes, Workshops and the first workshop.
    const tools = ['building', 'lane', 'path', 'plan', 'zone'];
    for (const s of content.guide.steps) {
      const p = s.point;
      if (!p) continue;
      if (p.tool) expect(tools, s.id).toContain(p.tool);
      if (p.panel)
        expect(
          panels.map((x) => x.id),
          s.id,
        ).toContain(p.panel);
      if (p.overlay)
        expect(
          overlays.map((x) => x.id),
          s.id,
        ).toContain(p.overlay);
    }
    expect(lenses.map((l) => l.id)).toEqual(['hearth', 'ledger']);
  });
});

describe('who sees the guide', () => {
  it('each seat for itself, while it runs, and for the farewell', () => {
    const g = step(undefined);
    g.hidden[1] = true;
    expect(guideShown(g, 0)).toBe(true);
    expect(guideShown(g, 1)).toBe(false);
    expect(guideShown({ ...g, over: true }, 0)).toBe(false);
    expect(guideShown({ ...g, over: true, id: 'farewell' }, 0)).toBe(true);
    expect(guideShown(null, 0)).toBe(false);
  });

  it('reads a letter as salutation, body and signature', () => {
    const parts = letterParts(content.guide.steps[0]!.letter);
    expect(parts.salutation).toBe('Dear both,');
    expect(parts.signature).toMatch(/Tobias Merriweather/);
    expect(parts.body.length).toBeGreaterThanOrEqual(2);
  });
});
