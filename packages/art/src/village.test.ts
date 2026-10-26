// C4E: the village kit: district styles, grown homes that keep their look when they upgrade, the I2
// buildings' footprints and anchors, animals and carts, and story outfits.
import { describe, expect, it } from 'vitest';
import { kitById, kits, type KitBuildOptions } from './kits';
import { animalArt, standingAnimal } from './kits/animals';
import { DISTRICT_STYLES, districtLook, districtStyle } from './kits/district';
import { homeLook } from './kits/grown';
import { EXTRA_KINDS, extraGeometry, residentLook, storyOutfit } from './kits/residents';
import { cartBodyGeometry, cartLoadGeometry, cartWheelGeometry } from './kits/vehicles';
import { seasonOf } from './kits/village';

const tris = (g: { getAttribute(n: string): { count: number } }): number =>
  g.getAttribute('position').count / 3;

describe('district styles', () => {
  it('name the four starter styles and find them by id or name', () => {
    expect(DISTRICT_STYLES.map((s) => s.id)).toEqual(['timber', 'stone', 'brick', 'plaster']);
    expect(districtStyle('riverside-timber')?.id).toBe('timber');
    expect(districtStyle('Hill Stone')?.id).toBe('stone');
    expect(districtStyle('')).toBeNull();
    expect(districtStyle('nonsense')).toBeNull();
  });

  it('give grown buildings their style: brick districts build in brick, stone in stone', () => {
    for (let seed = 1; seed <= 6; seed++) {
      expect(districtLook({ seed, params: { style: 'brick' } }, 1)!.wall).toMatch(/brick|plaster/);
      expect(districtLook({ seed, params: { style: 'stone' } }, 1)!.wall).toMatch(/stone|plaster/);
    }
  });

  it('let the player customization win over the district', () => {
    const l = districtLook(
      { seed: 3, params: { style: 'timber', roofMaterial: 'slate', windowBoxes: false } },
      1,
    )!;
    expect(l.roofMaterial).toBe('slate');
    expect(l.windowBoxes).toBe(false);
  });
});

describe('grown homes', () => {
  it('keep their walls, roof and paint when a cottage becomes a townhouse', () => {
    for (const style of ['timber', 'stone', 'brick', 'plaster', '']) {
      for (let seed = 1; seed <= 6; seed++) {
        const opts: KitBuildOptions = { seed, params: style ? { style } : {} };
        const cottage = homeLook(opts, 1);
        const townhouse = homeLook(opts, 31);
        expect(townhouse.wall, `${style} ${seed}`).toBe(cottage.wall);
        expect(townhouse.wallColor).toBe(cottage.wallColor);
        expect(townhouse.roofMaterial).toBe(cottage.roofMaterial);
        expect(townhouse.accent).toBe(cottage.accent);
      }
    }
  });

  it('draw a district cottage differently from the hamlet cottage, and the same each time', () => {
    const plain = kitById.get('cottage')!.build({ seed: 4 });
    const grown = kitById.get('cottage')!.build({ seed: 4, params: { style: 'plaster' } });
    expect(tris(grown)).not.toBe(tris(plain));
    const again = kitById.get('cottage')!.build({ seed: 4, params: { style: 'plaster' } });
    expect(Array.from(again.getAttribute('position').array)).toEqual(
      Array.from(grown.getAttribute('position').array),
    );
  });

  it('fit every lot size, staying inside the footprint', () => {
    for (const id of ['cottage', 'townhouse', 'shop', 'workshop', 'farmstead']) {
      for (const size of [
        [2, 2],
        [3, 2],
        [2, 3],
        [3, 3],
      ] as [number, number][]) {
        const g = kitById.get(id)!.build({
          size,
          entrance: [Math.floor(size[0] / 2), size[1] - 1],
          seed: 2,
          params: { style: 'timber' },
        });
        const b = g.boundingBox!;
        // Eaves and hanging signs may lean out a little over the lot line.
        expect(b.min.x, `${id} ${size}`).toBeGreaterThan(-0.3);
        expect(b.min.z, `${id} ${size}`).toBeGreaterThan(-0.3);
        expect(b.max.x, `${id} ${size}`).toBeLessThan(size[0] + 0.3);
        expect(b.max.z, `${id} ${size}`).toBeLessThan(size[1] + 0.3);
      }
    }
  });
});

describe('village buildings', () => {
  const ids = [
    'brick-kiln',
    'cart-shed',
    'cheesemaker',
    'chopping-shed',
    'cider-press',
    'clay-pit',
    'dairy',
    'herb-garden',
    'herbalist',
    'orchard',
    'school',
    'sheep-pasture',
    'smithy',
    'spinner',
    'tavern',
    'trading-post',
    'weaver',
  ];

  it('are all registered with the footprint they are drawn for', () => {
    for (const id of ids) {
      const kit = kitById.get(id);
      expect(kit?.kind, id).toBe('building');
      expect(kit?.footprint?.size.length, id).toBe(2);
    }
  });

  it('keep animals in pens on the pasture, the dairy and some farmsteads', () => {
    expect(kitById.get('sheep-pasture')!.anchors!({})!.animals![0]!.kind).toBe('sheep');
    expect(kitById.get('dairy')!.anchors!({})!.animals![0]!.kind).toBe('cow');
    const farms = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
      (seed) => kitById.get('farmstead')!.anchors!({ seed }).animals,
    );
    expect(farms.some((a) => a && a.length > 0)).toBe(true);
  });

  it('light their forges and kilns every night, and smoke', () => {
    for (const id of ['smithy', 'brick-kiln']) {
      const glow = Array.from(kitById.get(id)!.build({}).getAttribute('glow').array);
      expect(
        glow.some((v) => v === 2),
        id,
      ).toBe(true);
      expect(kitById.get(id)!.anchors!({}).smoke!.length, id).toBeGreaterThan(0);
    }
  });

  it('dress the orchard for the season', () => {
    expect(seasonOf({ params: { season: 'winter' } })).toBe(3);
    expect(seasonOf({ params: { season: 2 } })).toBe(2);
    expect(seasonOf({})).toBe(1);
    const orchard = kitById.get('orchard')!;
    const summer = tris(orchard.build({ params: { season: 1 } }));
    const winter = tris(orchard.build({ params: { season: 3 } }));
    expect(winter).toBeLessThan(summer);
  });

  it('carry grown crafts and farms by what they make', () => {
    const plain = tris(kitById.get('workshop')!.build({ seed: 1 }));
    const bricks = tris(kitById.get('workshop')!.build({ seed: 1, params: { make: 'bricks' } }));
    expect(bricks).not.toBe(plain);
  });
});

describe('animals and carts', () => {
  it('build sheep, cows and ponies as body, head and leg, with four hips', () => {
    for (const kind of ['sheep', 'cow', 'pony'] as const) {
      for (let v = 0; v < 3; v++) {
        const a = animalArt(kind, v);
        expect(a.hips).toHaveLength(4);
        expect(tris(a.body)).toBeGreaterThan(20);
        expect(tris(a.head)).toBeGreaterThan(4);
        expect(tris(standingAnimal(kind, v))).toBeLessThan(900);
        expect(standingAnimal(kind, v).boundingBox!.min.y).toBeGreaterThan(-0.01);
      }
    }
  });

  it('build a cart body, a wheel and a load for every good', () => {
    expect(tris(cartBodyGeometry(0))).toBeGreaterThan(50);
    expect(tris(cartWheelGeometry())).toBeGreaterThan(20);
    for (const good of ['logs', 'bricks', 'wool', 'cheese', 'apples', 'cider', 'cloth', 'tools', 'nonsense'])
      expect(tris(cartLoadGeometry(good)), good).toBeGreaterThan(4);
    expect(kits.filter((k) => k.kind === 'vehicle').map((k) => k.id)).toEqual(['cart']);
  });
});

describe('story characters and babies', () => {
  it('wear a signature outfit you can pick out', () => {
    for (const species of ['mouse', 'fox', 'rabbit']) {
      const story = residentLook({ species, look: 7, story: true }).extras.map((e) => e.kind);
      expect(story.length, species).toBeGreaterThanOrEqual(3);
      expect(story).toEqual(storyOutfit(species).map((e) => e.kind));
    }
  });

  it('have geometry for every extra, the sling included', () => {
    expect(EXTRA_KINDS).toContain('sling');
    for (const kind of EXTRA_KINDS) expect(tris(extraGeometry(kind)), kind).toBeGreaterThan(4);
  });
});
