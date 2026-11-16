import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { kitById } from './kits';
it('dbg', () => {
  const out: string[] = [];
  for (const style of ['brick', 'timber', 'stone', 'plaster'])
    for (const lod of ['high', 'low'])
      for (const seed of [1, 2, 3]) {
        const o = {
          size: [2, 3],
          entrance: [1, 2],
          seed,
          ...(lod === 'low' ? { lod } : {}),
          params: { style, storeys: 2, corner: 'R', streetR: true },
        } as never;
        const g = kitById.get('shop')!.build(o);
        out.push(`shop ${style} ${lod} seed${seed}: ${g.getAttribute('position').count / 3}`);
      }
  writeFileSync('/tmp/claude-0/dbg.txt', out.join('\n'));
});
