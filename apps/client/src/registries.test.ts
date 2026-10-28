import { kits } from '@qoti/art';
import { buildings, decor, roads, trees } from '@qoti/content';
import { commandHandlers, systems } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import type { ToolContext } from './input/context';
import { toolFactories } from './input/tools';
import { layerFactories } from './render/layers';
import { lenses } from './ui/lenses';
import { panels } from './ui/panels';

// docs/spec/31-parallel-development.md, Registries: every extensible list is a registry with one
// alphabetically sorted line per entry, so parallel branches merge cleanly.
const registries: Record<string, string[]> = {
  commands: commandHandlers.map((h) => h.type),
  systems: systems.map((s) => s.id),
  'content: buildings': buildings.map((b) => b.id),
  'content: decor': decor.map((d) => d.id),
  'content: roads': roads.map((r) => r.id),
  'content: trees': trees.map((t) => t.id),
  'render layers': layerFactories.map((make) => make().id),
  tools: toolFactories.map((make) => make({} as ToolContext).id),
  'lens toolbars': lenses.map((l) => l.id),
  panels: panels.map((p) => p.id),
  'art kits': kits.map((k) => k.id),
};

describe('registries', () => {
  for (const [name, ids] of Object.entries(registries)) {
    it(`${name}: exists, has entries, sorted, no duplicates`, () => {
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toEqual([...ids].sort());
      expect(new Set(ids).size).toBe(ids.length);
    });
  }

  it('ships the I0, I1 and I2 tools', () => {
    expect(registries.tools).toEqual([
      'building',
      'customize',
      'decor',
      'erase',
      'fence',
      'field',
      'inspect',
      'lane',
      'note',
      'path',
      'plan',
      'street',
      'tree',
      'zone',
    ]);
  });
});
