// R2D: the evening street brush marks road tiles only, and Shift gives them back.
import { Flags, MAP_SIZE, type Command } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../../state/mirror';
import { mockView } from '../../ui/mocks/session';
import type { ToolContext } from '../context';
import type { PointerInfo } from '../tool';
import { eveningTool } from './evening';

function rig() {
  const mirror = new Mirror();
  mirror.load(mockView());
  const sent: Command[] = [];
  const toasts: string[] = [];
  const ctx = {
    mirror,
    render: { setGhost: () => {} },
    submit: (cmd: Command) => {
      sent.push(cmd);
      return sent.length;
    },
    ui: { toast: (t: string) => toasts.push(t) },
  } as unknown as ToolContext;
  return { mirror, sent, toasts, tool: eveningTool(ctx) };
}

const at = (x: number, z: number, shiftKey = false): PointerInfo => ({
  clientX: 0,
  clientY: 0,
  button: 0,
  buttons: 1,
  shiftKey,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  tile: { x, z, fx: x * 256 + 128, fz: z * 256 + 128, h: 2 },
});

function drag(tool: ReturnType<typeof rig>['tool'], a: [number, number], b: [number, number], shift = false) {
  tool.pointerDown!(at(a[0], a[1], shift));
  tool.pointerMove!(at(b[0], b[1], shift));
  tool.pointerUp!(at(b[0], b[1], shift));
}

describe('the evening street brush', () => {
  it('lives in the Ledger and shows the Town overlay while out', () => {
    const { tool } = rig();
    expect(tool.lane).toBe('ledger');
    expect(tool.overlay!()).toBe('town:ledger');
  });

  it('marks only the road tiles of the drag, and skips tiles already kept', () => {
    const { mirror, sent, tool } = rig();
    // Road on x 10..12 of row 20; the drag runs 9..14, so 9, 13 and 14 are bare ground.
    for (const x of [10, 11, 12]) mirror.layers.road[20 * MAP_SIZE + x] = 2;
    mirror.layers.flags[20 * MAP_SIZE + 11] = Flags.evening;
    drag(tool, [9, 20], [14, 20]);
    expect(sent).toEqual([
      {
        t: 'road.setEvening',
        tiles: [
          [10, 20],
          [12, 20],
        ],
        on: true,
      },
    ]);
  });

  it('Shift unmarks, and a drag over bare ground says so instead of sending', () => {
    const { mirror, sent, toasts, tool } = rig();
    for (const x of [10, 11]) {
      mirror.layers.road[30 * MAP_SIZE + x] = 2;
      mirror.layers.flags[30 * MAP_SIZE + x] = Flags.evening;
    }
    drag(tool, [10, 30], [11, 30], true);
    expect(sent).toEqual([
      {
        t: 'road.setEvening',
        tiles: [
          [10, 30],
          [11, 30],
        ],
        on: false,
      },
    ]);
    drag(tool, [40, 5], [44, 5]);
    expect(sent).toHaveLength(1);
    expect(toasts).toEqual(['No road here to keep for strolling.']);
  });
});
