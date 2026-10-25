import { calendar, SEASON_NAMES, type SeatId, type SeatView, type Speed } from '@qoti/sim';

export function formatDate(tick: number): string {
  const c = calendar(tick);
  return `Year ${c.year}, ${SEASON_NAMES[c.season]}, day ${c.day}`;
}

export function formatTime(tick: number): string {
  const c = calendar(tick);
  return `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
}

/** Who is holding time back, for the top bar: "Paused by Bo", "Slowed by you". */
export function speedNote(seats: SeatView[], speed: Speed, me: SeatId, togetherOnly: boolean): string | null {
  const connected = seats.filter((s) => s.connected);
  if (connected.length === 0) return 'Time rests while nobody is here';
  if (togetherOnly && connected.length < 2) return 'Waiting for your partner';
  const top = Math.max(...connected.map((s) => s.desiredSpeed));
  if (speed > 0 && speed === top) return null;
  const holders = connected.filter((s) => s.desiredSpeed === speed);
  if (holders.length === 0) return null;
  const names = holders.map((s) => (s.seat === me ? 'you' : s.name)).join(' and ');
  return speed === 0 ? `Paused by ${names}` : `Slowed by ${names}`;
}

export function ago(time: number, now = Date.now()): string {
  const minutes = Math.round((now - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
