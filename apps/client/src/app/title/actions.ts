// P3D: what the title does when a choice is made: found a valley (online or solo), open a valley
// file, forget a valley, take a pasted invite. Moved out of Title.tsx with no change in behavior.
import { randomId } from '@qoti/protocol';
import type { ValleySettings } from '@qoti/sim';
import { createOnlineValley } from '../../net/api';
import { valleyDbName } from '../../net/idb';
import { LocalRoom } from '../../net/local';
import { copy } from '../../ui/copy';
import { parseInvite, rememberInvite, type Invite } from '../invite';
import { forgetValley, rememberValley, type RecentValley } from '../recent';
import type { SessionTarget } from '../session';
import { readValleyFile, type ValleyFile } from '../valleyFile';

export function targetOf(v: RecentValley): SessionTarget {
  return {
    valleyId: v.valleyId,
    seat: v.seat,
    token: v.token,
    mode: v.mode,
    ...(v.invite ? { invite: v.invite } : {}),
  };
}

/** What the second step asks for. */
export interface NewValleyForm {
  seed: string;
  town: string;
  creative: boolean;
  economy: ValleySettings['economy'];
  threat: ValleySettings['threat'];
  guide: boolean;
}

/** The create request: standard valleys are the game; a creative one is the quiet sandbox. */
export function createBody(f: NewValleyForm) {
  const settings: Partial<ValleySettings> = {
    mode: f.creative ? 'sandbox' : 'standard',
    economy: f.economy,
    threat: f.creative ? 'peaceful' : f.threat,
    ...(f.creative ? {} : { guide: f.guide }),
    ...(f.town.trim() ? { townName: f.town.trim() } : {}),
  };
  return { ...(f.seed.trim() ? { seed: f.seed.trim() } : {}), settings };
}

/** Founds an online valley and remembers it; the caller starts it. */
export async function newOnline(f: NewValleyForm): Promise<RecentValley> {
  const v = await createOnlineValley(createBody(f)).catch(() => {
    throw new Error(copy.title.relayDown);
  });
  const recentValley: RecentValley = {
    valleyId: v.valleyId,
    seat: 0,
    token: v.tokens[0]!,
    mode: 'online',
    name: f.town.trim() || 'Qoti',
    lastPlayed: Date.now(),
    seed: v.seed,
    ...(f.creative ? { creative: true } : {}),
    ...(v.invites[1] ? { invite: v.invites[1] } : {}),
  };
  rememberValley(recentValley);
  return recentValley;
}

/** Founds a solo valley in this browser and remembers it; the caller starts it. */
export async function newSolo(f: NewValleyForm): Promise<RecentValley> {
  const valleyId = randomId();
  const { token, seed: made } = await LocalRoom.create(valleyId, createBody(f));
  const recentValley: RecentValley = {
    valleyId,
    seat: 0,
    token,
    mode: 'solo',
    name: f.town.trim() || 'Qoti',
    lastPlayed: Date.now(),
    seed: made,
    ...(f.creative ? { creative: true } : {}),
  };
  rememberValley(recentValley);
  return recentValley;
}

/** Reads a picked valley file; throws the file's own complaint when it is not one. */
export async function pickFile(file: File): Promise<ValleyFile> {
  return readValleyFile(new Uint8Array(await file.arrayBuffer()));
}

/** Opens an imported valley file as a new valley, solo or for two. */
export async function openImported(imported: ValleyFile, mode: 'solo' | 'online'): Promise<RecentValley> {
  const req = { seed: imported.seed, settings: imported.settings, snapshot: imported.snapshot };
  const sandbox = imported.settings.mode === 'sandbox';
  const name = imported.summary.townName;
  if (mode === 'online') {
    const v = await createOnlineValley(req).catch(() => {
      throw new Error(copy.title.relayDown);
    });
    const recentValley: RecentValley = {
      valleyId: v.valleyId,
      seat: 0,
      token: v.tokens[0]!,
      mode: 'online',
      name,
      lastPlayed: Date.now(),
      ...(sandbox ? { creative: true } : {}),
      ...(v.invites[1] ? { invite: v.invites[1] } : {}),
    };
    rememberValley(recentValley);
    return recentValley;
  }
  const valleyId = randomId();
  const { token } = await LocalRoom.create(valleyId, req);
  const recentValley: RecentValley = {
    valleyId,
    seat: 0,
    token,
    mode: 'solo',
    name,
    lastPlayed: Date.now(),
    ...(sandbox ? { creative: true } : {}),
  };
  rememberValley(recentValley);
  return recentValley;
}

/** Takes a valley off the list; a solo valley's turns and snapshots live here alone, so they go too. */
export function forget(v: RecentValley): void {
  forgetValley(v.valleyId);
  if (v.mode === 'solo') {
    try {
      indexedDB.deleteDatabase(valleyDbName(v.valleyId));
    } catch {
      // Storage blocked: the list entry is gone, which is what the player asked for.
    }
  }
}

/** The invite inside whatever was pasted: a whole link, a fragment (#v=...), or bare v=...&s=...&k=... */
export function inviteFromText(text: string): Invite | null {
  const t = text.trim();
  if (!t) return null;
  const i = t.indexOf('#');
  return parseInvite(i >= 0 ? t.slice(i + 1) : t);
}

/** Remembers a pasted invite as pending (as an invite link in the address bar would). */
export function takePastedInvite(text: string): boolean {
  const invite = inviteFromText(text);
  if (!invite) return false;
  rememberInvite(invite);
  return true;
}
