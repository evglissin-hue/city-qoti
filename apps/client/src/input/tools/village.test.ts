// @vitest-environment happy-dom
// I2 (C4F): the zone tool (lot preview, paint, unzone, the Village lock) and the plan tool, against
// the village mocks.
import { content } from '@qoti/content';
import { MAP_SIZE, type Command } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import type { TilePick } from '../../render/api';
import { groundMarks } from '../../ui/marks';
import { mockVillageSession } from '../../ui/mocks/session';
import { villageIds } from '../../ui/mocks/village';
import { zoneInk } from '../../ui/village';
import type { ToolContext } from '../context';
import { INPUT_COPY } from '../copy';
import type { PointerInfo } from '../tool';
import { planTool } from './plan';
import { previewLots, zoneTool } from './zone';

/** A tool context over a mock session, with a stub renderer that records ghosts. */
function toolCtx(
  session: ReturnType<typeof mockVillageSession>['session'],
  toasts: string[],
  submitted: Command[],
) {
  const ghosts: unknown[] = [];
  const ctx: ToolContext = {
    mirror: session.mirror,
    render: {
      pickTile: () => null,
      pickEntity: () => null,
      setGhost: (g) => ghosts.push(g),
      setOverlay: () => {},
      setPresence: () => {},
      ping: () => {},
      focus: () => {},
      setQuality: () => {},
    },
    camera: {} as ToolContext['camera'],
    seat: 0,
    submit: (cmd) => {
      submitted.push(cmd);
      return submitted.length;
    },
    ui: {
      toast: (t) => toasts.push(t),
      confirm: () => Promise.resolve(true),
      prompt: () => Promise.resolve(null),
      select: () => {},
      lens: () => 'ledger',
      openPanel: (id) => (session.ui.panel.value = id),
      focusPlan: (id) => (session.ui.planFocus.value = id),
    },
  };
  return { ctx, ghosts };
}

function at(x: number, z: number, extra: Partial<PointerInfo> = {}): PointerInfo {
  const tile: TilePick = { x, z, fx: x * 256 + 128, fz: z * 256 + 128, h: 2 };
  return {
    clientX: 0,
    clientY: 0,
    button: 0,
    buttons: 1,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    tile,
    ...extra,
  };
}

describe('the zone tool', () => {
  it('sketches the lots a box would make along the lane, facing it', () => {
    const { session } = mockVillageSession();
    const { ctx } = toolCtx(session, [], []);
    const shops = content.zoneById.get('shops')!;
    const painted = new Set<number>();
    for (let z = 51; z <= 53; z++) for (let x = 42; x <= 49; x++) painted.add(z * MAP_SIZE + x);
    const { lots, road } = previewLots(ctx, shops, painted);
    const [w, d] = shops.lots[0]!.size;
    expect(road).toBe('lane');
    expect(lots).toHaveLength(8 / w);
    for (const l of lots) {
      expect(l).toMatchObject({ z: 51, w, d, door: 'n', ink: zoneInk('shops') });
    }
    // Ground with no lane or street in front makes no lots.
    const inland = new Set<number>();
    for (let z = 58; z <= 60; z++) for (let x = 42; x <= 49; x++) inland.add(z * MAP_SIZE + x);
    expect(previewLots(ctx, shops, inland).lots).toHaveLength(0);
  });

  it('paints a dragged box, previews lots while dragging, and unzones with Shift', () => {
    const { session } = mockVillageSession();
    const submitted: Command[] = [];
    const { ctx } = toolCtx(session, [], submitted);
    const tool = zoneTool(ctx);
    tool.variant!.value = 'homes-low';
    // Three rows deep: home lots want a back garden (C4B's deep plots).
    tool.pointerDown!(at(42, 51));
    tool.pointerMove!(at(47, 53));
    expect(groundMarks.value.length).toBeGreaterThan(0);
    tool.pointerUp!(at(47, 53));
    expect(groundMarks.value).toHaveLength(0);
    const paint = submitted.pop() as Extract<Command, { t: 'zone.paint' }>;
    expect(paint.t).toBe('zone.paint');
    expect(paint.zone).toBe('homes-low');
    expect(paint.tiles).toHaveLength(18);

    // The fixture's shop lots are zoned already: Shift+drag clears them.
    tool.pointerDown!(at(66, 51, { shiftKey: true }));
    tool.pointerUp!(at(67, 53, { shiftKey: true }));
    const clear = submitted.pop() as Extract<Command, { t: 'zone.clear' }>;
    expect(clear.t).toBe('zone.clear');
    expect(clear.tiles).toHaveLength(6);
  });

  it('stays shut before the Village rank, and says why', () => {
    const { session } = mockVillageSession();
    session.mirror.town.value = { ...session.mirror.town.value!, rank: 'hamlet' };
    const toasts: string[] = [];
    const submitted: Command[] = [];
    const tool = zoneTool(toolCtx(session, toasts, submitted).ctx);
    tool.pointerDown!(at(42, 51));
    tool.pointerUp!(at(47, 52));
    expect(submitted).toHaveLength(0);
    expect(toasts).toEqual([INPUT_COPY.zoneLocked]);
  });
});

describe('the plan tool', () => {
  it('the plan tool opens the plans book and picks a blueprint under the cursor', () => {
    const { session } = mockVillageSession();
    const tool = planTool(toolCtx(session, [], []).ctx);
    tool.enter!();
    expect(session.ui.panel.value).toBe('plans');
    // The fixture's plan is a bench at (61, 53).
    tool.pointerDown!(at(61, 53));
    expect(session.ui.planFocus.value).toBe(villageIds.plan);
    tool.pointerDown!(at(20, 20));
    expect(session.ui.planFocus.value).toBeNull();
  });
});
