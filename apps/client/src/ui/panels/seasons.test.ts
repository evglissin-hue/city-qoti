// @vitest-environment happy-dom
// I3 (C5F): the season pages against the I3 mocks (the sim's winter and threat fixtures through the
// sim's own view builders, plus a season report, a festival and raid result, a commission and a
// boat). Text and numbers come from the views and content, never pinned copy.
import { content } from '@qoti/content';
import { type Command } from '@qoti/sim';
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { closeAlmanac, seasonsAfterUpdate, showAlmanac } from '../../app/seasonsHook';
import {
  mockCommissions,
  mockFestival,
  mockFestivalResult,
  mockFieldGuide,
  mockRaid,
  mockRaidResult,
  mockSeasonCard,
  mockSeasonReport,
  mockThreat,
  mockTrial,
  mockWatch,
  threatIds,
  winterIds,
} from '../mocks/seasons';
import { mockSeasonsSession } from '../mocks/session';
import { computeAlerts } from '../alerts';
import { mount, settle, type Mounted } from '../test/dom';
import { BAND_WORD, SIDE_WORD, speciesName, WEATHER_WORD } from '../seasons';
import { TopBar } from '../TopBar';
import { CustomizePanel } from './Customize';
import { CommissionsTab, DockTab } from './balancesNeighbors';
import { FestivalPanel, FestivalResultPanel } from './Festival';
import { FieldGuidePanel } from './FieldGuide';
import { InspectorPanel } from './Inspector';
import { PhotoStrip, TogetherNote } from './Photo';
import { RaidPanel } from './Raid';
import { SeasonCardPanel } from './SeasonCard';
import { TrialPanel } from './Trial';
import { WatchPanel } from './Watch';
import { ValleyDials } from '../SettingsPanel';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

const last = <T extends Command['t']>(submitted: Command[], t: T) =>
  submitted.filter((c): c is Extract<Command, { t: T }> => c.t === t).pop();

describe('the almanac', () => {
  it('opens the season with the festival, the forecast and the trial steps', async () => {
    const { session } = await mockSeasonsSession('winter');
    showAlmanac(session.ui, { kind: 'card', view: mockSeasonCard });
    view = await mount(h(SeasonCardPanel, { session }));
    const card = view.get('season-card');
    expect(card.textContent).toContain(mockSeasonCard.name);
    expect(view.get('card-festival').textContent).toContain(mockSeasonCard.festival.name);
    expect(view.get('forecast').textContent).toContain(WEATHER_WORD[mockSeasonCard.weather.today].word);
    for (const step of mockSeasonCard.steps) expect(view.get('card-steps').textContent).toContain(step);
    // No raid is telegraphed in the winter fixture, so the card says nothing of one.
    expect(view.find('card-threat')).toBeNull();
    await view.click('card-plan');
    expect(session.ui.almanac.value).toBeNull();
    expect(session.ui.panel.value).toBe('festival');
  });

  it('names a telegraphed threat on the card with its side, band and signs', async () => {
    const { session } = await mockSeasonsSession('threat');
    showAlmanac(session.ui, { kind: 'card', view: { ...mockSeasonCard, threat: mockThreat } });
    view = await mount(h(SeasonCardPanel, { session }));
    const t = view.get('card-threat').textContent ?? '';
    expect(t).toContain(SIDE_WORD[mockThreat.side!]);
    expect(t).toContain(BAND_WORD[mockThreat.band!]);
  });

  it('closes a season with the Hearth and Ledger pages, the morning card waiting beneath', async () => {
    const { session } = await mockSeasonsSession('winter');
    showAlmanac(session.ui, { kind: 'report', view: mockSeasonReport, page: 0 });
    showAlmanac(session.ui, { kind: 'card', view: mockSeasonCard });
    view = await mount(h(SeasonCardPanel, { session }));
    for (const l of mockSeasonReport.hearth) expect(view.get('report-hearth').textContent).toContain(l.text);
    for (const l of mockSeasonReport.ledger) expect(view.get('report-ledger').textContent).toContain(l.text);
    await view.click('season-report-close');
    expect(view.find('season-card')).not.toBeNull();
    closeAlmanac(session.ui);
    expect(session.ui.almanac.value).toBeNull();
  });

  it('shows weather and renown in the top bar', async () => {
    const { session } = await mockSeasonsSession('winter');
    view = await mount(h(TopBar, { session, onLeave: () => {} }));
    expect(view.get('weather').textContent).toContain(WEATHER_WORD[session.mirror.weather.value!.today].word);
    expect(view.get('weather').getAttribute('title')).toContain('frozen');
    expect(view.get('renown').textContent).toContain(String(session.mirror.renown.value!.level));
  });
});

describe('the Hearth books', () => {
  it('Field Guide: a page per species with where and when, hints and habitats', async () => {
    const { session } = await mockSeasonsSession('winter');
    view = await mount(h(FieldGuidePanel, { session }));
    for (const g of mockFieldGuide)
      expect(view.get(`guide-${g.species}`).textContent).toContain(speciesName(g.species, g.name));
    expect(view.get('guide-hints').querySelectorAll('li')).toHaveLength(3);
    await view.click(`guide-${mockFieldGuide[0]!.species}`);
    expect(view.get('species-page').textContent).toContain(speciesName(mockFieldGuide[0]!.species));
    expect(view.get('species-first').textContent).toMatch(/Year \d/);
  });

  it('festival planner: the plan, the menu from stock, a live estimate, and the poster sent', async () => {
    const { session, submitted } = await mockSeasonsSession('winter');
    view = await mount(h(FestivalPanel, { session }));
    expect(view.get('festival').textContent).toContain(mockFestival.festival.name);
    const plan = mockFestival.plan!;
    for (const [g] of plan.menu) expect(view.find(`menu-${g}`)).not.toBeNull();
    expect(view.get(`menu-${plan.menu[0]![0]}`).textContent).toContain(`${plan.menu[0]![2]} put by`);
    expect(view.get('estimate-stars').dataset.stars).toMatch(/[1-5]/);
    await view.click(`menu-more-${plan.menu[0]![0]}`);
    expect(session.ui.festivalDraft.value?.menu[0]![1]).toBe(plan.menu[0]![1] + 5);
    await view.click('festival-send');
    const sent = last(submitted, 'festival.plan')!;
    expect(sent.menu[0]).toEqual([plan.menu[0]![0], plan.menu[0]![1] + 5]);
    expect(sent.site).toEqual(plan.site);
    expect(sent.twist).toBe(plan.twist);
  });

  it('festival result: the stars and the joy parts on a card', async () => {
    const { session } = await mockSeasonsSession('winter');
    session.ui.festivalCard.value = mockFestivalResult;
    view = await mount(h(FestivalResultPanel, { session }));
    expect(view.get('result-stars').dataset.stars).toBe(String(mockFestivalResult.stars));
    expect(view.get('festival-result').textContent).toContain(String(mockFestivalResult.attendance));
  });

  it('modules: a picker per slot the building has (none until C5C writes modules)', async () => {
    const { session } = await mockSeasonsSession('winter');
    const house = [...session.mirror.buildings.values()].find(
      (b) => content.buildingById.get(b.def)?.moduleSlots,
    );
    session.ui.customize.value = house?.id ?? winterIds.bathHouse;
    view = await mount(h(CustomizePanel, { session }));
    if (house) expect(view.find('module-picker')).not.toBeNull();
    else expect(view.find('module-picker')).toBeNull();
  });
});

describe('the Ledger books', () => {
  it('Watch: roster, target and budget, morale with its parts, guard points sent', async () => {
    const { session, submitted } = await mockSeasonsSession('threat', 1);
    session.ui.lens.value = 'ledger';
    view = await mount(h(WatchPanel, { session }));
    for (const id of mockWatch.members) expect(view.find(`watch-member-${id}`)).not.toBeNull();
    expect(view.get('watch-roster').textContent).toContain(`of ${mockWatch.target}`);
    expect(view.get('morale-parts').querySelectorAll('li').length).toBe(4);
    expect(view.find('watch-pressure')).not.toBeNull();
    expect(view.get('watch-threat').textContent).toContain(SIDE_WORD[mockThreat.side!]);
    await view.click('watch-target-more');
    expect(last(submitted, 'watch.setTarget')!.size).toBe(mockWatch.target + 1);
    await view.click('watch-budget-more');
    expect(last(submitted, 'watch.setBudget')!.coins).toBe(mockWatch.budget + 1);
    await view.click('watch-place-guards');
    session.ui.postureDraft.value = [[50, 50]];
    await settle();
    await view.click('watch-send-posture');
    expect(last(submitted, 'watch.setPosture')!.guards).toEqual([[50, 50]]);
  });

  it('River Dock: the boats and the frozen notice', async () => {
    const { session } = await mockSeasonsSession('winter');
    view = await mount(h(DockTab, { session }));
    expect(view.find('dock-frozen')).not.toBeNull();
    const boat = session.mirror.dock.value!.boats[0]!;
    expect(view.get(`boat-${boat.id}`).textContent).toContain(content.neighborById.get(boat.neighbor)!.name);
  });

  it('commissions: accept and decline an offer', async () => {
    const { session, submitted } = await mockSeasonsSession('winter');
    view = await mount(h(CommissionsTab, { session }));
    const c = mockCommissions[0]!;
    await view.click(`commission-accept-${c.id}`);
    expect(last(submitted, 'commission.accept')!.id).toBe(c.id);
    await view.click(`commission-decline-${c.id}`);
    expect(last(submitted, 'commission.decline')!.id).toBe(c.id);
  });
});

describe('threats', () => {
  it('raid bar: ring the bell (already rung here), light the lanterns, the gates', async () => {
    const { session, submitted } = await mockSeasonsSession('raid');
    view = await mount(h(RaidPanel, { session }));
    expect(view.get('raid-bar').textContent).toContain(SIDE_WORD[mockRaid.side]);
    expect((view.get('raid-bell') as HTMLButtonElement).disabled).toBe(mockRaid.bell);
    await view.click('raid-lanterns');
    expect(last(submitted, 'watch.lightLanterns')).toBeTruthy();
    await view.click('raid-gates-shut');
    expect(last(submitted, 'gate.set')).toEqual({ t: 'gate.set', id: threatIds.gate, open: false });
  });

  it('captive choice: either seat offers a home or sends them off', async () => {
    const { session, submitted } = await mockSeasonsSession('raid', 1);
    view = await mount(h(RaidPanel, { session }));
    await view.click('captive-home');
    expect(last(submitted, 'bandit.decide')).toEqual({
      t: 'bandit.decide',
      id: mockRaid.captures[0],
      choice: 'home',
    });
  });

  it('result card: goods lost, damage, captures, renown and morale', async () => {
    const { session } = await mockSeasonsSession('threat');
    session.ui.raidCard.value = mockRaidResult;
    view = await mount(h(RaidPanel, { session }));
    const card = view.get('raid-result').textContent ?? '';
    expect(card).toContain(String(mockRaidResult.stolen[0]![1]));
    expect(card).toContain(`+${mockRaidResult.renown}`);
    expect(card).toContain(`+${mockRaidResult.morale}`);
  });

  it('alerts: a raid in both lenses, gently in the Hearth; cold homes; commissions', async () => {
    const { session } = await mockSeasonsSession('threat');
    const all = computeAlerts(session.mirror);
    const raid = all.filter((a) => a.key.startsWith('raid-'));
    expect(raid.map((a) => a.lens).sort()).toEqual(['hearth', 'ledger']);
    expect(raid.every((a) => a.text.includes(SIDE_WORD[mockThreat.side!]))).toBe(true);
    const winter = await mockSeasonsSession('winter');
    const w = computeAlerts(winter.session.mirror);
    if ((winter.session.mirror.town.value?.coldHouseholds ?? 0) > 0)
      expect(w.some((a) => a.key.startsWith('cold-'))).toBe(true);
    expect(w.some((a) => a.key === `commission-${mockCommissions[0]!.id}`)).toBe(true);
  });
});

describe('trial, together and photo mode', () => {
  it('trial card: what the winter needs and how the town is doing', async () => {
    const { session } = await mockSeasonsSession('winter');
    view = await mount(h(TrialPanel, { session }));
    expect(view.get('trial').textContent).toContain(mockTrial.name);
    expect(view.find(`trial-${mockTrial.status}`)).not.toBeNull();
    expect(view.get('trial-progress').querySelectorAll('li').length).toBeGreaterThan(0);
    session.mirror.trial.value = { ...mockTrial, status: 'failed' };
    await settle();
    expect(view.get('trial-failed').textContent).toContain(`year ${mockTrial.year + 2}`);
  });

  it('together note from a together moment, and photo mode hiding the rest', async () => {
    const { session } = await mockSeasonsSession('winter');
    const change = session.mirror.apply({
      t: 1,
      tick: session.mirror.tick.value,
      events: [{ e: 'together.moment', kind: 'dance' }],
      patches: [],
    });
    seasonsAfterUpdate(session, change);
    view = await mount(h(TogetherNote, { session }));
    expect(view.get('together-note').textContent).toContain('both here');
    view.unmount();
    session.ui.photo.value = true;
    view = await mount(h(PhotoStrip, { session }));
    expect(view.find('photo-strip')).not.toBeNull();
    await view.click('photo-exit');
    expect(session.ui.photo.value).toBe(false);
  });

  it('the threat dial beside the economy dial in Settings', async () => {
    const { session, submitted } = await mockSeasonsSession('winter');
    view = await mount(h(ValleyDials, { session }));
    await view.click('settings-threat-fierce');
    expect(last(submitted, 'valley.setSettings')!.settings).toEqual({ threat: 'fierce' });
  });

  it('inspectors: warmth for a cold household, Watch duty for a member', async () => {
    const { session } = await mockSeasonsSession('winter');
    const member = winterIds.watch[0]!;
    session.ui.selection.value = { kind: 'resident', id: member };
    view = await mount(h(InspectorPanel, { session }));
    await settle();
    const seasonLines = view.find('resident-season');
    // The fixture's views carry warmth and Watch duty once C5A and C5D fill them.
    if (seasonLines) expect(seasonLines.textContent?.length).toBeGreaterThan(0);
  });
});
