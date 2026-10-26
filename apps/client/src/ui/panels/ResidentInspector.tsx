import { content } from '@qoti/content';
import type { ResidentDetail } from '@qoti/sim';
import { useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { buildingName, dayDate } from '../format';
import { HISTORY_WORD, MOOD_LINE, MOOD_WORD, NEED_LABEL, STAGE_WORD } from '../hamlet';
import { Glyph } from '../icons';
import { Portrait } from '../Portrait';
import { Empty, Frame, Hearts, Heading, Meter, useInspect } from './parts';

type Tab = 'today' | 'story';

/** Who a resident is, how they feel and what they wish for. Coarse facts come from the Mirror at
 * once; mood, needs, friends and history arrive from the worker's inspect. */
export function ResidentInspector({ session, id }: { session: Session; id: number }) {
  const m = session.mirror;
  void m.hamletRevision.value;
  const [tab, setTab] = useState<Tab>('today');
  const detail = useInspect<ResidentDetail>(
    (k, i) => session.inspect(k, i),
    'resident',
    id,
    m.hamletRevision.value,
  );
  const r = detail?.r ?? m.residents.get(id);
  if (!r) return null;
  const species = content.speciesById.get(r.species);
  const household = m.households.get(r.householdId);
  const home = m.buildings.get(r.homeId);
  const job = r.jobId ? m.buildings.get(r.jobId) : undefined;
  const following = session.ui.following.value === id;
  const wish = detail?.wish ?? (r.wishId ? m.wishes.get(r.wishId) : undefined);
  const close = () => (session.ui.selection.value = null);
  const goTo = (buildingId: number) => {
    const b = m.buildings.get(buildingId);
    if (!b) return;
    session.ui.selection.value = { kind: 'building', id: b.id };
    session.render?.focus(b.x, b.z);
  };
  const follow = () => {
    const next = following ? null : id;
    session.ui.following.value = next;
    session.render?.follow?.(next);
  };
  const ageLine = [
    species?.name ?? r.species,
    STAGE_WORD[r.stage] ?? r.stage,
    detail ? `${detail.age.years} ${detail.age.years === 1 ? 'year' : 'years'}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Frame
      id="resident-inspector"
      class="inspector-panel resident"
      kicker={ageLine}
      title={`${r.given} ${r.family}`}
      onClose={close}
    >
      <div class="resident-top">
        <Portrait species={r.species} look={r.look} stage={r.stage} size={68} mood={r.moodBand} />
        <div class="resident-facts">
          <p class="doing">{detail?.doing ?? ''}</p>
          <div class="traits">
            {r.traits.map((t) => {
              const def = content.traitById.get(t);
              return (
                <span key={t} class="trait" title={def?.blurb}>
                  {def?.name ?? t}
                </span>
              );
            })}
          </div>
          <p class={`mood-word band-${r.moodBand}`} data-testid="mood-word">
            <b>{MOOD_WORD[r.moodBand]}</b> <span class="muted">{MOOD_LINE[r.moodBand]}</span>
          </p>
          <button
            type="button"
            class={`small-button follow ${following ? 'active' : ''}`}
            data-testid="follow"
            onClick={follow}
            title="The camera keeps them in view"
          >
            <Glyph id="eye" /> {following ? 'Following' : 'Follow'}
          </button>
        </div>
      </div>

      <dl class="facts">
        <div>
          <dt>Household</dt>
          <dd>{household ? `The ${household.family} family` : r.family}</dd>
        </div>
        <div>
          <dt>Home</dt>
          <dd>
            {home ? (
              <button type="button" class="link" onClick={() => goTo(home.id)}>
                {buildingName(home.def)}
              </button>
            ) : (
              <span class="muted">Looking for somewhere</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Work</dt>
          <dd>
            {job ? (
              <button type="button" class="link" onClick={() => goTo(job.id)}>
                {buildingName(job.def)}
              </button>
            ) : (
              <span class="muted">{r.stage === 'child' ? 'Too busy being small' : 'Between jobs'}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Fondness for the town</dt>
          <dd>
            <Hearts level={r.bond} />
          </dd>
        </div>
      </dl>

      {wish && (
        <div class="wish-card" data-testid="resident-wish">
          <Glyph id="wishes" class="wish-star" />
          <p>{wish.text}</p>
          {wish.area && (
            <button
              type="button"
              class="small-button"
              onClick={() => {
                session.ui.wishFocus.value = wish.id;
                session.render?.highlight?.({ ...wish.area!, tone: wish.lane });
                session.render?.focus(wish.area!.x, wish.area!.z);
              }}
            >
              Show me where
            </button>
          )}
        </div>
      )}

      <div class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'today'}
          class={tab === 'today' ? 'active' : ''}
          onClick={() => setTab('today')}
        >
          Feelings
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'story'}
          class={tab === 'story' ? 'active' : ''}
          data-testid="resident-story-tab"
          onClick={() => setTab('story')}
        >
          Their story
        </button>
      </div>

      {tab === 'today' ? (
        <div class="tab-body">
          {detail ? (
            <>
              <Meter label="Mood" value={detail.mood / 100} note={`${Math.round(detail.mood)}`} tone="rose" />
              <ul class="mood-lines">
                {detail.moodLines.map((l) => (
                  <li key={l.label}>
                    <span>{NEED_LABEL[l.label] ?? l.label}</span>
                    <b class={l.value >= 0 ? 'plus' : 'minus'}>
                      {l.value >= 0 ? '+' : ''}
                      {Math.round(l.value)}
                    </b>
                  </li>
                ))}
              </ul>
              <Heading>Needs</Heading>
              <div class="needs">
                {detail.needs.map(([need, value]) => (
                  <Meter
                    key={need}
                    label={NEED_LABEL[need] ?? need}
                    value={value / 100}
                    tone={value < 35 ? 'warn' : 'sage'}
                  />
                ))}
              </div>
            </>
          ) : (
            <Empty>Asking around...</Empty>
          )}
        </div>
      ) : (
        <div class="tab-body story">
          {detail?.bio && <p class="bio">{detail.bio}</p>}
          <Heading>Friends</Heading>
          {detail && detail.friends.length > 0 ? (
            <ul class="people">
              {detail.friends.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    class="link"
                    onClick={() => (session.ui.selection.value = { kind: 'resident', id: f.id })}
                  >
                    {f.name}
                  </button>
                  <Hearts level={f.level} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No close friends yet. Benches help.</Empty>
          )}
          {detail && detail.householdMembers.length > 0 && (
            <>
              <Heading>Under the same roof</Heading>
              <p class="household-line">
                {detail.householdMembers.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ', '}
                    <button
                      type="button"
                      class="link"
                      onClick={() => (session.ui.selection.value = { kind: 'resident', id: p.id })}
                    >
                      {p.name}
                    </button>
                  </span>
                ))}
              </p>
            </>
          )}
          <Heading>History</Heading>
          {detail && detail.history.length > 0 ? (
            <ol class="history">
              {[...detail.history].reverse().map((h, i) => (
                <li key={i}>
                  <span class="muted">{dayDate(h.day)}</span>
                  <span>{h.text === h.kind ? (HISTORY_WORD[h.kind] ?? h.kind) : h.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Nothing written down yet.</Empty>
          )}
        </div>
      )}
    </Frame>
  );
}
