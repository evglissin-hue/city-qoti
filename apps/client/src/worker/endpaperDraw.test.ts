// V3D: the endpaper map's drawing, against a recording fake 2D context. Each element draws when its
// input has it and nothing when it does not; the same input gives the same calls; lettering follows
// the river; nothing reads upside down; nothing is random.
import { roads as contentRoads } from '@qoti/content';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { endpaperInk as K } from '../../../../packages/art/src/palette';
import * as render from '../render/endpaper';
import type { EndpaperInput } from '../render/endpaper';
import { drawMap, roadTable, type Ctx, type MakeCanvas } from './endpaperDraw';
import {
  ENDPAPER_MARGIN,
  endpaperSpan,
  blur,
  contours,
  padded,
  patches,
  riverCenterline,
  upright,
} from './endpaperGeo';
import { css } from './endpaperGlyphs';

interface Call {
  name: string;
  args: unknown[];
  fill: unknown;
  stroke: unknown;
  /** Origin of the current transform in canvas pixels, and its rotation. */
  at: [number, number];
  rot: number;
}

function fakeCtx(): { g: Ctx; log: Call[] } {
  const log: Call[] = [];
  const state: Record<string, unknown> = { fillStyle: '#000000', strokeStyle: '#000000', font: '10px serif' };
  type M = [number, number, number, number, number, number];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const impl: Record<string, (...a: unknown[]) => unknown> = {
    save: () => void stack.push([...m] as M),
    restore: () => void (m = stack.pop() ?? [1, 0, 0, 1, 0, 0]),
    translate: (x, y) => {
      m = [
        m[0],
        m[1],
        m[2],
        m[3],
        m[4] + m[0] * (x as number) + m[2] * (y as number),
        m[5] + m[1] * (x as number) + m[3] * (y as number),
      ];
    },
    rotate: (t) => {
      const c = Math.cos(t as number);
      const s = Math.sin(t as number);
      m = [m[0] * c + m[2] * s, m[1] * c + m[3] * s, -m[0] * s + m[2] * c, -m[1] * s + m[3] * c, m[4], m[5]];
    },
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createPattern: () => ({}),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray((w as number) * (h as number) * 4) }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    measureText: (t) => ({ width: String(t).length * 9 }),
  };
  const g = new Proxy(
    {},
    {
      get: (_t, name: string) => {
        if (name in state) return state[name];
        return (...args: unknown[]) => {
          log.push({
            name,
            args,
            fill: typeof state.fillStyle === 'string' ? state.fillStyle : 'obj',
            stroke: typeof state.strokeStyle === 'string' ? state.strokeStyle : 'obj',
            at: [m[4], m[5]],
            rot: Math.atan2(m[1], m[0]),
          });
          return impl[name]?.(...args);
        };
      },
      set: (_t, name: string, v) => {
        state[name] = v;
        return true;
      },
    },
  ) as unknown as Ctx;
  return { g, log };
}

const makeCanvas: MakeCanvas = (w, h) => ({ width: w, height: h, getContext: () => fakeCtx().g });

const TILES = 48;
const SIZE = 1024;

function blank(extra: Partial<EndpaperInput> = {}): EndpaperInput {
  const n = TILES * TILES;
  return {
    tiles: TILES,
    heights: new Uint8Array(n),
    water: new Uint8Array(n),
    woods: new Uint8Array(n),
    fields: new Uint8Array(n),
    roads: new Uint8Array(n),
    roofs: [],
    plans: [],
    labels: [],
    inks: {},
    terrain: new Uint8Array(n),
    ...extra,
  };
}

function run(input: EndpaperInput): Call[] {
  const { g, log } = fakeCtx();
  drawMap(g, input, SIZE, { makeCanvas });
  return log;
}

/** Colors used by the calls that paint: fills, strokes, text. */
function used(log: Call[]): Set<string> {
  const out = new Set<string>();
  for (const c of log) {
    if (c.name === 'fill' || c.name === 'fillRect' || c.name === 'fillText') out.add(String(c.fill));
    if (c.name === 'stroke' || c.name === 'strokeText') out.add(String(c.stroke));
  }
  return out;
}

const tile = (x: number, z: number): number => z * TILES + x;
const px = (c: Call): [number, number] => {
  const sc = SIZE / endpaperSpan(TILES);
  return [c.at[0] / sc - ENDPAPER_MARGIN, c.at[1] / sc - ENDPAPER_MARGIN];
};

/** A river across the valley west to east that drifts south as it goes, three tiles wide. */
function riverInput(extra: Partial<EndpaperInput> = {}): EndpaperInput {
  const water = new Uint8Array(TILES * TILES);
  for (let x = 2; x < TILES - 2; x++) {
    const z0 = 14 + Math.floor(x / 4);
    for (let dz = 0; dz < 3; dz++) water[tile(x, z0 + dz)] = 1;
  }
  return blank({ water, ...extra });
}

afterEach(() => vi.restoreAllMocks());

describe('the endpaper drawing', () => {
  it('draws parchment and a border even for an empty valley, and none of the town', () => {
    const colors = used(run(blank()));
    expect(colors.has(css(K.paper))).toBe(true);
    expect(colors.has(css(K.ink))).toBe(true);
    for (const k of [K.roof, K.blueprint, K.blueprintWash, K.field, K.goods, K.footfall, K.water]) {
      expect(colors.has(css(k))).toBe(false);
    }
  });

  it('hatches fields only where fields are', () => {
    const fields = new Uint8Array(TILES * TILES);
    for (let z = 10; z < 16; z++) for (let x = 10; x < 18; x++) fields[tile(x, z)] = 1;
    const withF = run(blank({ fields }));
    const hatch = withF.filter((c) => c.name === 'stroke' && c.stroke === css(K.field));
    expect(hatch.length).toBeGreaterThan(0);
    expect(used(run(blank())).has(css(K.field))).toBe(false);
  });

  it('draws water, woods, roads when present', () => {
    expect(used(run(riverInput())).has(css(K.water))).toBe(true);
    const woods = new Uint8Array(TILES * TILES);
    woods[tile(5, 5)] = 3 * 8 + 3;
    woods[tile(6, 5)] = 1 * 8 + 1;
    expect(run(blank({ woods })).filter((c) => c.name === 'drawImage')).toHaveLength(2);
    expect(run(blank()).filter((c) => c.name === 'drawImage')).toHaveLength(0);
    const roads = new Uint8Array(TILES * TILES);
    for (let x = 4; x < 20; x++) roads[tile(x, 8)] = 2;
    expect(used(run(blank({ roads }))).has(css(K.ink))).toBe(true);
    const paths = new Uint8Array(TILES * TILES);
    for (let x = 4; x < 20; x++) paths[tile(x, 8)] = 1;
    expect(used(run(blank({ roads: paths }))).has(css(K.path))).toBe(true);
    const streets = new Uint8Array(TILES * TILES);
    for (let x = 4; x < 20; x++) streets[tile(x, 8)] = 3;
    expect(used(run(blank({ roads: streets }))).has(css(K.road))).toBe(true);
  });

  it('draws roofs in the roof color and plans in blueprint ink', () => {
    const roofs = [{ x: 10, z: 10, w: 2, d: 3, rot: 0 }];
    const colors = used(run(blank({ roofs })));
    expect(colors.has(css(K.roof))).toBe(true);
    expect(colors.has(css(K.blueprint))).toBe(false);
    const plans = used(run(blank({ plans: [{ x: 20, z: 20, w: 3, d: 3, rot: 0 }] })));
    expect(plans.has(css(K.blueprint))).toBe(true);
    expect(plans.has(css(K.blueprintWash))).toBe(true);
    expect(plans.has(css(K.roof))).toBe(false);
  });

  it('draws the inks only when present, each in its own color', () => {
    const strong = new Uint16Array(TILES * TILES);
    for (let x = 6; x < 20; x++) strong[tile(x, 12)] = 800;
    const goods = used(run(blank({ inks: { goods: { tiles: strong, color: K.goods } } })));
    expect(goods.has(css(K.goods))).toBe(true);
    expect(goods.has(css(K.footfall))).toBe(false);
    const foot = used(run(blank({ inks: { footfall: { tiles: strong, color: K.footfall } } })));
    expect(foot.has(css(K.footfall))).toBe(true);
    expect(foot.has(css(K.goods))).toBe(false);
    const none = used(
      run(blank({ inks: { goods: { tiles: new Uint16Array(TILES * TILES), color: K.goods } } })),
    );
    expect(none.has(css(K.goods))).toBe(false);
  });

  it('draws the same calls for the same input', () => {
    const woods = new Uint8Array(TILES * TILES);
    woods[tile(9, 9)] = 2 * 8 + 2;
    const input = riverInput({
      woods,
      roofs: [{ x: 30, z: 30, w: 2, d: 2, rot: 0 }],
      labels: [{ text: 'Test Vale', x: 24, z: 20, angle: 0, kind: 'valley' }],
    });
    expect(JSON.stringify(run(input))).toBe(JSON.stringify(run(input)));
  });

  it('never calls Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random in the drawing');
    });
    const woods = new Uint8Array(TILES * TILES);
    woods[tile(9, 9)] = 8;
    expect(() =>
      run(riverInput({ woods, labels: [{ text: 'A', x: 5, z: 5, angle: 0, kind: 'place' }] })),
    ).not.toThrow();
  });

  it('letters the valley name along the river, letter by letter', () => {
    const input = riverInput({ labels: [{ text: 'Test Vale', x: 24, z: 20, angle: 0, kind: 'valley' }] });
    const letters = run(input).filter(
      (c) => c.name === 'fillText' && String(c.args[0]).length === 1 && c.fill === css(K.waterInk),
    );
    expect(letters.map((c) => c.args[0]).join('')).toBe('TestVale');
    const wet = new Set<number>();
    for (let i = 0; i < input.water.length; i++) if (input.water[i]) wet.add(i);
    for (const c of letters) {
      const [x, z] = px(c);
      let near = 99;
      for (const t of wet)
        near = Math.min(near, Math.hypot((t % TILES) + 0.5 - x, Math.floor(t / TILES) + 0.5 - z));
      expect(near).toBeLessThan(2.5);
    }
    // The river runs downhill to the east, so the letters turn with it.
    expect(letters.some((c) => Math.abs(c.rot) > 0.05)).toBe(true);
  });

  it('sets the valley name straight at x, z when there is no river', () => {
    const input = blank({ labels: [{ text: 'Test Vale', x: 20, z: 30, angle: 0, kind: 'valley' }] });
    const text = run(input).filter((c) => c.name === 'fillText' && c.args[0] === 'Test Vale');
    expect(text).toHaveLength(1);
    const [x, z] = px(text[0]!);
    expect(Math.hypot(x - 20, z - 30)).toBeLessThan(0.5);
    expect(text[0]!.rot).toBeCloseTo(0, 5);
  });

  it('never sets a place or street label upside down', () => {
    for (const angle of [Math.PI, Math.PI * 0.9, -Math.PI * 0.75, Math.PI * 1.5, 0.3]) {
      for (const kind of ['place', 'street'] as const) {
        const input = blank({ labels: [{ text: 'Mill Lane', x: 20, z: 30, angle, kind }] });
        const t = run(input).filter((c) => c.name === 'fillText' && c.args[0] === 'Mill Lane');
        expect(t).toHaveLength(1);
        expect(Math.abs(t[0]!.rot)).toBeLessThanOrEqual(Math.PI / 2 + 1e-6);
      }
    }
  });

  it('draws a roof only where it is: moving one roof leaves the rest of the calls alone', () => {
    const a = run(
      blank({
        roofs: [
          { x: 5, z: 5, w: 2, d: 2, rot: 0 },
          { x: 30, z: 30, w: 2, d: 2, rot: 0 },
        ],
      }),
    );
    const b = run(blank({ roofs: [{ x: 5, z: 5, w: 2, d: 2, rot: 0 }] }));
    expect(a.length).toBeGreaterThan(b.length);
  });
});

describe('the map frame', () => {
  it('matches the renderer side', () => {
    expect(ENDPAPER_MARGIN).toBe(render.ENDPAPER_MARGIN);
    expect(endpaperSpan(192)).toBe(render.endpaperSpan(192));
  });
});

describe('the road table', () => {
  it('is the content road table', () => {
    const key = (r: { id: string; layerValue: number }): string => `${r.id}:${r.layerValue}`;
    expect(roadTable.map(key).sort()).toEqual(contentRoads.map(key).sort());
  });
});

describe('the map geometry', () => {
  it('turns text upright', () => {
    expect(upright(Math.PI)).toBeCloseTo(0, 9);
    expect(upright(0.4)).toBeCloseTo(0.4, 9);
    expect(upright(-Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.1, 9);
    for (let a = -7; a <= 7; a += 0.37) expect(Math.abs(upright(a))).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
  });

  it('chains marching squares into one closed outline for a blob', () => {
    const mask = new Uint8Array(TILES * TILES);
    for (let z = 10; z < 15; z++) for (let x = 10; x < 16; x++) mask[tile(x, z)] = 1;
    const W = TILES + 4;
    const polys = contours(blur(padded(mask, TILES, 2, false), W, W, 1), W, W, 0.5);
    expect(polys).toHaveLength(1);
    expect(polys[0]!.closed).toBe(true);
  });

  it('labels connected patches', () => {
    const m = new Uint8Array(TILES * TILES);
    m[tile(1, 1)] = 1;
    m[tile(2, 1)] = 1;
    m[tile(10, 10)] = 1;
    expect(patches(m, TILES).list).toHaveLength(2);
  });

  it('finds the river centerline, and none where there is no river', () => {
    expect(riverCenterline(blank().water, TILES)).toBeNull();
    const line = riverCenterline(riverInput().water, TILES);
    expect(line?.axis).toBe('x');
    expect(line!.pts.length).toBeGreaterThan(40);
  });
});
