import type { Speed } from '@qoti/sim';
import type { Session } from '../app/session';
import { coinCount, coins, speedNote } from './format';
import { GoalPill } from './GoalPill';
import { Glyph } from './icons';
import { Clock } from './topbar/Clock';
import { TopMenu } from './topbar/Menu';
import { HearthStrip, LedgerStrip } from './topbar/Strips';
import { RANK_WORD } from './village';
import './topbar/topbar.css';

const SPEEDS: { speed: Speed; icon: string; title: string }[] = [
  { speed: 0, icon: 'pause', title: 'Pause (Space)' },
  { speed: 1, icon: 'play', title: 'Normal speed (1)' },
  { speed: 2, icon: 'fast', title: 'Double speed (2)' },
  { speed: 3, icon: 'faster', title: 'Triple speed (3)' },
];

/**
 * R1C: one calm row. Town, coins, rank and goal, the lens strip in the middle, the clock, speed
 * and one menu button that holds the rest (seats, connection, invite, townsfolk, settings, help,
 * leave). The clock is its own component so only it re-renders each tick.
 */
export function TopBar({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const m = session.mirror;
  const speed = m.clock.value.speed;
  const seats = m.seats.value;
  const settings = m.settings.value;
  const mine = session.myDesiredSpeed();
  const note = speedNote(seats, speed, session.seat, settings.togetherOnly);
  const standard = settings.mode === 'standard';
  const lens = session.ui.lens.value;

  return (
    <header class="topbar panel">
      <div class="topbar-town">
        <strong>{settings.townName}</strong>
        <span class="muted">{settings.valleyName}</span>
      </div>
      {standard && <TownStats session={session} />}
      <div class="topbar-middle">
        {standard &&
          (lens === 'hearth' ? <HearthStrip session={session} /> : <LedgerStrip session={session} />)}
      </div>
      <Clock session={session} />
      <div
        class="topbar-speed"
        role="group"
        aria-label="Game speed"
        title={`Game speed${note ? `. ${note}` : ''}`}
      >
        {SPEEDS.map((s) => (
          <button
            key={s.speed}
            type="button"
            class={`speed ${speed === s.speed ? 'effective' : ''} ${mine === s.speed ? 'mine' : ''}`}
            title={note ? `${s.title}. ${note}` : s.title}
            aria-label={s.title}
            data-testid={`speed-${s.speed}`}
            onClick={() => session.setSpeed(s.speed)}
          >
            <Glyph id={s.icon} />
          </button>
        ))}
        {/* The note rides in the group's tooltip; screen readers still get it. */}
        {note && (
          <span class="sr-only" data-testid="speed-note">
            {note}
          </span>
        )}
      </div>
      <TopMenu session={session} onLeave={onLeave} />
    </header>
  );
}

/** Coins, the rank pennant and the goal pill, standard valleys only. Lean times show gently. */
function TownStats({ session }: { session: Session }) {
  const m = session.mirror;
  const town = m.town.value;
  const budget = m.budget.value;
  const treasury = budget?.treasury ?? town?.treasury ?? 0;
  const lean = budget?.leanTimes ?? town?.leanTimes ?? false;
  const open = () => {
    session.ui.lens.value = 'ledger';
    // The Purse book replaces the old budget report.
    session.ui.panel.value = 'purse';
  };
  return (
    <div class="topbar-town-stats">
      <button
        type="button"
        class={`stat-chip coins ${lean ? 'lean' : ''}`}
        data-testid="treasury"
        title={
          lean
            ? `${coins(treasury)}. Lean times: new building waits until the books are back above zero.`
            : `${coins(treasury)} in the treasury. Click for the Purse.`
        }
        onClick={open}
      >
        <Glyph id="coin" />
        {coinCount(treasury)}
        {lean && <span class="lean-word">lean times</span>}
      </button>
      <RankChip session={session} />
      <GoalPill session={session} />
    </div>
  );
}

/**
 * I2 (C4F): the town's rank and how far along the next Charter is, as a little pennant with a pip
 * per goal. Opens the Charter board; glows warmly when the claim is open.
 */
function RankChip({ session }: { session: Session }) {
  const m = session.mirror;
  const town = m.town.value;
  const c = m.charter.value;
  const rank = c?.rank ?? town?.rank;
  if (!rank) return null;
  const goals = c?.goals ?? [];
  const done = c ? goals.filter((g) => g.done).length : (town?.charter?.done ?? 0);
  const total = c ? goals.length : (town?.charter?.total ?? 0);
  const ready = c?.ready ?? town?.charter?.ready ?? false;
  const next = c?.next;
  const open = session.ui.panel.value === 'charter';
  return (
    <button
      type="button"
      class={`stat-chip rank ${ready ? 'ready' : ''} ${open ? 'open' : ''}`}
      data-testid="rank"
      title={
        next
          ? `${RANK_WORD[rank]}. ${done} of ${total} goals toward ${RANK_WORD[next]}${ready ? ': ready to claim!' : '.'} (H)`
          : `${RANK_WORD[rank]}. The Charter board (H)`
      }
      onClick={() => (session.ui.panel.value = open ? null : 'charter')}
    >
      <Glyph id="rank" />
      <span class="rank-word">{RANK_WORD[rank]}</span>
    </button>
  );
}
