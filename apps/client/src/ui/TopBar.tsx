import { calendar, SEASON_NAMES, type Speed } from '@qoti/sim';
import type { Session } from '../app/session';
import { copy } from './copy';
import { coinCount, coins, formatDate, formatTime, speedNote } from './format';
import { Glyph } from './icons';
import { GoToPartner } from './Presence';
import { RANK_WORD } from './village';

const SPEEDS: { speed: Speed; label: string; title: string }[] = [
  { speed: 0, label: '❚❚', title: 'Pause (Space)' },
  { speed: 1, label: '1×', title: 'Normal speed (1)' },
  { speed: 2, label: '2×', title: 'Double speed (2)' },
  { speed: 3, label: '3×', title: 'Triple speed (3)' },
];

const STATUS_TEXT = {
  connecting: 'Connecting',
  'catching-up': 'Catching up',
  live: 'Live',
  offline: 'Offline',
} as const;

export function TopBar({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const m = session.mirror;
  const tick = m.tick.value;
  const speed = m.clock.value.speed;
  const seats = m.seats.value;
  const settings = m.settings.value;
  const mine = session.myDesiredSpeed();
  const note = speedNote(seats, speed, session.seat, settings.togetherOnly);
  const status = session.connection?.status.value ?? 'connecting';
  const online = session.target.mode === 'online';

  return (
    <header class="topbar panel">
      <div class="topbar-town">
        <strong>{settings.townName}</strong>
        <span class="muted">{settings.valleyName}</span>
      </div>
      {settings.mode === 'standard' && <TownStats session={session} />}
      <div class="topbar-clock" data-testid="clock">
        <span>{formatDate(tick)}</span>
        <span class="clock-time">{formatTime(tick)}</span>
        <span class="season-chip" data-testid="season">
          {SEASON_NAMES[calendar(tick).season]}
        </span>
      </div>
      <div class="topbar-speed">
        {SPEEDS.map((s) => (
          <button
            key={s.speed}
            type="button"
            class={`speed ${speed === s.speed ? 'effective' : ''} ${mine === s.speed ? 'mine' : ''}`}
            title={s.title}
            data-testid={`speed-${s.speed}`}
            onClick={() => session.setSpeed(s.speed)}
          >
            {s.label}
          </button>
        ))}
        {note && (
          <span class="speed-note" data-testid="speed-note">
            {note}
          </span>
        )}
      </div>
      <div class="topbar-right">
        <span class="seats">
          {seats.map((s) => (
            <span
              key={s.seat}
              class={`seat ${s.connected ? 'on' : 'off'}`}
              title={s.connected ? 'Here' : 'Away'}
            >
              <i style={{ background: `#${s.color.toString(16).padStart(6, '0')}` }} />
              {s.seat === session.seat ? `${s.name} (you)` : s.name}
            </span>
          ))}
        </span>
        {online && <GoToPartner session={session} />}
        <span class={`chip status-${status}`} data-testid="connection">
          {online ? STATUS_TEXT[status] : 'Solo'}
        </span>
        {online && (
          <button
            type="button"
            class="ghost-button"
            data-testid="invite-open"
            onClick={() => (session.ui.inviteOpen.value = true)}
          >
            Invite
          </button>
        )}
        <button
          type="button"
          class="ghost-button"
          data-testid="settings-open"
          title={copy.settings.open}
          onClick={() => (session.ui.settingsOpen.value = true)}
        >
          {copy.settings.open}
        </button>
        <button type="button" class="ghost-button" onClick={onLeave} title="Back to the title screen">
          Leave
        </button>
      </div>
    </header>
  );
}

/** Treasury and population, standard valleys only. Lean times show gently, never as an alarm. */
function TownStats({ session }: { session: Session }) {
  const m = session.mirror;
  const town = m.town.value;
  const budget = m.budget.value;
  const treasury = budget?.treasury ?? town?.treasury ?? 0;
  const lean = budget?.leanTimes ?? town?.leanTimes ?? false;
  const people = town?.population ?? m.residents.size;
  const homes = town?.households ?? m.households.size;
  const openBudget = () => {
    session.ui.lens.value = 'ledger';
    session.ui.reportTab.value = 'budget';
    session.ui.panel.value = 'reports';
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
            : `${coins(treasury)} in the treasury. Click for the budget.`
        }
        onClick={openBudget}
      >
        <Glyph id="coin" />
        {coinCount(treasury)}
        {lean && <span class="lean-word">lean times</span>}
      </button>
      <RankChip session={session} />
      <span
        class="stat-chip people"
        data-testid="population"
        title={`${people} ${people === 1 ? 'resident' : 'residents'} in ${homes} ${homes === 1 ? 'household' : 'households'}`}
      >
        <Glyph id="people" />
        {people}
      </span>
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
      {next && total > 0 && (
        <span class="pips" aria-label={`${done} of ${total}`}>
          {goals.length
            ? goals.map((g) => <i key={g.id} class={`${g.done ? 'on' : ''} lane-${g.lane}`} />)
            : Array.from({ length: total }, (_, i) => <i key={i} class={i < done ? 'on' : ''} />)}
        </span>
      )}
    </button>
  );
}
