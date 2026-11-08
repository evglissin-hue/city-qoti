// @vitest-environment happy-dom
// P1 (callings, playtest item 19): the Calling card in its states (open, waiting for the partner,
// chosen), the goal pill while the offer is open, and the Charter board naming the calling.
import { content } from '@qoti/content';
import type { CallingView, CharterView } from '@qoti/sim';
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { goalLine } from '../GoalPill';
import { mockCharter } from '../mocks/village';
import { mockVillageSession } from '../mocks/session';
import { mount, type Mounted } from '../test/dom';
import { CallingPanel } from './Calling';
import { CharterPanel } from './Charter';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

const offer = (over: Partial<CallingView> = {}): CallingView => ({
  offered: [
    { id: 'mill-town', reason: 'Your hills are full of stone and clay, and your river never sits still.' },
    { id: 'pilgrims-rest', reason: 'Your woods are old and quiet.' },
  ],
  chosen: null,
  together: false,
  ...over,
});

const villageCharter = (calling: CallingView): CharterView => ({
  ...mockCharter,
  rank: 'village',
  next: null,
  goals: [],
  ready: false,
  calling,
});

function open(calling: CallingView) {
  const made = mockVillageSession();
  made.session.mirror.charter.value = villageCharter(calling);
  made.session.ui.calling.value = true;
  return made;
}

describe('the Calling card', () => {
  it('shows the two callings with icon, blurb, the map reason and the effects, and chooses on a click', async () => {
    const { session, submitted } = open(offer());
    view = await mount(h(CallingPanel, { session }));
    expect(view.find('calling-card')).not.toBeNull();
    for (const id of ['mill-town', 'pilgrims-rest']) {
      const def = content.callingById.get(id)!;
      const card = view.get(`calling-${id}`);
      expect(card.textContent).toContain(def.name);
      expect(card.textContent).toContain(def.blurb);
      for (const line of def.effectLines) expect(card.textContent).toContain(line);
      expect(card.querySelector('.glyph svg')).not.toBeNull();
    }
    expect(view.get('calling-reason-mill-town').textContent).toContain('your river never sits still');
    expect(view.find('calling-choose-garden-village')).toBeNull();
    const choose = view.get('calling-choose-pilgrims-rest') as HTMLButtonElement;
    expect(choose.disabled).toBe(false);
    expect(choose.textContent).toBe('Choose');
    await view.click('calling-choose-pilgrims-rest');
    expect(submitted.filter((c) => c.t === 'calling.choose')).toEqual([
      { t: 'calling.choose', id: 'pilgrims-rest' },
    ]);
  });

  it('waits for the partner in a valley for two: Choose is disabled and says so', async () => {
    const { session, submitted } = open(offer({ together: true }));
    session.mirror.seats.value = session.mirror.seats.value.map((s) =>
      s.seat === 1 ? { ...s, connected: false } : s,
    );
    view = await mount(h(CallingPanel, { session }));
    const choose = view.get('calling-choose-mill-town') as HTMLButtonElement;
    expect(choose.disabled).toBe(true);
    expect(choose.textContent).toBe('Choose this together');
    await view.click('calling-choose-mill-town');
    expect(submitted.some((c) => c.t === 'calling.choose')).toBe(false);
  });

  it('lets either seat choose when both are here, and a solo valley choose alone', async () => {
    const both = open(offer({ together: true }));
    view = await mount(h(CallingPanel, { session: both.session }));
    expect((view.get('calling-choose-mill-town') as HTMLButtonElement).disabled).toBe(false);
    view.unmount();
    const solo = open(offer({ together: false }));
    solo.session.mirror.seats.value = solo.session.mirror.seats.value.map((s) => ({ ...s, connected: s.seat === 0 }));
    view = await mount(h(CallingPanel, { session: solo.session }));
    expect((view.get('calling-choose-mill-town') as HTMLButtonElement).disabled).toBe(false);
  });

  it('reads as settled once chosen: no buttons, the choice marked', async () => {
    const { session } = open(offer({ chosen: 'mill-town' }));
    view = await mount(h(CallingPanel, { session }));
    expect(view.find('calling-choose-pilgrims-rest')).toBeNull();
    expect(view.find('calling-picked-mill-town')).not.toBeNull();
    expect(view.get('calling-card').textContent).toContain('Mill Town');
  });

  it('draws nothing while closed or before there is an offer', async () => {
    const closed = mockVillageSession();
    closed.session.mirror.charter.value = villageCharter(offer());
    view = await mount(h(CallingPanel, { session: closed.session }));
    expect(view.find('calling-card')).toBeNull();
    view.unmount();
    const none = mockVillageSession();
    none.session.ui.calling.value = true;
    view = await mount(h(CallingPanel, { session: none.session }));
    expect(view.find('calling-card')).toBeNull();
  });
});

describe('the goal pill and the Charter board', () => {
  it('asks what the town is known for while the offer is open, then goes back to the trial', () => {
    const c = villageCharter(offer());
    const line = goalLine(c, null, 0, 'Thistlecombe')!;
    expect(line.text).toBe('Choose what Thistlecombe is known for');
    expect(line.opens).toBe('calling');
    expect(line.detail.join(' ')).toContain('Mill Town');
    const done = goalLine(villageCharter(offer({ chosen: 'mill-town' })), null, 0, 'Thistlecombe')!;
    expect(done.opens).not.toBe('calling');
    expect(goalLine({ ...c, calling: undefined }, null, 0)!.opens).not.toBe('calling');
  });

  it('names the calling on the Charter board, or opens the card from it', async () => {
    const chosen = open(offer({ chosen: 'pilgrims-rest' }));
    view = await mount(h(CharterPanel, { session: chosen.session }));
    expect(view.get('charter-calling').textContent).toContain("Pilgrims' Rest");
    view.unmount();
    const asking = open(offer());
    asking.session.ui.calling.value = false;
    view = await mount(h(CharterPanel, { session: asking.session }));
    expect(view.get('charter-calling').textContent).toContain('Choose what');
    await view.click('open-calling');
    expect(asking.session.ui.calling.value).toBe(true);
  });
});
