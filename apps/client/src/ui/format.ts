import { content } from '@qoti/content';
import {
  calendar,
  PENNIES_PER_COIN,
  SEASON_NAMES,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type SeatId,
  type SeatView,
  type Speed,
} from '@qoti/sim';

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

// ---------------------------------------------------------------------------------------------
// I1 (C3E): money, goods, dates and people for the hamlet panels.

/** 1234 as "1,234" (no Intl, so tests and every browser agree). */
export function thousands(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.abs(Math.trunc(n)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Just the number of coins in an amount of pennies, rounded toward zero. */
export function coinCount(pennies: number): string {
  return thousands(Math.trunc(pennies / PENNIES_PER_COIN));
}

/** "412 coins", "1 coin", "-38 coins". */
export function coins(pennies: number): string {
  const c = Math.trunc(pennies / PENNIES_PER_COIN);
  return `${thousands(c)} ${Math.abs(c) === 1 ? 'coin' : 'coins'}`;
}

export function goodName(id: string): string {
  return content.goodById.get(id)?.name ?? id;
}

/** "Spring 3" for a tick, with the year after the first one. */
export function shortDate(tick: number): string {
  const c = calendar(tick);
  return `${SEASON_NAMES[c.season]} ${c.day}${c.year > 1 ? `, Year ${c.year}` : ''}`;
}

/** "Spring 3" for an absolute day index (day 0 is the first day). */
export function dayDate(day: number): string {
  return shortDate(Math.max(0, day * TICKS_PER_DAY - START_HOUR * TICKS_PER_HOUR));
}

/** Whole days between two ticks. */
export function daysBetween(from: number, to: number): number {
  return Math.floor((to - from) / TICKS_PER_DAY);
}

/** How long a wish has left, in words. */
export function untilText(tick: number, now: number): string {
  const days = Math.floor((tick - now) / TICKS_PER_DAY);
  if (days <= 0) return 'Fading by tonight';
  if (days === 1) return 'One more day';
  return `${days} more days`;
}

/** A seat's name as this player reads it: "you", the partner's name, or "Player 2". */
export function seatLabel(seats: readonly SeatView[], seat: number, me: number): string {
  if (seat === me) return 'you';
  return seats.find((s) => s.seat === seat)?.name || `Player ${seat + 1}`;
}

/** "Ada", "Ada and Bo", "you and Bo". */
export function seatList(seats: readonly SeatView[], list: readonly number[], me: number): string {
  return list.map((s) => seatLabel(seats, s, me)).join(' and ');
}

export function buildingName(def: string): string {
  return content.buildingById.get(def)?.name ?? def;
}

export function personName(r: { given: string; family: string }): string {
  return `${r.given} ${r.family}`;
}

/** Capitalizes the first letter ("you" at the start of a sentence). */
export function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
