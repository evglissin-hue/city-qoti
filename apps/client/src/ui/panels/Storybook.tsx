// R3G: the storybook of the valley. When a chapter closes, this book lays it out for the browser's own
// print dialog, to paper or a file: the cover with the valley's endpaper map, a foreword, the
// chapter's Chronicle with its pictures, the Pattern Book and Town Book pages found, and the folk.
// The panel on screen is the title page and the Print button; the book itself is drawn into a print
// root on <body> that only `@media print` shows, and only while this panel is open (storybook.css),
// so printing anything else is unchanged. Made from the Mirror alone; nothing here is sim state.
import type { EntityId } from '@qoti/sim';
import { effect } from '@preact/signals';
import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useMemo, useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { fetchSnapshot } from '../../app/snapshots';
import { endpaperStill } from '../../render/endpaper';
import { Glyph } from '../icons';
import { Portrait } from '../Portrait';
import type { PictureRef } from '../pictures';
import {
  chapterPatternPages,
  chapterSeasons,
  chapterSpan,
  chapterTownBookPages,
  seatName,
  slotPicture,
  storybookChapters,
  storyHouseholds,
  townBookOf,
  type SlotPicture,
  type StoryEntry,
  type StoryHousehold,
  type StoryPage,
  type StorySeason,
  type StorybookChapter,
} from '../storybook';
import { Empty, Frame } from './parts';
import '../storybook.css';

export type Paper = 'a4' | 'letter';

/** The panel's id in the registry. */
const STORYBOOK = 'storybook';

const PAPER_KEY = 'qoti.storybook.paper';

/** The paper a printer near this player most likely holds: Letter in the Americas that use it. */
export function defaultPaper(lang: string | undefined): Paper {
  return /-(US|CA|MX|PH|CL|CO|VE|GT|CR|PA|DO|PR)$/i.test(lang ?? '') ? 'letter' : 'a4';
}

function savedPaper(): Paper {
  try {
    const v = localStorage.getItem(PAPER_KEY);
    if (v === 'a4' || v === 'letter') return v;
  } catch {
    // Storage blocked: fall back to the language's guess.
  }
  return defaultPaper(typeof navigator === 'undefined' ? undefined : navigator.language);
}

/** Where each picture slot stands: still looking (undefined), found, or empty (null). */
type Pictures = ReadonlyMap<string, SlotPicture | null>;

const slotKey = (ref: PictureRef) => `${ref.book}:${ref.id}`;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A list in words: "a, b and c". */
function inWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** What the chapter holds, counted from its own entries, for the foreword. */
export function forewordCounts(seasons: readonly StorySeason[], patterns: number, pages: number): string[] {
  const count = (kind: string) =>
    seasons.reduce((n, s) => n + s.entries.filter((e) => e.kind === kind).length, 0);
  const lines: [number, string, string][] = [
    [count('household-arrived'), 'household moves in', 'households move in'],
    [count('birth'), 'child is born', 'children are born'],
    [count('wedding'), 'couple marries', 'couples marry'],
    [count('festival'), 'festival is held', 'festivals are held'],
    [
      count('first-sighting'),
      'creature is spotted for the first time',
      'creatures are spotted for the first time',
    ],
    [count('achievement'), 'plaque goes up', 'plaques go up'],
    [patterns, 'page of the Pattern Book is written', 'pages of the Pattern Book are written'],
    [pages, 'page of the Town Book is found', 'pages of the Town Book are found'],
  ];
  return lines
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${NUMBER_WORDS[n] ?? n} ${n === 1 ? one : many}`);
}

/** Small numbers in words, as a book sets them ("one child is born"); larger ones in figures. */
const NUMBER_WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

/** The storybook panel: the chapter's title page on screen, and the book itself in the print root. */
export function StorybookPanel({ session }: { session: Session }) {
  const m = session.mirror;
  void m.revision.value;
  void m.hamletRevision.value;
  void m.villageRevision.value;
  const chapters = storybookChapters(m);
  const [pick, setPick] = useState<string | null>(null);
  const chapter = chapters.find((c) => c.id === pick) ?? chapters[chapters.length - 1] ?? null;
  const close = () => (session.ui.panel.value = null);
  return (
    <Frame
      id="storybook"
      class="book-panel storybook-panel"
      kicker="The storybook of the valley"
      title={chapter ? chapter.name : 'The storybook'}
      icon="chronicle"
      onClose={close}
    >
      {chapter ? (
        <ChapterBook session={session} chapter={chapter} chapters={chapters} onPick={setPick} />
      ) : (
        <Empty>
          The storybook binds itself when a chapter closes: for now, when the Village stands its first winter
          and the County seals the Charter. Until then the Chronicle keeps the notes, and very neatly too.
        </Empty>
      )}
    </Frame>
  );
}

function ChapterBook({
  session,
  chapter,
  chapters,
  onPick,
}: {
  session: Session;
  chapter: StorybookChapter;
  chapters: StorybookChapter[];
  onPick: (id: string) => void;
}) {
  const m = session.mirror;
  const settings = m.settings.value;
  const seasons = useMemo(
    () => chapterSeasons(m.chronicle.value, chapter),
    [m.chronicle.value, chapter.from, chapter.to],
  );
  const patterns = chapterPatternPages(m, chapter);
  const townPages = chapterTownBookPages(townBookOf(m), m.seats.value, chapter);
  const households = storyHouseholds(m);
  const [paper, setPaper] = useState<Paper>(savedPaper);
  const [map, setMap] = useState<string | null | undefined>(undefined);
  const [pictures, setPictures] = useState<Pictures>(new Map());
  const entries = seasons.flatMap((s) => s.entries);

  // The cover's map: a still of the endpaper at print resolution, through the render API when the
  // valley is on screen, else drawn directly from the Mirror.
  useEffect(() => {
    let url: string | null = null;
    let gone = false;
    const still = session.render?.endpaperStill?.(2048) ?? endpaperStill(m, { size: 2048 });
    void still.then((blob) => {
      if (gone) return;
      url = blob && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : null;
      setMap(url);
    });
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [chapter.id]);

  // Every slot's picture: the registered source's (V4B), else the valley's own snapshot.
  useEffect(() => {
    let gone = false;
    const found = new Map<string, SlotPicture | null>();
    const snapshot = (id: EntityId, notable: boolean) => async () => {
      if (!session.ui.snapshots.value.has(id) && notable) await fetchSnapshot(session, id);
      return session.ui.snapshots.value.get(id) ?? null;
    };
    const asks: [PictureRef, (() => Promise<string | null>) | null][] = [
      ...entries.map((e): [PictureRef, () => Promise<string | null>] => [
        { book: 'chronicle', id: String(e.id) },
        snapshot(e.id, e.notable),
      ]),
      ...patterns.map((p): [PictureRef, (() => Promise<string | null>) | null] => [
        { book: 'patternBook', id: p.id },
        p.chronicleId !== undefined ? snapshot(p.chronicleId, true) : null,
      ]),
      ...townPages.map((p): [PictureRef, null] => [{ book: 'townBook', id: p.id }, null]),
    ];
    void Promise.all(
      asks.map(async ([ref, fallback]) => found.set(slotKey(ref), await slotPicture(ref, fallback))),
    ).then(() => {
      if (!gone) setPictures(found);
    });
    return () => {
      gone = true;
    };
  }, [chapter.id, entries.length, patterns.length, townPages.length]);

  const choosePaper = (p: Paper) => {
    setPaper(p);
    try {
      localStorage.setItem(PAPER_KEY, p);
    } catch {
      // Not remembered this time; the choice still holds while the book is open.
    }
  };
  const ready = map !== undefined && pictures.size === entries.length + patterns.length + townPages.length;
  const pictured = entries.filter((e) => pictures.get(`chronicle:${e.id}`)).length;
  const folk = households.reduce((n, h) => n + h.folk.length, 0);
  const keepers = keepersOf(session);

  return (
    <>
      <div class="storybook-title">
        <figure class="storybook-thumb">
          {map ? (
            <img src={map} alt={`The map of ${settings.valleyName}`} />
          ) : (
            <span class="storybook-thumb-wait" />
          )}
        </figure>
        <div>
          <p class="storybook-town">{settings.townName}</p>
          <p class="small muted">
            {chapterSpan(chapter)}. Kept by {keepers}.
          </p>
          {chapters.length > 1 && (
            <label class="storybook-pick">
              Chapter{' '}
              <select value={chapter.id} onChange={(e) => onPick((e.target as HTMLSelectElement).value)}>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      <ul class="storybook-contents" data-testid="storybook-contents">
        <li>
          <b>The cover</b>: the valley&apos;s map, as the endpaper draws it.
        </li>
        <li>
          <b>The Chronicle</b>: {plural(entries.length, 'entry', 'entries')}
          {pictured > 0 ? `, ${plural(pictured, 'with its picture', 'with their pictures')}` : ''}.
        </li>
        <li>
          <b>The Pattern Book</b>: {plural(patterns.length, 'page', 'pages')} noticed.
        </li>
        <li>
          <b>The Town Book</b>:{' '}
          {townPages.length ? `${plural(townPages.length, 'page', 'pages')} found.` : 'blank this chapter.'}
        </li>
        <li>
          <b>The folk</b>: {plural(folk, 'portrait', 'portraits')}.
        </li>
      </ul>
      <fieldset class="storybook-paper" data-testid="storybook-paper">
        <legend>Paper</legend>
        {(['a4', 'letter'] as const).map((p) => (
          <label key={p}>
            <input
              type="radio"
              name="storybook-paper"
              checked={paper === p}
              onChange={() => choosePaper(p)}
            />{' '}
            {p === 'a4' ? 'A4' : 'US Letter'}
          </label>
        ))}
      </fieldset>
      <p class="small muted">
        The print dialog does the rest: a printer, or Save as PDF for a copy that never gets coffee on it.
      </p>
      <div class="actions">
        <button
          type="button"
          class="primary"
          data-testid="storybook-print-button"
          disabled={!ready}
          onClick={() => window.print()}
        >
          <Glyph id="chronicle" /> {ready ? 'Print the storybook' : 'Setting the type...'}
        </button>
      </div>
      <PrintRoot session={session}>
        <PrintedBook
          town={settings.townName}
          valley={settings.valleyName}
          keepers={keepers}
          chapter={chapter}
          seasons={seasons}
          patterns={patterns}
          townPages={townPages}
          households={households}
          map={map ?? null}
          pictures={pictures}
          paper={paper}
          ready={ready}
        />
      </PrintRoot>
    </>
  );
}

/** "Ada and Bo": the seats that have played this valley. */
function keepersOf(session: Session): string {
  const seats = session.mirror.seats.value;
  const list = seats.length ? seats.map((s) => s.seat) : [session.seat];
  return inWords(list.map((s) => seatName(seats, s)));
}

/** The book's root on <body>, marked so the print stylesheet shows it and nothing else. */
function PrintRoot({ session, children }: { session: Session; children: preact.ComponentChildren }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = document.createElement('div');
    el.className = 'storybook-print';
    el.setAttribute('data-testid', 'storybook-print');
    document.body.appendChild(el);
    document.body.classList.add('qoti-storybook');
    setRoot(el);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      document.body.classList.remove('qoti-storybook');
      el.remove();
    };
    // Every way out lets go at once, not when the unmount's cleanup gets round to it: the close
    // button, Escape and another book all move the open panel, and a print after that must print
    // the valley, not the book. The cleanup below is the backstop for an unmount from anywhere else.
    const stop = effect(() => {
      if (session.ui.panel.value !== STORYBOOK) release();
    });
    return () => {
      stop();
      release();
    };
  }, []);
  return root ? createPortal(<>{children}</>, root) : null;
}

const PAGE_SIZE: Record<Paper, string> = { a4: 'A4', letter: 'letter' };

/**
 * The page rules, written into the print root so they exist only while the storybook is open (an
 * `@page` rule in a stylesheet would reach every print). Margins suit a home printer's unprintable
 * edge; the folio and the running head sit in the margin boxes, and the cover has neither.
 */
export function pageRules(paper: Paper, running: string): string {
  const head = running.replace(/["\\]/g, '');
  return [
    `@page { size: ${PAGE_SIZE[paper]}; margin: 19mm 18mm 20mm 18mm;`,
    `  @top-center { content: "${head}"; font: italic 8.5pt Alegreya, Georgia, serif; color: #8a7660; }`,
    `  @bottom-center { content: counter(page); font: 9pt Alegreya, Georgia, serif; color: #6b5a48; } }`,
    `@page :first { margin: 16mm 18mm; @top-center { content: none; } @bottom-center { content: none; } }`,
  ].join('\n');
}

function PrintedBook(props: {
  town: string;
  valley: string;
  keepers: string;
  chapter: StorybookChapter;
  seasons: StorySeason[];
  patterns: StoryPage[];
  townPages: StoryPage[];
  households: StoryHousehold[];
  map: string | null;
  pictures: Pictures;
  paper: Paper;
  ready: boolean;
}) {
  const { town, valley, chapter, seasons, patterns, townPages, households, pictures } = props;
  const printed = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const counts = forewordCounts(seasons, patterns.length, townPages.length);
  return (
    <article class={`storybook paper-${props.paper}`} lang="en-US" data-ready={props.ready ? 'yes' : 'no'}>
      <style>{pageRules(props.paper, `${town}, ${chapter.name.replace(/^The /, 'the ')}`)}</style>

      <section class="sb-cover" data-testid="storybook-cover">
        <p class="sb-cover-kicker">A storybook of the valley</p>
        <h1 class="sb-cover-town">{town}</h1>
        <p class="sb-cover-chapter">{chapter.name}</p>
        <figure class="sb-cover-map">
          {props.map ? (
            <img src={props.map} alt={`The map of ${valley}`} data-testid="storybook-map" />
          ) : (
            <span class="sb-cover-nomap">{valley}</span>
          )}
        </figure>
        <p class="sb-cover-span">{chapterSpan(chapter)}</p>
        <p class="sb-cover-keepers">
          {town}, in {valley}. Kept by {props.keepers}.
        </p>
      </section>

      <section class="sb-foreword">
        <h2 class="sb-section">Before we begin</h2>
        <p class="sb-lead">
          This is the story of {town}, from its first spring morning in {valley} to the day the County sealed
          the Village Charter. It was written as it happened by the town&apos;s own gazette, which was there
          for all of it and has opinions.
        </p>
        {counts.length > 0 && (
          <p>In these pages {inWords(counts)}. Nobody was asked to hurry, and mostly nobody did.</p>
        )}
        <ul class="sb-contents">
          <li>The Chronicle</li>
          <li>The Pattern Book</li>
          <li>The Town Book</li>
          <li>The folk of {town}</li>
        </ul>
        <p class="sb-printed">Printed on {printed}.</p>
      </section>

      <section class="sb-chronicle" data-testid="storybook-chronicle">
        <h2 class="sb-section">
          <span class="sb-section-the">The</span> Chronicle
        </h2>
        <div class="sb-cols">
          {seasons.map((s, si) => [
            <h3 key={`head-${s.key}`} class="sb-season-head">
              {s.title}
            </h3>,
            ...s.entries.map((e, i) => (
              <Entry
                key={e.id}
                entry={e}
                picture={pictures.get(`chronicle:${e.id}`) ?? null}
                first={si === 0 && i === 0}
              />
            )),
          ])}
        </div>
      </section>

      <section class="sb-book" data-testid="storybook-patterns">
        <h2 class="sb-section">
          <span class="sb-section-the">The</span> Pattern Book
        </h2>
        <p class="sb-book-blurb">
          Pages noticed in this chapter: the places people started giving directions by.
        </p>
        {patterns.length ? (
          patterns.map((p) => (
            <BookPage key={p.id} page={p} picture={pictures.get(`patternBook:${p.id}`) ?? null} />
          ))
        ) : (
          <p class="sb-quiet">No pages this chapter. The Pattern Book is patient, and has a pencil.</p>
        )}
      </section>

      <section class="sb-book" data-testid="storybook-townbook">
        <h2 class="sb-section">
          <span class="sb-section-the">The</span> Town Book
        </h2>
        <p class="sb-book-blurb">The specialties and customs the town made its own.</p>
        {townPages.length ? (
          townPages.map((p) => (
            <BookPage key={p.id} page={p} picture={pictures.get(`townBook:${p.id}`) ?? null} />
          ))
        ) : (
          <p class="sb-quiet">
            Still blank when this chapter closed. A custom takes a few good evenings to become one.
          </p>
        )}
      </section>

      <section class="sb-folk" data-testid="storybook-folk">
        <h2 class="sb-section">
          <span class="sb-section-the">The</span> folk of {town}
        </h2>
        <p class="sb-book-blurb">
          {plural(
            households.reduce((n, h) => n + h.folk.length, 0),
            'resident',
            'residents',
          )}{' '}
          in {plural(households.length, 'household', 'households')}, as they were when this book was printed.
        </p>
        <div class="sb-households">
          {households.map((h) => (
            <div key={h.id} class="sb-household">
              <h4>The {h.family} household</h4>
              <div class="sb-faces">
                {h.folk.map((r) => (
                  <figure key={r.id} class="sb-face">
                    <Portrait species={r.species} look={r.look} stage={r.stage} mood={r.moodBand} size={64} />
                    <figcaption>{r.given}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section class="sb-end">
        <p class="sb-fleuron" aria-hidden="true">
          ❦
        </p>
        <p>
          Here ends {chapter.name.replace(/^The /, 'the ')} of {town}. The next one is already being written,
          mostly by the gazette, which never sleeps and rarely knocks.
        </p>
      </section>
    </article>
  );
}

function Entry({
  entry,
  picture,
  first,
}: {
  entry: StoryEntry;
  picture: SlotPicture | null;
  first: boolean;
}) {
  const cls = [
    'sb-entry',
    entry.brief && !picture ? 'brief' : '',
    picture ? 'pictured' : '',
    first ? 'first' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div class={cls} data-kind={entry.kind}>
      {picture && (
        <figure class="sb-picture" data-testid="storybook-entry-picture">
          <img src={picture.url} alt="" />
        </figure>
      )}
      <p class="sb-entry-head">
        {entry.mark && <span class="sb-mark">{entry.mark}</span>}
        <span class="sb-date">{entry.date}</span>
      </p>
      <p class="sb-entry-text">{entry.text}</p>
    </div>
  );
}

function BookPage({ page, picture }: { page: StoryPage; picture: SlotPicture | null }) {
  return (
    <div class={`sb-page ${page.book}`} data-testid={`storybook-page-${page.book}`}>
      <figure class={`sb-slot ${picture ? '' : 'empty'}`}>
        {picture ? (
          <img src={picture.url} alt="" />
        ) : (
          <span class="sb-slot-room">
            Room for a picture of
            <br />
            <i>{page.place ?? page.name}</i>
          </span>
        )}
      </figure>
      <div class="sb-page-words">
        <h4>{page.name}</h4>
        {page.place && <p class="sb-page-place">At {page.place}</p>}
        {page.text && <p class="sb-page-text">{page.text}</p>}
        <p class="sb-page-found">
          {page.found}
          {page.credit ? `, by ${page.credit}` : ''}.
        </p>
      </div>
    </div>
  );
}
