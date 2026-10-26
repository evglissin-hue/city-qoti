import { calendar, SEASON_NAMES, TICKS_PER_DAY, type ChronicleEntryView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { formatDate } from '../format';
import { Empty, Frame } from './parts';

const KIND_MARK: Record<string, string> = {
  founding: 'Founded',
  'household-arrived': 'Arrivals',
  'household-left': 'Farewells',
  'first-of': 'Firsts',
  'pattern-discovered': 'The Pattern Book',
  achievement: 'Plaques',
  'wishes-digest': 'Wishes',
  'season-summary': 'The season',
};

/** Groups entries by in-game day, newest day first, entries in order within a day. */
export function chronicleDays(
  entries: readonly ChronicleEntryView[],
): { day: number; entries: ChronicleEntryView[] }[] {
  const days = new Map<number, ChronicleEntryView[]>();
  for (const e of entries) {
    const day = Math.floor(e.tick / TICKS_PER_DAY);
    const list = days.get(day) ?? [];
    list.push(e);
    days.set(day, list);
  }
  return [...days].sort((a, b) => b[0] - a[0]).map(([day, list]) => ({ day, entries: list }));
}

function dayLine(tick: number): string {
  const c = calendar(tick);
  return `${SEASON_NAMES[c.season]}, day ${c.day}, Year ${c.year}`;
}

/** The town's history as a small gazette, newest news first. */
export function ChroniclePanel({ session }: { session: Session }) {
  const m = session.mirror;
  const entries = m.chronicle.value;
  const town = m.settings.value.townName;
  const days = chronicleDays(entries);
  const close = () => (session.ui.panel.value = null);
  return (
    <Frame id="chronicle" class="book-panel chronicle" onClose={close} title={<Masthead town={town} />}>
      <p class="gazette-dateline">
        <span>{formatDate(m.tick.value)}</span>
        <span>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </p>
      {days.length === 0 ? (
        <Empty>Nothing has happened yet. Give it a morning.</Empty>
      ) : (
        <div class="gazette" data-testid="chronicle-entries">
          {days.map(({ day, entries: list }, i) => (
            <section key={day} class={`gazette-day ${i === 0 ? 'lead' : ''}`}>
              <h4 class="gazette-day-head">{dayLine(list[0]!.tick)}</h4>
              {list.map((e) => (
                <article key={e.id} class={`gazette-entry kind-${e.kind}`}>
                  {KIND_MARK[e.kind] && <span class="gazette-kind">{KIND_MARK[e.kind]}</span>}
                  <p>{e.text}</p>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </Frame>
  );
}

function Masthead({ town }: { town: string }) {
  return (
    <span class="masthead">
      <span class="masthead-the">The</span> {town} Chronicle
    </span>
  );
}
