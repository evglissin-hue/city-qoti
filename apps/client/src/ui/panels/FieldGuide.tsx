// I3 (C5F): the Field Guide, a naturalist's notebook. A contents page of every creature seen and the
// blank pages still waiting (with three hints), then a page per species: line art, where and when
// it was first seen, by whom, how often since, its line, and its habitats drawn on the valley.
import { content } from '@qoti/content';
import {
  calendar,
  CHUNK_SIZE,
  CHUNKS_PER_SIDE,
  HABITAT_IDS,
  SEASON_NAMES,
  type FieldGuideEntryView,
} from '@qoti/sim';
import type { Session } from '../../app/session';
import { CreatureArt } from '../art';
import { Empty, Frame } from './parts';
import { speciesName } from '../seasons';

const HABITAT_WORD: Record<string, string> = {
  pollinator: 'flowers and blossom',
  wetland: 'ponds and reedy banks',
  hedgerow: 'hedges and shrubs',
  woodland: 'old trees and deep wood',
  meadow: 'unmown meadow',
  garden: 'garden nooks and old walls',
};

const KIND_WORD: Record<string, string> = {
  bird: 'Birds',
  insect: 'Insects',
  amphibian: 'Frogs and newts',
  fish: 'Fish',
  mammal: 'Mammals',
};

function hourWord([from, to]: [number, number]): string {
  if (from >= 18 || to <= 6) return 'at night';
  if (from >= 15) return 'in the evening';
  if (to <= 11) return 'in the morning';
  return 'by day';
}

/** Three hints for creatures not yet seen, the rarest last (from content: habitat, season, hour). */
export function fieldGuideHints(seen: ReadonlySet<string>, season: number): string[] {
  const out: string[] = [];
  const waiting = content.wildlife
    .filter((w) => !seen.has(w.id))
    .sort(
      (a, b) =>
        Number(b.seasons.includes(season)) - Number(a.seasons.includes(season)) || b.rarity - a.rarity,
    );
  for (const w of waiting.slice(0, 3)) {
    const where = w.habitats.map(([h]) => HABITAT_WORD[h] ?? h).join(' and ') || 'somewhere quiet';
    const when =
      w.seasons.length >= 4 ? 'any time of year' : w.seasons.map((s) => SEASON_NAMES[s]).join(' or ');
    out.push(
      `Something ${KIND_WORD[w.kind]?.toLowerCase() ?? 'small'}-ish likes ${where}, ${when}, ${hourWord(w.hours)}.`,
    );
  }
  while (out.length < 3)
    out.push(
      [
        'A pond with reeds at the edge draws more than frogs.',
        'Leave a corner unmown. Something always moves in.',
        'Hedges are hotels with no front desk.',
      ][out.length]!,
    );
  return out;
}

/** Tiles of the chunks where a habitat scores at least `min`, for the valley highlight. */
export function habitatTiles(
  habitats: ReadonlyMap<number, number[]>,
  habitat: string,
  min = 40,
): [number, number][] {
  const h = HABITAT_IDS.indexOf(habitat as (typeof HABITAT_IDS)[number]);
  if (h < 0) return [];
  const out: [number, number][] = [];
  for (const [chunk, scores] of habitats) {
    if ((scores[h] ?? 0) < min) continue;
    const cx = (chunk % CHUNKS_PER_SIDE) * CHUNK_SIZE;
    const cz = Math.floor(chunk / CHUNKS_PER_SIDE) * CHUNK_SIZE;
    // Every other tile is plenty for a wash and keeps the highlight light.
    for (let z = 0; z < CHUNK_SIZE; z += 2)
      for (let x = (z / 2) % 2; x < CHUNK_SIZE; x += 2) out.push([cx + x, cz + z]);
  }
  return out;
}

export function FieldGuidePanel({ session }: { session: Session }) {
  const m = session.mirror;
  void m.seasonsRevision.value;
  const page = session.ui.guidePage.value;
  const entries = [...m.fieldGuide.values()].sort((a, b) => a.firstTick - b.firstTick);
  const close = () => {
    session.ui.panel.value = null;
    session.render?.highlight?.(null);
  };
  const entry = page ? entries.find((e) => e.species === page) : undefined;
  return (
    <Frame
      id="field-guide"
      class="book-panel field-guide"
      icon="fieldguide"
      kicker="A naturalist's notebook"
      title="The Field Guide"
      onClose={close}
    >
      {entry ? (
        <SpeciesPage session={session} entry={entry} />
      ) : (
        <Contents session={session} entries={entries} />
      )}
    </Frame>
  );
}

function Contents({ session, entries }: { session: Session; entries: FieldGuideEntryView[] }) {
  const seen = new Set(entries.map((e) => e.species));
  const season = calendar(session.mirror.tick.value).season;
  const blank = Math.max(0, content.wildlife.length - entries.length);
  return (
    <div class="notebook-page">
      <p class="notebook-count" data-testid="guide-count">
        {entries.length} {entries.length === 1 ? 'creature' : 'creatures'} noted
        {content.wildlife.length > 0 && ` of ${content.wildlife.length}`}
      </p>
      {entries.length === 0 ? (
        <Empty>No pages yet. Plant something, dig a pond, and keep your eyes open.</Empty>
      ) : (
        <ul class="guide-list" data-testid="guide-entries">
          {entries.map((e, i) => (
            <li key={e.species}>
              <button
                type="button"
                class="guide-entry"
                data-testid={`guide-${e.species}`}
                onClick={() => (session.ui.guidePage.value = e.species)}
              >
                <CreatureArt kind={content.wildlifeById.get(e.species)?.kind ?? e.kind} seed={i} />
                <span class="guide-name">{speciesName(e.species, e.name)}</span>
                <span class="small muted">seen {e.count === 1 ? 'once' : `${e.count} times`}</span>
              </button>
            </li>
          ))}
          {Array.from({ length: Math.min(blank, 6) }, (_, i) => (
            <li key={`blank-${i}`} class="guide-blank" aria-hidden="true">
              <span>?</span>
            </li>
          ))}
        </ul>
      )}
      <section class="guide-hints" data-testid="guide-hints">
        <h4>Margin notes</h4>
        <ul>
          {fieldGuideHints(seen, season).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SpeciesPage({ session, entry }: { session: Session; entry: FieldGuideEntryView }) {
  const m = session.mirror;
  const def = content.wildlifeById.get(entry.species);
  const c = calendar(entry.firstTick);
  const seats = m.seats.value;
  const by = entry.seats.map((s) => seats.find((x) => x.seat === s)?.name ?? `Seat ${s + 1}`);
  const show = (habitat: string) =>
    session.render?.highlight?.({ tiles: habitatTiles(m.habitats, habitat), tone: 'hearth' });
  return (
    <article class="notebook-page species-page" data-testid="species-page">
      <button type="button" class="link-button back" onClick={() => (session.ui.guidePage.value = null)}>
        ← All the pages
      </button>
      <h3 class="species-name">{speciesName(entry.species, entry.name)}</h3>
      <div class="species-art">
        <CreatureArt kind={def?.kind ?? entry.kind} seed={entry.firstTick} />
      </div>
      {(def?.flavor || entry.flavor) && <p class="species-flavor">{def?.flavor || entry.flavor}</p>}
      <dl class="species-facts">
        <dt>First seen</dt>
        <dd data-testid="species-first">
          {SEASON_NAMES[c.season]}, day {c.day}, Year {c.year}
        </dd>
        <dt>Noted by</dt>
        <dd>{by.join(' and ')}</dd>
        <dt>Seen</dt>
        <dd>{entry.count === 1 ? 'Once' : `${entry.count} times`}</dd>
        {def && (
          <>
            <dt>About</dt>
            <dd>
              {def.seasons.length >= 4 ? 'All year' : def.seasons.map((s) => SEASON_NAMES[s]).join(', ')},{' '}
              {hourWord(def.hours)}
            </dd>
          </>
        )}
      </dl>
      {def && def.habitats.length > 0 && (
        <p class="species-habitats">
          Likes{' '}
          {def.habitats.map(([h], i) => (
            <span key={h}>
              {i > 0 && ' and '}
              <button type="button" class="link-button" data-testid={`habitat-${h}`} onClick={() => show(h)}>
                {HABITAT_WORD[h] ?? h}
              </button>
            </span>
          ))}
          . Click to see where the valley has it.
        </p>
      )}
    </article>
  );
}
