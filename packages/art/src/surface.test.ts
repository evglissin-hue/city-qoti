import { describe, expect, it } from 'vitest';
import { ShapeBuilder } from './geometry';
import { kitById, kits } from './kits';
import { cartBodyGeometry, cartWheelGeometry, mergeFlat } from './kits/vehicles';
import { standingAnimal } from './kits/animals';
import * as props from './kits/props';
import { EXTRA_KINDS, extraGeometry, residentGeometry, SPECIES_IDS } from './kits/residents';
import { palette2 } from './palette';
import { createPatternArray, PATTERN_ONE } from './patterns';
import {
  NOISE_LAYER,
  PATTERN_LAYERS,
  ROOM_LAYER,
  ROOM_LAYERS,
  SURFACE,
  SURFACE_LAYERS,
  surfaceDef,
  SURFACES,
} from './surface';

const OPTS = { size: [2, 2] as [number, number], entrance: [1, 1] as [number, number] };

describe('surface ids (V1.0)', () => {
  it('keep the concept viewer numbers, append-only', () => {
    // Changing this list breaks every kit and screenshot: add new surfaces at the end only.
    expect(Object.entries(SURFACE)).toEqual([
      ['plain', 0],
      ['plaster', 1],
      ['brick', 2],
      ['stone', 3],
      ['timber', 4],
      ['tile', 5],
      ['slate', 6],
      ['thatch', 7],
      ['cobble', 8],
      ['glass', 9],
      ['grass', 10],
      ['dirt', 11],
      ['water', 12],
      ['leaf', 13],
      ['zinc', 14],
      ['awning', 15],
      ['field', 16],
      ['flags', 17],
      ['flowers', 18],
      ['woodGrain', 20],
      ['paintedWood', 21],
      ['wroughtIron', 22],
      ['terracotta', 23],
      ['cloth', 24],
    ]);
    expect(NOISE_LAYER).toBe(19);
  });

  it('V2.0: appends layers after the noise layer, which keeps its index', () => {
    // Shaders read the noise layer by number (19); no surface may take its slot.
    expect(Object.values(SURFACE)).not.toContain(NOISE_LAYER);
    expect(SURFACE_LAYERS).toBe(25);
    expect(Math.max(...Object.values(SURFACE))).toBe(SURFACE_LAYERS - 1);
    expect(ROOM_LAYER).toBe(25);
    expect(ROOM_LAYERS).toBe(8);
    expect(PATTERN_LAYERS).toBe(33);
  });

  it('have one table row each, indexed by id, with sane values', () => {
    // V2.0: one row per id, and none in the noise layer's slot.
    expect(SURFACES.length).toBe(SURFACE_LAYERS);
    expect(SURFACES[NOISE_LAYER]).toBeUndefined();
    expect(SURFACES.filter(Boolean).length).toBe(Object.keys(SURFACE).length);
    SURFACES.forEach((s, i) => {
      if (!s) return;
      expect(s.id, s.name).toBe(i);
      expect(SURFACE[s.name]).toBe(i);
      expect(s.scale, s.name).toBeGreaterThan(0);
      expect(s.strength, s.name).toBeGreaterThanOrEqual(0);
      expect(s.strength, s.name).toBeLessThanOrEqual(1);
      if (s.accent) expect(typeof palette2[s.accent.token], s.name).toBe('number');
    });
    expect(surfaceDef(SURFACE.slate).mapping).toBe('roof');
    expect(surfaceDef(SURFACE.brick).accent?.token).toBe('mortar');
    expect(surfaceDef(SURFACE.awning).accent?.token).toBe('stripe');
    expect(surfaceDef(250).name).toBe('plain');
    expect(surfaceDef(NOISE_LAYER).name).toBe('plain');
  });

  it('V2C: the V2 surfaces show, gently, and laid like a facade', () => {
    for (const name of ['woodGrain', 'paintedWood', 'wroughtIron', 'terracotta', 'cloth'] as const) {
      const d = surfaceDef(SURFACE[name]);
      expect(d.name).toBe(name);
      expect(d.mapping, name).toBe('facade');
      // A detail, not a texture pack: a cart still reads as a painted toy.
      expect(d.strength, name).toBeGreaterThan(0.3);
      expect(d.strength, name).toBeLessThanOrEqual(0.6);
      expect(d.scale, name).toBeLessThanOrEqual(1);
    }
    expect(surfaceDef(SURFACE.paintedWood).accent?.token).toBe('wood');
    expect(surfaceDef(SURFACE.terracotta).accent?.token).toBe('stripe');
  });
});

describe('ShapeBuilder surfaces (V1.0)', () => {
  it('writes the id set before each face, plain before any', () => {
    const b = new ShapeBuilder();
    b.box(0, 0, 0, 1, 1, 1, 0xffffff); // 12 triangles, plain
    b.surface(SURFACE.brick).box(0, 1, 0, 1, 2, 1, 0xffffff);
    b.surface(SURFACE.slate).gable(0, 0, 1, 1, 2, 2.5, 0xffffff, true);
    const g = b.build();
    const surface = g.getAttribute('surface');
    expect(surface.count).toBe(g.getAttribute('position').count);
    expect(surface.array).toBeInstanceOf(Uint8Array);
    const ids = Array.from(surface.array);
    expect(ids.slice(0, 36).every((v) => v === 0)).toBe(true);
    expect(ids.slice(36, 72).every((v) => v === SURFACE.brick)).toBe(true);
    expect(ids.slice(72).every((v) => v === SURFACE.slate)).toBe(true);
  });

  it('V1B: buildings carry their wall, roof and glass surfaces at both levels', () => {
    const surfacesOf = (g: ReturnType<typeof ShapeBuilder.prototype.build>): Set<number> =>
      new Set(Array.from(g.getAttribute('surface').array));
    for (const kit of kits) {
      const g = kit.build(kit.kind === 'building' ? OPTS : undefined);
      const surface = g.getAttribute('surface');
      expect(surface, kit.id).toBeDefined();
      expect(surface.count, kit.id).toBe(g.getAttribute('position').count);
    }
    for (const style of ['timber', 'stone', 'brick', 'plaster']) {
      for (const id of ['cottage', 'townhouse', 'shop']) {
        for (const lod of ['high', 'low'] as const) {
          const ids = surfacesOf(kitById.get(id)!.build({ ...OPTS, params: { style }, lod }));
          const roofs = [SURFACE.tile, SURFACE.slate, SURFACE.thatch].filter((r) => ids.has(r));
          const walls = [SURFACE.plaster, SURFACE.brick, SURFACE.stone, SURFACE.timber].filter((w) =>
            ids.has(w),
          );
          expect(roofs.length, `${id} ${style} ${lod} roof`).toBeGreaterThan(0);
          expect(walls.length, `${id} ${style} ${lod} walls`).toBeGreaterThan(0);
          expect(ids.has(SURFACE.glass), `${id} ${style} ${lod} glass`).toBe(true);
        }
      }
    }
    // Lit panes are glass, at both levels.
    for (const lod of ['high', 'low'] as const) {
      const g = kitById.get('cottage')!.build({ ...OPTS, params: { style: 'brick' }, lod });
      const glow = g.getAttribute('glow').array;
      const surf = g.getAttribute('surface').array;
      for (let i = 0; i < glow.length; i++) if (glow[i] === 1) expect(surf[i]).toBe(SURFACE.glass);
    }
  });

  it('V1C: trees write leaf on their crowns and timber on their trunks, at both levels', () => {
    for (const id of ['oak', 'birch', 'pine']) {
      for (const lod of ['high', 'low'] as const) {
        const ids = new Set(
          Array.from(
            kits
              .find((k) => k.id === id)!
              .build({ lod })
              .getAttribute('surface').array,
          ),
        );
        expect([...ids].sort(), `${id} ${lod}`).toEqual([SURFACE.timber, SURFACE.leaf].sort());
      }
    }
  });

  it('survive merging, and rigged pieces are plain', () => {
    const brick = new ShapeBuilder().surface(SURFACE.brick).box(0, 0, 0, 1, 1, 1, 0xffffff).build();
    // V2C: the cart now carries wood ids, so plain stand-ins check that a part without ids merges as 0.
    const plainBox = (): ReturnType<ShapeBuilder['build']> =>
      new ShapeBuilder().box(0, 0, 0, 1, 1, 1, 0xffffff).build();
    const parts = [plainBox(), brick, standingAnimal('pony', 0), plainBox()];
    const merged = mergeFlat(parts);
    const ids = Array.from(merged.getAttribute('surface').array);
    expect(ids.length).toBe(merged.getAttribute('position').count);
    const start = parts[0]!.getAttribute('position').count;
    expect(ids.slice(start, start + 36).every((v) => v === SURFACE.brick)).toBe(true);
    expect(ids.filter((v) => v !== 0).length).toBe(36);
    const pony = standingAnimal('pony', 0).getAttribute('surface');
    expect(Array.from(pony.array).every((v) => v === 0)).toBe(true);
    // Buildings swap between levels in one batch: both carry the same attributes.
    const cottage = kitById.get('cottage')!;
    const high = Object.keys(cottage.build({ ...OPTS, lod: 'high' }).attributes).sort();
    const low = Object.keys(cottage.build({ ...OPTS, lod: 'low' }).attributes).sort();
    expect(low).toEqual(high);
  });
});

describe('pattern array (V1.0)', () => {
  it('has a layer per surface, the noise layer and (V2.0) the room layers, and fills flat on request', () => {
    const tex = createPatternArray(256, 'flat');
    expect(tex.image.width).toBe(256);
    expect(tex.image.height).toBe(256);
    expect(tex.image.depth).toBe(PATTERN_LAYERS);
    expect(tex.generateMipmaps).toBe(true);
    const data = tex.image.data as Uint8Array;
    expect(data.length).toBe(256 * 256 * PATTERN_LAYERS * 4);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== PATTERN_ONE || data[i + 1] !== 0 || data[i + 2] !== 0 || data[i + 3] !== 0) {
        throw new Error(`texel ${i / 4} is not flat`);
      }
    }
    expect(createPatternArray(64, 'flat').image.width).toBe(64);
  });
});

describe('palette 2.0 (V1.0)', () => {
  it('holds 24-bit colors only', () => {
    for (const [name, v] of Object.entries(palette2)) {
      const list = typeof v === 'number' ? [v] : [...v];
      expect(list.length, name).toBeGreaterThan(0);
      for (const c of list) {
        expect(Number.isInteger(c), name).toBe(true);
        expect(c, name).toBeGreaterThanOrEqual(0);
        expect(c, name).toBeLessThanOrEqual(0xffffff);
      }
    }
  });
});

describe('V2C: surfaces on props, carts and residents', () => {
  const idsOf = (g: { getAttribute(n: string): { array: ArrayLike<number> } }): Set<number> =>
    new Set(Array.from(g.getAttribute('surface').array));

  it('props write their own ids and leave the caller surface as they found it', () => {
    const p = [0, 0, 0] as [number, number, number];
    const rnd = (): number => 0.5;
    const calls: Record<string, (s: ShapeBuilder) => void> = {
      barrel: (s) => props.barrel(s, 0, 0, 0, rnd),
      bench: (s) => props.bench(s, 0, 0, true, rnd),
      flowerPot: (s) => props.flowerPot(s, 0, 0, 0, rnd),
      hayBale: (s) => props.hayBale(s, 0, 0, 0, true, rnd),
      sawhorse: (s) => props.sawhorse(s, 0, 0, true, rnd),
      ladder: (s) => props.ladder(s, p, [0, 1, 0.2], [1, 0, 0]),
      choppingBlock: (s) => props.choppingBlock(s, 0, 0, rnd),
      scarecrow: (s) => props.scarecrow(s, 0, 0, 0x886644),
      rowboat: (s) => props.rowboat(s, 0, 0, 0, true, 0x3f7f7a, rnd),
      dryingRack: (s) => props.dryingRack(s, 0, 0, true, 3, rnd),
      netFrame: (s) => props.netFrame(s, 0, 0, true),
      trap: (s) => props.trap(s, 0, 0, true),
      birdBox: (s) => props.birdBox(s, 0, 0, 0xaa5544),
      wateringCan: (s) => props.wateringCan(s, 0, 0, 0),
      groundPatch: (s) => props.groundPatch(s, 0, 0, 1, 1, 0x998877, rnd),
      wattle: (s) => props.wattle(s, [0, 0], [1, 0], rnd),
      picket: (s) => props.picket(s, [0, 0], [1, 0], 0xeeeeee),
      sapling: (s) => props.sapling(s, 0, 0, 0.3, rnd, true),
      weathervane: (s) => props.weathervane(s, 0, 0, 0),
      wallLantern: (s) => void props.wallLantern(s, [0, 0.5, 0], [0, 0, 1]),
      firewood: (s) => props.firewood(s, 0, 0, true, 2, rnd),
      milkChurn: (s) => props.milkChurn(s, 0, 0),
    };
    for (const [name, call] of Object.entries(calls)) {
      const s = new ShapeBuilder().surface(SURFACE.brick);
      call(s);
      expect(s.currentSurface, name).toBe(SURFACE.brick);
    }
  });

  it('a barrel is grain and iron, a pot terracotta, a ladder grain, a colored bench painted', () => {
    const rnd = (): number => 0.5;
    const build = (call: (s: ShapeBuilder) => void): Set<number> => {
      const s = new ShapeBuilder();
      call(s);
      return idsOf(s.build());
    };
    const barrel = build((s) => props.barrel(s, 0, 0, 0, rnd));
    expect(barrel.has(SURFACE.woodGrain)).toBe(true);
    expect(barrel.has(SURFACE.wroughtIron)).toBe(true);
    expect(build((s) => props.flowerPot(s, 0, 0, 0, rnd)).has(SURFACE.terracotta)).toBe(true);
    expect(build((s) => props.ladder(s, [0, 0, 0], [0, 1, 0.2], [1, 0, 0])).has(SURFACE.woodGrain)).toBe(
      true,
    );
    const plain = build((s) => props.bench(s, 0, 0, true, rnd));
    expect(plain.has(SURFACE.woodGrain)).toBe(true);
    expect(plain.has(SURFACE.paintedWood)).toBe(false);
    expect(build((s) => props.bench(s, 0, 0, true, rnd, 0x3f7f7a)).has(SURFACE.paintedWood)).toBe(true);
  });

  it('carts carry wood surfaces and iron on the wheel, residents carry cloth, at both levels', () => {
    for (let v = 0; v < 5; v++) {
      const g = cartBodyGeometry(v);
      const ids = g.getAttribute('surface');
      expect(ids.count).toBe(g.getAttribute('position').count);
      const set = idsOf(g);
      expect(set.has(SURFACE.woodGrain) || set.has(SURFACE.paintedWood)).toBe(true);
    }
    const wheel = cartWheelGeometry();
    expect(wheel.getAttribute('surface').count).toBe(wheel.getAttribute('position').count);
    expect(idsOf(wheel).has(SURFACE.woodGrain)).toBe(true);
    expect(idsOf(wheel).has(SURFACE.wroughtIron)).toBe(true);
    for (const sp of SPECIES_IDS) {
      const full = residentGeometry(sp, 'full');
      const simple = residentGeometry(sp, 'simple');
      for (const g of [full, simple]) {
        expect(g.getAttribute('surface').count, sp).toBe(g.getAttribute('position').count);
        expect(idsOf(g).has(SURFACE.cloth), sp).toBe(true);
      }
      expect(Object.keys(simple.attributes).sort(), sp).toEqual(Object.keys(full.attributes).sort());
      expect(
        Object.values(simple.attributes).map((a) => a.itemSize),
        sp,
      ).toEqual(Object.values(full.attributes).map((a) => a.itemSize));
    }
  });

  it('every extra builds a surface attribute, cloth ones carry cloth', () => {
    for (const kind of EXTRA_KINDS) {
      const g = extraGeometry(kind);
      expect(g.getAttribute('surface').count, kind).toBe(g.getAttribute('position').count);
    }
    expect(idsOf(extraGeometry('apron')).has(SURFACE.cloth)).toBe(true);
    expect(idsOf(extraGeometry('staff')).has(SURFACE.woodGrain)).toBe(true);
    expect(idsOf(extraGeometry('lantern')).has(SURFACE.wroughtIron)).toBe(true);
  });
});
