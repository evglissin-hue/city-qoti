import { describe, expect, it } from 'vitest';
import { AGENT_STRIDE, AgentAnim, AgentField, AgentFlags, MAP_SIZE } from '@qoti/sim';
import {
  chooseTeaBreak,
  IdleTimer,
  ORBIT_DISTANCE,
  onRoundHour,
  TEA_BREAK_AFTER_MS,
  type DecisionSource,
  type TeaBreakGuards,
  type TeaBreakMirror,
  waitingOnPlayer,
} from './teaBreak';

const guards = (o: Partial<Record<keyof TeaBreakGuards, boolean>> = {}): TeaBreakGuards => ({
  enabled: () => o.enabled ?? true,
  toolInHand: () => o.toolInHand ?? false,
  cardOpen: () => o.cardOpen ?? false,
  busy: () => o.busy ?? false,
});

describe('V4.0: the tea break idle timer', () => {
  it('waits 90 seconds from the last input', () => {
    expect(TEA_BREAK_AFTER_MS).toBe(90_000);
    const t = new IdleTimer(1000);
    expect(t.due(1000 + TEA_BREAK_AFTER_MS - 1, guards())).toBe(false);
    expect(t.due(1000 + TEA_BREAK_AFTER_MS, guards())).toBe(true);
    t.poke(50_000);
    expect(t.idleFor(60_000)).toBe(10_000);
    expect(t.due(60_000, guards())).toBe(false);
    expect(t.due(50_000 + TEA_BREAK_AFTER_MS, guards())).toBe(true);
  });

  it('never starts with the setting off, a tool in hand, a card open or the camera busy', () => {
    const t = new IdleTimer(0);
    const late = TEA_BREAK_AFTER_MS * 3;
    expect(t.due(late, guards({ enabled: false }))).toBe(false);
    expect(t.due(late, guards({ toolInHand: true }))).toBe(false);
    expect(t.due(late, guards({ cardOpen: true }))).toBe(false);
    expect(t.due(late, guards({ busy: true }))).toBe(false);
    expect(t.due(late, guards())).toBe(true);
  });

  it('each guard alone blocks it, and a poke starts the wait again', () => {
    const t = new IdleTimer(0);
    const late = TEA_BREAK_AFTER_MS;
    for (const k of ['enabled', 'toolInHand', 'cardOpen', 'busy'] as const) {
      const o = { enabled: true, toolInHand: false, cardOpen: false, busy: false };
      o[k] = !o[k];
      expect(t.due(late, guards(o)), k).toBe(false);
    }
    t.poke(late);
    expect(t.due(late + 1, guards())).toBe(false);
    expect(t.due(late * 2, guards())).toBe(true);
  });
});

interface FakeAgent {
  id: number;
  x?: number;
  z?: number;
  anim?: number;
  flags?: number;
}
interface FakePlace {
  id: number;
  x: number;
  z: number;
  present?: number;
}
interface FakeBuilding {
  id: number;
  x: number;
  z: number;
  stage?: string;
}

function fake(
  hour: number,
  o: {
    agents?: FakeAgent[];
    residents?: number[];
    places?: FakePlace[];
    buildings?: FakeBuilding[];
    foot?: [number, number, number][];
    minute?: number;
  } = {},
): TeaBreakMirror {
  const agents = o.agents ?? [];
  const latest = new Float32Array(agents.length * AGENT_STRIDE);
  agents.forEach((a, i) => {
    const b = i * AGENT_STRIDE;
    latest[b + AgentField.id] = a.id;
    latest[b + AgentField.x] = a.x ?? 0;
    latest[b + AgentField.z] = a.z ?? 0;
    latest[b + AgentField.anim] = a.anim ?? AgentAnim.walk;
    latest[b + AgentField.flags] = a.flags ?? 0;
  });
  const day = new Uint16Array(MAP_SIZE * MAP_SIZE);
  for (const [x, z, n] of o.foot ?? []) day[z * MAP_SIZE + x] = n;
  const residents = new Map((o.residents ?? agents.map((a) => a.id)).map((id) => [id, { id }]));
  const places = new Map(
    (o.places ?? []).map((p) => {
      const tile = Math.floor(p.z) * MAP_SIZE + Math.floor(p.x);
      return [p.id, { id: p.id, tile, tiles: [tile], present: p.present ?? 0 }];
    }),
  );
  const buildings = new Map(
    (o.buildings ?? []).map((b) => [
      b.id,
      { id: b.id, def: 'nothing-here', x: b.x, z: b.z, rot: 0, stage: b.stage ?? 'built' },
    ]),
  );
  return {
    clock: { value: { hour, minute: o.minute ?? 0 } },
    agents: { latest },
    residents,
    places,
    buildings,
    footfall: { value: { day, eve: new Uint16Array(MAP_SIZE * MAP_SIZE) } },
  } as unknown as TeaBreakMirror;
}

describe('V4C: choosing a tea break, evening', () => {
  it('follows a walking grown-up at 18:00', () => {
    expect(chooseTeaBreak(fake(18, { agents: [{ id: 7 }] }))).toEqual({ kind: 'follow', residentId: 7 });
  });

  it('prefers a walker to a seated resident', () => {
    const m = fake(18, { agents: [{ id: 1, anim: AgentAnim.sit }, { id: 9 }] });
    expect(chooseTeaBreak(m)).toEqual({ kind: 'follow', residentId: 9 });
    expect(chooseTeaBreak(fake(18, { agents: [{ id: 1, anim: AgentAnim.sit }] }))).toEqual({
      kind: 'follow',
      residentId: 1,
    });
  });

  it('never picks a child, raider, wolf or visitor, or an id that is not a resident', () => {
    const agents = [
      { id: 1, flags: AgentFlags.child },
      { id: 2, flags: AgentFlags.raider },
      { id: 3, flags: AgentFlags.wolf },
      { id: 4, flags: AgentFlags.visitor },
      { id: 5 },
    ];
    expect(chooseTeaBreak(fake(18, { agents, residents: [1, 2, 3, 4] }))).toBe(null);
    expect(chooseTeaBreak(fake(18, { agents, residents: [1, 2, 3, 4, 5] }))).toEqual({
      kind: 'follow',
      residentId: 5,
    });
  });

  it('picks the walker nearest the camera, avoids the previous resident, and noFollow goes to the place', () => {
    const agents = [
      { id: 1, x: 10, z: 10 },
      { id: 2, x: 100, z: 100 },
    ];
    const m = fake(18, { agents, places: [{ id: 1, x: 50, z: 50, present: 2 }] });
    expect(chooseTeaBreak(m, { near: { x: 95, z: 95 } })).toEqual({ kind: 'follow', residentId: 2 });
    expect(chooseTeaBreak(m, { near: { x: 11, z: 11 } })).toEqual({ kind: 'follow', residentId: 1 });
    expect(
      chooseTeaBreak(m, { near: { x: 11, z: 11 }, previous: { kind: 'follow', residentId: 1 } }),
    ).toEqual({
      kind: 'follow',
      residentId: 2,
    });
    const plan = chooseTeaBreak(m, { noFollow: true });
    expect(plan?.kind).toBe('orbit');
  });
});

describe('V4C: choosing a tea break, day', () => {
  it('circles the place or building with the most footfall about it', () => {
    const m = fake(11, {
      agents: [{ id: 1 }],
      places: [{ id: 1, x: 30, z: 30 }],
      buildings: [{ id: 1, x: 80, z: 80 }],
      foot: [
        [30, 30, 5],
        [80, 80, 9],
      ],
    });
    const plan = chooseTeaBreak(m);
    expect(plan?.kind).toBe('orbit');
    if (plan?.kind === 'orbit') {
      expect(plan.distance).toBe(ORBIT_DISTANCE);
      expect(Math.abs(plan.x - 80.5)).toBeLessThan(1);
      expect(Math.abs(plan.z - 80.5)).toBeLessThan(1);
    }
  });

  it('counts folk present at a place, and ignores a building under construction', () => {
    const m = fake(11, {
      places: [{ id: 1, x: 30, z: 30, present: 1 }],
      buildings: [{ id: 1, x: 80, z: 80, stage: 'site' }],
      foot: [[80, 80, 9]],
    });
    const plan = chooseTeaBreak(m);
    expect(plan?.kind === 'orbit' && Math.abs(plan.x - 30.5) < 1).toBe(true);
    expect(
      chooseTeaBreak(fake(11, { buildings: [{ id: 1, x: 80, z: 80, stage: 'site' }], foot: [[80, 80, 9]] })),
    ).toBe(null);
  });

  it('with no footfall yet (a new valley by day), circles where folk are about right now', () => {
    const m = fake(9, {
      agents: [
        { id: 1, x: 80.5, z: 79.5 },
        { id: 2, x: 82, z: 81, anim: AgentAnim.work },
        // Raiders and wolves are not the town being busy.
        { id: 3, x: 30, z: 30, flags: AgentFlags.raider },
        { id: 4, x: 30.5, z: 31, flags: AgentFlags.wolf },
        { id: 5, x: 31, z: 30.5, flags: AgentFlags.raider },
      ],
      residents: [1, 2],
      places: [{ id: 1, x: 30, z: 30 }],
      buildings: [{ id: 1, x: 80, z: 80 }],
    });
    const plan = chooseTeaBreak(m);
    expect(plan?.kind === 'orbit' && Math.abs(plan.x - 80.5) < 1 && Math.abs(plan.z - 80.5) < 1).toBe(true);
    // Nobody about and nothing walked: nothing to watch.
    expect(
      chooseTeaBreak(fake(9, { places: [{ id: 1, x: 30, z: 30 }], buildings: [{ id: 1, x: 80, z: 80 }] })),
    ).toBe(null);
  });

  it('a second circle goes at least 16 tiles away when it can, else stays', () => {
    const m = fake(11, {
      buildings: [
        { id: 1, x: 30, z: 30 },
        { id: 2, x: 33, z: 30 },
        { id: 3, x: 100, z: 100 },
      ],
      foot: [
        [30, 30, 50],
        [33, 30, 40],
        [100, 100, 1],
      ],
    });
    const first = chooseTeaBreak(m);
    expect(first?.kind).toBe('orbit');
    const second = chooseTeaBreak(m, { previous: first });
    expect(second?.kind === 'orbit' && Math.abs(second.x - 100.5) < 1).toBe(true);
    const lone = fake(11, { buildings: [{ id: 1, x: 30, z: 30 }], foot: [[30, 30, 5]] });
    const a = chooseTeaBreak(lone);
    expect(chooseTeaBreak(lone, { previous: a })).toEqual(a);
  });
});

describe('V4C: nothing to watch, and the round hours', () => {
  it('picks nothing in an empty valley, by day or at 18:00 with nobody out', () => {
    expect(chooseTeaBreak(fake(11))).toBe(null);
    expect(chooseTeaBreak(fake(18))).toBe(null);
    expect(chooseTeaBreak(fake(18, { agents: [{ id: 1, flags: AgentFlags.child }] }))).toBe(null);
  });

  it('the evening round runs from 17:30 to 21:00', () => {
    expect(onRoundHour({ hour: 17, minute: 29 })).toBe(false);
    expect(onRoundHour({ hour: 17, minute: 30 })).toBe(true);
    expect(onRoundHour({ hour: 20, minute: 59 })).toBe(true);
    expect(onRoundHour({ hour: 21, minute: 0 })).toBe(false);
  });
});

describe('V4C: what waits on the player', () => {
  const raidView = (captures: number[] = []) => ({
    id: 9,
    side: 'north' as const,
    band: 'small' as const,
    raiders: 4,
    fled: 0,
    captured: captures.length,
    bell: false,
    lanterns: false,
    captures,
  });
  const source = (o: { raid?: unknown; captives?: number[]; dialog?: unknown } = {}): DecisionSource =>
    ({
      mirror: {
        raid: { value: o.raid ?? null },
        threat: { value: o.captives ? { captives: o.captives } : null },
      },
      ui: { dialog: { value: o.dialog ?? null } },
    }) as unknown as DecisionSource;

  it('a quiet valley waits on nobody', () => {
    expect(waitingOnPlayer(source())).toEqual([]);
  });

  it('a raid under way asks for the bell, the lanterns or the gates', () => {
    expect(waitingOnPlayer(source({ raid: raidView() }))).toEqual(['raid']);
  });

  it('captured raiders wait for a decision, in the raid or kept after dawn', () => {
    expect(waitingOnPlayer(source({ raid: raidView([31]) }))).toEqual(['raid', 'captives']);
    expect(waitingOnPlayer(source({ captives: [31, 32] }))).toEqual(['captives']);
    expect(waitingOnPlayer(source({ captives: [] }))).toEqual([]);
  });

  it('a dialog waits for yes or no', () => {
    const dialog = { kind: 'confirm', text: 'Take the bench away?', ok: 'Yes', cancel: 'No', resolve() {} };
    expect(waitingOnPlayer(source({ dialog }))).toEqual(['dialog']);
  });
});
