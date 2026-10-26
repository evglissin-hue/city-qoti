import type { BuildingView } from '@qoti/sim';
import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../state/mirror';
import { buildingKey, buildingParams, constructionStage } from './kitGeometry';
import { flowsOf, ramp } from './layers/overlays';

function view(over: Partial<BuildingView>): BuildingView {
  return {
    id: 5,
    def: 'storehouse',
    x: 10,
    z: 10,
    rot: 0,
    builtBy: 0,
    handmade: false,
    stage: 'built',
    foundation: false,
    ...over,
  };
}

const rt = (over: Partial<NonNullable<BuildingView['rt']>> = {}): NonNullable<BuildingView['rt']> => ({
  jobs: 1,
  workers: 1,
  present: 1,
  status: 0,
  condition: 100,
  paused: false,
  progress: 0,
  input: [],
  output: [],
  store: [],
  ...over,
});

describe('building variants', () => {
  it('turn runtime stock, output and growth into pile levels', () => {
    const p = buildingParams(
      view({
        rt: rt({
          store: [
            ['logs', 60],
            ['stone', 5],
          ],
        }),
      }),
    );
    expect(p['stock:logs']).toBe(4);
    expect(p['stock:stone']).toBe(1);
    const plot = buildingParams(view({ def: 'vegetable-plot', rt: rt({ progress: 0.8 }) }));
    expect(plot.growth).toBe(3);
    const custom = buildingParams(view({ def: 'cottage', custom: { wall: 'rose', sign: 'Home' } }));
    expect(custom.wall).toBe('rose');
    expect(custom.sign).toBe('Home');
  });

  it('share keys within a pile bucket and change them across buckets and stages', () => {
    const a = buildingKey(view({ rt: rt({ store: [['logs', 31]] }) }));
    const b = buildingKey(view({ rt: rt({ store: [['logs', 32]] }) }));
    const c = buildingKey(view({ rt: rt({ store: [['logs', 59]] }) }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    const site = view({
      stage: 'construction',
      rt: rt({
        construction: { stage: 2, progress: 0.5, needs: [], delivered: [['planks', 4]], priority: false },
      }),
    });
    expect(constructionStage(site)).toBe(2);
    expect(buildingKey(site)).toMatch(/^site:storehouse:2:/);
    expect(buildingKey(view({}), 'low')).not.toBe(buildingKey(view({}), 'high'));
  });
});

describe('overlays', () => {
  it('use a ramp whose lightness rises steadily, so it reads without hue', () => {
    let last = -1;
    for (let i = 0; i <= 20; i++) {
      const c = ramp(i / 20, new Color());
      const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      expect(lum).toBeGreaterThan(last);
      last = lum;
    }
  });

  it('estimate flows from runtimes when the sim sends none', () => {
    const m = new Mirror();
    m.buildings.set(1, view({ id: 1, def: 'storehouse', x: 0, z: 0, rt: rt() }));
    m.buildings.set(2, view({ id: 2, def: 'woodcutter', x: 8, z: 0, rt: rt({ output: [['logs', 6]] }) }));
    m.buildings.set(3, view({ id: 3, def: 'market-stall', x: 0, z: 8, rt: rt() }));
    const flows = flowsOf(m);
    expect(flows).toContainEqual([2, 1, 6]);
    expect(flows.some(([from, to]) => from === 1 && to === 3)).toBe(true);
    expect(flowsOf(new Mirror())).toEqual([]);
  });
});
