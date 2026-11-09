// P1 player's chair: Earthworks showed its icon's name as a word in the Ledger's toolbar, because the
// toolbar looked icons up by tool id only. The class check: every registered tool draws an icon.
import { describe, expect, it } from 'vitest';
import type { ToolContext } from '../input/context';
import { toolFactories } from '../input/tools';
import { toolIcon } from './icons';

describe('tool icons', () => {
  it('every tool in the registry draws an icon, never its name', () => {
    const missing = toolFactories
      .map((make) => make({} as ToolContext))
      .filter((t) => toolIcon(t.id, t.icon) === null)
      .map((t) => `${t.id} (${t.icon})`);
    expect(missing).toEqual([]);
  });
});
