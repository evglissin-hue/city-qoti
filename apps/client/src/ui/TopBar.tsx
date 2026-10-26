import type { Speed } from '@qoti/sim';
import type { Session } from '../app/session';
import { formatDate, formatTime, speedNote } from './format';

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
      <div class="topbar-clock" data-testid="clock">
        <span>{formatDate(tick)}</span>
        <span class="clock-time">{formatTime(tick)}</span>
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
        <button type="button" class="ghost-button" onClick={onLeave} title="Back to the title screen">
          Leave
        </button>
      </div>
    </header>
  );
}
