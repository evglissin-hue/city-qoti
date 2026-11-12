// @vitest-environment happy-dom
// R1C: the building tool draws the reach of a specialized building on the ground (a ring around the
// ghost and around the ones already standing), and clears it when the tool is put away.
import { content } from '@qoti/content';
import { MAP_SIZE } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import type { TilePick } from '../../render/api';
import { groundMarks } from '../../ui/marks';
import { mockVillageSession } from '../../ui/mocks/session';
import type { ToolContext } from '../context';
import type { PointerInfo } from '../tool';
import { buildingTool } from './building';

function setup() {
  const { session } = mockVillageSession();
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
    submit: () => 1,
    ui: {
      toast: () => {},
      confirm: () => Promise.resolve(true),
      prompt: () => Promise.resolve(null),
      select: () => {},
      lens: () => 'ledger',
    },
  };
  return { session, tool: buildingTool(ctx) };
}

function at(x: number, z: number): PointerInfo {
  const tile: TilePick = { x, z, fx: x * 256 + 128, fz: z * 256 + 128, h: 2 };
  return { clientX: 0, clientY: 0, tile, button: 0, shiftKey: false } as unknown as PointerInfo;
}

describe('reach rings', () => {
  it('rings the ghost of a building with a reach, and clears when the tool goes away', () => {
    const { tool } = setup();
    const windmill = content.buildingById.get('windmill')!;
    expect(windmill.reach).toBeGreaterThan(0);
    tool.variant!.value = 'windmill';
    tool.enter!();
    tool.pointerMove!(at(50, 50));
    // R1X: marks are road tiles in reach, or (where no road is in reach) the straight-line ring.
    const marks = groundMarks.value.filter((m) => m.ring || m.fill);
    expect(marks.length).toBeGreaterThanOrEqual(1);
    expect(marks.filter((m) => m.ring).every((r) => r.ring === windmill.reach)).toBe(true);
    // The ghost's own are the solid ones.
    expect(marks.some((r) => !r.dashed)).toBe(true);
    tool.exit!();
    expect(groundMarks.value).toHaveLength(0);
  });

  it('R1X: draws the road tiles in reach, not a circle, and only roads', () => {
    const { session, tool } = setup();
    const m = session.mirror;
    // A lane along z = 52, and none anywhere else near the ghost.
    for (let x = 0; x < MAP_SIZE; x++) {
      for (let z = 30; z < 70; z++) m.layers.road[z * MAP_SIZE + x] = 0;
      m.layers.road[52 * MAP_SIZE + x] = 1;
    }
    m.layerRevision++;
    tool.variant!.value = 'windmill';
    tool.enter!();
    tool.pointerMove!(at(60, 52));
    const ghost = groundMarks.value.filter((k) => k.fill && !k.dashed);
    expect(ghost.length).toBeGreaterThan(10);
    expect(groundMarks.value.some((k) => k.ring && !k.dashed)).toBe(false);
    for (const k of ghost) expect(m.road(k.x, k.z)).toBeGreaterThan(0);
    // Walked along the road: nothing beyond the reach and its hop from the door.
    const reach = content.buildingById.get('windmill')!.reach!;
    expect(Math.max(...ghost.map((k) => Math.abs(k.x - 60)))).toBeLessThanOrEqual(reach + 6);
    tool.exit!();
  });

  it('draws no ring for a building that has no reach', () => {
    const { tool } = setup();
    expect(content.buildingById.get('well')!.reach).toBeUndefined();
    tool.variant!.value = 'well';
    tool.enter!();
    tool.pointerMove!(at(50, 50));
    expect(groundMarks.value).toHaveLength(0);
    tool.exit!();
  });

  it('rings the standing ones too, fainter', () => {
    const { session, tool } = setup();
    const stall = [...session.mirror.buildings.values()].find((b) => b.def === 'market-stall');
    tool.variant!.value = 'market-stall';
    tool.enter!();
    tool.pointerMove!(at(50, 50));
    // Faint road washes where the stall has roads in reach, its faint ring where it has none.
    const dashed = groundMarks.value.filter((m) => (m.ring || m.fill) && m.dashed);
    if (stall) expect(dashed.length).toBeGreaterThan(0);
    tool.exit!();
  });
});
