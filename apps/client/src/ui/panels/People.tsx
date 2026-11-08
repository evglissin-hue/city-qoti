import { content } from '@qoti/content';
import type { ResidentView } from '@qoti/sim';
import { useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { MOOD_WORD, TIER_WORD } from '../hamlet';
import { Portrait } from '../Portrait';
import { Empty, Frame } from './parts';

type Filter = 'all' | 'working' | 'looking' | 'unhappy' | 'children' | 'elders';

const FILTERS: [Filter, string][] = [
  ['all', 'Everyone'],
  ['working', 'At work'],
  ['looking', 'Looking for work'],
  ['unhappy', 'Unhappy'],
  ['children', 'Children'],
  ['elders', 'Elders'],
];

/** Of working age: grown, not yet retired. */
const canWork = (r: ResidentView) => r.stage === 'young' || r.stage === 'adult';

/** What a resident does all day, in a few words. */
function occupation(session: Session, r: ResidentView): string {
  if (r.stage === 'child') return 'Too small for work';
  if (r.stage === 'elder' && !r.jobId) return 'Retired, and enjoying it';
  if (!r.jobId) return 'Looking for work';
  const b = session.mirror.buildings.get(r.jobId);
  return content.buildingById.get(b?.def ?? '')?.name ?? 'Working';
}

/**
 * Playtest: the townsfolk at a glance, from the population chip. Who works where, who is looking,
 * how content everyone is; a row opens that resident in the inspector and finds their home.
 */
export function PeoplePanel({ session }: { session: Session }) {
  const m = session.mirror;
  void m.hamletRevision.value;
  void m.revision.value;
  const [filter, setFilter] = useState<Filter>('all');
  const all = [...m.residents.values()];
  const working = all.filter((r) => r.jobId);
  const looking = all.filter((r) => canWork(r) && !r.jobId);
  const bands = [0, 0, 0, 0, 0];
  for (const r of all) bands[r.moodBand] = (bands[r.moodBand] ?? 0) + 1;
  const average = all.length ? Math.round(all.reduce((a, r) => a + r.moodBand, 0) / all.length) : 2;
  const shown = all
    .filter((r) => {
      switch (filter) {
        case 'working':
          return !!r.jobId;
        case 'looking':
          return canWork(r) && !r.jobId;
        case 'unhappy':
          return r.moodBand <= 1;
        case 'children':
          return r.stage === 'child';
        case 'elders':
          return r.stage === 'elder';
        default:
          return true;
      }
    })
    .sort(
      (a, b) => a.moodBand - b.moodBand || a.family.localeCompare(b.family) || a.given.localeCompare(b.given),
    );
  const pick = (r: ResidentView) => {
    session.ui.selection.value = { kind: 'resident', id: r.id };
    const home = m.buildings.get(r.homeId);
    if (home) session.render?.focus(home.x, home.z);
  };

  return (
    <Frame
      id="people"
      class="book-panel people"
      icon="people"
      kicker="Who lives here"
      title="The townsfolk"
      onClose={() => (session.ui.panel.value = null)}
    >
      {all.length === 0 ? (
        <Empty>Nobody yet. The first family is on the road, probably arguing about the map.</Empty>
      ) : (
        <>
          <div class="people-summary">
            <div>
              <b>{all.length}</b> {all.length === 1 ? 'resident' : 'residents'} in <b>{m.households.size}</b>{' '}
              {m.households.size === 1 ? 'household' : 'households'}
            </div>
            <div>
              <b>{working.length}</b> at work
              {looking.length > 0 ? (
                <>
                  , <b class="warn">{looking.length}</b> looking for work
                </>
              ) : (
                ', nobody idle'
              )}
            </div>
            <div class="mood-spread" title="How the town feels, unhappiest on the left">
              {bands.map((n, i) => (
                <span
                  key={i}
                  class={`band band-${i}`}
                  style={{ flexGrow: Math.max(n, 0.0001) }}
                  title={`${MOOD_WORD[i]}: ${n}`}
                />
              ))}
            </div>
            <div class="muted">On the whole: {MOOD_WORD[average]?.toLowerCase()}.</div>
          </div>
          <div class="people-filters" role="tablist">
            {FILTERS.map(([f, label]) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                class={filter === f ? 'active' : ''}
                data-testid={`people-${f}`}
                onClick={() => setFilter(f)}
              >
                {label}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <Empty>Nobody here, which is good news or no news.</Empty>
          ) : (
            <ul class="people-list">
              {shown.map((r) => {
                const species = content.speciesById.get(r.species)?.name ?? r.species;
                return (
                  <li key={r.id}>
                    <button type="button" data-testid={`person-${r.id}`} onClick={() => pick(r)}>
                      <Portrait
                        species={r.species}
                        look={r.look}
                        stage={r.stage}
                        size={34}
                        mood={r.moodBand}
                      />
                      <span class="who">
                        <b>
                          {r.given} {r.family}
                        </b>
                        <span class="muted">
                          {species}, {TIER_WORD[r.tier] ?? r.tier}
                        </span>
                      </span>
                      <span class={`what ${!r.jobId && canWork(r) ? 'warn' : ''}`}>
                        {occupation(session, r)}
                      </span>
                      <span class={`mood band-${r.moodBand}`}>{MOOD_WORD[r.moodBand]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Frame>
  );
}
