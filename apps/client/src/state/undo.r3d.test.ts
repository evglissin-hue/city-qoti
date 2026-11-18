import { type Command, type PlaceView } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { mockPlace } from '../ui/mocks/evening';
import { mockVillageSession } from '../ui/mocks/session';
import type { Mirror, MirrorChange } from './mirror';
import { UndoStack } from './undo';

// R3D: undo for a place's priority and the carrier's places switch. The sim's supplies are
// stand-ins until R3A, so the mirror is moved by hand the way a turn would move it.
function rig() {
  const { session } = mockVillageSession();
  const mirror: Mirror = session.mirror;
  const undo = new UndoStack(0);
  let seq = 0;
  let turn = mirror.lastTurn.value;
  const sent: Command[] = [];
  /** Submits as the session does, and lets the turn carry it. */
  const submit = (cmd: Command, effect: () => void) => {
    const before = undo.prepare(cmd, mirror);
    const s = ++seq;
    if (before) undo.submitted(s, cmd, before, turn);
    turn += 1;
    undo.sawTurn({ t: turn, cmds: [{ seat: 0, seq: s, cmd }] });
    effect();
    mirror.lastTurn.value = turn;
    undo.observe({ rejections: [] } as unknown as MirrorChange, mirror);
  };
  const raw = (cmd: Command) => {
    sent.push(cmd);
    return ++seq;
  };
  return { mirror, undo, submit, raw, sent };
}

const place = (priority?: PlaceView['priority']) =>
  mockPlace({ id: 'seats:5', name: 'the Promenade', ...(priority ? { priority } : {}) });

describe('undo for a place priority', () => {
  it('puts the old priority back, with a label that names the place', () => {
    const r = rig();
    r.mirror.setPlaces({ places: [place()] });
    r.submit({ t: 'place.setPriority', id: 'seats:5', priority: 'keep' }, () =>
      r.mirror.setPlaces({ places: [place('keep')] }),
    );
    r.mirror.setPlaces({ places: [place('keep')] });
    const out = r.undo.undo(r.mirror, r.raw);
    expect(out).toMatchObject({ ok: true, label: 'keeping the Promenade first' });
    expect(r.sent).toEqual([{ t: 'place.setPriority', id: 'seats:5', priority: 'normal' }]);
  });

  it('words rest and as-it-comes, and says CHANGED when the partner moved it since', () => {
    const r = rig();
    r.mirror.setPlaces({ places: [place('keep')] });
    r.submit({ t: 'place.setPriority', id: 'seats:5', priority: 'rest' }, () =>
      r.mirror.setPlaces({ places: [place('rest')] }),
    );
    r.mirror.setPlaces({ places: [place('keep')] });
    expect(r.undo.undo(r.mirror, r.raw)).toEqual({ ok: false, reason: 'CHANGED' });
    r.mirror.setPlaces({ places: [place('rest')] });
    r.submit({ t: 'place.setPriority', id: 'seats:5', priority: 'normal' }, () =>
      r.mirror.setPlaces({ places: [place()] }),
    );
    expect(r.undo.undo(r.mirror, r.raw)).toMatchObject({
      ok: true,
      label: 'taking the Promenade as it comes',
    });
    expect(r.sent[0]).toEqual({ t: 'place.setPriority', id: 'seats:5', priority: 'rest' });
  });
});

describe('undo for the carrier places switch', () => {
  const setLine = (m: Mirror, patch: object) => {
    const b = m.balances.value!;
    m.balances.value = { ...b, lines: b.lines.map((l) => (l.family === 'fuel' ? { ...l, ...patch } : l)) };
  };
  const fuel = (m: Mirror) => m.balances.value!.lines.find((l) => l.family === 'fuel')!;

  it('undoes a places-only change exactly, keeping the rule and the selling switch', () => {
    const r = rig();
    setLine(r.mirror, { forPlaces: false });
    const { rule, sell } = fuel(r.mirror);
    r.submit({ t: 'carrier.setRule', family: 'fuel', rule, sell, places: true }, () =>
      setLine(r.mirror, { forPlaces: true }),
    );
    expect(r.undo.undo(r.mirror, r.raw)).toMatchObject({ ok: true, label: 'the fuel places switch' });
    expect(r.sent).toEqual([{ t: 'carrier.setRule', family: 'fuel', rule, sell, places: false }]);
  });

  it('leaves the places switch alone when the command did not name it, and notices a partner change', () => {
    const r = rig();
    setLine(r.mirror, { forPlaces: true });
    const { rule, sell } = fuel(r.mirror);
    r.submit({ t: 'carrier.setRule', family: 'fuel', rule: 'never', sell }, () =>
      setLine(r.mirror, { rule: 'never' }),
    );
    r.undo.undo(r.mirror, r.raw);
    expect(r.sent).toEqual([{ t: 'carrier.setRule', family: 'fuel', rule, sell }]);
    r.submit({ t: 'carrier.setRule', family: 'fuel', rule, sell, places: false }, () =>
      setLine(r.mirror, { forPlaces: false }),
    );
    setLine(r.mirror, { forPlaces: true });
    expect(r.undo.undo(r.mirror, r.raw)).toEqual({ ok: false, reason: 'CHANGED' });
  });
});
