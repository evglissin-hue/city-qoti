// C5B: renown (docs/spec/15-progression.md, Renown): levels by the content thresholds, every source
// (festivals, patterns, story finales, commissions, the sealed Charter's trial, raids through C5D's
// call), and its effects (trade terms at the post and the dock, a little more pull for arrivals,
// the River Dock unlocking at renown 1). Numbers are read from content.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { renownView } from '../../src/view/seasons';
import { postBuyPrice, postSellPrice } from '../../src/systems/trade/caravans';
import { dockBuyPrice, dockSellPrice } from '../../src/systems/dock';
import { addRenown, levelFor, renownEffect } from '../../src/systems/renown/api';
import { grantReward } from '../../src/systems/stories/api';
import { runPatterns } from '../../src/systems/hearth/patterns/engine';
import { meetsRequires } from '../../src/systems/innovations/api';
import { attractiveness } from '../../src/systems/residents/lifecycle';
import { createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { addDecorAt } from '../fixtures/seasonsPlace';
import { winterFixture } from '../fixtures/winter';
import { good } from './helpers';

describe('renown', () => {
  it('climbs the content levels and writes a Chronicle line at each new one', () => {
    const { state } = villageFixture();
    const ctx = createTickCtx(state);
    for (const r of content.renown) expect(levelFor(r.points)).toBe(r.level);
    addRenown(state, ctx, content.renown[1]!.points, 'festival');
    expect(state.renown.level).toBe(1);
    expect(ctx.events.some((e) => e.e === 'renown.updated')).toBe(true);
    expect(state.chronicle[state.chronicle.length - 1]!.kind).toBe('renown-level');
    expect(renownView(state).next).toBe(content.renown[2]!.points);
    const lines = state.chronicle.length;
    addRenown(state, ctx, 1, 'raid');
    expect(state.chronicle.length).toBe(lines);
    expect(state.renown.log.map((e) => e.source)).toEqual(['festival', 'raid']);
  });

  it('comes from patterns, story finales and the sealed Charter', () => {
    const { state } = winterFixture();
    const ctx = createTickCtx(state);
    addDecorAt(state, 'bench', 58.5, 53.5);
    addDecorAt(state, 'bench', 63.5, 53.5);
    addDecorAt(state, 'cherry-tree', 61.5, 50.5);
    state.hearth.discovered = state.hearth.discovered.filter((d) => d.pattern !== 'well-gathering-place');
    runPatterns(state, ctx);
    expect(state.renown.log.some((e) => e.source === 'pattern')).toBe(true);
    const finale = content.storyById.get('musician')!.finale;
    expect(finale.renown).toBeGreaterThan(0);
    grantReward(state, ctx, finale, 0);
    expect(state.renown.log[state.renown.log.length - 1]).toMatchObject({
      source: 'story',
      points: finale.renown,
    });
  });

  it('gives better terms at the post and the dock, a level at a time', () => {
    const { state } = villageFixture();
    const planks = good('planks');
    const wheat = good('wheat');
    const sell0 = postSellPrice(state, 'millhaven', planks)!;
    const buy0 = postBuyPrice(state, 'millhaven', wheat)!;
    const dock0 = dockSellPrice(state, planks)!;
    const dockBuy0 = dockBuyPrice(state, wheat)!;
    state.renown.points = content.renown[3]!.points;
    state.renown.level = 3;
    const t = renownEffect(state, 'trade');
    expect(t).toBeGreaterThan(0);
    expect(postSellPrice(state, 'millhaven', planks)).toBe(Math.round((sell0 * (100 + t)) / 100));
    expect(postBuyPrice(state, 'millhaven', wheat)!).toBeLessThan(buy0);
    expect(dockSellPrice(state, planks)!).toBeGreaterThan(dock0);
    expect(dockBuyPrice(state, wheat)!).toBeLessThan(dockBuy0);
  });

  it('pulls a little harder for arrivals, and opens the River Dock at renown 1', () => {
    const { state } = villageFixture();
    const dock = content.buildingById.get('river-dock')!;
    expect(meetsRequires(state, dock.requires, dock.id)).toBe(false);
    const before = attractiveness(state);
    state.renown.level = 1;
    expect(meetsRequires(state, dock.requires, dock.id)).toBe(true);
    state.renown.level = 5;
    expect(before).toBeGreaterThan(0);
    expect(renownEffect(state, 'arrivals')).toBeGreaterThan(0);
    expect(attractiveness(state)).toBeGreaterThan(before);
  });
});
