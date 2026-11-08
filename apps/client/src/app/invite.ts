import type { SeatId } from '@qoti/sim';
import { rememberValley } from './recent';

export interface Invite {
  valleyId: string;
  seat: SeatId;
  token: string;
}

/** Parses an invite fragment: #v=<valleyId>&s=<seat>&k=<token>. */
export function parseInvite(hash: string): Invite | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const valleyId = params.get('v');
  const seat = Number(params.get('s'));
  const token = params.get('k');
  if (!valleyId || !token || ![0, 1, 2, 3].includes(seat)) return null;
  return { valleyId, seat: seat as SeatId, token };
}

/**
 * Takes an invite from the address bar: the fragment moves into local storage and is cleared
 * from the address bar, so the token never lingers in history or a shared screenshot.
 */
export function takeInviteFromUrl(): Invite | null {
  const invite = parseInvite(location.hash);
  if (!invite) return null;
  rememberValley({
    valleyId: invite.valleyId,
    seat: invite.seat,
    token: invite.token,
    mode: 'online',
    name: 'A shared valley',
    lastPlayed: Date.now(),
    pending: true,
  });
  history.replaceState(null, '', location.pathname + location.search);
  return invite;
}

export function inviteLink(fragment: string): string {
  return `${location.origin}${location.pathname}${fragment}`;
}

/** The valley being played lives in the fragment too (#play=<id>), so a reload goes straight back. */
export function readPlayHash(): string | null {
  const m = /^#play=([0-9a-zA-Z-]+)$/.exec(location.hash);
  return m ? m[1]! : null;
}

export function setPlayHash(valleyId: string | null): void {
  history.replaceState(null, '', location.pathname + location.search + (valleyId ? `#play=${valleyId}` : ''));
}
