import { describe, expect, it } from 'vitest';
import { baskets, carts, charters, content, innovations, neighbors, roads, zones } from './index';

// I2 content (C4.0): every reference resolves, values stay in their ranges, words stay clean.
describe('I2 content', () => {
  const goods = (pairs: readonly (readonly [string, number])[]) => pairs.map(([g]) => g);

  it('zones have unique layer values 1 to 5 and lots of 2 to 3 tiles', () => {
    expect(zones.map((z) => z.layerValue).sort()).toEqual([1, 2, 3, 4, 5]);
    for (const z of zones) {
      expect(z.lots.length, z.id).toBeGreaterThan(0);
      for (const l of z.lots) for (const n of l.size) expect(n >= 2 && n <= 3, z.id).toBe(true);
    }
  });

  it('baskets and neighbors name real goods', () => {
    expect(baskets.map((b) => b.tier).sort()).toEqual(['craftsfolk', 'settler']);
    for (const b of baskets) {
      for (const g of b.groups) {
        expect(g.perDay, `${b.tier}.${g.id}`).toBeGreaterThan(0);
        for (const id of goods(g.goods)) expect(content.goodById.has(id), id).toBe(true);
      }
    }
    for (const n of neighbors) {
      for (const id of [...goods(n.sells), ...goods(n.buys)]) expect(content.goodById.has(id), id).toBe(true);
      for (const [id, season, p] of n.seasonal ?? []) {
        expect(content.goodById.has(id) && season >= 0 && season <= 3 && p > 0, id).toBe(true);
      }
    }
  });

  it('charters, innovations and carts are well formed', () => {
    const village = charters.find((c) => c.id === 'village')!;
    expect(village.goals.map((g) => g.target)).toEqual([30, 3, 5, 5, 1]);
    expect(new Set(village.goals.map((g) => g.id)).size).toBe(village.goals.length);
    expect(innovations.map((i) => i.id)).toEqual([...innovations.map((i) => i.id)].sort());
    for (const i of innovations) expect(i.unlocks.length, i.id).toBeGreaterThan(0);
    for (const c of carts) {
      for (const [road] of c.ticksPerTile) expect(roads.find((r) => r.id === road)?.carts, road).toBe(true);
    }
    expect(roads.find((r) => r.id === 'street')).toMatchObject({ layerValue: 3, carts: true, capacity: 80 });
  });

  it('writes without em or en dashes', () => {
    const text = JSON.stringify([zones, baskets, neighbors, innovations, charters, carts]);
    expect(text).not.toMatch(/—|–/);
  });
});

// I2 chains, services and homes (C4C).
describe('I2 buildings', () => {
  const I2_GOODS = [
    'clay',
    'bricks',
    'wool',
    'yarn',
    'cloth',
    'milk',
    'cheese',
    'apples',
    'cider',
    'firewood',
    'herbs',
    'tools',
  ];
  /** Daily wages per job tier in coins at wage level 100 (docs/spec/13-ledger.md, Wages). */
  const WAGE = { settler: 6, craftsfolk: 10, merchant: 16, patron: 26 } as const;
  const price = (g: string) => content.goodById.get(g)!.basePrice / 100;

  it('makes every I2 good somewhere, and every craft input too', () => {
    const made = new Set(
      content.buildings.flatMap((b) => (b.methods ?? []).flatMap((m) => m.outputs.map(([g]) => g))),
    );
    for (const g of I2_GOODS) expect(made.has(g), g).toBe(true);
    for (const b of content.buildings)
      for (const m of b.methods ?? [])
        for (const [g] of m.inputs) expect(made.has(g), `${b.id} needs ${g}`).toBe(true);
  });

  it('names real ranks, innovations, zones and upgrade targets', () => {
    const ranks = ['hamlet', 'village', 'town', 'marketTown', 'city'];
    for (const b of content.buildings) {
      if (b.requires?.rank) expect(ranks, b.id).toContain(b.requires.rank);
      if (b.requires?.innovation) expect(content.innovationById.has(b.requires.innovation), b.id).toBe(true);
      if (b.grows) expect(content.zoneById.has(b.grows.zone), b.id).toBe(true);
      const up = b.upgradesTo;
      if (!up) continue;
      const to = content.buildingById.get(up.def)!;
      expect(to, b.id).toBeDefined();
      // Upgrades happen in place: the same footprint and door.
      expect(to.size, b.id).toEqual(b.size);
      expect(to.entrance, b.id).toEqual(b.entrance);
      expect(to.housing, b.id).toBeDefined();
      for (const [g, q] of up.goods) expect(content.goodById.has(g) && q > 0, `${b.id} ${g}`).toBe(true);
    }
    for (const i of content.innovations)
      for (const u of i.unlocks) {
        // Capabilities: porter-carry-6 [I2]; forecast-days-2 and wheat-yield-120 [I3].
        const known =
          content.buildingById.has(u) ||
          content.roadById.has(u) ||
          /^(porter-carry|forecast-days|wheat-yield)-\d+$/.test(u);
        expect(known, `${i.id} unlocks ${u}`).toBe(true);
      }
  });

  it('gives the services coverage and the tiers their homes', () => {
    for (const [id, kind] of [
      ['school', 'education'],
      ['tavern', 'social'],
      ['herbalist', 'health'],
    ] as const) {
      const cov = content.buildingById.get(id)!.coverage?.find((c) => c.kind === kind);
      expect(cov && cov.radius > 0 && (cov.capacity ?? 0) > 0, id).toBe(true);
    }
    expect(content.buildingById.get('cottage')!.upgradesTo?.def).toBe('townhouse');
    expect(content.buildingById.get('townhouse')!.tier).toBe('craftsfolk');
    expect(content.buildings.filter((b) => b.tags?.includes('trading-post')).map((b) => b.id)).toEqual([
      'trading-post',
    ]);
  });

  it('pays its way: every hand-placed I2 producer makes more than it costs a work day at base prices', () => {
    for (const b of content.buildings) {
      const m = b.methods?.[0];
      if (!m || !b.requires || b.grows || m.outputs.length === 0) continue;
      const cycles = (9 / m.hours) * (m.perWorker ? m.workers : 1);
      let value = 0;
      for (const [g, q] of m.outputs) value += price(g) * q * cycles;
      for (const [g, q] of m.inputs) value -= price(g) * q * cycles;
      const wages = (b.jobs?.count ?? 0) * WAGE[b.jobs?.tier ?? 'settler'];
      expect(value - wages - (b.upkeep ?? 0), b.id).toBeGreaterThan(0);
    }
  });

  it('writes the I2 buildings and decor without em or en dashes', () => {
    const i2 = content.buildings.filter((b) => b.requires || b.grows || b.upgradesTo);
    expect(JSON.stringify([i2, content.decor, content.patterns])).not.toMatch(/\u2014|\u2013/);
  });
});
