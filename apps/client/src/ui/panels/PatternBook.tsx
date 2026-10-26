import { content, type PatternDef } from '@qoti/content';
import type { PatternView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { seatLabel, seatList, shortDate } from '../format';

/**
 * The Pattern Book as a little two-page book: contents on the left, the open page on the right.
 * Discovered pages carry name, flavor, date and credit; hinted ones only their hint.
 */
export function PatternBookPanel({ session }: { session: Session }) {
  const m = session.mirror;
  void m.hamletRevision.value;
  const seats = m.seats.value;
  const pages = content.patterns.map((def) => ({ def, view: m.patterns.get(def.id) }));
  // Found pages first in the order found, then hints, then the blank pages still to come.
  const order = [
    ...pages.filter((p) => p.view?.discovered).sort((a, b) => (a.view!.tick ?? 0) - (b.view!.tick ?? 0)),
    ...pages.filter((p) => !p.view?.discovered && p.view?.hinted),
    ...pages.filter((p) => !p.view?.discovered && !p.view?.hinted),
  ];
  const found = order.filter((p) => p.view?.discovered).length;
  const current = session.ui.bookPage.value;
  const at = order.findIndex((p) => p.def.id === current);
  const page = at >= 0 ? order[at]! : null;
  const open = (id: string | null) => (session.ui.bookPage.value = id);
  const close = () => {
    session.ui.panel.value = null;
    session.render?.highlight?.(null);
  };

  return (
    <section class="pattern-book" data-testid="patterns" aria-label="The Pattern Book">
      <div class="book-spread">
        <div class="book-page left">
          <header class="book-head">
            <span class="book-kicker">The</span>
            <h2>Pattern Book</h2>
            <p class="book-sub">of {m.settings.value.townName}</p>
          </header>
          <p class="book-count">
            {found} of {order.length} pages written
          </p>
          <ol class="book-contents">
            {order.map((p, i) => {
              const state = p.view?.discovered ? 'found' : p.view?.hinted ? 'hinted' : 'blank';
              return (
                <li key={p.def.id} class={`${state} ${current === p.def.id ? 'here' : ''}`}>
                  <button
                    type="button"
                    data-testid={`page-${p.def.id}`}
                    disabled={state === 'blank'}
                    onClick={() => open(p.def.id)}
                  >
                    <span class="leader">
                      <span class="entry">
                        {state === 'found'
                          ? p.def.name
                          : state === 'hinted'
                            ? 'A page not yet found'
                            : '. . .'}
                      </span>
                    </span>
                    <span class="folio">{i + 1}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        <div class="book-spine" aria-hidden="true" />
        <div class="book-page right">
          {page ? (
            <Page def={page.def} view={page.view} session={session} folio={at + 1} />
          ) : (
            <Cover order={order} seats={seats} me={session.seat} onOpen={open} />
          )}
        </div>
      </div>
      <nav class="book-nav">
        <button
          type="button"
          disabled={at <= 0 && !page}
          onClick={() => open(at > 0 ? order[at - 1]!.def.id : null)}
          title="Previous page"
        >
          ‹
        </button>
        <button
          type="button"
          data-testid="book-next"
          disabled={
            at >= order.length - 1 || !(order[at + 1]?.view?.discovered || order[at + 1]?.view?.hinted)
          }
          onClick={() => open(order[at + 1]!.def.id)}
          title="Next page"
        >
          ›
        </button>
        <button type="button" class="book-close" data-testid="patterns-close" onClick={close}>
          Close the book
        </button>
      </nav>
    </section>
  );
}

function Cover({
  order,
  seats,
  me,
  onOpen,
}: {
  order: { def: PatternDef; view: PatternView | undefined }[];
  seats: Session['mirror']['seats']['value'];
  me: number;
  onOpen: (id: string) => void;
}) {
  const hints = order.filter((p) => !p.view?.discovered && p.view?.hinted);
  const last = [...order].filter((p) => p.view?.discovered).pop();
  return (
    <div class="book-cover-page">
      <Ornament />
      <p class="book-epigraph">
        Good places are made of small, patient patterns. Nobody sells them. You find them by building.
      </p>
      {last?.view && (
        <p class="book-latest">
          Latest page:{' '}
          <button type="button" class="link" onClick={() => onOpen(last.def.id)}>
            {last.def.name}
          </button>
          , found by {seatLabel(seats, last.view.seat ?? 0, me)}.
        </p>
      )}
      {hints.length > 0 && (
        <>
          <h4 class="flourish">
            <span>Hints in the margin</span>
          </h4>
          <ul class="book-hints">
            {hints.map((p) => (
              <li key={p.def.id}>
                <button type="button" class="link" onClick={() => onOpen(p.def.id)}>
                  {p.def.hint}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Page({
  def,
  view,
  session,
  folio,
}: {
  def: PatternDef;
  view: PatternView | undefined;
  session: Session;
  folio: number;
}) {
  const seats = session.mirror.seats.value;
  if (!view?.discovered) {
    return (
      <article class="book-entry unfound" data-testid="book-page">
        <p class="book-kicker">Not yet found</p>
        <h3 class="unknown-title">? ? ?</h3>
        <p class="hint-text">{def.hint}</p>
        <p class="muted small">Build it somewhere in the valley and the page will write itself.</p>
        <span class="folio-mark">{folio}</span>
      </article>
    );
  }
  const unlocks = def.unlocks
    .map((id) => content.decorById.get(id)?.name ?? content.buildingById.get(id)?.name)
    .filter(Boolean);
  const credit = view.together
    ? seatList(
        seats,
        seats.map((s) => s.seat),
        session.seat,
      )
    : seatLabel(seats, view.seat ?? 0, session.seat);
  const site = view.sites[0];
  return (
    <article class="book-entry" data-testid="book-page">
      <p class="book-kicker">Pattern {folio}</p>
      <h3>{def.name}</h3>
      <Vignette id={def.id} />
      <p class="flavor">{def.flavor}</p>
      <dl class="book-facts">
        <div>
          <dt>Found</dt>
          <dd>
            {view.tick !== undefined ? shortDate(view.tick) : 'Some time ago'}, by {credit}
            {view.together && <span class="together"> together</span>}
          </dd>
        </div>
        <div>
          <dt>In the valley</dt>
          <dd>
            {view.sites.length} {view.sites.length === 1 ? 'place' : 'places'}, each adding charm{' '}
            {def.siteBonus.charm > 0 ? `+${def.siteBonus.charm}` : def.siteBonus.charm} nearby
          </dd>
        </div>
        {unlocks.length > 0 && (
          <div>
            <dt>Unlocked</dt>
            <dd>{unlocks.join(', ')}</dd>
          </div>
        )}
      </dl>
      {site && (
        <button
          type="button"
          class="small-button"
          onClick={() => {
            session.render?.highlight?.({
              x: site.x,
              z: site.z,
              radius: def.siteBonus.radius,
              tone: 'hearth',
            });
            session.render?.focus(site.x, site.z);
          }}
        >
          Show me the first one
        </button>
      )}
      <span class="folio-mark">{folio}</span>
    </article>
  );
}

/** A small inked flourish for the cover page. */
function Ornament() {
  return (
    <svg class="ornament" viewBox="0 0 160 28" aria-hidden="true">
      <path d="M4 14h52M104 14h52" />
      <path d="M56 14c6-9 14-9 18 0-4 9-12 9-18 0zM104 14c-6-9-14-9-18 0 4 9 12 9 18 0z" />
      <circle cx="80" cy="14" r="4" />
      <path d="M80 4v4M80 20v4" />
    </svg>
  );
}

/** A tiny line drawing for each page, so the book has pictures. */
function Vignette({ id }: { id: string }) {
  const art: Record<string, string> = {
    'well-gathering-place':
      'M70 52V36h20v16M66 36h28M72 36l8-10 8 10M80 26v-4M40 56h22M98 56h22M44 56v-6h14v6M102 56v-6h14v6M130 56c0-14 6-22 14-22s14 8 14 22',
    'sitting-wall':
      'M20 56h120M24 56V46h112v10M24 46h112M44 46v10M64 46v10M84 46v10M104 46v10M30 46c2-8 6-8 8 0M58 46c2-9 6-9 8 0M96 46c2-8 6-8 8 0',
    'tree-place':
      'M80 56V34M80 34c-16 0-24-8-24-16S66 4 80 4s24 6 24 14-8 16-24 16zM50 56h12M98 56h12M52 56v-5h8v5M100 56v-5h8v5M10 60c30-4 50-4 70-4s40 0 70 4',
    'pocket-park':
      'M20 56V22h24v34M116 56V22h24v34M80 56V40M80 40c-8 0-12-4-12-9s5-9 12-9 12 4 12 9-4 9-12 9zM54 56h12M54 56v-4h12v4M96 54c2-4 6-4 8 0M104 54c2-4 6-4 8 0',
    'kitchen-garden':
      'M20 56V28l20-14 20 14v28M30 56V44h10v12M76 56h70M80 56c0-6 4-8 6-8M94 56c0-6 4-8 6-8M108 56c0-6 4-8 6-8M122 56c0-6 4-8 6-8M76 46h70M78 40v16M144 40v16',
    'lantern-walk':
      'M10 60c40-10 100-10 140 0M30 54V30M26 30h8l-1 6h-6zM80 50V26M76 26h8l-1 6h-6zM130 54V30M126 30h8l-1 6h-6z',
    'promenade-by-the-water':
      'M10 44h140M10 52c10-3 20 3 30 0s20-3 30 0 20 3 30 0 20-3 30 0 20 3 20 0M40 44v-8h16v8M108 44V24M104 24h8l-1 6h-6z',
    'hedgerow-lane':
      'M10 58h140M30 50h100M20 42c6-10 14-10 20 0 6-10 14-10 20 0 6-10 14-10 20 0 6-10 14-10 20 0 6-10 14-10 20 0 6-10 14-10 20 0',
  };
  const d = art[id];
  if (!d) return null;
  return (
    <svg class="vignette" viewBox="0 0 160 64" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
