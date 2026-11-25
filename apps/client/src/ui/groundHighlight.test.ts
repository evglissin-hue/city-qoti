import { describe, expect, it } from 'vitest';
import { mockSession } from './mocks/session';
import { setGroundLayer } from './groundHighlight';

const a = { tiles: [[1, 1]] as [number, number][], tone: 'hearth' as const };
const b = { tiles: [[2, 2]] as [number, number][], tone: 'ledger' as const };

describe('ground layers', () => {
  it('draws the thread over the inspector, and the inspector again when the thread clears', () => {
    const { session, calls } = mockSession();
    const last = () => calls.filter((c) => c.method === 'highlight').at(-1)?.args[0];
    setGroundLayer(session, 'inspector', a);
    expect(last()).toEqual(a);
    setGroundLayer(session, 'thread', b);
    expect(last()).toEqual(b);
    setGroundLayer(session, 'inspector', a);
    expect(last()).toEqual(b);
    setGroundLayer(session, 'thread', null);
    expect(last()).toEqual(a);
  });

  it('clears the ground when both layers are empty', () => {
    const { session, calls } = mockSession();
    const last = () => calls.filter((c) => c.method === 'highlight').at(-1)?.args[0];
    setGroundLayer(session, 'inspector', a);
    setGroundLayer(session, 'thread', b);
    setGroundLayer(session, 'thread', null);
    setGroundLayer(session, 'inspector', null);
    expect(last()).toBeNull();
  });
});
