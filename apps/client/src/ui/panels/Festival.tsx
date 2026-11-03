// I3 (C5F): the festival planner, drawn as a village poster. Pick the site on the map (a box of open
// ground or a Pattern Book site, with validity), fill the menu from stock (with what is already put
// by), choose the music and the twist, and watch a live joy estimate with its parts. The result
// card hands out the stars the night after.
import { content } from '@qoti/content';
import { FESTIVAL_MENU_MAX, MAP_SIZE, type FestivalResultView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { SeasonVignette, Stars } from '../art';
import { goodName } from '../format';
import { dayName, festivalName, JOY_PARTS, joyEstimate, today, twistName, whenWord } from '../seasons';
import type { FestivalDraft } from '../state';
import { Frame, Meter } from './parts';

const MUSIC: { id: FestivalDraft['music']; label: string; note: string }[] = [
  { id: 'none', label: 'No music', note: 'Folk will hum. Badly.' },
  { id: 'resident', label: 'A local musician', note: 'Someone in town with an instrument and nerve.' },
  { id: 'bandstand', label: 'The bandstand', note: 'A proper stage, if the town has one.' },
];

/** The draft on the planner: what is in the book, or the plan already sent. */
export function currentDraft(session: Session): FestivalDraft {
  const d = session.ui.festivalDraft.value;
  if (d) return d;
  const plan = session.mirror.festival.value?.plan;
  return plan
    ? { site: plan.site, menu: plan.menu.map(([g, q]) => [g, q]), twist: plan.twist, music: plan.music }
    : { site: null, menu: [], twist: '', music: 'none' };
}

/** Average charm over the site's tiles (the charm layer), 0 to 100. */
function siteCharm(session: Session, site: FestivalDraft['site']): number {
  const charm = session.mirror.layers.charm;
  if (!site || !charm) return 0;
  let sum = 0;
  let n = 0;
  if ('rect' in site) {
    const [x0, z0, x1, z1] = site.rect;
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        sum += charm[z * MAP_SIZE + x] ?? 0;
        n++;
      }
  } else {
    const p = session.mirror.patterns.get(site.pattern);
    const s = p?.sites.find((x) => x.z * MAP_SIZE + x.x === site.anchor) ?? p?.sites[0];
    for (const t of s?.tiles ?? [site.anchor]) {
      sum += charm[t] ?? 0;
      n++;
    }
    // A Pattern Book site is a lovely spot by definition.
    return Math.min(100, (n ? sum / n : 0) + 15);
  }
  return n ? sum / n : 0;
}

function siteLabel(site: FestivalDraft['site']): string {
  if (!site) return 'Not chosen yet';
  if ('rect' in site) {
    const [x0, z0, x1, z1] = site.rect;
    return `Open ground, ${x1 - x0 + 1} by ${z1 - z0 + 1} tiles`;
  }
  return content.patternById.get(site.pattern)?.name ?? 'A Pattern Book site';
}

export function FestivalPanel({ session }: { session: Session }) {
  const m = session.mirror;
  const f = m.festival.value;
  const draft = currentDraft(session);
  const stocks = m.stocks.value?.lines ?? [];
  const plan = f?.plan ?? null;
  const reserved = new Map((plan?.menu ?? []).map(([g, , r]) => [g, r]));
  const set = (patch: Partial<FestivalDraft>) => (session.ui.festivalDraft.value = { ...draft, ...patch });
  const close = () => {
    session.ui.panel.value = null;
    session.render?.highlight?.(null);
  };
  if (!f) {
    return (
      <Frame id="festival" class="book-panel festival-poster" onClose={close} title="Festivals">
        <p class="muted">The valley's first festival comes with its first full season.</p>
      </Frame>
    );
  }
  const now = today(m.tick.value);
  const attendees = m.town.value?.population ?? m.residents.size;
  const season = content.festivalById.get(f.festival.id)?.season ?? f.festival.season;
  const twists = content.twists.filter((t) => !t.seasons || t.seasons.includes(season));
  const est = joyEstimate({
    siteCharm: siteCharm(session, draft.site),
    pieces: f.pieces.length,
    menu: draft.menu,
    attendees,
    music: draft.music,
    twist: !!draft.twist,
  });
  const foods = stocks.filter(
    (l) => content.goodById.get(l.good)?.food || ['cider', 'pies', 'honey'].includes(l.good),
  );
  const onMenu = new Set(draft.menu.map(([g]) => g));
  const changed = !!session.ui.festivalDraft.value;
  const send = () => {
    session.submit({
      t: 'festival.plan',
      site: draft.site,
      menu: draft.menu.filter(([, q]) => q > 0),
      ...(draft.twist ? { twist: draft.twist } : {}),
      music: draft.music,
    });
    session.ui.festivalDraft.value = null;
  };
  const pickSite = () => {
    session.ui.festivalDraft.value = draft;
    session.tools?.select('festival-site');
  };
  const showSite = () => {
    const s = draft.site;
    if (!s) return;
    if ('rect' in s) {
      const [x0, z0, x1, z1] = s.rect;
      session.render?.focus((x0 + x1) / 2, (z0 + z1) / 2);
      const tiles: [number, number][] = [];
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) tiles.push([x, z]);
      session.render?.highlight?.({ tiles, tone: 'hearth' });
    } else session.render?.focus(s.anchor % MAP_SIZE, Math.floor(s.anchor / MAP_SIZE));
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
          {dayName(f.day)}, six till ten in the evening{f.day >= now ? ` (${whenWord(f.day - now)})` : ''}
        </p>
        {f.live && <p class="poster-live">It is on right now. Go and look.</p>}
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
          const stock = stocks.find((l) => l.good === g)?.stock ?? 0;
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
          {MUSIC.map((mu) => (
            <label key={mu.id} class="radio-line" title={mu.note}>
              <input
                type="radio"
                name="festival-music"
                checked={draft.music === mu.id}
                onChange={() => set({ music: mu.id })}
              />
              {mu.label}
            </label>
          ))}
        </section>
        <section class="poster-block" data-testid="festival-twist">
          <h4>The twist</h4>
          <select value={draft.twist} onChange={(e) => set({ twist: (e.target as HTMLSelectElement).value })}>
            <option value="">None this time</option>
            {twists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
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
        <p class="small muted">
          About {attendees} folk could come; rain thins the crowd. An estimate, mind: the night decides.
        </p>
      </section>

      <div class="actions">
        <button
          type="button"
          class="primary"
          data-testid="festival-send"
          disabled={!draft.site || f.live}
          onClick={send}
        >
          {plan ? (changed ? 'Pin up the new poster' : 'Poster is up') : 'Pin up the poster'}
        </button>
        {plan && (
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
