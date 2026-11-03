// I3 (C5F): threats on screen, informing without alarming (P3, P36). During a raid a small bar with
// its only controls (ring the bell, light every lantern, open or shut the gates) and how it is
// going; after it, the result card and the captive choice (offer a home or send them off, either
// seat deciding). Warm words, clear facts, never red, never flashing.
import { content } from '@qoti/content';
import type { EntityId, RaidResultView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { CompassArrow } from '../art';
import { goodName } from '../format';
import { BAND_WORD, SIDE_WORD } from '../seasons';

/** Captured raiders waiting for a decision: the live raid's, then the ones kept after dawn. */
export function captivesOf(session: Session): EntityId[] {
  const m = session.mirror;
  const out = new Set<EntityId>(m.raid.value?.captures ?? []);
  for (const id of m.threat.value?.captives ?? []) out.add(id);
  return [...out];
}

export function RaidPanel({ session }: { session: Session }) {
  const m = session.mirror;
  const raid = m.raid.value;
  const captives = captivesOf(session);
  const card = session.ui.raidCard.value;
  return (
    <>
      {raid && <RaidBar session={session} />}
      {captives.length > 0 && !card && <CaptiveChoice session={session} ids={captives} />}
      {card && (
        <div
          class="modal-backdrop letter-backdrop"
          onClick={(e) => e.target === e.currentTarget && (session.ui.raidCard.value = null)}
        >
          <RaidResultCard result={card} onClose={() => (session.ui.raidCard.value = null)} captives={captives.length} />
        </div>
      )}
    </>
  );
}

function gates(session: Session) {
  return [...session.mirror.buildings.values()].filter(
    (b) => b.stage === 'built' && content.buildingById.get(b.def)?.defense?.passable === 'gate',
  );
}

export function RaidBar({ session }: { session: Session }) {
  const r = session.mirror.raid.value;
  if (!r) return null;
  const left = Math.max(0, r.raiders - r.fled - r.captured);
  const gs = gates(session);
  const setGates = (open: boolean) => {
    for (const g of gs) session.submit({ t: 'gate.set', id: g.id, open });
  };
  return (
    <div class="raid-bar panel" role="region" aria-label="The raid" data-testid="raid-bar">
      <CompassArrow side={r.side} />
      <div class="raid-words">
        <b>Visitors of the unwelcome sort.</b>{' '}
        <span class="small">
          {BAND_WORD[r.band]} from {SIDE_WORD[r.side]}: {left} still about, {r.fled} fled, {r.captured} caught.
        </span>
        <span class="raid-progress" aria-hidden="true">
          {Array.from({ length: r.raiders }, (_, i) => (
            <i key={i} class={i < r.captured ? 'caught' : i < r.captured + r.fled ? 'fled' : 'about'} />
          ))}
        </span>
      </div>
      <button
        type="button"
        class="ghost-button"
        data-testid="raid-bell"
        disabled={r.bell}
        title="Folk hurry indoors and the gates close"
        onClick={() => session.submit({ t: 'watch.ringBell' })}
      >
        {r.bell ? 'The bell has rung' : 'Ring the bell'}
      </button>
      <button
        type="button"
        class="ghost-button"
        data-testid="raid-lanterns"
        disabled={r.lanterns}
        title="Raiders lose heart in the light"
        onClick={() => session.submit({ t: 'watch.lightLanterns' })}
      >
        {r.lanterns ? 'Lanterns are lit' : 'Light all lanterns'}
      </button>
      {gs.length > 0 && (
        <span class="gate-pair">
          <button type="button" class="ghost-button" data-testid="raid-gates-shut" title="Raiders must break through" onClick={() => setGates(false)}>
            Shut the gates
          </button>
          <button type="button" class="link-button" data-testid="raid-gates-open" title="Let folk through again" onClick={() => setGates(true)}>
            open
          </button>
        </span>
      )}
    </div>
  );
}

export function RaidResultCard({
  result: r,
  onClose,
  captives,
}: {
  result: RaidResultView;
  onClose: () => void;
  captives: number;
}) {
  const lost = r.stolen.reduce((s, [, q]) => s + q, 0);
  const line = r.repelled
    ? lost === 0
      ? 'The gate held and not a crumb went missing. The Watch is unbearable this morning.'
      : 'Seen off, with a little taken. The Watch has already decided it was mostly a win.'
    : 'They got away with something, and the Watch has a few ideas for next time.';
  return (
    <div class="raid-result" role="dialog" aria-label="After the raid" data-testid="raid-result">
      <p class="kicker">The morning after</p>
      <h2>{r.repelled ? 'The raid was seen off' : 'The raid is over'}</h2>
      <p class="proclamation">{line}</p>
      <dl class="result-facts">
        <dt>Goods lost</dt>
        <dd data-testid="raid-lost">
          {lost === 0 ? 'Nothing' : r.stolen.map(([g, q]) => `${q} ${goodName(g).toLowerCase()}`).join(', ')}
        </dd>
        <dt>Damage</dt>
        <dd>{r.damage === 0 ? 'None' : `${r.damage} points of wear across the buildings, mendable`}</dd>
        <dt>Caught</dt>
        <dd>{r.captured}</dd>
        <dt>Renown</dt>
        <dd>{r.renown > 0 ? `+${r.renown}` : 'No change'}</dd>
        <dt>Watch morale</dt>
        <dd>{r.morale > 0 ? `+${r.morale}` : r.morale < 0 ? `${r.morale}` : 'Unmoved'}</dd>
      </dl>
      {captives > 0 && <p class="small">Some of them are waiting to hear what happens next.</p>}
      <div class="actions">
        <button type="button" class="primary" data-testid="raid-result-close" onClick={onClose}>
          {captives > 0 ? 'See to the captives' : 'Back to work'}
        </button>
      </div>
    </div>
  );
}

/** The captive choice: one card per captured raider. Either seat decides; the first answer stands. */
export function CaptiveChoice({ session, ids }: { session: Session; ids: EntityId[] }) {
  const id = ids[0]!;
  const decide = (choice: 'home' | 'send') => session.submit({ t: 'bandit.decide', id, choice });
  return (
    <div class="captive-card panel" role="dialog" aria-label="A captured raider" data-testid="captive-choice">
      <p class="kicker">
        {ids.length > 1 ? `${ids.length} captured, one at a time` : 'Caught by the Watch'}
      </p>
      <p>
        They look cold, a bit sheepish and very hungry. Bandits are a gang, not a species: anyone
        might be one, and anyone might stop.
      </p>
      <div class="actions">
        <button type="button" class="primary" data-testid="captive-home" onClick={() => decide('home')}>
          Offer them a home
        </button>
        <button type="button" class="ghost-button" data-testid="captive-send" onClick={() => decide('send')}>
          Send them off
        </button>
      </div>
      <p class="small muted">A home means a new neighbor with a past. Sending them off spreads the word: renown +1.</p>
    </div>
  );
}
