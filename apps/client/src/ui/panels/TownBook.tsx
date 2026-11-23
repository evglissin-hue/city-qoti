import { content } from '@qoti/content';
import { LEANINGS, type Leaning, type SeatView, type TownBookPageView, type TownBookView } from '@qoti/sim';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { dayDate } from '../format';
import { pictureFor } from '../pictures';
import './townBook.css';

const LEANING_NAMES: Record<Leaning, string> = {
  industry: 'Industry',
  gardens: 'Gardens',
  pilgrimage: 'Pilgrimage',
};

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

const EMPTY: TownBookView = { pages: [], hints: [], callings: [], leanings: [0, 0, 0] };

/** The pages in contents order: by leaning (LEANINGS order), then the order found. */
export function townBookOrder(pages: readonly TownBookPageView[]): TownBookPageView[] {
  return LEANINGS.flatMap((l) =>
    pages.filter((p) => p.leaning === l).sort((a, b) => a.day - b.day || a.id - b.id),
  );
}

/** "2 of 3 toward Mill Town", or "Mill Town, earned". */
export function tallyWords(book: TownBookView, leaning: Leaning): string {
  const calling = content.callings.find((c) => c.leaning === leaning);
  const need = content.townBook.pagesForCalling;
  const n = book.leanings[LEANINGS.indexOf(leaning)] ?? 0;
  const name = calling?.name ?? 'a calling';
  const earned = book.callings.some((c) => c.leaning === leaning);
  return earned ? `${name}, earned` : `${Math.min(n, need)} of ${need} toward ${name}`;
}

/**
 * The Town Book as a two-page spread, like the Pattern Book: contents on the left, the cover or the
 * open page on the right. Pages are found by the town's habits, never built; no button opens it but
 * the Books shelf (and its key).
 */
export function TownBookPanel({ session }: { session: Session }) {
  const m = session.mirror;
  const book = m.townBook.value ?? EMPTY;
  const seats = m.seats.value;
  const order = townBookOrder(book.pages);
  const [current, setCurrent] = useState<number | null>(null);
  const at = order.findIndex((p) => p.id === current);
  const page = at >= 0 ? order[at]! : null;
  const close = () => {
    session.ui.panel.value = null;
    session.render?.highlight?.(null);
  };
  const count =
    order.length === 0 ? 'No pages yet' : `${order.length} ${order.length === 1 ? 'page' : 'pages'} found`;

  return (
    <section class="pattern-book town-book" data-testid="town-book" aria-label="The Town Book">
      <div class="book-spread">
        <div class="book-page left">
          <header class="book-head">
            <span class="book-kicker">The</span>
            <h2>Town Book</h2>
            <p class="book-sub">of {m.settings.value.townName}</p>
          </header>
          <p class="book-count">{count}</p>
          <div class="tb-contents">
            {LEANINGS.map((l) => {
              const list = order.filter((p) => p.leaning === l);
              if (list.length === 0) return null;
              return (
                <div key={l} class="tb-group">
                  <h4 class="tb-leaning">{LEANING_NAMES[l]}</h4>
                  <ol class="book-contents">
                    {list.map((p) => (
                      <li key={p.id} class={p.id === current ? 'found here' : 'found'}>
                        <button
                          type="button"
                          data-testid={`town-book-link-${p.id}`}
                          onClick={() => setCurrent(p.id)}
                        >
                          <span class="leader">
                            <span class="entry">{p.name}</span>
                          </span>
                          <span class="folio">{order.indexOf(p) + 1}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
          <ul class="tb-tally" aria-label="Toward a calling">
            {LEANINGS.map((l) => (
              <li key={l}>
                <b>{LEANING_NAMES[l]}</b>: {tallyWords(book, l)}
              </li>
            ))}
          </ul>
        </div>
        <div class="book-spine" aria-hidden="true" />
        <div class="book-page right">
          {page ? (
            <PageView page={page} folio={at + 1} seats={seats} me={session.seat} session={session} />
          ) : (
            <Cover book={book} />
          )}
        </div>
      </div>
      <nav class="book-nav">
        <button
          type="button"
          disabled={!page}
          onClick={() => setCurrent(at > 0 ? order[at - 1]!.id : null)}
          title="Previous page"
        >
          ‹
        </button>
        <button
          type="button"
          data-testid="town-book-next"
          disabled={order.length === 0 || at >= order.length - 1}
          onClick={() => setCurrent(order[at + 1]!.id)}
          title="Next page"
        >
          ›
        </button>
        <button type="button" class="book-close" data-testid="town-book-close" onClick={close}>
          Close the book
        </button>
      </nav>
    </section>
  );
}

function Cover({ book }: { book: TownBookView }) {
  const bare = book.pages.length === 0 && book.hints.length === 0;
  return (
    <div class="book-cover-page">
      <Ornament />
      <p class="book-epigraph">Every town has habits. This one writes them down.</p>
      {bare && (
        <p class="tb-empty">Nothing is written yet. The town is still deciding what it does of an evening.</p>
      )}
      {book.hints.length > 0 && (
        <>
          <h4 class="flourish">
            <span>Not yet found</span>
          </h4>
          <ul class="book-hints">
            {book.hints.map((h) => (
              <li key={h.def} data-testid="town-book-hint">
                <span class="tb-hint-words">{h.hint}</span>{' '}
                <span class="tb-hint-leaning">{LEANING_NAMES[h.leaning]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {book.callings.length > 0 && (
        <>
          <h4 class="flourish">
            <span>What the town is known for</span>
          </h4>
          <ul class="tb-callings">
            {book.callings.map((c) => (
              <li key={c.id} data-testid="town-book-calling">
                <b>{c.name}</b>
                <p class="tb-blurb">{c.blurb}</p>
                <ul class="tb-effects">
                  {c.effectLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** The page's picture: one slot, 240 x 180, an empty inked frame with the name when there is none. */
function Picture({ page }: { page: TownBookPageView }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    void pictureFor({ book: 'townBook', id: String(page.id) }).then((u) => {
      if (live) setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [page.id]);
  return (
    <div class="tb-picture" data-testid="town-book-picture">
      {url ? (
        <img src={url} alt={page.name} width={240} height={180} />
      ) : (
        <span class="tb-frame-name">{page.name}</span>
      )}
    </div>
  );
}

function credit(page: TownBookPageView, seats: readonly SeatView[], me: number): ComponentChildren {
  const name = (id: number) => {
    const s = seats.find((x) => x.seat === id);
    const label = s?.name || `Player ${id + 1}`;
    return (
      <b key={id} class="tb-seat" style={{ '--seat': hex(s?.color ?? 0x8a7a66) }}>
        {id === me ? `${label} (you)` : label}
      </b>
    );
  };
  const ids = page.seats.length > 0 ? page.seats : [0];
  if (page.together) {
    return (
      <>
        <span class="together">Made Together</span>{' '}
        {ids.map((id, i) => (
          <span key={id}>
            {i > 0 && ' and '}
            {name(id)}
          </span>
        ))}
      </>
    );
  }
  return <>Found by {name(ids[0]!)}</>;
}

function PageView({
  page,
  folio,
  seats,
  me,
  session,
}: {
  page: TownBookPageView;
  folio: number;
  seats: readonly SeatView[];
  me: number;
  session: Session;
}) {
  const where = page.placeName || 'a place the town has since forgotten';
  return (
    <article class="book-entry" data-testid="town-book-page">
      <Picture page={page} />
      <p class="book-kicker">
        {page.kind === 'specialty' ? 'Specialty' : 'Custom'} {folio}
      </p>
      <h3>{page.name}</h3>
      <p class="flavor">{page.text}</p>
      <dl class="book-facts">
        <div>
          <dt>Where</dt>
          <dd>
            {page.placeName ? (
              <button
                type="button"
                class="link"
                data-testid="town-book-where"
                onClick={() => (session.ui.selection.value = { kind: 'place', id: page.place })}
              >
                {where}
              </button>
            ) : (
              where
            )}
          </dd>
        </div>
        <div>
          <dt>Found</dt>
          <dd>{dayDate(page.day)}</dd>
        </div>
        <div>
          <dt>Credit</dt>
          <dd>{credit(page, seats, me)}</dd>
        </div>
        <div>
          <dt>Leaning</dt>
          <dd>{LEANING_NAMES[page.leaning]}</dd>
        </div>
      </dl>
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
