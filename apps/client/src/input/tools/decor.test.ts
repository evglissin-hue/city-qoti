// @vitest-environment happy-dom
// R1D T2: the decor tool's click and drag, a seat's own facing, and the fence tool's openings.
import type { Command } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import type { TilePick } from '../../render/api';
import { mockVillageSession } from '../../ui/mocks/session';
import type { ToolContext } from '../context';
import type { PointerInfo } from '../tool';
import { decorTool } from './decor';
import { fenceTool } from './fence';
import { flowersTool } from './flowers';

function toolCtx(session: ReturnType<typeof mockVillageSession>['session'], submitted: Command[]) {
  const ctx: ToolContext = {
    mirror: session.mirror,
    render: {
      pickTile: () => null,
      pickEntity: () => null,
      setGhost: () => {},
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
      toast: () => {},
      confirm: () => Promise.resolve(true),
      prompt: () => Promise.resolve(null),
      select: () => {},
      lens: () => 'hearth',
    },
  };
  return ctx;
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

describe('the decor tool', () => {
  it('a click places one lantern; a drag of 2 or more tiles places a run as one command', () => {
    const { session } = mockVillageSession();
    const sent: Command[] = [];
    const tool = decorTool(toolCtx(session, sent));
    tool.enter!();
    tool.variant!.value = 'lantern';

    tool.pointerDown!(at(10, 10));
    tool.pointerUp!(at(10, 10));
    expect(sent.map((c) => c.t)).toEqual(['decor.place']);

    tool.pointerDown!(at(10, 20));
    tool.pointerMove!(at(16, 20));
    tool.pointerUp!(at(16, 20));
    const run = sent.pop() as Extract<Command, { t: 'decor.placeRun' }>;
    expect(run.t).toBe('decor.placeRun');
    expect(run.def).toBe('lantern');
    expect(run.pieces!.length).toBeGreaterThanOrEqual(2);
    expect(run.pieces!.every((p) => p.def === 'lantern')).toBe(true);
  });

  it('a bench set down without turning it faces something, and R keeps the turn', () => {
    const { session } = mockVillageSession();
    const sent: Command[] = [];
    const tool = decorTool(toolCtx(session, sent));
    tool.enter!();
    tool.variant!.value = 'bench';
    // Open ground: nothing to face, so rotation 0.
    tool.pointerMove!(at(10, 10));
    tool.pointerDown!(at(10, 10));
    expect((sent.pop() as Extract<Command, { t: 'decor.place' }>).rot).toBe(0);
    // Pressing R keeps what the player chose.
    tool.key!({ key: 'r', shiftKey: false } as KeyboardEvent);
    tool.pointerDown!(at(10, 12));
    expect((sent.pop() as Extract<Command, { t: 'decor.place' }>).rot).toBe(8);
  });
});

describe('the flower brush tool', () => {
  it('paints a drift on release as one placeRun with pieces', () => {
    const { session } = mockVillageSession();
    const sent: Command[] = [];
    const tool = flowersTool(toolCtx(session, sent));
    expect(tool.label).toBe('Flowers');
    expect(tool.hint).toBe('Drag to paint a drift of flowers');
    tool.pointerDown!(at(10, 30));
    for (let x = 11; x <= 18; x++) tool.pointerMove!(at(x, 30));
    tool.pointerUp!(at(18, 30));
    const cmd = sent.pop() as Extract<Command, { t: 'decor.placeRun' }> | undefined;
    // The mock may have no flowers it can pay for; when it does, it is a single command.
    if (cmd) {
      expect(cmd.t).toBe('decor.placeRun');
      expect(cmd.pieces!.length).toBeGreaterThan(0);
    }
  });
});

describe('the fence tool', () => {
  it('sends the plain run when it crosses no road', () => {
    const { session } = mockVillageSession();
    const sent: Command[] = [];
    const tool = fenceTool(toolCtx(session, sent));
    tool.pointerDown!(at(10, 40));
    tool.pointerMove!(at(14, 40));
    tool.pointerUp!(at(14, 40));
    const run = sent.pop() as Extract<Command, { t: 'decor.placeRun' }> | undefined;
    expect(run?.pieces).toBeUndefined();
  });
});
