// I3 (C5F): the festival planner, drawn as a village poster. Pick the site on the map (a box of open
// ground or a Pattern Book site, with validity), fill the menu from stock (with what is already put
// by), choose the music and the twist, and watch a live joy estimate with its parts. The result
// card hands out the stars the night after.
import { content } from '@qoti/content';
import {
  FESTIVAL_MENU_MAX,
  MAP_SIZE,
  TILE_FP,
  type FestivalPlanView,
  type FestivalResultView,
  type FestivalView,
} from '@qoti/sim';
import { useEffect } from 'preact/hooks';
import type { Session } from '../../app/session';
import { SeasonVignette, Stars } from '../art';
import { goodName } from '../format';
import {
  currentFestivalPlan,
  dayName,
  festivalName,
  festivalPhase,
  festivalReach,
  festivalSiteRect,
  festivalTooLate,
  JOY_PARTS,
  joyEstimate,
  twistName,
  twistNeeds,
  whenWord,
} from '../seasons';
import type { FestivalDraft } from '../state';
import { Frame, Meter } from './parts';

type Rect = [number, number, number, number];

const MUSIC: { id: FestivalDraft['music']; label: string; note: string }[] = [
  { id: 'none', label: 'No music', note: 'Folk will hum. Badly.' },
  { id: 'resident', label: 'A local musician', note: 'Someone in town with an instrument and nerve.' },
  { id: 'bandstand', label: 'The bandstand', note: 'A proper stage, if the town has one.' },
];

/** The draft on the planner: what is in the book, or the plan already sent. */
export function currentDraft(session: Session): FestivalDraft {
  const d = session.ui.festivalDraft.value;
  if (d) return d;
  const plan = currentFestivalPlan(session.mirror.festival.value, session.mirror.tick.value);
  return plan
    ? { site: plan.site, menu: plan.menu.map(([g, q]) => [g, q]), twist: plan.twist, music: plan.music }
    : { site: null, menu: [], twist: '', music: 'none' };
}

/** True when a draft says what the plan on the poster says (so there is nothing left to send). */
export function draftMatchesPlan(draft: FestivalDraft, plan: FestivalPlanView | null): boolean {
  if (!plan) return false;
  const menu = (l: readonly (readonly [string, number, ...number[]])[]) =>
    JSON.stringify(l.filter(([, q]) => q > 0).map(([g, q]) => [g, q]));
  return (
    JSON.stringify(draft.site) === JSON.stringify(plan.site) &&
    menu(draft.menu) === menu(plan.menu) &&
    draft.twist === plan.twist &&
    draft.music === plan.music
  );
}

/** Average charm over the site's tiles (the charm layer, its own scale), and whether it is a Pattern Book site. */
function siteCharm(session: Session, rect: Rect | null): number {
  const charm = session.mirror.layers.charm;
  if (!rect || !charm) return 0;
  let sum = 0;
  let n = 0;
  for (let z = rect[1]; z <= rect[3]; z++)
    for (let x = rect[0]; x <= rect[2]; x++) {
      sum += charm[z * MAP_SIZE + x] ?? 0;
      n++;
    }
  return n ? sum / n : 0;
}

/** Distinct festival pieces standing on the site (the sim's pieceVariety). */
function piecesOnSite(session: Session, rect: Rect | null): number {
  if (!rect) return 0;
  const seen = new Set<string>();
  for (const d of session.mirror.decor.values()) {
    if (!content.decorById.get(d.def)?.festival) continue;
    const x = Math.floor(d.fx / TILE_FP);
    const z = Math.floor(d.fz / TILE_FP);
    if (x >= rect[0] && x <= rect[2] && z >= rect[1] && z <= rect[3]) seen.add(d.def);
  }
  return seen.size;
}

function siteLabel(site: FestivalDraft['site']): string {
  if (!site) return 'Not chosen yet';
  if ('rect' in site) {
    const [x0, z0, x1, z1] = site.rect;
    return `Open ground, ${x1 - x0 + 1} by ${z1 - z0 + 1} tiles`;
  }
  return content.patternById.get(site.pattern)?.name ?? 'A Pattern Book site';
}

/** Whether somebody in town can play: Juniper Reed, or an Artistic grown-up (the sim's musicianFor). */
function hasMusician(m: Session['mirror']): boolean {
  const arc = m.stories.get('musician');
  if (arc?.residentId && m.residents.has(arc.residentId)) return true;
  for (const r of m.residents.values()) if (r.stage === 'adult' && r.traits.includes('artistic')) return true;
  return false;
}

/** The poster's "when" line, by where the festival day stands. */
function whenLine(f: FestivalView, tick: number): string {
  const { phase, daysAhead } = festivalPhase(f, tick);
  const base = `${dayName(f.day)}, six till ten in the evening`;
  if (phase === 'ahead') return `${base} (${whenWord(daysAhead)})`;
  if (phase === 'tonight') return `${base} (tonight)`;
  if (phase === 'live') return `${base} (on now)`;
  return `${dayName(f.day)}: this season's festival is over. The next poster goes up with the next season.`;
}

export function FestivalPanel({ session }: { session: Session }) {
  const m = session.mirror;
  const f = m.festival.value;
  const draft = currentDraft(session);
  const stocks = m.stocks.value?.lines ?? [];
  const tick = m.tick.value;
  const plan = currentFestivalPlan(f, tick);
  const reserved = new Map((plan?.menu ?? []).map(([g, , r]) => [g, r]));
  const set = (patch: Partial<FestivalDraft>) => (session.ui.festivalDraft.value = { ...draft, ...patch });
  const close = () => {
    session.ui.panel.value = null;
    session.render?.highlight?.(null);
  };
  const matches = draftMatchesPlan(draft, plan);
  // The draft stays until the accepted plan comes back (festival.updated carrying it); a refusal
  // keeps it, so nothing the player set up is lost.
  useEffect(() => {
    if (matches && session.ui.festivalDraft.value) session.ui.festivalDraft.value = null;
  }, [matches]);
  if (!f) {
    return (
      <Frame id="festival" class="book-panel festival-poster" onClose={close} title="Festivals">
        <p class="muted">The valley's first festival comes with its first full season.</p>
      </Frame>
    );
  }
  const stockOf = (g: string) => stocks.find((l) => l.good === g)?.stock ?? 0;
  const rect = festivalSiteRect(m, draft.site);
  const reach = festivalReach(m, rect);
  const attendees = draft.site ? reach.near : (m.town.value?.population ?? m.residents.size);
  const season = content.festivalById.get(f.festival.id)?.season ?? f.festival.season;
  const lastTwist = m.festivalResult.value?.twist ?? '';
  const twists = content.twists
    .filter((t) => !t.seasons || t.seasons.includes(season))
    .map((t) => ({
      def: t,
      why: t.id === lastTwist ? 'used last time' : twistNeeds(t.id, stockOf),
    }));
  const twistOk = !twists.some((t) => t.def.id === draft.twist && t.why);
  const est = joyEstimate({
    siteCharm: siteCharm(session, rect),
    pattern: !!draft.site && 'pattern' in draft.site,
    pieces: piecesOnSite(session, rect),
    // What the menu can actually put by: the stock, plus what is already set aside.
    menu: draft.menu.map(([g, q]) => [g, Math.min(q, stockOf(g) + (reserved.get(g) ?? 0))]),
    attendees,
    music: draft.music,
    twist: !!draft.twist && twistOk,
  });
  const musician = hasMusician(m);
  const bandstand = (m.town.value?.unlocked ?? []).includes('bandstand-green');
  const musicWhy = (id: FestivalDraft['music']): string | null =>
    id === 'resident' && !musician
      ? 'Nobody in town plays yet'
      : id === 'bandstand' && !bandstand
        ? 'The bandstand is not found yet'
        : null;
  const foods = stocks.filter(
    (l) => content.goodById.get(l.good)?.food || ['cider', 'pies', 'honey'].includes(l.good),
  );
  const onMenu = new Set(draft.menu.map(([g]) => g));
  const phase = festivalPhase(f, tick).phase;
  const tooLate = festivalTooLate(f, tick);
  const twistWhy = draft.twist ? twists.find((t) => t.def.id === draft.twist)?.why : null;
  // Why Send is off, in a few words; the same reasons the sim would refuse for.
  const blocked = tooLate
    ? 'Too late for this season: the evening has begun.'
    : f.live
      ? 'It is on right now.'
      : !draft.site
        ? 'Choose a site first.'
        : twistWhy
          ? `The twist is ${twistWhy === 'used last time' ? 'the one used last time' : `out of reach (needs ${twistWhy})`}.`
          : musicWhy(draft.music)
            ? `${musicWhy(draft.music)}, so pick other music.`
            : null;
  const send = () => {
    // The draft stays: the effect above clears it when the accepted plan comes back.
    session.submit({
      t: 'festival.plan',
      site: draft.site,
      menu: draft.menu.filter(([, q]) => q > 0),
      ...(draft.twist ? { twist: draft.twist } : {}),
      music: draft.music,
    });
  };
  const setOut = () => {
    const piece = content.festivalById.get(f.festival.id)?.pieces[0];
    close();
    if (piece) session.tools?.select('decor', piece);
    if (rect) session.render?.focus((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2);
  };
  const pickSite = () => {
    session.ui.festivalDraft.value = draft;
    // The poster steps aside while the site is picked; the tool brings it back.
    session.ui.panel.value = null;
    session.tools?.select('festival-site');
  };
  const showSite = () => {
    if (!rect) return;
    session.render?.focus((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2);
    const tiles: [number, number][] = [];
    for (let z = rect[1]; z <= rect[3]; z++) for (let x = rect[0]; x <= rect[2]; x++) tiles.push([x, z]);
    session.render?.highlight?.({ tiles, tone: 'hearth' });
  };
  return (
    <Frame
      id="festival"
      class="book-panel festival-poster"
      icon="festival"
      kicker="By order of the festival committee"
      title={f.festival.name}
      onClose={close}
    >
      <div class="poster-head">
        <SeasonVignette season={season} />
        <p class="poster-when" data-testid="festival-when">
          {whenLine(f, tick)}
        </p>
        {f.live && <p class="poster-live">It is on right now. Go and look.</p>}
        {plan && phase !== 'over' && !tooLate && (
          <div class="row-actions">
            <button type="button" class="ghost-button" data-testid="festival-set-out" onClick={setOut}>
              Set out the pieces
            </button>
          </div>
        )}
      </div>

      <section class="poster-block" data-testid="festival-site">
        <h4>Where</h4>
        <p>
          <b>{siteLabel(draft.site)}</b>
        </p>
        <div class="row-actions">
          <button type="button" class="ghost-button" data-testid="festival-pick-site" onClick={pickSite}>
            {draft.site ? 'Somewhere else' : 'Choose on the map'}
          </button>
          {draft.site && (
            <button type="button" class="link-button" onClick={showSite}>
              Show me
            </button>
          )}
        </div>
      </section>

      <section class="poster-block" data-testid="festival-menu">
        <h4>
          On the menu{' '}
          <span class="muted small">
            ({draft.menu.length} of {FESTIVAL_MENU_MAX})
          </span>
        </h4>
        {draft.menu.map(([g, q]) => {
          const stock = stockOf(g);
          const put = reserved.get(g) ?? 0;
          return (
            <div key={g} class="menu-line" data-testid={`menu-${g}`}>
              <span class="menu-good">{goodName(g)}</span>
              <span class="stepper">
                <button
                  type="button"
                  aria-label="Less"
                  onClick={() =>
                    set({ menu: draft.menu.map(([x, n]) => [x, x === g ? Math.max(1, n - 5) : n]) })
                  }
                >
                  −
                </button>
                <b>{q}</b>
                <button
                  type="button"
                  aria-label="More"
                  data-testid={`menu-more-${g}`}
                  onClick={() =>
                    set({ menu: draft.menu.map(([x, n]) => [x, x === g ? Math.min(500, n + 5) : n]) })
                  }
                >
                  +
                </button>
              </span>
              <span class={`small ${stock < q ? 'short' : 'muted'}`}>
                {stock} in store{put > 0 ? `, ${put} put by` : ''}
              </span>
              <button
                type="button"
                class="link-button"
                onClick={() => set({ menu: draft.menu.filter(([x]) => x !== g) })}
              >
                Take off
              </button>
            </div>
          );
        })}
        {draft.menu.length < FESTIVAL_MENU_MAX && (
          <div class="menu-add">
            {foods
              .filter((l) => !onMenu.has(l.good) && l.stock > 0)
              .slice(0, 8)
              .map((l) => (
                <button
                  key={l.good}
                  type="button"
                  class="chip-button"
                  data-testid={`menu-add-${l.good}`}
                  onClick={() =>
                    set({
                      menu: [
                        ...draft.menu,
                        [l.good, Math.min(l.stock, Math.max(5, Math.round(attendees / 4)))],
                      ],
                    })
                  }
                >
                  + {goodName(l.good)} <span class="muted">({l.stock})</span>
                </button>
              ))}
          </div>
        )}
      </section>

      <div class="poster-pair">
        <section class="poster-block" data-testid="festival-music">
          <h4>Music</h4>
          {MUSIC.map((mu) => {
            const why = musicWhy(mu.id);
            return (
              <label key={mu.id} class="radio-line" title={why ?? mu.note}>
                <input
                  type="radio"
                  name="festival-music"
                  checked={draft.music === mu.id}
                  disabled={!!why && draft.music !== mu.id}
                  onChange={() => set({ music: mu.id })}
                />
                {mu.label}
                {why && <span class="small muted"> ({why})</span>}
              </label>
            );
          })}
        </section>
        <section class="poster-block" data-testid="festival-twist">
          <h4>The twist</h4>
          <select value={draft.twist} onChange={(e) => set({ twist: (e.target as HTMLSelectElement).value })}>
            <option value="">None this time</option>
            {twists.map(({ def, why }) => (
              <option key={def.id} value={def.id} disabled={!!why && draft.twist !== def.id}>
                {def.name}
                {why ? (why === 'used last time' ? ' (used last time)' : ` (needs ${why})`) : ''}
              </option>
            ))}
          </select>
          {draft.twist && <p class="small muted">{content.twistById.get(draft.twist)?.blurb}</p>}
        </section>
      </div>

      <section class="poster-block joy" data-testid="festival-estimate">
        <h4>
          How it might go <Stars n={est.stars} testid="estimate-stars" />
        </h4>
        {JOY_PARTS.map(([k, label]) => (
          <Meter
            key={k}
            label={label}
            value={est.parts[k] / 100}
            note={est.parts[k]}
            tone={k === 'menu' ? 'ochre' : 'sage'}
          />
        ))}
        <p class="small muted" data-testid="festival-reach">
          {draft.site
            ? `About ${reach.near} folk live close enough to come${
                reach.far > 0 ? `, and ${reach.far} live too far away` : ''
              }.`
            : `About ${attendees} folk live in the valley; the site decides who is close enough.`}{' '}
          Rain thins the crowd. An estimate, mind: the night decides.
        </p>
      </section>

      <div class="actions">
        <button
          type="button"
          class="primary"
          data-testid="festival-send"
          disabled={!!blocked}
          title={blocked ?? undefined}
          onClick={send}
        >
          {plan ? (matches ? 'Poster is up' : 'Pin up the new poster') : 'Pin up the poster'}
        </button>
        {blocked && (
          <span class="small short" data-testid="festival-blocked">
            {blocked}
          </span>
        )}
        {plan && !blocked && (
          <span class="small muted" data-testid="festival-planned">
            Planned by {m.seats.value.find((s) => s.seat === plan.by)?.name ?? 'someone'}.
          </span>
        )}
      </div>
    </Frame>
  );
}

/** The morning after: stars, the crowd and the joy parts, on a card. */
export function FestivalResultPanel({ session }: { session: Session }) {
  const r = session.ui.festivalCard.value;
  if (!r) return null;
  const close = () => (session.ui.festivalCard.value = null);
  return (
    <div class="modal-backdrop letter-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <FestivalResultCard result={r} onClose={close} />
    </div>
  );
}

export function FestivalResultCard({
  result: r,
  onClose,
}: {
  result: FestivalResultView;
  onClose: () => void;
}) {
  const line =
    r.stars >= 5
      ? 'People will be talking about this one until next year, and then some.'
      : r.stars >= 4
        ? 'A proper success. Several people danced who swore they never would.'
        : r.stars >= 3
          ? 'A good night. Nobody went home early, which is the real test.'
          : r.stars >= 2
            ? 'Pleasant enough. Next time, a little more of everything.'
            : 'A quiet one. The folk who came had a nice chat, at least.';
  return (
    <div
      class="festival-result"
      role="dialog"
      aria-label={`${festivalName(r.festival)}: ${r.stars} stars`}
      data-testid="festival-result"
    >
      <p class="kicker">The morning after</p>
      <h2>{festivalName(r.festival)}</h2>
      <Stars n={r.stars} testid="result-stars" />
      <p class="proclamation">{line}</p>
      <p class="small">
        {r.attendance} came. Twist: {twistName(r.twist)}.
      </p>
      <div class="result-parts">
        {JOY_PARTS.map(([k, label]) => (
          <Meter key={k} label={label} value={r.joy[k] / 100} note={r.joy[k]} />
        ))}
      </div>
      <div class="actions">
        <button type="button" class="primary" data-testid="festival-result-close" onClick={onClose}>
          Sweep up the bunting
        </button>
      </div>
    </div>
  );
}
