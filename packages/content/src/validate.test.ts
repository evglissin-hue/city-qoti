import { describe, expect, it } from 'vitest';
import { buildings, content, decor, roads, trees } from './index';
import type { Cost, PlacementRule } from './types';

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const DEPOSITS = new Set(['stone', 'clay', 'sand', 'coal']);

function expectSaneCost(cost: Cost | undefined, where: string): void {
  if (!cost) return;
  if (cost.coins !== undefined) {
    expect(Number.isInteger(cost.coins) && cost.coins >= 0, `${where} coins`).toBe(true);
  }
  for (const [good, qty] of cost.goods ?? []) {
    expect(good, `${where} good id`).toMatch(KEBAB);
    expect(Number.isInteger(qty) && qty > 0, `${where} ${good} quantity`).toBe(true);
  }
}

function expectSaneRule(rule: PlacementRule, where: string): void {
  switch (rule.kind) {
    case 'deposit':
      expect(DEPOSITS.has(rule.deposit), `${where} deposit`).toBe(true);
      break;
    case 'fertility':
      expect(rule.min >= 0 && rule.min <= 100, `${where} fertility`).toBe(true);
      break;
    case 'height':
      expect((rule.min ?? 0) <= (rule.max ?? 15), `${where} height range`).toBe(true);
      break;
    case 'waterEdge':
      break;
  }
}

describe('content', () => {
  it('has unique kebab-case ids across every kind', () => {
    const ids = [...buildings, ...decor, ...roads, ...trees].map((d) => d.id);
    for (const id of ids) expect(id).toMatch(KEBAB);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps registries in alphabetical order by id', () => {
    for (const list of [buildings, decor, roads, trees]) {
      const ids = list.map((d) => d.id);
      expect(ids).toEqual([...ids].sort());
    }
  });

  it('ships the I0 content list', () => {
    expect(buildings.map((b) => b.id).sort()).toEqual(
      ['cottage', 'house', 'shed', 'town-hall', 'well', 'windmill'].sort(),
    );
    expect(decor.map((d) => d.id).sort()).toEqual(
      [
        'apple-tree',
        'barrels',
        'bench',
        'cherry-tree',
        'crates',
        'fence',
        'flower-bed',
        'hedge',
        'lantern',
        'low-wall',
        'planter',
        'signpost',
      ].sort(),
    );
    expect(roads.map((r) => r.id).sort()).toEqual(['lane', 'path']);
    expect(trees.map((t) => t.id).sort()).toEqual(['birch', 'oak', 'pine']);
  });

  it('gives buildings sane footprints, entrances, rules and costs', () => {
    for (const b of buildings) {
      const [w, d] = b.size;
      expect(Number.isInteger(w) && w >= 1 && w <= 8, `${b.id} width`).toBe(true);
      expect(Number.isInteger(d) && d >= 1 && d <= 8, `${b.id} depth`).toBe(true);
      const [ex, ez] = b.entrance;
      expect(ex >= 0 && ex < w && ez >= 0 && ez < d, `${b.id} entrance inside footprint`).toBe(true);
      for (const rule of b.placement ?? []) expectSaneRule(rule, b.id);
      expectSaneCost(b.cost, b.id);
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.art.kit).toMatch(KEBAB);
    }
  });

  it('gives decor sane radii and flags', () => {
    for (const d of decor) {
      expect(Number.isInteger(d.radius) && d.radius > 0 && d.radius <= 512, `${d.id} radius`).toBe(true);
      if (d.linear) expect(d.radius, `${d.id} linear radius`).toBeLessThanOrEqual(128);
      expect(d.tags.length, `${d.id} tags`).toBeGreaterThan(0);
      expect(d.art.kit).toMatch(KEBAB);
    }
    expect(decor.filter((d) => d.linear).map((d) => d.id)).toEqual(['fence', 'hedge', 'low-wall']);
  });

  it('maps roads and trees to unique layer values', () => {
    const roadValues = roads.map((r) => r.layerValue);
    expect(new Set(roadValues).size).toBe(roads.length);
    for (const v of roadValues) expect(v >= 1 && v <= 4).toBe(true);
    for (const r of roads) expectSaneCost(r.cost, r.id);
    const species = trees.map((t) => t.species);
    expect(new Set(species).size).toBe(trees.length);
    for (const s of species) expect(s >= 1 && s <= 31).toBe(true);
  });

  it('indexes every def by id', () => {
    for (const b of buildings) expect(content.buildingById.get(b.id)).toBe(b);
    for (const d of decor) expect(content.decorById.get(d.id)).toBe(d);
    for (const r of roads) expect(content.roadById.get(r.id)).toBe(r);
    for (const t of trees) expect(content.treeById.get(t.id)).toBe(t);
  });
});
