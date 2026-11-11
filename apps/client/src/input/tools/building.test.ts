// @vitest-environment happy-dom
// R1C: the building tool draws the reach of a specialized building on the ground (a ring around the
// ghost and around the ones already standing), and clears it when the tool is put away.
import { content } from '@qoti/content';
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
    const rings = groundMarks.value.filter((m) => m.ring);
    expect(rings.length).toBeGreaterThanOrEqual(1);
    expect(rings.every((r) => r.ring === windmill.reach)).toBe(true);
    // The ghost's ring is the solid one.
    expect(rings.some((r) => !r.dashed)).toBe(true);
    tool.exit!();
    expect(groundMarks.value).toHaveLength(0);
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
    const dashed = groundMarks.value.filter((m) => m.ring && m.dashed);
    expect(dashed).toHaveLength(
      [...session.mirror.buildings.values()].filter((b) => b.def === 'market-stall').length,
    );
    if (stall) expect(dashed.length).toBeGreaterThan(0);
    tool.exit!();
  });
});
