// Debug only (C4P): folk between walks, for art review, in this client's Mirror only (the sim never
// sees any of it). Two benches with folk standing by them (they sit), a pair and a trio standing
// together (they chat), and two neighbors walking a lane toward each other (they wave as they pass).
import { content } from '@qoti/content';
import { AGENT_STRIDE, AgentAnim, TILE_FP, type SimEvent } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { hash2 } from './coords';

const FIRST_ID = 910000;

interface Folk {
  id: number;
  x: number;
  z: number;
  heading: number;
  /** Walkers go back and forth along x between x and x + walk at 1 tile a second. */
  walk?: number;
}

export interface FolkShowcaseResult {
  center: [number, number];
  folk: number;
  stop: () => void;
}

export function folkShowcase(mirror: Mirror, cx = 52, cz = 104): FolkShowcaseResult {
  const events: SimEvent[] = [];
  let did = FIRST_ID;
  const decor = (def: string, x: number, z: number, rot = 0): void => {
    if (!content.decorById.get(def)) return;
    events.push({
      e: 'decor.added',
      d: { id: did++, def, fx: Math.round(x * TILE_FP), fz: Math.round(z * TILE_FP), rot, builtBy: 0 },
    });
  };
  decor('bench', cx + 0.5, cz + 0.5);
  decor('bench', cx + 3.5, cz + 0.5, 16);
  decor('flower-bed', cx + 1.5, cz + 0.6);
  mirror.apply({ t: mirror.lastTurn.value, events, patches: [] });

  let id = FIRST_ID + 100;
  const folk: Folk[] = [];
  const add = (x: number, z: number, heading: number, walk?: number): number => {
    folk.push({ id, x, z, heading, ...(walk !== undefined ? { walk } : {}) });
    return id++;
  };
  // By the benches: two by the first, one by the second.
  add(cx + 0.4, cz + 0.1, Math.PI);
  add(cx + 0.7, cz + 0.2, Math.PI);
  add(cx + 3.1, cz + 0.5, -Math.PI / 2);
  // A pair and a trio standing about.
  add(cx - 2, cz + 2.5, 0.4);
  add(cx - 1.5, cz + 2.7, 2.2);
  add(cx + 1.5, cz + 3, 1);
  add(cx + 2.1, cz + 3.1, 4);
  add(cx + 1.8, cz + 3.6, 3);
  // Two neighbors who know each other, walking toward each other along a lane.
  const a = add(cx - 4, cz + 5.2, Math.PI / 2, 8);
  let b = a + 1;
  while (hash2(a, b, 41) >= 0.33) b++;
  id = b;
  add(cx + 4, cz + 5.6, -Math.PI / 2, -8);
  mirror.hamletRevision.value++;

  const start = performance.now();
  const rows = (): Float32Array => {
    const t = (performance.now() - start) / 1000;
    const data = new Float32Array(folk.length * AGENT_STRIDE);
    folk.forEach((f, i) => {
      const o = i * AGENT_STRIDE;
      let x = f.x;
      let heading = f.heading;
      let anim: number = AgentAnim.idle;
      if (f.walk !== undefined) {
        const span = Math.abs(f.walk);
        const s = t % (span * 2);
        const out = s < span;
        const along = out ? s : span * 2 - s;
        x = f.x + Math.sign(f.walk) * along;
        heading = (Math.sign(f.walk) > 0) === out ? Math.PI / 2 : -Math.PI / 2;
        anim = AgentAnim.walk;
      }
      data[o] = f.id;
      data[o + 1] = x;
      data[o + 2] = f.z;
      data[o + 3] = 0;
      data[o + 4] = heading;
      data[o + 5] = anim;
      data[o + 6] = 0;
      data[o + 7] = 0;
    });
    return data;
  };
  const apply = mirror.applyAgents.bind(mirror);
  mirror.applyAgents = (turn, data, now) => {
    const extra = rows();
    const merged = new Float32Array(data.length + extra.length);
    merged.set(data);
    merged.set(extra, data.length);
    apply(turn, merged, now);
  };
  return {
    center: [cx, cz],
    folk: folk.length,
    stop: () => {
      mirror.applyAgents = apply;
    },
  };
}
