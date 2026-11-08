// The first days guide's arrows and highlights (C5H). Pure helpers the Guide panel reads each
// frame: what a step's `point` names on screen right now (a toolbar button, a book, the overlay
// list, the lens switch when the thing is in the other lens), when the arrow has done its job,
// and the words the guide uses outside its letters. No DOM writes here.
import type { GuideView, Lens } from '@qoti/sim';

export const guideCopy = {
  /** New valley checkbox and the Settings line. */
  show: 'Show the founding guide',
  showHint: 'a County surveyor writes for the first few days',
  settingsHint: 'Just for you; your partner keeps theirs.',
  /** The small card in the corner. */
  cardStep: (step: number, of: number) => `Letter ${step + 1} of ${of}`,
  farewell: 'The surveyor signs off',
  lane: { hearth: 'Hearth', ledger: 'Ledger', both: 'Both of you' } as Record<GuideView['lens'], string>,
  open: 'Read the letter',
  /** On the first letter. */
  skip: 'Skip the guide',
  skipHint: 'You can bring it back in Settings.',
  close: 'Back to it',
  done: 'Thank you, Tobias',
} as const;

/** Lens accents, as the lens switch draws them (ui/lenses.ts). */
export const LANE_INK: Record<GuideView['lens'], string> = {
  hearth: 'var(--hearth)',
  ledger: 'var(--ledger)',
  both: 'linear-gradient(90deg, var(--hearth) 50%, var(--ledger) 50%)',
};

/** Whether this seat sees the guide at all: open (or saying goodbye) and not hidden by this seat. */
export function guideShown(g: GuideView | null, seat: number): g is GuideView {
  if (!g || g.hidden[seat]) return false;
  return !g.over || g.id === 'farewell';
}

/** The open step's lens for this seat: a 'both' step is in whichever lens the seat is in. */
export function stepLens(g: GuideView, lens: Lens): Lens {
  return g.lens === 'both' ? lens : g.lens;
}

/** What the interface shows right now, for deciding where an arrow goes and when it is done. */
export interface GuideUiNow {
  lens: Lens;
  panel: string | null;
  overlay: string | null;
  tool: string | null;
  overlayListOpen: boolean;
}

/**
 * The element an arrow points at, as data-testid values in order of preference: the thing itself
 * when it is on screen, else the way to it (the overlay menu, the other lens's switch). Empty when
 * the point is a tile only, or done.
 */
export function pointTargets(g: GuideView, ui: GuideUiNow): string[] {
  const p = g.point;
  if (!p || pointDone(g, ui)) return [];
  const lens = stepLens(g, ui.lens);
  const lensSwitch = `lens-${lens}`;
  if (p.tool) return [`tool-${p.tool}`, lensSwitch];
  if (p.panel) return [`book-${p.panel}`, lensSwitch];
  if (p.overlay) {
    if (ui.lens !== lens) return [lensSwitch];
    return ui.overlayListOpen ? [`overlay-${p.overlay}`, 'overlays'] : ['overlays'];
  }
  return [];
}

/** The arrow has done its job: the tool is in hand, the book is open or the overlay is showing. */
export function pointDone(g: GuideView, ui: GuideUiNow): boolean {
  const p = g.point;
  if (!p) return true;
  if (p.tool) return ui.tool === p.tool;
  if (p.panel) return ui.panel === p.panel;
  if (p.overlay) return ui.overlay === p.overlay;
  return false;
}

/** The step's letter as lines: the salutation, the body, and the signature last. */
export function letterParts(text: string): { salutation: string; body: string[]; signature: string } {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const salutation = lines[0] && /^dear\b/i.test(lines[0]) ? lines.shift()! : 'Dear both,';
  const signature = lines.length > 1 ? lines.pop()! : '';
  return { salutation, body: lines, signature };
}
