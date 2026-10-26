import { signal } from '@preact/signals';
import { MAP_SIZE, MAX_NOTE_CHARS, type Command, type SeatId } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { INPUT_COPY } from './copy';

/** A pending "remove your partner's handmade work?" question, answered by RemovalConfirm. */
export interface RemovalRequest {
  title: string;
  body: string;
  placeholder: string;
  ok: string;
  cancel: string;
  /** Resolves with the optional reason ('' when none), or null when the player keeps it. */
  resolve(reason: string | null): void;
}

export const removalRequest = signal<RemovalRequest | null>(null);

/** Asks the player to confirm a removal. Any earlier open question is answered with "keep it". */
export function askRemoval(r: Omit<RemovalRequest, 'resolve'>): Promise<string | null> {
  removalRequest.value?.resolve(null);
  return new Promise((resolve) => {
    removalRequest.value = {
      ...r,
      resolve: (reason) => {
        removalRequest.value = null;
        resolve(reason);
      },
    };
  });
}

/** Who removes what: enough of a session or tool context to submit and to name the seats. */
export interface RemovalEnv {
  mirror: Mirror;
  seat: SeatId;
  submit(cmd: Command): number;
}

/**
 * Removes a piece, asking first when it is the partner's handmade work (decor, or a building they
 * customized) and leaving them a note with the optional reason (docs/spec/16-coop.md, Guardrails).
 * Resolves false when the player decides to keep it.
 */
export async function removeWithCare(
  env: RemovalEnv,
  piece: { builtBy: SeatId; handmade: boolean; thing: string; x: number; z: number; building?: boolean },
  cmd: Command,
): Promise<boolean> {
  if (!piece.handmade || piece.builtBy === env.seat) {
    env.submit(cmd);
    return true;
  }
  const seats = env.mirror.seats.value;
  const owner = seats.find((s) => s.seat === piece.builtBy)?.name || INPUT_COPY.partner;
  const me = seats.find((s) => s.seat === env.seat)?.name || INPUT_COPY.someone;
  const reason = await askRemoval({
    title: piece.building
      ? INPUT_COPY.removeBuildingTitle(owner, piece.thing)
      : INPUT_COPY.removeTitle(owner, piece.thing),
    body: INPUT_COPY.removeBody,
    placeholder: INPUT_COPY.removeReason,
    ok: INPUT_COPY.removeOk,
    cancel: INPUT_COPY.removeCancel,
  });
  if (reason === null) return false;
  env.submit(cmd);
  const x = Math.max(0, Math.min(MAP_SIZE - 1, piece.x));
  const z = Math.max(0, Math.min(MAP_SIZE - 1, piece.z));
  const text = INPUT_COPY.removeNote(me, piece.thing, reason).slice(0, MAX_NOTE_CHARS);
  env.submit({ t: 'note.pin', x, z, text });
  return true;
}
