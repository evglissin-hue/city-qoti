// The one menu button: everything the top bar used to carry that is not the game itself. A small
// paper dropdown; Esc or a click outside closes it.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { copy } from '../copy';
import { Glyph } from '../icons';
import { toggleBook } from '../panels';
import { GoToPartner } from '../Presence';

const STATUS_TEXT = {
  connecting: 'Connecting',
  'catching-up': 'Catching up',
  live: 'Live',
  offline: 'Offline',
} as const;

function People({ session, close }: { session: Session; close: () => void }) {
  const m = session.mirror;
  const town = m.town.value;
  const people = town?.population ?? m.residents.size;
  const homes = town?.households ?? m.households.size;
  return (
    <button
      type="button"
      class="menu-item"
      data-testid="population"
      title={`${people} ${people === 1 ? 'resident' : 'residents'} in ${homes} ${homes === 1 ? 'household' : 'households'}. (K)`}
      onClick={() => {
        close();
        toggleBook(session, 'people');
      }}
    >
      <Glyph id="people" />
      <span>Townsfolk</span>
      <span class="menu-count">{people}</span>
    </button>
  );
}

export function TopMenu({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const m = session.mirror;
  const seats = m.seats.value;
  const online = session.target.mode === 'online';
  const status = session.connection?.status.value ?? 'connecting';
  const partnerHere = online && seats.some((s) => s.seat !== session.seat && s.connected);
  const trouble = online && status !== 'live';
  const standard = m.settings.value.mode === 'standard';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    addEventListener('keydown', onKey, true);
    addEventListener('pointerdown', onDown, true);
    return () => {
      removeEventListener('keydown', onKey, true);
      removeEventListener('pointerdown', onDown, true);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div class="topbar-menu" ref={root}>
      <button
        type="button"
        class={`ghost-button icon-button menu-button ${open ? 'open' : ''}`}
        data-testid="menu-open"
        title="Menu: your partner, settings, help, leave"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span class="glyph">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          >
            <path d="M5 7h14M5 12h14M5 17h14" />
          </svg>
        </span>
        {(partnerHere || trouble) && (
          <b class={`menu-dot ${trouble ? 'warn' : ''}`} data-testid="menu-dot" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div class="menu-sheet panel" role="menu" data-testid="menu">
          <div class="menu-seats">
            {seats.map((s) => (
              <span
                key={s.seat}
                class={`seat ${s.connected ? 'on' : 'off'}`}
                title={`${s.seat === session.seat ? `${s.name} (you)` : s.name}: ${s.connected ? 'here' : 'away'}`}
              >
                <i style={{ background: `#${s.color.toString(16).padStart(6, '0')}` }} />
                <span class="seat-name">{s.seat === session.seat ? `${s.name} (you)` : s.name}</span>
                <span class="seat-where">{s.connected ? 'here' : 'away'}</span>
              </span>
            ))}
          </div>
          {online && (
            <div class="menu-row" onClick={close}>
              <GoToPartner session={session} />
            </div>
          )}
          <div class="menu-row">
            <span class={`chip status-${status}`} data-testid="connection">
              {online ? STATUS_TEXT[status] : 'Solo'}
            </span>
          </div>
          {online && (
            <button
              type="button"
              class="menu-item"
              data-testid="invite-open"
              onClick={() => {
                close();
                session.ui.inviteOpen.value = true;
              }}
            >
              <Glyph id="invite" />
              <span>Invite your partner</span>
            </button>
          )}
          {standard && <People session={session} close={close} />}
          <button
            type="button"
            class="menu-item"
            data-testid="settings-open"
            onClick={() => {
              close();
              session.ui.settingsOpen.value = true;
            }}
          >
            <Glyph id="settings" />
            <span>{copy.settings.open}</span>
          </button>
          <button
            type="button"
            class="menu-item"
            data-testid="help-open"
            onClick={() => {
              close();
              session.ui.helpOpen.value = true;
            }}
          >
            <Glyph id="letter" />
            <span>Help (?)</span>
          </button>
          <button
            type="button"
            class="menu-item"
            data-testid="leave"
            title="Back to the title screen"
            onClick={() => {
              close();
              onLeave();
            }}
          >
            <Glyph id="exit" />
            <span>Leave</span>
          </button>
        </div>
      )}
    </div>
  );
}
