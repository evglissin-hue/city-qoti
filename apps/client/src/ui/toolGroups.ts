// P3B: tools that are one idea share one button in the bottom bar; their kinds open on a small
// shelf above it. Tool group registry: one line per group, in alphabetical order by id. Tools merge
// here, in the layout, never in the tool registry: every tool keeps its id, and a tool no group
// names keeps a button of its own, so a new tool shows up without a line here.
import type { Lens } from '@qoti/sim';
import type { Tool } from '../input/tool';

export interface ToolGroupDef {
  id: string;
  lens: Lens | 'shared';
  /** The button's name. */
  label: string;
  /** Position in the bar among the tools' own `order`. */
  order: number;
  /** The tools it holds, in shelf order, each with the word it wears on the shelf. */
  members: readonly (readonly [tool: string, label: string])[];
}

// prettier-ignore
export const toolGroups: readonly ToolGroupDef[] = [
  { id: 'decor', lens: 'hearth', label: 'Decor', order: 40, members: [['decor', 'Pieces'], ['fence', 'Fences'], ['customize', 'Dress up']] },
  { id: 'land', lens: 'ledger', label: 'Land', order: 33, members: [['terrain', 'Earthworks'], ['wall', 'Walls'], ['field', 'Fields']] },
  { id: 'nature', lens: 'hearth', label: 'Nature', order: 41, members: [['flowers', 'Flowers'], ['tree', 'Trees'], ['pond', 'Pond']] },
  { id: 'plans', lens: 'shared', label: 'Plans', order: 72, members: [['plan', 'Plans'], ['note', 'Note'], ['layout', 'Lay it out']] },
  { id: 'roads', lens: 'ledger', label: 'Roads', order: 20, members: [['lane', 'Cart lane'], ['street', 'Street'], ['evening', 'Evening streets']] },
];

/** One button in the bar: a tool of its own, or a group of two or more tools that are one idea. */
export type BarSlot =
  | { kind: 'tool'; tool: Tool; order: number }
  | { kind: 'group'; group: ToolGroupDef; members: { tool: Tool; label: string }[]; order: number };

/**
 * The bar's buttons for the tools a lens shows (already filtered for the lens, the valley mode and
 * what is hidden), in order. A group with one tool showing is just that tool; with none, it is gone.
 */
export function barSlots(tools: readonly Tool[], lens: Lens): BarSlot[] {
  const byId = new Map(tools.map((t) => [t.id, t] as const));
  const grouped = new Set<string>();
  const slots: BarSlot[] = [];
  for (const group of toolGroups) {
    if (group.lens !== 'shared' && group.lens !== lens) continue;
    const members = group.members.flatMap(([id, label]) => {
      const tool = byId.get(id);
      return tool ? [{ tool, label }] : [];
    });
    for (const m of members) grouped.add(m.tool.id);
    if (members.length === 1) slots.push({ kind: 'tool', tool: members[0]!.tool, order: group.order });
    else if (members.length > 1) slots.push({ kind: 'group', group, members, order: group.order });
  }
  for (const tool of tools)
    if (!grouped.has(tool.id)) slots.push({ kind: 'tool', tool, order: tool.order ?? 50 });
  return slots.sort((a, b) => a.order - b.order);
}

/** Tools fall in bands (look, make, talk, take away); a little air separates the bands. */
export function slotBand(slot: BarSlot): number {
  const o = slot.order;
  return o < 10 ? 0 : o < 70 ? 1 : o < 90 ? 2 : 3;
}
