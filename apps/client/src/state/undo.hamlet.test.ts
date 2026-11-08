import { MAP_SIZE, type Command, type SimEvent } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { mockView } from '../ui/mocks/session';
import { Mirror } from './mirror';
import { UndoStack } from './undo';

// Customize, field paint, pause and sale undo against the Mirror, with the sim's answers written by
// hand: C3B and C3C implement these commands in parallel, so the updates here are what they emit.
function rig() {
  const mirror = new Mirror();
  mirror.load(mockView());
  const undo = new UndoStack(0);
  let seq = 0;
  const sent: Command[] = [];
  const raw = (cmd: Command) => {
    sent.push(cmd);
    return ++seq;
  };
  /** Submits `cmd`, then the turn that carries it arrives with the given events and patches. */
  const play = (
    cmd: Command,
    events: SimEvent[],
    patches: Parameters<Mirror['apply']>[0]['patches'] = [],
  ) => {
    const before = undo.prepare(cmd, mirror);
    const s = raw(cmd);
    if (before) undo.submitted(s, cmd, before, mirror.lastTurn.value);
    const t = mirror.lastTurn.value + 1;
    undo.sawTurn({ t, cmds: [{ seat: 0, seq: s, cmd }] });
    undo.observe(mirror.apply({ t, events, patches }), mirror);
  };
  /** Something else happens (the partner, the sim). */
  const happen = (events: SimEvent[], patches: Parameters<Mirror['apply']>[0]['patches'] = []) => {
    undo.observe(mirror.apply({ t: mirror.lastTurn.value + 1, events, patches }), mirror);
  };
  return { mirror, undo, raw, sent, play, happen };
}

const bakery = () => mockView().buildings.find((b) => b.id === 6)!;

describe('undo for hamlet commands', () => {
  it('customize: puts the old look back, and refuses once someone repainted it', () => {
    const r = rig();
    const b = bakery();
    r.play({ t: 'build.customize', id: 6, custom: { wall: 'rose', shutters: true } }, [
      { e: 'building.updated', b: { ...b, custom: { ...b.custom, wall: 'rose', shutters: true } } },
    ]);
    expect(r.undo.size.value).toBe(1);
    expect(r.undo.undo(r.mirror, r.raw)).toMatchObject({ ok: true, label: 'the new look for the bakery' });
    expect(r.sent.pop()).toEqual({ t: 'build.customize', id: 6, custom: { wall: 'butter', shutters: null } });

    r.play({ t: 'build.customize', id: 6, custom: { roof: 'slate' } }, [
      { e: 'building.updated', b: { ...b, custom: { ...b.custom, roof: 'slate' } } },
    ]);
    r.happen([{ e: 'building.updated', b: { ...b, custom: { ...b.custom, roof: 'moss' } } }]);
    expect(r.undo.undo(r.mirror, r.raw)).toEqual({ ok: false, reason: 'CHANGED' });
  });

  it('field paint: clears the new field tiles, and refuses when they changed hands', () => {
    const r = rig();
    const tiles: [number, number][] = [
      [30, 30],
      [31, 30],
    ];
    const owned = (farm: number) => [
      {
        layer: 'fieldOwner' as const,
        rect: [30, 30, 31, 30] as [number, number, number, number],
        data: new Int32Array([farm, farm]),
      },
    ];
    r.play({ t: 'field.paint', farm: 77, tiles }, [], owned(77));
    expect(r.mirror.layers.fieldOwner[30 * MAP_SIZE + 31]).toBe(77);
    expect(r.undo.undo(r.mirror, r.raw)).toMatchObject({ ok: true, label: 'the field' });
    expect(r.sent.pop()).toEqual({ t: 'field.remove', tiles });
    r.happen([], owned(0));

    r.play({ t: 'field.paint', farm: 77, tiles }, [], owned(77));
    r.happen([], owned(0));
    expect(r.undo.undo(r.mirror, r.raw)).toEqual({ ok: false, reason: 'CHANGED' });

    // Clearing a field undoes into painting it again for the farm that had it.
    r.happen([], owned(77));
    r.play({ t: 'field.remove', tiles }, [], owned(0));
    r.undo.undo(r.mirror, r.raw);
    expect(r.sent.pop()).toEqual({ t: 'field.paint', farm: 77, tiles });
  });

  it('pause, priority and sale toggles flip back', () => {
    const r = rig();
    const b = bakery();
    r.play({ t: 'build.setPaused', id: 6, paused: true }, [
      { e: 'building.updated', b: { ...b, rt: { ...b.rt!, paused: true } } },
    ]);
    r.undo.undo(r.mirror, r.raw);
    expect(r.sent.pop()).toEqual({ t: 'build.setPaused', id: 6, paused: false });

    const site = mockView().buildings.find((x) => x.id === 8)!;
    r.play({ t: 'build.setPriority', id: 8, priority: false }, [
      {
        e: 'building.updated',
        b: { ...site, rt: { ...site.rt!, construction: { ...site.rt!.construction!, priority: false } } },
      },
    ]);
    r.undo.undo(r.mirror, r.raw);
    expect(r.sent.pop()).toEqual({ t: 'build.setPriority', id: 8, priority: true });

    const stocks = mockView().stocks!;
    r.play({ t: 'ledger.setForSale', good: 'bread', forSale: true }, [
      {
        e: 'stocks.updated',
        s: { lines: stocks.lines.map((l) => (l.good === 'bread' ? { ...l, forSale: true } : l)) },
      },
    ]);
    r.undo.undo(r.mirror, r.raw);
    expect(r.sent.pop()).toEqual({ t: 'ledger.setForSale', good: 'bread', forSale: false });
  });

  it('a rejected inverse is remembered as an undo, so its toast can say so', () => {
    const r = rig();
    const b = bakery();
    r.play({ t: 'build.setPaused', id: 6, paused: true }, [
      { e: 'building.updated', b: { ...b, rt: { ...b.rt!, paused: true } } },
    ]);
    const out = r.undo.undo(r.mirror, r.raw);
    expect(out.ok && r.undo.undoSeqs.has(out.seqs[0]!)).toBe(true);
  });
});
